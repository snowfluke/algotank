// Server-sent event connections. The hub holds the open connections of each
// arena, encodes the messages of the StreamMessage protocol, and knows when each
// player was last connected (presence), which the public arenas use to remove
// players who left.

import type { ArenaId, OwnStats, PlayerId, PublicArena, StreamMessage } from "@game/arena";

/** The stream messages of the chat, which only the chat's readers get. */
export type ChatStreamMessage = Extract<StreamMessage, { readonly type: "chat" | "chatRemoved" }>;
import type { Decision, Snapshot, TickResult } from "@game/engine";
import { HttpError } from "./http.ts";
import { decisionsById, roundStartMessage, toCompactTick } from "./public-tick.ts";
import type { Clock, Scheduler } from "./timers.ts";

/**
 * Whether a player has a stream open, and when they were last seen: when their last
 * stream closed, or when markSeen was called (at join, and at a restart). null: never seen
 * by this process.
 */
export interface Presence {
  readonly open: boolean;
  readonly lastSeenAt: number | null;
}

interface PresenceEntry {
  openStreams: number;
  lastSeenAt: number | null;
}

const encoder = new TextEncoder();
const HEARTBEAT = encoder.encode(": keep-alive\n\n");
// A client that stops reading leaves chunks queued in memory. Past this many bytes,
// the hub drops it; the browser reconnects and receives the full current state.
// A compact tick of 512 bots is about 20 KB, so this holds about 25 ticks (15 seconds at
// the fast pace of 600 ms). Bytes, not chunks, because the chunk size depends on the number of players.
export const MAX_QUEUED_BYTES = 512 * 1024;
/** A full presenter arena (512 players) plus the presenter page, the big screen and second tabs. */
export const DEFAULT_MAX_STREAMS_PER_ARENA = 600;
/**
 * An arena message that changes only the player list (a join, a look, a leave) goes out at
 * most this often per arena. Every join used to send the whole list to every stream: with
 * 512 players that is a 49 KB message per join to up to 512 streams, about 4.4 GB for one
 * event's joins (docs/decisions, "Large arenas"). Any other change goes out at once.
 */
export const DEFAULT_ARENA_MESSAGE_INTERVAL_MS = 1000;

export interface StreamHubOptions {
  readonly heartbeatMs: number;
  /** Open event streams one arena accepts before it answers 429. */
  readonly maxStreamsPerArena: number;
  readonly now: Clock;
  /** Runs the delayed arena message. */
  readonly scheduler: Scheduler;
  /** See DEFAULT_ARENA_MESSAGE_INTERVAL_MS. 0 sends every arena message at once. */
  readonly arenaMessageIntervalMs: number;
}

/** The last arena message sent to an arena's streams, and the newer one that waits for the interval. */
interface ArenaMessageState {
  sent: PublicArena;
  sentAt: number;
  waiting: PublicArena | null;
  cancel: (() => void) | null;
}

// ponytail: an arena message carries the whole player list (49 KB at 512 players), held to one
// per second while players join; a message with only the change, applied by the web, would replace it.

/** True when `next` differs from `sent` in its player list only. The reducer keeps the other parts as the same objects when they do not change. */
function onlyPlayersChanged(sent: PublicArena, next: PublicArena): boolean {
  return (
    sent.settings === next.settings &&
    sent.phase === next.phase &&
    sent.rounds === next.rounds &&
    sent.game === next.game &&
    sent.chat === next.chat &&
    JSON.stringify(sent.auto) === JSON.stringify(next.auto)
  );
}

function frame(type: StreamMessage["type"], dataJson: string): Uint8Array {
  return encoder.encode(`event: ${type}\ndata: ${dataJson}\n\n`);
}

export function encodeMessage(message: StreamMessage): Uint8Array {
  return frame(message.type, JSON.stringify(message));
}

/** The bytes of a tick message up to its `own` value. They are the same for every connection. */
function tickHead(round: number, compactTickJson: string): Uint8Array {
  return encoder.encode(`event: tick\ndata: {"type":"tick","round":${round},"tick":${compactTickJson},"own":`);
}

function withOwn(head: Uint8Array, own: Decision | null): Uint8Array {
  const tail = encoder.encode(`${JSON.stringify(own)}}\n\n`);
  const chunk = new Uint8Array(head.byteLength + tail.byteLength);
  chunk.set(head);
  chunk.set(tail, head.byteLength);
  return chunk;
}

/**
 * The same bytes as encodeMessage for a tick message. The compact tick is the large
 * part and is the same for every viewer, so the caller serializes and encodes it once
 * and only `own` differs per connection.
 */
export function encodeTickMessage(round: number, compactTickJson: string, own: Decision | null): Uint8Array {
  return withOwn(tickHead(round, compactTickJson), own);
}

/** One open event stream. The monthly league's streams (monthly/streams.ts) use it too. */
export class Connection {
  readonly body: ReadableStream<Uint8Array>;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private disposed = false;
  private readonly heartbeat: ReturnType<typeof setInterval>;

  constructor(
    readonly playerId: PlayerId | null,
    /** Opened with the owner's session cookie. The owner reads the chat without a seat. */
    readonly isOwner: boolean,
    heartbeatMs: number,
    initial: readonly Uint8Array[],
    private readonly onGone: (connection: Connection) => void,
  ) {
    this.body = new ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          this.controller = controller;
          for (const chunk of initial) controller.enqueue(chunk);
        },
        // The client went away.
        cancel: () => this.dispose(),
      },
      new ByteLengthQueuingStrategy({ highWaterMark: MAX_QUEUED_BYTES }),
    );
    this.heartbeat = setInterval(() => this.send(HEARTBEAT), heartbeatMs);
  }

  send(chunk: Uint8Array): void {
    const controller = this.controller;
    if (controller === null) return;
    try {
      controller.enqueue(chunk);
    } catch {
      // The stream closed between the client leaving and cancel running.
      this.dispose();
      return;
    }
    if (controller.desiredSize !== null && controller.desiredSize < 0) {
      // Logged, because a venue whose phones fall behind shows up here first.
      console.error(`Dropped an event stream (player ${this.playerId ?? "none"}): more than ${MAX_QUEUED_BYTES} bytes waited unread.`);
      this.drop();
    }
  }

  /** Ends the stream from the server side, after the client has read what is queued. */
  close(): void {
    const controller = this.controller;
    this.dispose();
    controller?.close();
  }

  /** Ends the stream and discards the queue. close() would keep the queued chunks in memory until read. */
  private drop(): void {
    const controller = this.controller;
    this.dispose();
    controller?.error(new Error("The client reads too slowly."));
  }

  private dispose(): void {
    // close() and the client's cancel can both arrive; presence must count one departure.
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.heartbeat);
    this.controller = null;
    this.onGone(this);
  }
}

export class StreamHub {
  private readonly connections = new Map<ArenaId, Set<Connection>>();
  private readonly presence = new Map<ArenaId, Map<PlayerId, PresenceEntry>>();
  private readonly arenaMessages = new Map<ArenaId, ArenaMessageState>();
  private readonly heartbeatMs: number;
  private readonly maxStreamsPerArena: number;
  private readonly now: Clock;
  private readonly scheduler: Scheduler;
  private readonly arenaMessageIntervalMs: number;

  constructor(options: StreamHubOptions) {
    this.heartbeatMs = options.heartbeatMs;
    this.maxStreamsPerArena = options.maxStreamsPerArena;
    this.now = options.now;
    this.scheduler = options.scheduler;
    this.arenaMessageIntervalMs = options.arenaMessageIntervalMs;
  }

  /**
   * Opens a connection that starts with the `initial` messages. It throws a 429
   * when the arena has the most streams it allows. There is no limit per address,
   * because a room behind one NAT shares an address. `isOwner`: the request carried the
   * owner's session, so the stream gets the chat (sendChat).
   */
  open(arenaId: ArenaId, playerId: PlayerId | null, initial: readonly StreamMessage[], isOwner = false): Response {
    if (this.connectionCount(arenaId) >= this.maxStreamsPerArena) {
      throw new HttpError(429, "This arena has reached its limit of open connections.");
    }
    const connection = new Connection(playerId, isOwner, this.heartbeatMs, initial.map(encodeMessage), (gone) =>
      this.remove(arenaId, gone),
    );
    let set = this.connections.get(arenaId);
    if (set === undefined) {
      set = new Set();
      this.connections.set(arenaId, set);
    }
    set.add(connection);
    if (playerId !== null) this.entryOf(arenaId, playerId).openStreams += 1;

    return new Response(connection.body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        // Stops a reverse proxy such as nginx from holding events back.
        "x-accel-buffering": "no",
      },
    });
  }

  /**
   * Sends the arena to its streams. A change of the player list only, within
   * arenaMessageIntervalMs of the last message, waits and goes out as the newest list
   * when the interval ends; any other change goes out at once and replaces what waits.
   * A stream that opens meanwhile starts with the current arena (routes.ts), so it misses nothing.
   */
  sendArena(arena: PublicArena): void {
    const state = this.arenaMessages.get(arena.id);
    const now = this.now();
    if (state !== undefined && now - state.sentAt < this.arenaMessageIntervalMs && onlyPlayersChanged(state.sent, arena)) {
      state.waiting = arena;
      state.cancel ??= this.scheduler.after(() => {
        state.cancel = null;
        const waiting = state.waiting;
        if (waiting !== null) this.sendArenaNow(waiting);
      }, state.sentAt + this.arenaMessageIntervalMs - now);
      return;
    }
    this.sendArenaNow(arena);
  }

  private sendArenaNow(arena: PublicArena): void {
    const state = this.arenaMessages.get(arena.id);
    state?.cancel?.();
    this.arenaMessages.set(arena.id, { sent: arena, sentAt: this.now(), waiting: null, cancel: null });
    const chunk = encodeMessage({ type: "arena", arena });
    for (const connection of this.connections.get(arena.id) ?? []) connection.send(chunk);
  }

  sendRoundStart(arenaId: ArenaId, round: number, snapshot: Snapshot, startsInMs: number): void {
    const chunk = encodeMessage(roundStartMessage(round, snapshot, startsInMs));
    for (const connection of this.connections.get(arenaId) ?? []) connection.send(chunk);
  }

  sendTick(arenaId: ArenaId, round: number, result: TickResult): void {
    const connections = this.connections.get(arenaId);
    if (connections === undefined) return;
    // Serialized and encoded once for every connection; only `own` is added per player.
    const head = tickHead(round, JSON.stringify(toCompactTick(result)));
    const viewerChunk = withOwn(head, null);
    const decisions = decisionsById(result);
    for (const connection of connections) {
      connection.send(connection.playerId === null ? viewerChunk : withOwn(head, decisions.get(connection.playerId) ?? null));
    }
  }

  /**
   * Sends a player's own statistics (stats-protocol.ts) to the streams opened with that player's
   * token, and to no other stream: another player's rules and counts are theirs.
   */
  sendStats(arenaId: ArenaId, playerId: PlayerId, stats: OwnStats): void {
    const chunk = encodeMessage({ type: "stats", stats });
    for (const connection of this.connections.get(arenaId) ?? []) {
      if (connection.playerId === playerId) connection.send(chunk);
    }
  }

  /**
   * Sends a chat message to the streams that may read the chat: the owner's, and those of the
   * players in `members`. A player the owner removed keeps an open stream with their id, so
   * the list of current players decides, not the id alone. A viewer never gets chat, because
   * a big screen must not show text that nobody checked.
   */
  sendChat(arenaId: ArenaId, message: ChatStreamMessage, members: ReadonlySet<PlayerId>): void {
    const chunk = encodeMessage(message);
    for (const connection of this.connections.get(arenaId) ?? []) {
      if (connection.isOwner || (connection.playerId !== null && members.has(connection.playerId))) connection.send(chunk);
    }
  }

  connectionCount(arenaId: ArenaId): number {
    return this.connections.get(arenaId)?.size ?? 0;
  }

  /** Sends `closed` to every stream of the arena, ends them, and forgets its presence. */
  closeArena(arenaId: ArenaId): void {
    this.arenaMessages.get(arenaId)?.cancel?.();
    this.arenaMessages.delete(arenaId);
    const chunk = encodeMessage({ type: "closed" });
    for (const connection of [...(this.connections.get(arenaId) ?? [])]) {
      connection.send(chunk);
      connection.close();
    }
    this.presence.delete(arenaId);
  }

  presenceOf(arenaId: ArenaId, playerId: PlayerId): Presence {
    const entry = this.presence.get(arenaId)?.get(playerId);
    return entry === undefined ? { open: false, lastSeenAt: null } : { open: entry.openStreams > 0, lastSeenAt: entry.lastSeenAt };
  }

  /** Counts as seen now, for a player who has not opened a stream yet. */
  markSeen(arenaId: ArenaId, playerId: PlayerId): void {
    this.entryOf(arenaId, playerId).lastSeenAt = this.now();
  }

  /** Drops the presence of players who left the arena. */
  forget(arenaId: ArenaId, playerIds: readonly PlayerId[]): void {
    const entries = this.presence.get(arenaId);
    for (const playerId of playerIds) entries?.delete(playerId);
  }

  /** Ends every connection, so the server can stop. */
  closeAll(): void {
    for (const state of this.arenaMessages.values()) state.cancel?.();
    this.arenaMessages.clear();
    for (const set of [...this.connections.values()]) {
      for (const connection of [...set]) connection.close();
    }
  }

  private entryOf(arenaId: ArenaId, playerId: PlayerId): PresenceEntry {
    let entries = this.presence.get(arenaId);
    if (entries === undefined) {
      entries = new Map();
      this.presence.set(arenaId, entries);
    }
    let entry = entries.get(playerId);
    if (entry === undefined) {
      entry = { openStreams: 0, lastSeenAt: null };
      entries.set(playerId, entry);
    }
    return entry;
  }

  private remove(arenaId: ArenaId, connection: Connection): void {
    const set = this.connections.get(arenaId);
    if (set === undefined) return;
    set.delete(connection);
    if (set.size === 0) this.connections.delete(arenaId);
    if (connection.playerId === null) return;
    // A closed arena has forgotten its presence already; do not bring an entry back.
    const entry = this.presence.get(arenaId)?.get(connection.playerId);
    if (entry === undefined) return;
    entry.openStreams = Math.max(0, entry.openStreams - 1);
    entry.lastSeenAt = this.now();
  }
}
