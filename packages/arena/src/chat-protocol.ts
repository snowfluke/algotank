// The messages of arena chat (docs/specs/revamp/72-arena-chat.md). Chat exists in private and
// presenter arenas only, while people wait: the lobby, the break and after the game. The
// owner switches it on and off (`setChat` in types.ts); the server holds the messages
// (apps/server/src/chat.ts). The routes are listed at the bottom of types.ts.
//
// The name and the look are copied into each message, so a message outlives its sender's
// seat: a player who leaves keeps their lines, a player the owner removes loses them
// (`chatRemoved` on the stream).

import type { PlayerId, TankLook } from "./types.ts";

export const CHAT_LIMITS = {
  /** The most characters (code points) of one message. */
  textMax: 200,
  /** A message is kept for 24 hours. */
  keepMs: 24 * 60 * 60 * 1000,
  /** At most this many messages per arena; the oldest go first. */
  keepCount: 500,
  /** GET /api/arenas/:id/chat answers at most this many. */
  pageSize: 100,
} as const;

/** "on" or "off" in a private or presenter arena; a public arena has no chat. */
export type ChatSetting = "on" | "off";

export type ChatSender =
  | { readonly kind: "player"; readonly playerId: PlayerId; readonly name: string; readonly look: TankLook }
  /** The arena's owner without a seat (the presenter, or a private owner who posts from the host page). */
  | { readonly kind: "host" };

export interface ChatMessage {
  /** Unique in its arena. The client uses it to drop a line it already has (the history and the stream overlap). */
  readonly id: string;
  /** Milliseconds since 1970. */
  readonly at: number;
  readonly sender: ChatSender;
  /** The result of parseChatText. Shown as plain text; a link is never made clickable. */
  readonly text: string;
}

/** Body of POST /api/arenas/:id/chat. */
export interface ChatPostRequest {
  readonly text: string;
}

/** Body of PUT /api/arenas/:id/chat. */
export interface ChatSettingRequest {
  readonly on: boolean;
}

/** GET /api/arenas/:id/chat. */
export interface ChatHistoryResponse {
  /** Oldest first, up to CHAT_LIMITS.pageSize, each younger than CHAT_LIMITS.keepMs. */
  readonly messages: readonly ChatMessage[];
}

/**
 * The codes of a refused chat call, in ErrorResponse.code:
 * - no_chat: a public arena (404).
 * - chat_off: the owner turned the chat off (409); GET answers it too.
 * - chat_closed: a round runs (409, POST only; GET still answers).
 * - chat_text_invalid: the text is not 1 to 200 characters after parseChatText (400).
 * - chat_text_blocked: the text holds a word of the server's block list (422). Not stored, not sent.
 * - chat_too_fast: this sender sent too many (429). `retryAfterMs` in the body, `Retry-After` in seconds.
 * - chat_busy: the whole arena sends too many (429), with the same two fields.
 */
export type ChatErrorCode = "no_chat" | "chat_off" | "chat_closed" | "chat_text_invalid" | "chat_text_blocked" | "chat_too_fast" | "chat_busy";

// Bidi controls are format characters, not control characters, but they reverse the text that
// follows them, so a line could show other words than it holds. Other format characters stay:
// the zero-width joiner builds emoji.
const CONTROL_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;
// A tab is a control character too, and it separates words, so it becomes a space like a line break.
const LINE_BREAKS_AND_TABS = /[\r\n\t\u2028\u2029]+/g;
const WHITE_SPACE = /\s+/g;

/**
 * The one validator of a chat line, for the server and the browser. It joins the lines with a
 * space (before the control characters go, because a line break is one), removes control
 * characters, makes every run of white space one space, trims, and counts code points, so an
 * emoji counts as one character. Null when the value is not text or not 1 to
 * CHAT_LIMITS.textMax characters afterwards.
 */
export function parseChatText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFC").replace(LINE_BREAKS_AND_TABS, " ").replace(CONTROL_CHARACTERS, "").replace(WHITE_SPACE, " ").trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= CHAT_LIMITS.textMax ? text : null;
}
