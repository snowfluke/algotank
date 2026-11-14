// The pages of the app and the paths that lead to them. This is the only file
// that knows the URL shapes, so a new page edits this file and App.tsx.

import { isResultId, type CreateArenaRequest, type PublicKind } from "@game/arena";

/** The two arenas a signed-in person can create. */
type CreatableKind = CreateArenaRequest["kind"];

export type Route =
  | { readonly page: "home" }
  | { readonly page: "join" }
  | { readonly page: "play" }
  | { readonly page: "signIn" }
  /** The email code step of a signed-in account (auth/VerifyEmailPage.tsx). */
  | { readonly page: "verifyEmail" }
  | { readonly page: "create"; readonly kind: CreatableKind }
  | { readonly page: "host"; readonly arenaId: string }
  | { readonly page: "screen"; readonly arenaId: string }
  | { readonly page: "player"; readonly arenaId: string }
  | { readonly page: "kit" }
  | { readonly page: "workshop" }
  | { readonly page: "myTank" }
  | { readonly page: "champions" }
  /** The monthly arena: a league that always runs (docs/specs/revamp/77-monthly-league.md). */
  | { readonly page: "monthly" }
  /** A stored tournament result (results-protocol.ts); the id is the only key to it. */
  | { readonly page: "result"; readonly resultId: string }
  | { readonly page: "myResults" }
  /** The host's usage numbers (metrics/AdminMetricsPage.tsx); the server answers 404 to anyone but ADMIN_EMAILS. */
  | { readonly page: "adminMetrics" }
  | { readonly page: "notFound" };

export const paths = {
  home: () => "/",
  join: () => "/join",
  play: () => "/play",
  /** `next` is the page to return to after signing in; auth/nextPath.ts checks it on the way back. */
  signIn: (next?: string) => (next === undefined ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`),
  /** `next` is the page to return to once the email is verified. */
  verifyEmail: (next?: string) => (next === undefined ? "/verify-email" : `/verify-email?next=${encodeURIComponent(next)}`),
  create: (kind: CreatableKind) => `/new/${kind}`,
  host: (arenaId: string) => `/a/${encodeURIComponent(arenaId)}/host`,
  screen: (arenaId: string) => `/a/${encodeURIComponent(arenaId)}/screen`,
  player: (arenaId: string) => `/a/${encodeURIComponent(arenaId)}`,
  kit: () => "/kit",
  workshop: () => "/workshop",
  myTank: () => "/my-tank",
  champions: () => "/champions",
  monthly: () => "/monthly",
  /** The monthly arena with its join step open, where the sign-in page returns to. */
  monthlyJoin: () => "/monthly?join=1",
  result: (resultId: string) => `/r/${encodeURIComponent(resultId)}`,
  myResults: () => "/my-results",
  adminMetrics: () => "/admin/metrics",
  /** The chooser of the three public arenas, with one of them chosen. */
  playIn: (kind: PublicKind) => `/play?arena=${kind}`,
} as const;

const NOT_FOUND: Route = { page: "notFound" };

/** A pasted link's path ends at the first "?" or "#". */
const QUERY_OR_FRAGMENT = /[?#]/;

/** Pages that have one path segment and no arena. */
const SINGLE_SEGMENT: Readonly<Record<string, Route>> = {
  join: { page: "join" },
  play: { page: "play" },
  "sign-in": { page: "signIn" },
  "verify-email": { page: "verifyEmail" },
  kit: { page: "kit" },
  workshop: { page: "workshop" },
  "my-tank": { page: "myTank" },
  champions: { page: "champions" },
  monthly: { page: "monthly" },
  "my-results": { page: "myResults" },
};

/** The server ignores the case of an arena id, so the browser keys its stored tokens by the upper case form. */
function decodeArenaId(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded === "" ? null : decoded.toUpperCase();
  } catch {
    // A malformed escape such as %E0%A4 is a bad link, not a crash.
    return null;
  }
}

function parseArenaRoute(segments: readonly string[]): Route {
  if (segments.length < 2 || segments.length > 3) return NOT_FOUND;
  const arenaId = decodeArenaId(segments[1] ?? "");
  if (arenaId === null) return NOT_FOUND;
  switch (segments[2]) {
    case undefined:
      return { page: "player", arenaId };
    case "host":
      return { page: "host", arenaId };
    case "screen":
      return { page: "screen", arenaId };
    default:
      return NOT_FOUND;
  }
}

export function parseRoute(pathname: string): Route {
  const segments = pathname.split("/").filter((s) => s !== "");
  const [first, second] = segments;
  if (first === undefined) return { page: "home" };
  if (segments.length === 1 && Object.hasOwn(SINGLE_SEGMENT, first)) return SINGLE_SEGMENT[first] ?? NOT_FOUND;
  if (first === "new" && segments.length === 2 && (second === "private" || second === "presenter")) {
    return { page: "create", kind: second };
  }
  if (first === "a") return parseArenaRoute(segments);
  if (first === "admin" && second === "metrics" && segments.length === 2) return { page: "adminMetrics" };
  // A result id is base64url, so it needs no decoding; anything else is not a result.
  if (first === "r" && segments.length === 2 && second !== undefined && isResultId(second)) return { page: "result", resultId: second };
  return NOT_FOUND;
}

/**
 * The arena id in a pasted link ("https://host/a/K7M2QX", "host/a/K7M2QX/screen",
 * "/a/K7M2QX"), or null when the text is not a link to an arena page.
 */
export function arenaIdFromLink(text: string): string | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("/a/");
  if (start === -1) return null;
  const path = trimmed.slice(start).split(QUERY_OR_FRAGMENT)[0] ?? "";
  const route = parseRoute(path);
  return route.page === "player" || route.page === "host" || route.page === "screen" ? route.arenaId : null;
}
