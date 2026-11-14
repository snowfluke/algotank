# Work package B1: accounts and sign-in (server)

Read `00-overview.md` first. Owner's decisions: sign-in is by email and password; only a signed-in account can create an arena; joining and playing never need an account. This package builds accounts and sessions. Another package (B2) later uses them for arena ownership and the limit of one open arena per account. The sign-in screens are built later by a web package.

## You own

New folder `apps/server/src/auth/**` (code and tests), new file `packages/arena/src/auth-protocol.ts` with one export line in `packages/arena/src/index.ts`, new script `apps/server/scripts/reset-password.ts`, and the smallest edits in `apps/server/src/config.ts`, `apps/server/src/server.ts`, `apps/server/src/index.ts` and `apps/server/src/routes.ts` that construct the auth module, register its routes and put it into the route dependencies. Do not change the arena routes, the arena package's other files, or anything in `apps/web` (a web engineer is working there now).

## Session lifecycle

| From | To | Actor | Guard |
|------|----|-------|-------|
| none | active | visitor | register with a valid new email and password, or log in with correct credentials; rate limit not exceeded |
| active | ended | account | logout |
| active | ended | server | 30 days after creation; or the account logs in an 11th time (the oldest session ends); or a password reset |

Terminal state: ended. An ended session token is rejected like an unknown one.

## Protocol (`packages/arena/src/auth-protocol.ts`)

```ts
export type AccountId = string;
export interface PublicAccount { readonly id: AccountId; readonly email: string }
export interface RegisterRequest { readonly email: string; readonly password: string }
export type LoginRequest = RegisterRequest;
export interface AccountResponse { readonly account: PublicAccount }
export interface MeResponse { readonly account: PublicAccount | null }
export type AuthErrorCode =
  | "email_invalid" | "password_too_short" | "password_too_long" | "password_is_email"
  | "email_taken" | "invalid_credentials" | "rate_limited" | "not_signed_in" | "bad_origin";
export interface AuthErrorResponse { readonly error: string; readonly code: AuthErrorCode; readonly retryAfterSeconds?: number }
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
```

| Route | Body | Answer |
|-------|------|--------|
| `POST /api/auth/register` | `RegisterRequest` | 200 `AccountResponse` and the session cookie; 400 with a validation code; 409 `email_taken`; 429 `rate_limited` |
| `POST /api/auth/login` | `LoginRequest` | 200 `AccountResponse` and a new session cookie; 401 `invalid_credentials` (the same answer for an unknown email and a wrong password); 429 `rate_limited` |
| `POST /api/auth/logout` | none | 204; ends the session and clears the cookie; 204 also when no session exists |
| `GET /api/auth/me` | none | 200 `MeResponse` (null when not signed in) |

## The module's interface for the rest of the server

```ts
// apps/server/src/auth/index.ts
export interface Account { readonly id: AccountId; readonly email: string; readonly createdAt: string }
export interface Auth {
  /** The signed-in account of a request, read from its session cookie, or null. */
  accountOf(req: Request): Account | null;
  /** The account, or an HttpError: 401 not_signed_in without a session, 403 bad_origin when a request that changes state does not come from this site. */
  requireAccount(req: Request): Account;
  registerRoutes(router: Router): void;
  /** Stops the hourly sweep of expired sessions. */
  stop(): void;
}
export function createAuth(options: { dataDir?: string; secureCookies: boolean; trustProxy: boolean; now?: () => number }): Auth;
```

Match the existing patterns in `router.ts`, `http.ts` (HttpError, readJson, jsonResponse), `arena-files.ts` (atomic write, file mode, PersistenceError) and `secrets.ts` (tokens, constant-time compare). Reuse them; do not copy them.

## Rules

Each rule lives in one place and has a test through the routes.

- Email: trimmed and lower-cased before any use; at most 254 characters; must have one `@` with text on both sides and a dot in the domain. Stored and compared in the normalised form.
- Password: 8 to 200 characters, any characters, not equal to the email. No composition rules.
- Hashing: `Bun.password.hash` (argon2id) and `Bun.password.verify`. Never store, log or return a password or a hash.
- Login for an unknown email still runs one verify against a fixed dummy hash, so the answer time does not reveal whether the email exists.
- Session token: 32 random bytes, base64url. The server stores only its SHA-256 hash. Cookie `algotank_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, and `Secure` when `secureCookies` is true. Every login creates a new session.
- Origin check: a request with a method other than GET or HEAD that carries the session cookie must have an `Origin` header whose host equals the request's `Host` header (when `trustProxy` is true, `X-Forwarded-Host` is used if present). Otherwise 403 `bad_origin`. This applies to logout and to `requireAccount`.
- Rate limits, in memory, sliding window: register 5 per hour per client address; login 10 per 15 minutes per client address and 5 failed attempts per 15 minutes per email. A limited request answers 429 with `retryAfterSeconds` and a `Retry-After` header and does not run the password hash. The client address is the socket address; when `trustProxy` is true it is the first address in `X-Forwarded-For`.
- Request bodies: JSON only, at most 4 KB (reuse the existing body limit helper with this size).
- Storage: `DATA_DIR/auth/accounts.json` and `DATA_DIR/auth/sessions.json`, written atomically with mode 0600 in a directory with mode 0700. Without `dataDir` everything stays in memory. A file that cannot be read or has a wrong shape stops the start with a message that names the file. Expired sessions are dropped at load and once per hour.
- The arena loader today reads every `*.json` directly in `DATA_DIR` as an arena, so the `auth` subfolder must not disturb it; add a test with both present.
- Config: `COOKIE_SECURE` ("1" turns it on; default off for local http) and `TRUST_PROXY` ("1" turns it on; default off). Document both in the config file's comment. `HOST_KEY` stays as it is for now; B2 removes it.
- `apps/server/scripts/reset-password.ts <email>`: for the person who runs the server, because a forgotten password cannot be recovered by email. It reads the new password from standard input, applies the password rules, replaces the hash and ends that account's sessions. It prints nothing secret.

## Named limits (state them in your report and in the module's header comment)

- An email is not verified, so one person can register several accounts. The per-address rate limit is the only brake.
- Rate-limit counters live in memory and reset on a restart.
- Two server processes must not share one `DATA_DIR`.

## Check

- `bun test apps/server packages/arena` and `bunx tsc --noEmit -p apps/server && bunx tsc --noEmit -p packages/arena` are clean. Do not run the web type check; the web is being changed by someone else.
- Tests through the routes on a real server instance with a temporary data directory (the existing `server.test.ts` shows the pattern): register, me, logout, login; wrong password and unknown email give the same body and status; duplicate email; each validation code; the cookie attributes; a session survives a restart on the same data directory and ends after 30 days (inject `now`); the 11th login ends the oldest session; a POST with the cookie and a foreign or missing Origin is refused; each rate limit with `retryAfterSeconds`; a damaged accounts file stops the start; the reset script changes the password and ends sessions.
- One manual run with curl on port 8951 with a temporary `DATA_DIR`: register, me with the cookie, logout, me again. Stop the server by its PID and remove the directory by its literal path.

## Report

The common report, plus: the exact interface another engineer calls (`createAuth`, `Auth`), where it is wired in, and every security decision you took that this file does not state.
