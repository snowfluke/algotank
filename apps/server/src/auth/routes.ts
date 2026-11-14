// The sign-in routes (see packages/arena/src/auth-protocol.ts). The email-code routes are in email-routes.ts.

import type { AccountResponse, MailLanguage, MeResponse, PublicAccount, RegisterResponse, VerificationEmail } from "@game/arena";
import { HttpError, isRecord, jsonResponse, noContent, readJson } from "../http.ts";
import type { RouteContext, Router } from "../router.ts";
import { emailProblem, normalizeEmail, passwordProblem } from "./credentials.ts";
import { AuthError } from "./errors.ts";
import type { SlidingWindowLimit } from "../rate-limit.ts";
import {
  clearedSessionCookie,
  clientAddress,
  newSessionToken,
  refuseCrossSite,
  requireJsonContentType,
  sessionCookie,
  sessionCookieOf,
} from "./request.ts";
import { readLanguage } from "./language.ts";
import type { AuthStore, StoredAccount } from "./store.ts";
import type { MetricsRecorder } from "../metrics/metrics.ts";

export const AUTH_BODY_MAX_BYTES = 4 * 1024;

export interface AuthLimits {
  /** Registrations per client address. */
  readonly register: SlidingWindowLimit;
  /** Login attempts per client address. */
  readonly loginByAddress: SlidingWindowLimit;
  /** Failed logins per normalized email, known or not, so a 429 does not reveal which emails exist. */
  readonly failedLoginByEmail: SlidingWindowLimit;
}

export interface AuthRouteDeps {
  readonly store: AuthStore;
  readonly limits: AuthLimits;
  /** Verified against for an unknown email, so the answer time does not reveal whether it exists. */
  readonly dummyHash: Promise<string>;
  readonly secureCookies: boolean;
  readonly trustProxy: boolean;
  readonly now: () => number;
  /** Sends a new account its verification code (email-routes.ts). */
  readonly sendSignUpCode: (account: StoredAccount, language: MailLanguage) => Promise<VerificationEmail>;
  /** The usage numbers (metrics/metrics.ts). */
  readonly metrics: MetricsRecorder;
}

/** Built field by field, so a stored password hash can never reach an answer. */
export function publicAccount(account: StoredAccount): PublicAccount {
  return { id: account.id, email: account.email, emailVerified: account.emailVerified };
}

interface Credentials {
  readonly email: string;
  readonly password: string;
  readonly language: MailLanguage;
}

async function readCredentials(req: Request): Promise<Credentials> {
  requireJsonContentType(req);
  const body = await readJson(req, AUTH_BODY_MAX_BYTES);
  if (!isRecord(body) || typeof body["email"] !== "string" || typeof body["password"] !== "string") {
    throw new HttpError(400, "Send the email and the password as text.");
  }
  return { email: normalizeEmail(body["email"]), password: body["password"], language: readLanguage(body) };
}

/** Starts a session for the account and answers with it. `extra` adds fields to the answer (the sign-up's code). */
export function signedIn(deps: Pick<AuthRouteDeps, "store" | "secureCookies">, account: StoredAccount, extra: object = {}): Response {
  const token = newSessionToken();
  deps.store.addSession(token, account.id);
  const body: AccountResponse = { ...extra, account: publicAccount(account) };
  const response = jsonResponse(body);
  response.headers.set("set-cookie", sessionCookie(token, deps));
  return response;
}

export function registerAuthRoutes(router: Router, deps: AuthRouteDeps): void {
  const { store, limits } = deps;

  router.add("POST", "/api/auth/register", async (ctx: RouteContext) => {
    refuseCrossSite(ctx.req, deps.trustProxy);
    const { email, password, language } = await readCredentials(ctx.req);

    // Checked first, so a limited request learns nothing about the email. Recorded only
    // for a request that would create an account, so typos do not use up the limit; the
    // check and the record run in one synchronous step, so parallel requests cannot pass together.
    const address = clientAddress(ctx.req, ctx.server, deps.trustProxy);
    const limit = limits.register.check(address);
    if (!limit.ok) throw new AuthError("rate_limited", limit.retryAfterSeconds);
    const problem = emailProblem(email) ?? passwordProblem(password, email);
    if (problem !== null) throw new AuthError(problem);
    if (store.accountByEmail(email) !== undefined) throw new AuthError("email_taken");
    limits.register.record(address);

    const passwordHash = await Bun.password.hash(password);
    // Checked again: another request for the same email may have finished during the hash.
    if (store.accountByEmail(email) !== undefined) throw new AuthError("email_taken");
    const account: StoredAccount = {
      id: crypto.randomUUID(),
      email,
      passwordHash,
      createdAt: new Date(deps.now()).toISOString(),
      emailVerified: false,
    };
    store.addAccount(account);
    deps.metrics.count("accountRegistered");
    // Never throws: a failed send is "failed", and the page offers a new code.
    const verificationEmail = await deps.sendSignUpCode(account, language);
    const extra: Omit<RegisterResponse, "account"> = { verificationEmail };
    return signedIn(deps, account, extra);
  });

  router.add("POST", "/api/auth/login", async (ctx: RouteContext) => {
    refuseCrossSite(ctx.req, deps.trustProxy);
    const { email, password } = await readCredentials(ctx.req);

    // Both limits are checked before either is recorded, and all of it before the first
    // await, so a refused request costs no hash and parallel requests cannot pass together.
    const address = clientAddress(ctx.req, ctx.server, deps.trustProxy);
    const byAddress = limits.loginByAddress.check(address);
    const byEmail = limits.failedLoginByEmail.check(email);
    if (!byAddress.ok) throw new AuthError("rate_limited", byAddress.retryAfterSeconds);
    if (!byEmail.ok) throw new AuthError("rate_limited", byEmail.retryAfterSeconds);
    limits.loginByAddress.record(address);
    // Counted as a failure until the password proves right.
    const failureSlot = limits.failedLoginByEmail.record(email);

    const account = store.accountByEmail(email);
    const matches = await Bun.password.verify(password, account?.passwordHash ?? (await deps.dummyHash));
    if (account === undefined || !matches) throw new AuthError("invalid_credentials");

    limits.failedLoginByEmail.release(email, failureSlot);
    deps.metrics.count("signedIn");
    return signedIn(deps, account);
  });

  router.add("POST", "/api/auth/logout", (ctx: RouteContext) => {
    refuseCrossSite(ctx.req, deps.trustProxy);
    const cookie = sessionCookieOf(ctx.req);
    if (cookie.kind === "token") store.endSession(cookie.token);
    const response = noContent();
    response.headers.set("set-cookie", clearedSessionCookie(deps));
    return response;
  });

  router.add("GET", "/api/auth/me", (ctx: RouteContext) => {
    const account = accountOfRequest(store, ctx.req);
    const body: MeResponse = { account: account === undefined ? null : publicAccount(account) };
    return jsonResponse(body);
  });
}

/** The account of the request's live session. An unknown, ended or expired session is no session. */
export function accountOfRequest(store: AuthStore, req: Request): StoredAccount | undefined {
  const cookie = sessionCookieOf(req);
  const session = cookie.kind === "token" ? store.sessionOf(cookie.token) : undefined;
  return session === undefined ? undefined : store.accountById(session.accountId);
}
