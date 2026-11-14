// Arena chat on the server (docs/specs/revamp/72-arena-chat.md): who may read and post, the
// messages of each arena, their file, and the rate limits. The routes are in chat-routes.ts,
// the messages in packages/arena/src/chat-protocol.ts.
//
// When the chat is open. `Arena.chat` is the owner's setting ("on" by default, setChat in the
// reducer, any phase); everything else is derived here (chatStateOf):
// | Arena kind          | Phase                    | Setting   | Read (GET, stream) | Post                       |
// |---------------------|--------------------------|-----------|--------------------|----------------------------|
// | private, presenter  | lobby, break, finished   | on        | player, owner      | player, owner              |
// | private, presenter  | running                  | on        | player, owner      | nobody (409 chat_closed)   |
// | private, presenter  | any                      | off       | nobody (409        | nobody (409 chat_off)      |
// |                     |                          |           | chat_off); stream  |                            |
// |                     |                          |           | sends nothing new  |                            |
// | practice, tournament| any                      | (no chat) | 404 no_chat        | 404 no_chat                |
// "Player" is a player in the arena (a "waiting" one too) who sends their token; "owner" is the
// owner's session without a token, who posts as the host. A viewer never reads the chat.
// Transition: on <-> off, actor the owner, any phase. Terminal: none; the chat ends with the arena.
//
// Retention. A message is kept for CHAT_LIMITS.keepMs (24 hours), at most CHAT_LIMITS.keepCount
// (500) per arena, oldest dropped first. Pruning runs on every read and post and in the 10-minute
// sweep of arena-lifetime.ts. Closing or expiring the arena removes its chat: the arena row's
// delete takes its lines with it (ON DELETE CASCADE). The owner removing a player removes that
// player's messages (removePlayerChat); a player who leaves keeps them, because each message
// carries its own name and look.
//
// Storage. The table `chat_line` (db/schema.ts), read on each call. A post is written before the
// answer, so a line that reached the streams is not lost in a crash. Player tokens are never in it.
//
// Rate limits (token buckets, rate-limit.ts). Per sender: 5 at once, then 1 every 3 seconds.
// Per arena: 20 at once, then 5 per second. Both are checked before either is spent, so a
// refusal by one never costs a token of the other. A line that is refused for a blocked word
// spends its tokens, which slows down someone who tries spellings until one passes; a line that
// is not text of 1 to 200 characters spends none. The buckets live in memory: a restart refills them.
//
// Named limits:
// - A block list never catches everything (name-filter.ts); the owner can turn the chat off and
//   remove a player.
// - A player who rejoins under a new seat gets a fresh sender limit.

import type { Database, Statement } from "bun:sqlite";
import {
  CHAT_LIMITS,
  parseChatText,
  parseTankLook,
  type Arena,
  type ArenaId,
  type ChatMessage,
  type ChatSender,
  type PlayerId,
} from "@game/arena";
import { invalidRow, jsonColumn } from "./db/rows.ts";
import { TokenBucket } from "./rate-limit.ts";
import type { ArenaRecord } from "./store.ts";
import type { StreamHub } from "./stream.ts";
import type { Clock } from "./timers.ts";

const SENDER_BURST = 5;
const SENDER_REFILL_MS = 3000;
const ARENA_BURST = 20;
const ARENA_REFILL_MS = 200;

// ---------------------------------------------------------------------------
// When the chat is open (the table above)
// ---------------------------------------------------------------------------

export type ChatState =
  /** A public arena. */
  | "none"
  | "off"
  /** A round runs: reading works, posting does not. */
  | "readOnly"
  | "open";

export function chatStateOf(arena: Arena): ChatState {
  if (arena.chat === null) return "none";
  if (arena.chat === "off") return "off";
  return arena.phase.kind === "running" ? "readOnly" : "open";
}

/** The players whose streams get the chat: every human in the arena. The owner's stream is marked when it opens. */
export function chatMembers(arena: Arena): ReadonlySet<PlayerId> {
  // A player the owner removed in a break stays in the list for the round history, but has left the room.
  return new Set(arena.players.filter((p) => !p.isBot && p.status.kind !== "removed").map((p) => p.id));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

interface LineRow {
  readonly sequence: number;
  readonly id: string;
  readonly at: number;
  readonly sender_kind: string;
  readonly player_id: string | null;
  readonly name: string | null;
  readonly look_json: string | null;
  readonly text: string;
}

const LINE_COLUMNS = "sequence, id, at, sender_kind, player_id, name, look_json, text";

export class ChatStore {
  private readonly insertLine: Statement<unknown, [string, string, number, string, string | null, string | null, string | null, string]>;
  private readonly newest: Statement<LineRow, [string, number]>;
  private readonly trimArena: Statement<unknown, [string, string, number]>;
  private readonly deleteOlderIn: Statement<unknown, [string, number]>;
  private readonly deleteOlder: Statement<unknown, [number]>;
  private readonly deletePlayer: Statement<unknown, [string, string]>;

  constructor(
    private readonly db: Database,
    private readonly now: Clock,
  ) {
    this.insertLine = db.prepare("INSERT INTO chat_line (arena_id, id, at, sender_kind, player_id, name, look_json, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    this.newest = db.prepare(`SELECT ${LINE_COLUMNS} FROM (SELECT ${LINE_COLUMNS} FROM chat_line WHERE arena_id = ? ORDER BY sequence DESC LIMIT ?) ORDER BY sequence`);
    this.trimArena = db.prepare("DELETE FROM chat_line WHERE arena_id = ? AND sequence NOT IN (SELECT sequence FROM chat_line WHERE arena_id = ? ORDER BY sequence DESC LIMIT ?)");
    this.deleteOlderIn = db.prepare("DELETE FROM chat_line WHERE arena_id = ? AND at < ?");
    this.deleteOlder = db.prepare("DELETE FROM chat_line WHERE at < ?");
    this.deletePlayer = db.prepare("DELETE FROM chat_line WHERE arena_id = ? AND sender_kind = 'player' AND player_id = ?");
  }

  /**
   * The newest CHAT_LIMITS.pageSize messages younger than CHAT_LIMITS.keepMs, oldest first. Prunes
   * first. Throws a PersistenceError that names a damaged row.
   */
  history(arenaId: ArenaId): readonly ChatMessage[] {
    this.deleteOlderIn.run(arenaId, this.oldestKept());
    return this.newest.all(arenaId, CHAT_LIMITS.pageSize).map(toMessage);
  }

  /** Adds a message and drops the old ones and the oldest beyond CHAT_LIMITS.keepCount, in one transaction. */
  append(arenaId: ArenaId, message: ChatMessage): void {
    const { sender } = message;
    this.db.transaction(() => {
      this.deleteOlderIn.run(arenaId, this.oldestKept());
      this.insertLine.run(
        arenaId,
        message.id,
        message.at,
        sender.kind,
        sender.kind === "player" ? sender.playerId : null,
        sender.kind === "player" ? sender.name : null,
        sender.kind === "player" ? JSON.stringify(sender.look) : null,
        message.text,
      );
      this.trimArena.run(arenaId, arenaId, CHAT_LIMITS.keepCount);
    }).immediate();
  }

  /** Removes every message of the player. True when there was one. */
  removePlayer(arenaId: ArenaId, playerId: PlayerId): boolean {
    return this.deletePlayer.run(arenaId, playerId).changes > 0;
  }

  /** Drops the messages older than CHAT_LIMITS.keepMs in every arena. The 10-minute sweep calls it. */
  pruneAll(): void {
    this.deleteOlder.run(this.oldestKept());
  }

  private oldestKept(): number {
    return this.now() - CHAT_LIMITS.keepMs;
  }
}

/** The stored text must be what the validator gives, so an edited row cannot hold a line the server would refuse. */
function toMessage(row: LineRow): ChatMessage {
  const key = String(row.sequence);
  const invalid = (reason: string) => invalidRow("chat_line", key, reason);
  if (parseChatText(row.text) !== row.text) throw invalid("the text is not a chat line the server accepts.");
  return { id: row.id, at: row.at, sender: toSender(row, key), text: row.text };
}

function toSender(row: LineRow, key: string): ChatSender {
  if (row.sender_kind === "host") return { kind: "host" };
  // Any stored name: the line carries the name the seat had, which an older name rule may have allowed.
  if (row.sender_kind !== "player" || row.player_id === null || row.name === null || row.name === "" || row.look_json === null) {
    throw invalidRow("chat_line", key, "the sender must be the host or a player with a name and a look.");
  }
  const look = parseTankLook(jsonColumn("chat_line", key, "look_json", row.look_json));
  if (look === null) throw invalidRow("chat_line", key, "look_json is not a tank look.");
  return { kind: "player", playerId: row.player_id, name: row.name, look };
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/** Who spends from a sender bucket: a player's seat, or the owner as the host. */
export type ChatSenderKey = { readonly kind: "player"; readonly playerId: PlayerId } | { readonly kind: "host" };

export type ChatRateAnswer =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: "chat_too_fast" | "chat_busy"; readonly waitMs: number };

interface ArenaBuckets {
  readonly arena: TokenBucket;
  /** By ChatSenderKey: the player id, or "host". */
  readonly senders: Map<string, TokenBucket>;
}

export class ChatLimits {
  private readonly arenas = new Map<ArenaId, ArenaBuckets>();

  constructor(private readonly now: Clock) {}

  /** Spends one token of the sender and one of the arena, or neither when either is empty. The sender's limit answers first. */
  take(arenaId: ArenaId, sender: ChatSenderKey): ChatRateAnswer {
    let buckets = this.arenas.get(arenaId);
    if (buckets === undefined) {
      buckets = { arena: new TokenBucket(ARENA_BURST, ARENA_REFILL_MS, this.now), senders: new Map() };
      this.arenas.set(arenaId, buckets);
    }
    const key = keyOf(sender);
    let own = buckets.senders.get(key);
    if (own === undefined) {
      own = new TokenBucket(SENDER_BURST, SENDER_REFILL_MS, this.now);
      buckets.senders.set(key, own);
    }
    const senderCheck = own.check();
    if (!senderCheck.allowed) return { allowed: false, code: "chat_too_fast", waitMs: senderCheck.waitMs };
    const arenaCheck = buckets.arena.check();
    if (!arenaCheck.allowed) return { allowed: false, code: "chat_busy", waitMs: arenaCheck.waitMs };
    own.take();
    buckets.arena.take();
    return { allowed: true };
  }

  /** A removed player's id never comes back, so the bucket would only hold memory. */
  removePlayer(arenaId: ArenaId, playerId: PlayerId): void {
    this.arenas.get(arenaId)?.senders.delete(keyOf({ kind: "player", playerId }));
  }

  removeArena(arenaId: ArenaId): void {
    this.arenas.delete(arenaId);
  }
}

function keyOf(sender: ChatSenderKey): string {
  // "host" cannot be a player id: ids start with "p" and a hex part (secrets.ts), so the two never meet.
  return sender.kind === "host" ? "host" : sender.playerId;
}

// ---------------------------------------------------------------------------
// The parts of the server that hold chat state for one arena
// ---------------------------------------------------------------------------

export interface ChatParts {
  readonly chat: ChatStore;
  readonly chatLimits: ChatLimits;
  readonly hub: StreamHub;
}

/**
 * The owner removed a player (DELETE /api/arenas/:id/players/:playerId): their messages and
 * sender bucket go, and the readers learn it. Call it after the reducer removed the player, so
 * the removed player's own stream no longer counts as a reader.
 */
export function removePlayerChat(parts: ChatParts, record: ArenaRecord, playerId: PlayerId): void {
  if (record.arena.chat === null) return;
  const arenaId = record.arena.id;
  parts.chatLimits.removePlayer(arenaId, playerId);
  parts.chat.removePlayer(arenaId, playerId);
  // Sent also when the player wrote nothing: one small message, and the client needs no other rule.
  parts.hub.sendChat(arenaId, { type: "chatRemoved", playerId }, chatMembers(record.arena));
}
