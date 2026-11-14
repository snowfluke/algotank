// Request and response helpers shared by every route: JSON bodies, bearer
// tokens, and the mapping from an arena rejection to an HTTP status.

import {
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  type ArenaError,
  type ArenaId,
  type ArenaRouteErrorCode,
  type ChatErrorCode,
  type ErrorResponse,
  type MonthlyErrorCode,
} from "@game/arena";

const MAX_BODY_BYTES = 64 * 1024;

export interface HttpErrorExtra {
  readonly details?: readonly string[];
  readonly code?: ArenaRouteErrorCode | ChatErrorCode | MonthlyErrorCode;
  /** With arena_limit: the arena the account owns. */
  readonly arenaId?: ArenaId;
  /** With rate_limited: also sent as the Retry-After header. */
  readonly retryAfterSeconds?: number;
  /** With chat_too_fast and chat_busy: the wait in milliseconds; the Retry-After header carries it in whole seconds, rounded up. */
  readonly retryAfterMs?: number;
  /** With name_blocked: a name from the game to offer instead. */
  readonly suggestion?: string;
  /** On the 404 of an arena that ended: its last stored result. */
  readonly resultId?: string;
}

/** An error the client caused or may fix. The router turns it into an ErrorResponse. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: HttpErrorExtra = {},
  ) {
    super(message);
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return jsonTextResponse(JSON.stringify(body), status);
}

/** For a body that is already serialized, such as a cached replay. */
export function jsonTextResponse(json: string, status = 200): Response {
  return new Response(json, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** A body already compressed with gzip. Send it only to a client for which acceptsGzip is true. */
export function gzipJsonResponse(bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "cache-control": "no-store",
    },
  });
}

const QUALITY = /^q=(\d(?:\.\d{0,3})?)$/i;

/** True when the Accept-Encoding header lists gzip with a quality above 0 (q=0 means "not acceptable"). */
export function acceptsGzip(req: Request): boolean {
  const header = req.headers.get("accept-encoding");
  if (header === null) return false;
  for (const entry of header.split(",")) {
    const [coding, ...parameters] = entry.trim().split(";");
    if (coding?.trim().toLowerCase() !== "gzip") continue;
    const quality = parameters.map((p) => QUALITY.exec(p.trim())?.[1]).find((q) => q !== undefined);
    return quality === undefined || Number(quality) > 0;
  }
  return false;
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function errorResponse(error: HttpError): Response {
  const { details, code, arenaId, retryAfterSeconds, retryAfterMs, suggestion, resultId } = error.extra;
  const body: ErrorResponse = {
    error: error.message,
    ...(details === undefined ? {} : { details }),
    ...(code === undefined ? {} : { code }),
    ...(arenaId === undefined ? {} : { arenaId }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    ...(suggestion === undefined ? {} : { suggestion }),
    ...(resultId === undefined ? {} : { resultId }),
  };
  const response = jsonResponse(body, error.status);
  if (retryAfterSeconds !== undefined) response.headers.set("retry-after", String(retryAfterSeconds));
  // Retry-After counts whole seconds, so a wait of 200 ms is 1.
  if (retryAfterMs !== undefined) response.headers.set("retry-after", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return response;
}

/**
 * Reads a JSON body of at most `maxBytes`. It stops reading at the limit, so a
 * large upload without a Content-Length header cannot fill memory.
 */
export async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) throw tooLarge(maxBytes);
  if (req.body === null) throw new HttpError(400, "The request needs a JSON body.");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "The body is not valid JSON.");
  }
}

function tooLarge(maxBytes: number): HttpError {
  return new HttpError(413, `The body is larger than ${maxBytes / 1024} KB.`);
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const BEARER = /^Bearer\s+(\S+)$/i;

/** The token in the Authorization header, or null when there is none. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  return BEARER.exec(header)?.[1] ?? null;
}

// Player-facing text for each rejection. The Record type forces an entry for every ArenaError.
const ARENA_ERRORS: Readonly<Record<ArenaError, { status: number; message: string }>> = {
  wrong_phase: { status: 409, message: "That action is not allowed in the current phase of the event." },
  arena_full: { status: 409, message: "The arena is full." },
  name_taken: { status: 409, message: "That name is already taken." },
  name_invalid: {
    status: 400,
    message: `The name must have ${PLAYER_NAME_MIN} to ${PLAYER_NAME_MAX} characters: letters A to Z, digits, and one space between words.`,
  },
  unknown_player: { status: 404, message: "That player does not exist." },
  // 409, not 403: a client may treat 403 as "the token is wrong" and forget it,
  // but an eliminated player is still signed in and may still watch.
  player_eliminated: { status: 409, message: "You are out of the event." },
  not_enough_players: { status: 409, message: "More players are needed to start a round." },
  // The server builds the standings itself, so a mismatch is a server bug.
  standings_mismatch: { status: 500, message: "Something went wrong on the server." },
  // The server draws the rule set itself, so a mismatch is a server bug.
  rule_set_mismatch: { status: 500, message: "Something went wrong on the server." },
  look_invalid: { status: 400, message: "The tank look is not valid: it needs a colour, a skin, a second colour, a plate and an icon from the lists." },
  ban_unavailable: { status: 400, message: "Only an arena for signed-in players can keep a player out." },
  not_banned: { status: 404, message: "That account is not kept out of this arena." },
  tank_count_invalid: { status: 400, message: "The number of tanks is outside what this arena allows." },
  tank_count_below_players: { status: 409, message: "More people are in the arena than that number of tanks." },
};

export function httpErrorFor(error: ArenaError): HttpError {
  const { status, message } = ARENA_ERRORS[error];
  return new HttpError(status, message, { code: error });
}

/** The answer to a name with a blocked word (name-filter.ts). `suggestion` is a name from the game. */
export function nameBlocked(suggestion: string): HttpError {
  return new HttpError(400, "That name has a word we do not use in this game. You can take the suggested name or type another one.", {
    code: "name_blocked",
    suggestion,
  });
}
