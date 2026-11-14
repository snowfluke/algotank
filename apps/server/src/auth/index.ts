// Accounts and sign-in: email and password, a session in an HttpOnly cookie.
// Other features call accountOf or requireAccount; nothing outside this folder reads
// the session cookie or the auth tables.
//
// Session lifecycle (terminal state: ended; an ended token is rejected like an unknown one):
//
// | From   | To     | Actor   | Guard                                                             |
// |--------|--------|---------|-------------------------------------------------------------------|
// | none   | active | visitor | register with a valid new email and password, or log in with the |
// |        |        |         | correct credentials; rate limit not exceeded                      |
// | active | ended  | account | logout                                                            |
// | active | ended  | server  | 30 days after creation; the account's 11th login ends the oldest; |
// |        |        |         | a password reset (scripts/reset-password.ts, also while the       |
// |        |        |         | server runs, or by an email code:                                 |
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
// - Anyone who knows an email can block its logins for 15 minutes with 5 wrong passwords.
// - With TRUST_PROXY=1 the first X-Forwarded-For entry is the client address. A proxy
//   that appends to a client-sent header lets a client choose its address and pass
//   the per-address limits.

import type { Database } from "bun:sqlite";
import type { AccountId } from "@game/arena";
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
   * Throws for an unknown account.
   */
  markEmailVerified(id: AccountId): void;
  registerRoutes(router: Router): void;
  /** Stops the hourly sweep of expired sessions. */
  stop(): void;
}

export interface AuthOptions {
  /** The server's database (db/open.ts), with the tables account, session and email_code. */
  readonly db: Database;
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
export function createAuth(options: AuthOptions): Auth {
  const now = options.now ?? Date.now;
  const store = new AuthStore(options.db, now);
  const codes = new CodeStore(options.db, now);
  // As at every start before the database: the sessions that expired while the server was stopped go now, not an hour later.
  store.dropExpiredSessions();
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
      // The expired sessions and codes stay (they are already refused at lookup), and the next sweep tries again.
      console.error("The hourly sweep could not delete the expired sessions or codes:", error);
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
        inTransaction: (work) => options.db.transaction(work).immediate(),
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
    },
  };
}

/** Built field by field, so the password hash never leaves this folder. */
function toAccount(account: StoredAccount): Account {
  return { id: account.id, email: account.email, createdAt: account.createdAt, emailVerified: account.emailVerified };
}
