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
// (500) per arena, oldest dropped first. Pruning runs on every read and in the 10-minute sweep
// of arena-lifetime.ts. Closing or expiring the arena removes its chat (closeArena). The owner
// removing a player removes that player's messages (removePlayerChat); a player who leaves keeps
// them, because each message carries its own name and look.
//
// Files. DATA_DIR/chat/<ARENA CODE>.json, 0600 in a 0700 folder, written atomically, at most once
// per second per arena: a change more than WRITE_INTERVAL_MS after the last write is written at
// once, a change sooner waits for the rest of the second. A failed write is logged and tried
// again a second later; the message is already in memory and on the streams. Loaded at start; a
// damaged file stops the start with its name. A file whose arena is gone (a crash between
// removing the arena and its chat) is removed at start with one log line. Player tokens are
// never in the file.
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
// - A message lost in the second before a crash is not recovered.
// - A player who rejoins under a new seat gets a fresh sender limit.

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  CHAT_LIMITS,
  isArenaCode,
  parseChatText,
  parseTankLook,
  type Arena,
  type ArenaId,
  type ChatMessage,
  type ChatSender,
  type PlayerId,
} from "@game/arena";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "./arena-files.ts";
import { isRecord } from "./http.ts";
import { TokenBucket } from "./rate-limit.ts";
import type { ArenaRecord } from "./store.ts";
import type { StreamHub } from "./stream.ts";
import type { Clock, Scheduler } from "./timers.ts";

export const CHAT_FOLDER = "chat";
/** The shortest time between two writes of one arena's chat file. */
const WRITE_INTERVAL_MS = 1000;
const STORED_VERSION = 1;
const CHAT_FILE = /^(.+)\.json$/;

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
// Messages and their files
// ---------------------------------------------------------------------------

interface ChatFile {
  readonly version: typeof STORED_VERSION;
  /** Oldest first. */
  readonly messages: readonly ChatMessage[];
}

export interface ChatStoreOptions {
  /** DATA_DIR. Without it the chat lives in memory only (tests). */
  readonly dataDir?: string;
  readonly now: Clock;
  /** Runs the delayed write. */
  readonly scheduler: Scheduler;
}

export class ChatStore {
  /** Oldest first, per arena. Replaced, never changed in place. */
  private readonly messages = new Map<ArenaId, readonly ChatMessage[]>();
  private readonly directory: string | null;
  private readonly now: Clock;
  private readonly scheduler: Scheduler;
  private readonly lastWriteAt = new Map<ArenaId, number>();
  private readonly waitingWrites = new Map<ArenaId, () => void>();

  /** With `dataDir`, loads every chat file, and throws a PersistenceError that names the first damaged one. */
  constructor(options: ChatStoreOptions) {
    this.now = options.now;
    this.scheduler = options.scheduler;
    this.directory = options.dataDir === undefined ? null : join(options.dataDir, CHAT_FOLDER);
    // Made at the first write, so a server without a chat has no empty folder.
    if (this.directory === null || !existsSync(this.directory)) return;
    for (const name of readdirSync(this.directory).sort()) {
      const match = CHAT_FILE.exec(name);
      if (match === null) continue;
      const arenaId = match[1] ?? "";
      this.messages.set(arenaId, readChatFile(join(this.directory, name), arenaId));
    }
  }

  /**
   * Removes the chat of every arena not in `arenaIds` (the arenas with a chat), memory and file.
   * At start, a file can outlive its arena when the server stopped between removing the two.
   */
  keepOnly(arenaIds: ReadonlySet<ArenaId>): void {
    for (const arenaId of [...this.messages.keys()]) {
      if (arenaIds.has(arenaId)) continue;
      console.log(`Removed the chat of arena ${arenaId}, because the arena is gone.`);
      this.removeArena(arenaId);
    }
  }

  /** The newest CHAT_LIMITS.pageSize messages younger than CHAT_LIMITS.keepMs, oldest first. Prunes first. */
  history(arenaId: ArenaId): readonly ChatMessage[] {
    this.prune(arenaId);
    return (this.messages.get(arenaId) ?? []).slice(-CHAT_LIMITS.pageSize);
  }

  /** Adds a message and drops the oldest beyond CHAT_LIMITS.keepCount. */
  append(arenaId: ArenaId, message: ChatMessage): void {
    const kept = this.younger(this.messages.get(arenaId) ?? []);
    this.replace(arenaId, [...kept, message].slice(-CHAT_LIMITS.keepCount));
  }

  /** Removes every message of the player. True when there was one. */
  removePlayer(arenaId: ArenaId, playerId: PlayerId): boolean {
    const all = this.messages.get(arenaId) ?? [];
    const kept = all.filter((m) => m.sender.kind !== "player" || m.sender.playerId !== playerId);
    if (kept.length === all.length) return false;
    this.replace(arenaId, kept);
    return true;
  }

  /** Removes the arena's chat from memory, then its file. Throws a PersistenceError when the file stays. */
  removeArena(arenaId: ArenaId): void {
    this.messages.delete(arenaId);
    this.lastWriteAt.delete(arenaId);
    this.waitingWrites.get(arenaId)?.();
    this.waitingWrites.delete(arenaId);
    if (this.directory === null) return;
    const path = this.pathOf(arenaId);
    try {
      rmSync(path, { force: true });
    } catch (error) {
      throw new PersistenceError(`The chat of arena ${arenaId} could not be removed from ${path}: ${describe(error)}`);
    }
  }

  /** Drops the messages older than CHAT_LIMITS.keepMs in every arena. The 10-minute sweep calls it. */
  pruneAll(): void {
    for (const arenaId of [...this.messages.keys()]) this.prune(arenaId);
  }

  /** Writes every waiting change now. The server calls it when it stops. */
  flush(): void {
    for (const [arenaId, cancel] of [...this.waitingWrites]) {
      cancel();
      this.waitingWrites.delete(arenaId);
      this.write(arenaId);
    }
  }

  private prune(arenaId: ArenaId): void {
    const all = this.messages.get(arenaId);
    if (all === undefined) return;
    const kept = this.younger(all);
    if (kept.length !== all.length) this.replace(arenaId, kept);
  }

  private younger(messages: readonly ChatMessage[]): readonly ChatMessage[] {
    const oldest = this.now() - CHAT_LIMITS.keepMs;
    return messages.filter((m) => m.at >= oldest);
  }

  private replace(arenaId: ArenaId, messages: readonly ChatMessage[]): void {
    this.messages.set(arenaId, messages);
    this.persist(arenaId);
  }

  /** Writes now when the last write is a second old, otherwise once the second is over. */
  private persist(arenaId: ArenaId): void {
    if (this.directory === null || this.waitingWrites.has(arenaId)) return;
    const sinceLast = this.now() - (this.lastWriteAt.get(arenaId) ?? Number.NEGATIVE_INFINITY);
    if (sinceLast >= WRITE_INTERVAL_MS) {
      this.write(arenaId);
      return;
    }
    this.waitLater(arenaId, WRITE_INTERVAL_MS - sinceLast);
  }

  private waitLater(arenaId: ArenaId, afterMs: number): void {
    this.waitingWrites.set(
      arenaId,
      this.scheduler.after(() => {
        this.waitingWrites.delete(arenaId);
        this.write(arenaId);
      }, afterMs),
    );
  }

  /** A failed write is logged and tried again, because the message already reached memory and the streams. */
  private write(arenaId: ArenaId): void {
    const messages = this.messages.get(arenaId);
    if (this.directory === null || messages === undefined) return;
    this.lastWriteAt.set(arenaId, this.now());
    const file: ChatFile = { version: STORED_VERSION, messages };
    try {
      createPrivateDirectory(this.directory);
      writePrivateFileAtomically(this.directory, `${arenaId}.json`, JSON.stringify(file));
    } catch (error) {
      console.error(`The chat of arena ${arenaId} could not be saved to ${this.pathOf(arenaId)}; trying again in ${WRITE_INTERVAL_MS} ms:`, error);
      this.waitLater(arenaId, WRITE_INTERVAL_MS);
    }
  }

  private pathOf(arenaId: ArenaId): string {
    // The id reaches a file path, so only a code the server could have made may pass.
    if (this.directory === null || !isArenaCode(arenaId)) throw new PersistenceError(`"${arenaId}" cannot name a chat file.`);
    return join(this.directory, `${arenaId}.json`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readChatFile(path: string, arenaId: string): readonly ChatMessage[] {
  const invalid = (what: string) => new PersistenceError(`The chat file ${path} is not valid: ${what}.`);
  if (!isArenaCode(arenaId)) throw invalid("its name must be an arena code");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The chat file ${path} cannot be read: ${describe(error)}`);
  }
  if (!isRecord(raw) || raw["version"] !== STORED_VERSION) throw invalid(`it must hold version ${STORED_VERSION}`);
  const list = raw["messages"];
  if (!Array.isArray(list) || list.length > CHAT_LIMITS.keepCount) throw invalid(`messages must be a list of at most ${CHAT_LIMITS.keepCount}`);
  const messages = list.map((value: unknown, i): ChatMessage => {
    const message = readMessage(value);
    if (message === null) throw invalid(`messages[${i}] must be a chat message (id, at, sender, text)`);
    return message;
  });
  if (new Set(messages.map((m) => m.id)).size !== messages.length) throw invalid("two messages have one id");
  return messages;
}

function readMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const { id, at, sender, text } = value;
  if (typeof id !== "string" || id === "") return null;
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) return null;
  // The stored text must be what the validator gives, so a hand-edited file cannot hold a line the server would refuse.
  if (typeof text !== "string" || parseChatText(text) !== text) return null;
  const parsedSender = readSender(sender);
  return parsedSender === null ? null : { id, at, sender: parsedSender, text };
}

function readSender(value: unknown): ChatSender | null {
  if (!isRecord(value)) return null;
  if (value["kind"] === "host") return { kind: "host" };
  if (value["kind"] !== "player") return null;
  const { playerId, name } = value;
  const look = parseTankLook(value["look"]);
  // Any stored name: the arena file keeps older names too (stored-arena.ts), and the line carries the name the seat had.
  if (typeof playerId !== "string" || playerId === "" || typeof name !== "string" || name === "" || look === null) return null;
  return { kind: "player", playerId, name, look };
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
