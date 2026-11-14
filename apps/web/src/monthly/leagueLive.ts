// The live state of one league from its event stream (GET /api/monthly/leagues/:league/events,
// packages/arena/src/monthly-protocol.ts). A `state` message replaces the board; a `tick`
// is expanded against the tanks of the last state, because a join or a quit sends a new state
// before the next turn. Pure, so the order of messages is tested without a server.
//
// The page's view of the stream (useLeagueLive.ts runs it):
// | From         | Event                         | To           | Note                                       |
// |--------------|-------------------------------|--------------|--------------------------------------------|
// | connecting   | state                         | ready        | the board, the day's end anchored to now   |
// | connecting   | tick                          | connecting   | a turn before any state cannot be placed   |
// | ready        | state                         | ready        | own turns kept while the day is the same   |
// | ready        | tick                          | ready        | the board moves; `own` adds a feed line    |
// | ready        | tick for other tanks          | connecting   | the hook opens the stream again            |
// | any          | closed                        | closed       | the month close emptied this league        |
// | connecting   | the server refuses the stream | failed       | the hook offers Try again                  |
// | failed       | Try again                     | connecting   |                                            |
// Terminal: closed (the page moves to a league that exists, which is a new stream).

import { expandTick, type LeagueLive, type LeagueStreamMessage, type PublicSnapshot } from "@game/arena";
import type { ThrowEvent } from "@game/engine";
import { OWN_DECISIONS_KEPT, type OwnDecision } from "../stream/streamState.ts";
import { throwOf } from "../water/water.ts";

export interface LeagueBoard {
  readonly live: LeagueLive;
  /** The board now: the state's board, then the snapshot of each turn. */
  readonly snapshot: PublicSnapshot;
  /** The shots of the turn that made `snapshot`; empty after a state. */
  readonly throws: readonly ThrowEvent[];
  /** When the day round ends, as a Date.now() time: the state's `dayEndsInMs` from when it arrived. */
  readonly dayEndsAt: number;
  /** The viewer's own tank's last turns, oldest first, for the "Tank kamu" feed. */
  readonly own: readonly OwnDecision[];
}

export type LeagueLiveLoad =
  | { readonly kind: "connecting" }
  | { readonly kind: "ready"; readonly board: LeagueBoard }
  /** The league closed at the month close; `leagues` leagues exist now. */
  | { readonly kind: "closed"; readonly leagues: number };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads one event's data. Returns null for data that is not a league message, which the page ignores. */
export function parseLeagueMessage(data: string): LeagueStreamMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  if (raw["type"] === "state" && isRecord(raw["state"]) && Array.isArray(raw["state"]["tanks"]) && isRecord(raw["state"]["board"])) return raw as unknown as LeagueStreamMessage;
  if (raw["type"] === "tick" && isRecord(raw["tick"])) return raw as unknown as LeagueStreamMessage;
  if (raw["type"] === "closed" && typeof raw["leagues"] === "number" && raw["leagues"] >= 1) return raw as unknown as LeagueStreamMessage;
  return null;
}

/** The next load after one message, received at `now` (Date.now()). A turn before any state cannot be placed and is skipped. */
export function nextLeagueLoad(load: LeagueLiveLoad, message: LeagueStreamMessage, now: number): LeagueLiveLoad {
  if (message.type === "closed") return { kind: "closed", leagues: message.leagues };
  if (message.type === "state") {
    const state = message.state;
    // A join or a quit keeps the feed; a new day or another league starts it empty.
    const same = load.kind === "ready" && load.board.live.day === state.day && load.board.live.league === state.league;
    return { kind: "ready", board: { live: state, snapshot: state.board, throws: [], dayEndsAt: now + state.dayEndsInMs, own: same ? load.board.own : [] } };
  }
  if (load.kind !== "ready") return load;
  // expandTick throws on a turn that does not fit the tanks of the state; the stream then reconnects (useLeagueLive).
  const tick = expandTick(message.tick, load.board.live.board);
  const own =
    message.own === null
      ? load.board.own
      : [...load.board.own, { tick: tick.tick, decision: message.own, throwEvent: throwOf(tick.throws, message.own.botId) }].slice(-OWN_DECISIONS_KEPT);
  return { kind: "ready", board: { ...load.board, snapshot: tick.snapshot, throws: tick.throws, own } };
}
