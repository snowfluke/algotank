// Email verification and password reset by a 6-digit code (76-email-and-sequences.md, E1).
// The routes are listed in packages/arena/src/auth-protocol.ts.
//
// An account's email (terminal state: verified):
//
// | From       | Event                          | Actor   | Guard                                             | To         |
// |------------|--------------------------------|---------|---------------------------------------------------|------------|
// | unverified | sign-up                        | visitor | mail settings exist (the send may still fail)     | code sent  |
// | unverified | "Send a new code"              | account | mail settings; 1 per minute, 5 per hour           | code sent  |
// | code sent  | "Send a new code"              | account | as above; the old code stops working              | code sent  |
// | code sent  | right code                     | account | before 15 minutes, fewer than 5 wrong tries       | verified   |
// | code sent  | wrong code, tries left         | account | 1st to 4th wrong try                              | code sent  |
// | code sent  | 5th wrong code                 | account |                                                   | unverified |
// | code sent  | 15 minutes pass                | clock   |                                                   | unverified |
// | unverified | right reset code (see below)   | visitor | the reset proves the mailbox too                  | verified   |
// "unverified" means no live code: a code that expired or is used up is refused like a missing one
// (code_expired), and the hourly sweep removes it from the table.
//
// A password reset (per account, independent of the table above):
//
// | From      | Event                      | Actor   | Guard                                               | To         |
// |-----------|----------------------------|---------|-----------------------------------------------------|------------|
// | no code   | "Forgot password" + email  | visitor | address: 1 per minute, 5 per hour; email: the same  | code sent  |
// | code sent | another request            | visitor | as above; the old code stops working                | code sent  |
// | code sent | right code + new password  | visitor | before 15 minutes, fewer than 5 wrong tries, a      | no code    |
// |           |                            |         | valid password; every session ends, a new one starts|            |
// | code sent | wrong code (5th: code ends)| visitor |                                                     | code sent / no code |
// | code sent | 15 minutes pass            | clock   |                                                     | no code    |
//
// The reset never tells whether an email has an account: the request answers 202 for every valid
// email, the per-email limit and the send happen after the answer, and the confirm has one error
// (code_invalid) for an unknown email, a missing, wrong, expired or used-up code. Only the
// per-address limit answers 429, because it says nothing about the email.

import { randomInt } from "node:crypto";
import {
  EMAIL_CODE_LENGTH,
  type AccountResponse,
  type AuthCapabilities,
  type MailLanguage,
  type ResetSendResponse,
  type VerificationEmail,
} from "@game/arena";
import { HttpError, isRecord, jsonResponse, noContent, readJson } from "../http.ts";
import type { MailSender } from "../mail.ts";
import type { LimitCheck, SlidingWindowLimit } from "../rate-limit.ts";
import type { RouteContext, Router } from "../router.ts";
import type { CodePurpose, CodeStore } from "./codes.ts";
import { CODE_MAX_WRONG_TRIES } from "./codes.ts";
import { emailProblem, normalizeEmail, passwordProblem } from "./credentials.ts";
import { AuthError } from "./errors.ts";
import { readLanguage } from "./language.ts";
import { codeMail } from "./mail-text.ts";
import { clientAddress, refuseCrossSite, requireJsonContentType } from "./request.ts";
import { accountOfRequest, AUTH_BODY_MAX_BYTES, publicAccount, sessionResponse, startSession, type AuthRouteDeps } from "./routes.ts";
import type { StoredAccount } from "./store.ts";

const CODE_PATTERN = new RegExp(`^[0-9]{${EMAIL_CODE_LENGTH}}$`);
const WHITESPACE = /\s/g;

/** Sends of a code: both windows must have room. Keys carry a prefix: "verify:<account>", "reset:<email>", "address:<ip>". */
export interface CodeSendLimits {
  /** 1 per minute. */
  readonly perMinute: SlidingWindowLimit;
  /** 5 per hour. */
  readonly perHour: SlidingWindowLimit;
}

export interface EmailRouteDeps extends AuthRouteDeps {
  readonly codes: CodeStore;
  /** null: the server has no mail settings. */
  readonly mail: MailSender | null;
  readonly sendLimits: CodeSendLimits;
}

function checkSend(limits: CodeSendLimits, key: string): LimitCheck {
  const minute = limits.perMinute.check(key);
  const hour = limits.perHour.check(key);
  if (!hour.ok) return hour;
  return minute;
}

function recordSend(limits: CodeSendLimits, key: string): void {
  limits.perMinute.record(key);
  limits.perHour.record(key);
}


async function readBody(req: Request): Promise<Readonly<Record<string, unknown>>> {
  requireJsonContentType(req);
  const body = await readJson(req, AUTH_BODY_MAX_BYTES);
  if (!isRecord(body)) throw new HttpError(400, "Send a JSON object.");
  return body;
}

/** Digits only; spaces a person typed or pasted between the digits are dropped. A malformed code never counts as a try. */
function readCode(body: Readonly<Record<string, unknown>>): string | null {
  const sent = body["code"];
  if (typeof sent !== "string") return null;
  const code = sent.replace(WHITESPACE, "");
  return CODE_PATTERN.test(code) ? code : null;
}

function newCode(): string {
  return String(randomInt(0, 10 ** EMAIL_CODE_LENGTH)).padStart(EMAIL_CODE_LENGTH, "0");
}

/** Stores a new code (the old one stops working) and returns it, for the email only. */
async function issueCode(deps: EmailRouteDeps, account: StoredAccount, purpose: CodePurpose): Promise<string> {
  const code = newCode();
  deps.codes.put(account.id, purpose, await Bun.password.hash(code));
  return code;
}

/** The send of the code a sign-up gets. Counts against the account's send limit, so a new account cannot send more. */
export async function sendSignUpCode(deps: EmailRouteDeps, account: StoredAccount, language: MailLanguage): Promise<VerificationEmail> {
  if (deps.mail === null) return "off";
  recordSend(deps.sendLimits, `verify:${account.id}`);
  try {
    const code = await issueCode(deps, account, "verify");
    await deps.mail.sendMail(codeMail(account.email, "verify", code, language));
    return "sent";
  } catch (error) {
    // The account exists already; the page says the email did not go out and offers a new code.
    console.error(`The verification email of account ${account.id} could not be sent:`, describe(error));
    return "failed";
  }
}

/** The error's message only: an SMTP error can quote the mail it refused, which holds the code. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message.split("\n")[0] ?? ""}` : "unknown error";
}

function requireSignedIn(deps: EmailRouteDeps, req: Request): StoredAccount {
  refuseCrossSite(req, deps.trustProxy);
  const account = accountOfRequest(deps.store, req);
  if (account === undefined) throw new AuthError("not_signed_in");
  return account;
}

export function registerEmailRoutes(router: Router, deps: EmailRouteDeps): void {
  const { codes, sendLimits } = deps;

  router.add("GET", "/api/auth/capabilities", () => {
    const body: AuthCapabilities = { canSendEmail: deps.mail !== null };
    return jsonResponse(body);
  });

  router.add("POST", "/api/auth/verify/send", async (ctx: RouteContext) => {
    const account = requireSignedIn(deps, ctx.req);
    const language = readLanguage(await readBody(ctx.req));
    if (account.emailVerified) throw new AuthError("already_verified");
    if (deps.mail === null) throw new AuthError("mail_off");
    const key = `verify:${account.id}`;
    const limit = checkSend(sendLimits, key);
    if (!limit.ok) throw new AuthError("rate_limited", limit.retryAfterSeconds);
    recordSend(sendLimits, key);
    const code = await issueCode(deps, account, "verify");
    try {
      await deps.mail.sendMail(codeMail(account.email, "verify", code, language));
    } catch (error) {
      console.error(`A verification email of account ${account.id} could not be sent:`, describe(error));
      throw new AuthError("mail_failed");
    }
    return noContent();
  });

  router.add("POST", "/api/auth/verify", async (ctx: RouteContext) => {
    const account = requireSignedIn(deps, ctx.req);
    const code = readCode(await readBody(ctx.req));
    if (code === null) throw new HttpError(400, `Send the code as ${EMAIL_CODE_LENGTH} digits.`);
    const done = (verified: StoredAccount) => {
      const body: AccountResponse = { account: publicAccount(verified) };
      return jsonResponse(body);
    };
    if (account.emailVerified) return done(account);
    const stored = codes.live(account.id, "verify");
    if (stored === undefined) throw new AuthError("code_expired");
    const counted = codes.countTry(stored);
    const matches = await Bun.password.verify(code, stored.codeHash);
    // A new code sent during the check replaced this one, so this one no longer counts.
    if (!codes.isCurrent(counted)) throw new AuthError("code_expired");
    if (!matches) {
      if (counted.wrongTries >= CODE_MAX_WRONG_TRIES) {
        codes.drop(account.id, "verify");
        throw new AuthError("code_expired");
      }
      throw new AuthError("code_wrong", undefined, CODE_MAX_WRONG_TRIES - counted.wrongTries);
    }
    deps.inTransaction(() => {
      deps.store.markEmailVerified(account.id);
      codes.drop(account.id, "verify");
    });
    deps.metrics.count("accountVerified");
    const verified = deps.store.accountById(account.id);
    if (verified === undefined) throw new Error(`Account ${account.id} disappeared while it was verified.`);
    return done(verified);
  });

  router.add("POST", "/api/auth/reset/send", async (ctx: RouteContext) => {
    refuseCrossSite(ctx.req, deps.trustProxy);
    const body = await readBody(ctx.req);
    if (typeof body["email"] !== "string") throw new HttpError(400, "Send the email as text.");
    const email = normalizeEmail(body["email"]);
    const language = readLanguage(body);
    if (emailProblem(email) !== null) throw new AuthError("email_invalid");
    if (deps.mail === null) throw new AuthError("mail_off");
    const addressKey = `address:${clientAddress(ctx.req, ctx.server, deps.trustProxy)}`;
    const byAddress = checkSend(sendLimits, addressKey);
    if (!byAddress.ok) throw new AuthError("rate_limited", byAddress.retryAfterSeconds);
    recordSend(sendLimits, addressKey);

    const answer: ResetSendResponse = { accepted: true };
    // Everything about the email happens after this point and is not awaited, so neither the answer
    // nor its timing tells whether the email has an account or reached its own limit.
    const emailKey = `reset:${email}`;
    const account = deps.store.accountByEmail(email);
    if (checkSend(sendLimits, emailKey).ok) {
      recordSend(sendLimits, emailKey);
      if (account !== undefined) void sendResetCode(deps, deps.mail, account, language);
    }
    return jsonResponse(answer, 202);
  });

  router.add("POST", "/api/auth/reset", async (ctx: RouteContext) => {
    refuseCrossSite(ctx.req, deps.trustProxy);
    const body = await readBody(ctx.req);
    if (typeof body["email"] !== "string" || typeof body["password"] !== "string") {
      throw new HttpError(400, "Send the email, the code and the new password as text.");
    }
    if (deps.mail === null) throw new AuthError("mail_off");
    const email = normalizeEmail(body["email"]);
    const password = body["password"];
    const code = readCode(body);
    if (code === null) throw new AuthError("code_invalid");
    const problem = passwordProblem(password, email);
    if (problem !== null) throw new AuthError(problem);

    const account = deps.store.accountByEmail(email);
    const stored = account === undefined ? undefined : codes.live(account.id, "reset");
    if (account === undefined || stored === undefined) {
      // As slow as a real check, so the answer time does not reveal whether the email has a code.
      await Bun.password.verify(code, await deps.dummyHash);
      throw new AuthError("code_invalid");
    }
    const counted = codes.countTry(stored);
    const matches = await Bun.password.verify(code, stored.codeHash);
    if (!codes.isCurrent(counted)) throw new AuthError("code_invalid");
    if (!matches) {
      if (counted.wrongTries >= CODE_MAX_WRONG_TRIES) codes.drop(account.id, "reset");
      throw new AuthError("code_invalid");
    }
    // Dropped first, so the code cannot set a second password while the new one is hashed.
    codes.drop(account.id, "reset");
    const passwordHash = await Bun.password.hash(password);
    // One transaction: the new password, the end of every old session and the reset's own new session happen together or not at all.
    const token = deps.inTransaction(() => {
      deps.store.replacePasswordHash(account.id, passwordHash);
      deps.store.endSessionsOf(account.id);
      // The code reached this mailbox, which is the same proof a verification code gives.
      deps.store.markEmailVerified(account.id);
      return startSession(deps.store, account.id);
    });
    if (!account.emailVerified) deps.metrics.count("accountVerified");
    const updated = deps.store.accountById(account.id);
    if (updated === undefined) throw new Error(`Account ${account.id} disappeared during a reset.`);
    return sessionResponse(deps, token, updated);
  });
}

/** Runs after the answer went out. A failure is logged without the code; the person asks again. */
async function sendResetCode(deps: EmailRouteDeps, mail: MailSender, account: StoredAccount, language: MailLanguage): Promise<void> {
  try {
    const code = await issueCode(deps, account, "reset");
    await mail.sendMail(codeMail(account.email, "reset", code, language));
  } catch (error) {
    console.error(`A password-reset email of account ${account.id} could not be sent:`, describe(error));
  }
}
