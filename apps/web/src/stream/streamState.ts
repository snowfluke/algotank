// The state a page builds from the stream messages. A reducer, so the rules for
// reconnects, late messages and the timers of the server sit in one place and run
// in tests without a browser. Every message action carries the time it arrived, so
// a "starts in N ms" from the server becomes an absolute time here and a page can
// count down without drifting.
//
// Turns arrive in the compact form (packages/arena/src/compact-tick.ts), which names
// tanks by their index in the round's roundStart snapshot. The reducer keeps that
// snapshot and expands each turn here, so every page reads a PublicTick. A compact
// turn that does not fit its round is a protocol error, never a crash.

import { expandTick } from "@game/arena";
import type { CompactTick, OwnStats, PublicArena, PublicSnapshot, PublicTick, StreamMessage } from "@game/arena";
import type { Decision, ThrowEvent } from "@game/engine";
import { throwOf } from "../water/water.ts";

/** How many recent decisions of the player the state keeps. */
export const OWN_DECISIONS_KEPT = 5;

export type Connection = "connecting" | "open" | "reconnecting" | "closed";

export interface OwnDecision {
  readonly tick: number;
  readonly decision: Decision;
  /** What the player's throw did on this tick, or null when the bot did not throw. */
  readonly throwEvent: ThrowEvent | null;
}

/** What the server does by itself next (a public arena) and when, as a time from Date.now(). */
export interface NextStep {
  readonly action: "start" | "reset";
  readonly at: number;
}

/** A stream message as parsed, before its turn is expanded: the turn is in the compact form. */
export type WireStreamMessage =
  | Exclude<StreamMessage, { readonly type: "tick" }>
  | { readonly type: "tick"; readonly round: number; readonly tick: CompactTick; readonly own: Decision | null };

export interface ArenaStreamState {
  readonly connection: Connection;
  readonly arena: PublicArena | null;
  /** The round the snapshot below belongs to, or null before any round of this game started. */
  readonly snapshotRound: number | null;
  readonly snapshot: PublicSnapshot | null;
  /** The roundStart snapshot of snapshotRound: its tank order is what a compact turn's indexes refer to. */
  readonly roundSpawn: PublicSnapshot | null;
  /** The throws of the tick that produced the snapshot. Empty for a spawn state. */
  readonly throws: readonly ThrowEvent[];
  /** The player's own decisions in snapshotRound, oldest first. Empty for a viewer. */
  readonly ownDecisions: readonly OwnDecision[];
  /** Set when a message could not be read. It stays until the next valid message. */
  readonly protocolError: string | null;
  /** When the first turn of snapshotRound plays (Date.now() time), or null once turns run or no pause was sent. */
  readonly firstTurnAt: number | null;
  /** The server's own next step, from the latest arena message. */
  readonly nextStep: NextStep | null;
  /** A public arena: when the next game's first round starts (Date.now() time), from the latest arena message. */
  readonly nextGameAt: number | null;
  /**
   * How many times the stream opened: 1 after the first open, and 1 more after each reconnect.
   * The server sends no chat history on connect, so the chat reads it again when this changes.
   */
  readonly opens: number;
  /**
   * The player token the stream was opened with (null for a viewer). Until the reset for a new
   * token lands, the state still holds the arena seen with the old one, so a page that just
   * changed its seat compares this before it trusts that the arena does not list the seat.
   */
  readonly playerToken: string | null;
  /**
   * The player's own statistics of the arena's current game (stats-protocol.ts), from the round
   * that ended last; null for a viewer and before the first round of a game ends.
   */
  readonly ownStats: OwnStats | null;
}

export const INITIAL_STREAM_STATE: ArenaStreamState = {
  connection: "connecting",
  arena: null,
  snapshotRound: null,
  snapshot: null,
  roundSpawn: null,
  throws: [],
  ownDecisions: [],
  protocolError: null,
  firstTurnAt: null,
  nextStep: null,
  nextGameAt: null,
  opens: 0,
  playerToken: null,
  ownStats: null,
};

export type StreamAction =
  /** A new EventSource opens. The old arena belongs to another token or arena, so nothing carries over. */
  | { readonly kind: "reset"; readonly playerToken: string | null }
  | { readonly kind: "connection"; readonly connection: Connection }
  /** `receivedAt` is Date.now() when the message arrived. */
  | { readonly kind: "message"; readonly message: WireStreamMessage; readonly receivedAt: number }
  | { readonly kind: "unreadable"; readonly reason: string };

/** The round data of a game, cleared when a new game starts, because its round numbers start at 1 again. */
const NO_ROUND = {
  snapshotRound: null,
  snapshot: null,
  roundSpawn: null,
  throws: [],
  ownDecisions: [],
  firstTurnAt: null,
} as const satisfies Partial<ArenaStreamState>;

function withArena(state: ArenaStreamState, arena: PublicArena, receivedAt: number): ArenaStreamState {
  const newGame = state.arena !== null && state.arena.game !== arena.game;
  const nextStep = arena.auto === null ? null : { action: arena.auto.action, at: receivedAt + arena.auto.inMs };
  const nextGameAt = arena.nextGameInMs === null ? null : receivedAt + arena.nextGameInMs;
  // Statistics of an earlier game do not describe this one.
  const ownStats = state.ownStats !== null && state.ownStats.game !== arena.game ? null : state.ownStats;
  return { ...state, ...(newGame ? NO_ROUND : {}), arena, nextStep, nextGameAt, ownStats, protocolError: null };
}

/** The turn as a PublicTick, or the reason it does not fit the round. */
function expandWireTick(wire: CompactTick, spawn: PublicSnapshot | null): { readonly ok: true; readonly tick: PublicTick } | { readonly ok: false; readonly reason: string } {
  if (spawn === null) return { ok: false, reason: `Turn ${wire.tick} arrived before the start of its round.` };
  try {
    const tick = expandTick(wire, spawn);
    // The board draws a tank at its square, so a square off the arena would draw it outside the wall.
    const off = tick.snapshot.bots.find((bot) => bot.x < 0 || bot.y < 0 || bot.x >= spawn.width || bot.y >= spawn.height);
    if (off !== undefined) return { ok: false, reason: `Turn ${wire.tick} puts tank ${off.id} off the arena.` };
    return { ok: true, tick };
  } catch (error) {
    return { ok: false, reason: `Turn ${wire.tick} does not fit its round: ${error instanceof Error ? error.message : String(error)}.` };
  }
}

function withTick(state: ArenaStreamState, round: number, wire: CompactTick, own: Decision | null): ArenaStreamState {
  // A tick of an older round is a late message. A newer round without a roundStart
  // first cannot reset the feed, so the feed restarts when the round number changes.
  if (state.snapshotRound !== null && round < state.snapshotRound) return state;
  // A compact turn of another round than the kept spawn cannot be read: its indexes refer to that round's tanks.
  const expanded = expandWireTick(wire, state.snapshotRound === round ? state.roundSpawn : null);
  if (!expanded.ok) return { ...state, protocolError: expanded.reason };
  const tick = expanded.tick;
  const sameRound = state.snapshotRound === round;
  const previous = sameRound ? state.ownDecisions : [];
  const ownDecisions =
    own === null ? previous : [...previous, { tick: tick.tick, decision: own, throwEvent: throwOf(tick.throws, own.botId) }].slice(-OWN_DECISIONS_KEPT);
  return {
    ...state,
    snapshotRound: round,
    snapshot: tick.snapshot,
    throws: tick.throws,
    ownDecisions,
    protocolError: null,
    firstTurnAt: null,
  };
}

export function reduceStream(state: ArenaStreamState, action: StreamAction): ArenaStreamState {
  switch (action.kind) {
    case "reset":
      return { ...INITIAL_STREAM_STATE, playerToken: action.playerToken };
    case "connection":
      return { ...state, connection: action.connection, opens: action.connection === "open" ? state.opens + 1 : state.opens };
    case "unreadable":
      return { ...state, protocolError: action.reason };
    case "message": {
      const message = action.message;
      switch (message.type) {
        case "arena":
          return withArena(state, message.arena, action.receivedAt);
        case "roundStart": {
          // The server also sends roundStart on a reconnect mid-round. The feed then
          // keeps its decisions, because the round number did not change.
          if (state.snapshotRound !== null && message.round < state.snapshotRound) return state;
          const sameRound = state.snapshotRound === message.round;
          return {
            ...state,
            snapshotRound: message.round,
            snapshot: message.snapshot,
            roundSpawn: message.snapshot,
            throws: [],
            ownDecisions: sameRound ? state.ownDecisions : [],
            protocolError: null,
            firstTurnAt: message.startsInMs > 0 ? action.receivedAt + message.startsInMs : null,
          };
        }
        case "tick":
          return withTick(state, message.round, message.tick, message.own);
        case "closed":
          // The owner closed the arena or it expired; the server ends the stream after this message.
          return { ...state, connection: "closed" };
        case "stats":
          // Sent just before the arena message that ends the round, so its game is the one that arena carries.
          return { ...state, ownStats: message.stats, protocolError: null };
        case "chat":
        case "chatRemoved":
          // The chat has its own state (chat/chatLog.ts); useArenaStream hands these to the chat's feed instead.
          return state;
      }
    }
  }
}

/** The snapshot of the given round, or null while the state still holds an older round or none. */
export function snapshotFor(state: ArenaStreamState, round: number): PublicSnapshot | null {
  return state.snapshotRound === round ? state.snapshot : null;
}

