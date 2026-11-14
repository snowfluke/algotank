// Server settings from the environment. index.ts reads them once at start.
//
// PORT              Port to listen on (default 8787).
// HOST              The address to listen on, for example 127.0.0.1 behind a proxy on the same
//                   machine (default: every interface).
// DATA_DIR          The folder of the database DATA_DIR/algotank.sqlite, which holds
//                   everything the server keeps (default ./data).
// COOKIE_SECURE     "1" adds Secure to the sign-in cookie, so the browser sends it only
//                   over HTTPS. Turn it on in production; off by default for local http.
// TRUST_PROXY       "1" reads the client address from X-Forwarded-For and the host from
//                   X-Forwarded-Host. Turn it on only behind a proxy that sets both,
//                   because otherwise a client can choose them. Off by default.
// ARENA_TTL_HOURS   A private or presenter arena with no activity for this many hours is
//                   removed (default 24). A positive number; fractions are allowed.
// PUBLIC_ARENA_MAX  The most practice arenas the server keeps at once (default 20). A whole
//                   number of at least 1.
// LEAGUE_TIME_ZONE  The time zone whose calendar days and months the monthly league follows
//                   (default Asia/Jakarta). An IANA zone name such as Europe/Berlin; checked at start.
// PUBLIC_TIME_DIVISOR  For scripted runs only: divides the public arenas' turn length (down to
//                   100 ms) and their countdowns, breaks and result times by this whole number
//                   from 1 to 9 (default 1, the real game). It divides the monthly league's turn
//                   too, but not its day: a day still follows the calendar.
// LEAGUE_SHORT_DAYS For scripted runs only: "<ISO time>/<seconds per day>/<days per month>", for
//                   example 2026-11-14T10:00:00Z/120/3. The league's days then last that many
//                   seconds from that moment on, and a month has that many days
//                   (monthly/calendar.ts), so a day close and a month close happen within minutes.
// STATIC_DIR        The folder with the built web client (default apps/web/dist). Set it to
//                   serve another build, for example one made with `vite build --outDir`.
// SMTP_HOST         The mail server for verification and password-reset codes, for example
//                   smtp.gmail.com. Without it the server sends no email: accounts stay unverified
//                   and a forgotten password is reset by the operator (scripts/reset-password.ts).
// SMTP_PORT         465 (TLS, the default) or another port that offers STARTTLS, such as 587.
// SMTP_USER         The login at the mail server. Set it together with SMTP_PASS, or neither.
// SMTP_PASS         Its password; for Gmail an app password (see docs/deployment/10-mail.md).
// MAIL_FROM         The sender address, for example "AlgoTank <game@example.org>". Needed with SMTP_HOST.
// ADMIN_EMAILS      Comma-separated emails of the accounts that may open /admin/metrics, the usage
//                   numbers (metrics/routes.ts). With SMTP_HOST the email must also be verified.
//                   Not set: nobody may.
// METRICS_TOKEN     The bearer token of GET /metrics, the server health in the Prometheus text
//                   format (docs/deployment/06-monitoring.md). At least 16 characters. Not set:
//                   the route does not exist.

import { DEFAULT_ARENA_TTL_HOURS } from "./arena-lifetime.ts";
import { emailProblem, normalizeEmail } from "./auth/credentials.ts";
import { DEFAULT_LEAGUE_TIME_ZONE, isTimeZone, parseShortDays, type ShortDays } from "./monthly/calendar.ts";
import { DEFAULT_SMTP_PORT, type MailSettings } from "./mail.ts";
import { DEFAULT_PUBLIC_ARENA_MAX } from "./public-arenas.ts";
import { PUBLIC_TIME_DIVISOR_MAX } from "./public-kinds.ts";

export const DEFAULT_PORT = 8787;
/** Relative to the folder the server starts in. */
export const DEFAULT_DATA_DIR = "./data";

export interface ServerConfig {
  readonly port: number;
  /** HOST, or undefined to listen on every interface. */
  readonly host: string | undefined;
  /** Where arenas and accounts are saved, so a restart does not end a game. */
  readonly dataDir: string;
  /** COOKIE_SECURE. */
  readonly secureCookies: boolean;
  /** TRUST_PROXY. */
  readonly trustProxy: boolean;
  /** ARENA_TTL_HOURS. */
  readonly arenaTtlHours: number;
  /** PUBLIC_ARENA_MAX. */
  readonly publicArenaMax: number;
  /** STATIC_DIR, or undefined for the server's default folder. */
  readonly staticDir: string | undefined;
  /** LEAGUE_TIME_ZONE. */
  readonly leagueTimeZone: string;
  /** PUBLIC_TIME_DIVISOR. */
  readonly publicTimeDivisor: number;
  /** LEAGUE_SHORT_DAYS, or null for the time zone's days. */
  readonly leagueShortDays: ShortDays | null;
  /** SMTP_* and MAIL_FROM, or null when SMTP_HOST is not set (no email). */
  readonly mail: MailSettings | null;
  /** ADMIN_EMAILS, normalized; empty when not set. */
  readonly adminEmails: readonly string[];
  /** METRICS_TOKEN, or null when not set (no /metrics route). */
  readonly metricsToken: string | null;
}

/** A shorter token is easy to guess, and /metrics tells how busy the server is. */
const METRICS_TOKEN_MIN_LENGTH = 16;
const HAS_SPACE = /\s/;

export class ConfigError extends Error {}

/** The value of `name`, or undefined when it is missing or empty. */
function optional(env: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value === "" ? undefined : value;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): ServerConfig {
  const dataDir = optional(env, "DATA_DIR") ?? DEFAULT_DATA_DIR;

  // Only "1" turns a switch on, so a typo such as "true" leaves the safe default for TRUST_PROXY.
  const secureCookies = env["COOKIE_SECURE"] === "1";
  const trustProxy = env["TRUST_PROXY"] === "1";

  const rawPort = optional(env, "PORT");
  const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`PORT must be a whole number from 0 to 65535, but it is "${rawPort}".`);
  }

  const rawTtl = optional(env, "ARENA_TTL_HOURS");
  const arenaTtlHours = rawTtl === undefined ? DEFAULT_ARENA_TTL_HOURS : Number(rawTtl);
  if (!Number.isFinite(arenaTtlHours) || arenaTtlHours <= 0) {
    throw new ConfigError(`ARENA_TTL_HOURS must be a number of hours above 0, but it is "${rawTtl}".`);
  }

  const rawMax = optional(env, "PUBLIC_ARENA_MAX");
  const publicArenaMax = rawMax === undefined ? DEFAULT_PUBLIC_ARENA_MAX : Number(rawMax);
  if (!Number.isInteger(publicArenaMax) || publicArenaMax < 1) {
    throw new ConfigError(`PUBLIC_ARENA_MAX must be a whole number of at least 1, but it is "${rawMax}".`);
  }

  const leagueTimeZone = optional(env, "LEAGUE_TIME_ZONE") ?? DEFAULT_LEAGUE_TIME_ZONE;
  if (!isTimeZone(leagueTimeZone)) {
    throw new ConfigError(`LEAGUE_TIME_ZONE must be a time zone name such as Asia/Jakarta, but it is "${leagueTimeZone}".`);
  }

  const rawDivisor = optional(env, "PUBLIC_TIME_DIVISOR");
  const publicTimeDivisor = rawDivisor === undefined ? 1 : Number(rawDivisor);
  if (!Number.isInteger(publicTimeDivisor) || publicTimeDivisor < 1 || publicTimeDivisor > PUBLIC_TIME_DIVISOR_MAX) {
    throw new ConfigError(`PUBLIC_TIME_DIVISOR must be a whole number from 1 to ${PUBLIC_TIME_DIVISOR_MAX}, but it is "${rawDivisor}".`);
  }

  const rawShortDays = optional(env, "LEAGUE_SHORT_DAYS");
  const leagueShortDays = rawShortDays === undefined ? null : parseShortDays(rawShortDays);
  if (rawShortDays !== undefined && leagueShortDays === null) {
    throw new ConfigError(`LEAGUE_SHORT_DAYS must look like 2026-11-14T10:00:00Z/120/3 (a time, 10 to 86400 seconds per day, 1 to 31 days per month), but it is "${rawShortDays}".`);
  }

  const mail = loadMail(env);

  const rawAdmins = optional(env, "ADMIN_EMAILS");
  const adminEmails = rawAdmins === undefined ? [] : rawAdmins.split(",").map(normalizeEmail).filter((email) => email !== "");
  const badAdmin = adminEmails.find((email) => emailProblem(email) !== null);
  if (badAdmin !== undefined) throw new ConfigError(`ADMIN_EMAILS must be emails separated by commas, but "${badAdmin}" is not an email.`);

  const metricsToken = optional(env, "METRICS_TOKEN") ?? null;
  if (metricsToken !== null && (metricsToken.length < METRICS_TOKEN_MIN_LENGTH || HAS_SPACE.test(metricsToken))) {
    throw new ConfigError(`METRICS_TOKEN must have at least ${METRICS_TOKEN_MIN_LENGTH} characters and no spaces.`);
  }

  return {
    port,
    host: optional(env, "HOST"),
    dataDir,
    secureCookies,
    trustProxy,
    arenaTtlHours,
    publicArenaMax,
    staticDir: optional(env, "STATIC_DIR"),
    leagueTimeZone,
    publicTimeDivisor,
    leagueShortDays,
    mail,
    adminEmails,
    metricsToken,
  };
}

const MAIL_NAMES = ["SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;

/** All or nothing, so a half-set mail server fails at start instead of at the first sign-up. */
function loadMail(env: Readonly<Record<string, string | undefined>>): MailSettings | null {
  const host = optional(env, "SMTP_HOST");
  if (host === undefined) {
    const stray = MAIL_NAMES.filter((name) => optional(env, name) !== undefined);
    if (stray.length > 0) throw new ConfigError(`${stray.join(", ")} need SMTP_HOST. Set SMTP_HOST, or remove them to run without email.`);
    return null;
  }
  const rawPort = optional(env, "SMTP_PORT");
  const port = rawPort === undefined ? DEFAULT_SMTP_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`SMTP_PORT must be a whole number from 1 to 65535, but it is "${rawPort}".`);
  }
  const user = optional(env, "SMTP_USER");
  const pass = optional(env, "SMTP_PASS");
  if ((user === undefined) !== (pass === undefined)) throw new ConfigError("Set SMTP_USER and SMTP_PASS together, or neither.");
  const from = optional(env, "MAIL_FROM");
  if (from === undefined) throw new ConfigError("MAIL_FROM is needed with SMTP_HOST, for example MAIL_FROM=AlgoTank <game@example.org>.");
  return { host, port, login: user === undefined || pass === undefined ? null : { user, pass }, from };
}
