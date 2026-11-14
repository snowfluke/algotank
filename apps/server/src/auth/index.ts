// Accounts and sign-in: email and password, a session in an HttpOnly cookie.
// Other features call accountOf or requireAccount; nothing outside this folder reads
// the session cookie or the auth files.
//
// Session lifecycle (terminal state: ended; an ended token is rejected like an unknown one):
//
// | From   | To     | Actor   | Guard                                                             |
// |--------|--------|---------|-------------------------------------------------------------------|
// | none   | active | visitor | register with a valid new email and password, or log in with the |
// |        |        |         | correct credentials; rate limit not exceeded                      |
// | active | ended  | account | logout                                                            |
// | active | ended  | server  | 30 days after creation; the account's 11th login ends the oldest; |
// |        |        |         | a password reset (scripts/reset-password.ts, or by an email code: |
// |        |        |         | every session ends and the reset's own browser gets a new one)    |
//
// The email of an account (unverified, code sent, verified) and the password reset by an email
// code have their tables in email-routes.ts.
//
// Named limits:
// - A verified email proves control of a mailbox, not one person: one person with two mailboxes
//   can still hold two accounts. The per-address rate limit is the only other brake.
// - A Gmail account sends about 500 emails a day; beyond that sends fail (mail_failed) until the
//   next day. Each sign-up sends one, and each "Send a new code" or reset one more.
// - The send limits of codes live in memory too, so a restart lets an account send again at once.
// - Rate-limit counters live in memory and reset on a restart.
// - Two server processes must not share one DATA_DIR: each holds the files in memory
//   and overwrites the other's changes. The reset script refuses to run while the
//   server that wrote auth/server.pid is alive, for the same reason.
// - Anyone who knows an email can block its logins for 15 minutes with 5 wrong passwords.
// - With TRUST_PROXY=1 the first X-Forwarded-For entry is the client address. A proxy
//   that appends to a client-sent header lets a client choose its address and pass
//   the per-address limits.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AccountId } from "@game/arena";
import { PersistenceError, writePrivateFileAtomically } from "../arena-files.ts";
import type { Router } from "../router.ts";
import { AuthError } from "./errors.ts";
import { SlidingWindowLimit } from "../rate-limit.ts";
import type { MailSender } from "../mail.ts";
import { NO_METRICS, type MetricsRecorder } from "../metrics/metrics.ts";
import { CodeStore } from "./codes.ts";
import { registerEmailRoutes, sendSignUpCode, type CodeSendLimits, type EmailRouteDeps } from "./email-routes.ts";
import { refuseCrossSite } from "./request.ts";
import { accountOfRequest, registerAuthRoutes, type AuthLimits } from "./routes.ts";
import { AuthStore, type StoredAccount } from "./store.ts";

export { AuthError } from "./errors.ts";

export interface Account {
  readonly id: AccountId;
  /** Personal data: it leaves the server only in answers to the account itself or to the owner of an arena the account plays in. */
  readonly email: string;
  readonly createdAt: string;
  readonly emailVerified: boolean;
}

export interface Auth {
  /** The signed-in account of a request, read from its session cookie, or null. */
  accountOf(req: Request): Account | null;
  /** The account, or an HttpError: 401 not_signed_in without a session, 403 bad_origin when a request that changes state does not come from this site. */
  requireAccount(req: Request): Account;
  /** An account by id, or null when it does not exist. The owner-only email routes use it. */
  accountById(id: AccountId): Account | null;
  /**
   * Marks the account's email as verified, the guard of the "verified" join policy. The
   * email-verification package calls it once a code is confirmed; tests call it directly.
   * Throws for an unknown account and a PersistenceError when the file cannot be saved.
   */
  markEmailVerified(id: AccountId): void;
  registerRoutes(router: Router): void;
  /** Stops the hourly sweep of expired sessions. */
  stop(): void;
}

export interface AuthOptions {
  /** DATA_DIR. The auth files go in its auth/ folder. Without it everything stays in memory. */
  readonly dataDir?: string;
  /** Adds Secure to the session cookie. Turn it on when the site is served over HTTPS. */
  readonly secureCookies: boolean;
  /** Reads the client address and host from X-Forwarded-For and X-Forwarded-Host. Only behind a proxy that sets them. */
  readonly trustProxy: boolean;
  /** Milliseconds since 1970. Tests move it to expire sessions and rate-limit windows. */
  readonly now?: () => number;
  /** Sends the verification and reset codes. null: the server has no mail settings, so it sends none. */
  readonly mail: MailSender | null;
  /** Counts sign-ups, verifications and sign-ins (metrics/metrics.ts). NO_METRICS when not given. */
  readonly metrics?: MetricsRecorder;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const SWEEP_INTERVAL_MS = HOUR_MS;
/** Written while a server uses the directory; the reset script reads it. */
export const SERVER_PID_FILE = "server.pid";
export const AUTH_FOLDER = "auth";

/** Throws a PersistenceError that names the file when an auth file is damaged. */
export function createAuth(options: AuthOptions): Auth {
  const now = options.now ?? Date.now;
  const directory = options.dataDir === undefined ? null : join(options.dataDir, AUTH_FOLDER);
  const store = new AuthStore(directory, now);
  const codes = new CodeStore(directory, now, (id) => store.accountById(id) !== undefined);
  const limits: AuthLimits = {
    register: new SlidingWindowLimit(5, HOUR_MS, now),
    loginByAddress: new SlidingWindowLimit(10, 15 * MINUTE_MS, now),
    failedLoginByEmail: new SlidingWindowLimit(5, 15 * MINUTE_MS, now),
  };
  const sendLimits: CodeSendLimits = {
    perMinute: new SlidingWindowLimit(1, MINUTE_MS, now),
    perHour: new SlidingWindowLimit(5, HOUR_MS, now),
  };
  // Hashed here with the same defaults as a real password, so a verify against it takes as long.
  const dummyHash = Bun.password.hash(crypto.randomUUID());

  if (directory !== null) {
    try {
      writePrivateFileAtomically(directory, SERVER_PID_FILE, String(process.pid));
    } catch (error) {
      throw new PersistenceError(`${join(directory, SERVER_PID_FILE)} could not be written: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const sweep = setInterval(() => {
    limits.register.sweep();
    limits.loginByAddress.sweep();
    limits.failedLoginByEmail.sweep();
    sendLimits.perMinute.sweep();
    sendLimits.perHour.sweep();
    try {
      store.dropExpiredSessions();
      codes.dropDead();
    } catch (error) {
      // Memory keeps the expired sessions and codes (they are already refused at lookup), and the next sweep tries again.
      console.error("The hourly sweep could not save the sessions or the codes:", error);
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  function accountOf(req: Request): Account | null {
    const account = accountOfRequest(store, req);
    return account === undefined ? null : toAccount(account);
  }

  return {
    accountOf,
    requireAccount(req) {
      // Before the session lookup, so a cross-site request learns nothing about the session.
      refuseCrossSite(req, options.trustProxy);
      const account = accountOf(req);
      if (account === null) throw new AuthError("not_signed_in");
      return account;
    },
    accountById(id) {
      const account = store.accountById(id);
      return account === undefined ? null : toAccount(account);
    },
    markEmailVerified(id) {
      store.markEmailVerified(id);
    },
    registerRoutes(router) {
      const deps: EmailRouteDeps = {
        store,
        limits,
        dummyHash,
        secureCookies: options.secureCookies,
        trustProxy: options.trustProxy,
        now,
        codes,
        mail: options.mail,
        sendLimits,
        sendSignUpCode: (account, language) => sendSignUpCode(deps, account, language),
        metrics: options.metrics ?? NO_METRICS,
      };
      registerAuthRoutes(router, deps);
      registerEmailRoutes(router, deps);
    },
    stop() {
      clearInterval(sweep);
      if (directory !== null) removeOwnPidFile(directory);
    },
  };
}

/** Built field by field, so the password hash never leaves this folder. */
function toAccount(account: StoredAccount): Account {
  return { id: account.id, email: account.email, createdAt: account.createdAt, emailVerified: account.emailVerified };
}

function removeOwnPidFile(directory: string): void {
  const path = join(directory, SERVER_PID_FILE);
  // Another process may have started on the directory since; its file stays.
  if (existsSync(path) && readFileSync(path, "utf8") === String(process.pid)) rmSync(path, { force: true });
}
