// The chat lines a page holds, as a reducer, so the rules for the overlap of the history and
// the stream run in tests without a browser:
//
// | Action              | Comes from                                   | Does                                              |
// |---------------------|----------------------------------------------|---------------------------------------------------|
// | history             | GET /api/arenas/:id/chat, after each open    | adds the lines the page does not have yet (by id) |
// | chat                | the stream, or the answer to the page's POST | adds the line unless the page has its id          |
// | chatRemoved         | the stream, when the owner removes a player  | drops that player's lines and remembers the id    |
//
// The server sends no history on connect and the stream and the history overlap, so a line
// can arrive twice: the id decides. Lines stay in time order, and lines of the same
// millisecond in the server's order. A removed player's id is remembered, so a history answer
// that left the server before the removal cannot bring their lines back.
//
// Named limit: a chatRemoved sent while the stream was down is missed; the removed player's
// lines then stay on this page until it reloads (the history after the reconnect no longer
// holds them, but the page keeps what it has).

import { CHAT_LIMITS, type ChatMessage, type PlayerId } from "@game/arena";
import type { ChatStreamMessage } from "./chatWire.ts";

export interface ChatLog {
  /** Oldest first, each id once, at most CHAT_LIMITS.keepCount (the server keeps no more). */
  readonly lines: readonly ChatMessage[];
  /** Players the owner removed in this page's life. */
  readonly removed: ReadonlySet<PlayerId>;
}

export const EMPTY_CHAT_LOG: ChatLog = { lines: [], removed: new Set() };

export type ChatLogAction = ChatStreamMessage | { readonly type: "history"; readonly messages: readonly ChatMessage[] };

/**
 * Time order. Array sort is stable, so lines of the same millisecond keep the order they are
 * given in, which is the server's order: the history lists them in the order they were sent,
 * and the stream sends them in that order too.
 */
const byTime = (a: ChatMessage, b: ChatMessage): number => a.at - b.at;

function senderId(message: ChatMessage): PlayerId | null {
  return message.sender.kind === "player" ? message.sender.playerId : null;
}

/** `fromHistory`: the incoming lines are the server's own list, so they go first and their order wins a tie. */
function withLines(log: ChatLog, incoming: readonly ChatMessage[], fromHistory: boolean): ChatLog {
  const allowed = incoming.filter((line) => {
    const sender = senderId(line);
    return sender === null || !log.removed.has(sender);
  });
  const known = new Set(log.lines.map((line) => line.id));
  if (allowed.every((line) => known.has(line.id))) return log;
  const incomingIds = new Set(allowed.map((line) => line.id));
  const merged = fromHistory
    ? [...allowed, ...log.lines.filter((line) => !incomingIds.has(line.id))]
    : [...log.lines, ...allowed.filter((line) => !known.has(line.id))];
  return { ...log, lines: merged.sort(byTime).slice(-CHAT_LIMITS.keepCount) };
}

export function reduceChatLog(log: ChatLog, action: ChatLogAction): ChatLog {
  switch (action.type) {
    case "history":
      return withLines(log, action.messages, true);
    case "chat":
      return withLines(log, [action.message], false);
    case "chatRemoved": {
      const removed = new Set(log.removed).add(action.playerId);
      return { lines: log.lines.filter((line) => senderId(line) !== action.playerId), removed };
    }
  }
}

/** Who reads the page: a player by their seat, or the owner on the host page. */
export type ChatReader = { readonly kind: "player"; readonly playerId: PlayerId } | { readonly kind: "host" };

export function isOwnLine(line: ChatMessage, reader: ChatReader): boolean {
  return reader.kind === "host" ? line.sender.kind === "host" : senderId(line) === reader.playerId;
}

/** The newest line the reader has seen, by time and id; null before the chat was ever shown. */
export type SeenMark = { readonly at: number; readonly id: string } | null;

/** The mark for the lines on screen now: the newest one. */
export function seenMarkOf(lines: readonly ChatMessage[]): SeenMark {
  const newest = lines.at(-1);
  return newest === undefined ? null : { at: newest.at, id: newest.id };
}

/** True when someone else wrote a line after the mark. The reader's own lines never count. */
export function hasUnread(lines: readonly ChatMessage[], seen: SeenMark, reader: ChatReader): boolean {
  const seenIndex = seen === null ? -1 : lines.findIndex((line) => line.id === seen.id);
  // A seen line that is gone (its sender was removed) still marks a time.
  const after = (line: ChatMessage, index: number) => seen === null || (seenIndex >= 0 ? index > seenIndex : line.at > seen.at);
  return lines.some((line, index) => !isOwnLine(line, reader) && after(line, index));
}
