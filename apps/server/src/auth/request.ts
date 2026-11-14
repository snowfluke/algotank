// What the auth module reads from a request: the session cookie, the origin check
// and the client address. Each rule is here once.

import { randomBytes } from "node:crypto";
import { HttpError } from "../http.ts";
import { AuthError } from "./errors.ts";
import { SESSION_LIFETIME_MS } from "./store.ts";

const SESSION_COOKIE = "algotank_session";
/** 32 random bytes in base64url without padding. */
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_MAX_AGE_SECONDS = SESSION_LIFETIME_MS / 1000;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

type SessionCookie =
  | { readonly kind: "absent" }
  /** The cookie is there but cannot be a token the server made, so it matches no session. */
  | { readonly kind: "malformed" }
  | { readonly kind: "token"; readonly token: string };

/** The first algotank_session cookie of the request. */
export function sessionCookieOf(req: Request): SessionCookie {
  const header = req.headers.get("cookie");
  if (header === null) return { kind: "absent" };
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1 || pair.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = pair.slice(separator + 1).trim();
    return SESSION_TOKEN.test(value) ? { kind: "token", token: value } : { kind: "malformed" };
  }
  return { kind: "absent" };
}

export interface CookieOptions {
  readonly secureCookies: boolean;
}

export function sessionCookie(token: string, options: CookieOptions): string {
  return cookieHeader(`${SESSION_COOKIE}=${token}`, SESSION_MAX_AGE_SECONDS, options);
}

export function clearedSessionCookie(options: CookieOptions): string {
  return cookieHeader(`${SESSION_COOKIE}=`, 0, options);
}

function cookieHeader(pair: string, maxAgeSeconds: number, options: CookieOptions): string {
  return `${pair}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${options.secureCookies ? "; Secure" : ""}`;
}

/** The host the visitor asked for: the Host header, or with a trusted proxy the first X-Forwarded-Host. Null when missing. */
export function requestHost(req: Request, trustProxy: boolean): string | null {
  const forwarded = trustProxy ? firstListEntry(req.headers.get("x-forwarded-host")) : null;
  const host = forwarded ?? req.headers.get("host");
  return host === null || host === "" ? null : host;
}

/**
 * True when the Origin header names this site: the same host and port as the Host
 * header (or the first X-Forwarded-Host when the proxy is trusted). A missing,
 * "null" or unparsable Origin, or a missing Host, is not this site.
 */
function comesFromThisSite(req: Request, trustProxy: boolean): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return false;
  const host = requestHost(req, trustProxy);
  if (host === null) return false;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;
    // Parsed with the origin's scheme, so "example.org:443" and "https://example.org" compare equal.
    return originUrl.host === new URL(`${originUrl.protocol}//${host}`).host;
  } catch {
    return false; // an unparsable Origin or Host is not this site
  }
}

/**
 * The cross-site request check. A request that changes state (not GET or HEAD) must
 * come from this site when it carries the session cookie. It must also come from this
 * site whenever it sends an Origin header at all, so another site cannot sign a visitor
 * in to an account of its choosing (login CSRF).
 */
export function refuseCrossSite(req: Request, trustProxy: boolean): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const carriesCookie = sessionCookieOf(req).kind !== "absent";
  if ((carriesCookie || req.headers.has("origin")) && !comesFromThisSite(req, trustProxy)) {
    throw new AuthError("bad_origin");
  }
}

/** The socket address, or with a trusted proxy the first X-Forwarded-For entry. */
export function clientAddress(req: Request, server: Bun.Server<undefined>, trustProxy: boolean): string {
  const forwarded = trustProxy ? firstListEntry(req.headers.get("x-forwarded-for")) : null;
  // A socket without an address (a Unix socket) shares one key, which limits more, not less.
  return forwarded ?? server.requestIP(req)?.address ?? "unknown";
}

function firstListEntry(header: string | null): string | null {
  const first = header?.split(",")[0]?.trim();
  return first === undefined || first === "" ? null : first;
}

const JSON_MEDIA_TYPE = "application/json";

/**
 * Bodies must be declared JSON. A cross-site form cannot send that type without a
 * CORS preflight, which this server never answers.
 */
export function requireJsonContentType(req: Request): void {
  const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== JSON_MEDIA_TYPE) throw new HttpError(415, "Send the body as JSON with Content-Type: application/json.");
}
