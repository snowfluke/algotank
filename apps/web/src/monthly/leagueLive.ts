// The live state of one league from its event stream (GET /api/monthly/leagues/:league/events,
// packages/arena/src/monthly-protocol.ts). A `state` message replaces the board; a `tick`
// is expanded against the last board's tank order. A fresh start moves a tank to the end
// of that order, and a join or a quit sends a state. Pure, so this is tested without a server.
//
// The page's view of the stream (useLeagueLive.ts runs it):
// | From         | Event                         | To           | Note                                       |
// |--------------|-------------------------------|--------------|--------------------------------------------|
// | connecting   | state                         | ready        | the board, the day's end anchored to now   |
// | connecting   | tick                          | connecting   | a turn before any state cannot be placed   |
// | ready        | state                         | ready        | own turns kept while the day is the same   |
// | ready        | state with board growth       | ready        | the board says "Reshuffled" for a moment   |
// | ready        | state with weather change     | ready        | same turn, new board and condition notice  |
// | ready        | tick                          | ready        | the board moves; `own` adds a feed line    |
// | ready        | tick for other tanks          | connecting   | the hook opens the stream again            |
// | any          | closed                        | closed       | the month close emptied this league        |
// | connecting   | the server refuses the stream | failed       | the hook offers Try again                  |
// | failed       | Try again                     | connecting   |                                            |
// Terminal: closed (the page moves to a league that exists, which is a new stream).

import { expandTick, isLeagueLayout, parseLeagueActivity, type LeagueLive, type LeagueStreamMessage, type PlayerId, type PublicSnapshot } from "@game/arena";
import { arenaConditionOf, waterCapacityOf, type ThrowEvent, type UltimateFire } from "@game/engine";
import type { TankTunnel } from "../board/props.ts";
import { isCompactTick, isDecision, isSnapshot } from "../stream/parseStreamMessage.ts";
import { OWN_DECISIONS_KEPT, type OwnDecision } from "../stream/streamState.ts";
import { throwOf } from "../water/water.ts";

export interface LeagueBoard {
  readonly live: LeagueLive;
  /** The board now: the state's board, then the snapshot of each turn. */
  readonly snapshot: PublicSnapshot;
  /** The shots of the turn that made `snapshot`; kept through bot or weather changes on that turn. */
  readonly throws: readonly ThrowEvent[];
  /** The ultimate fires of the turn that made `snapshot`; kept on the same updates as shots. */
  readonly fires: readonly UltimateFire[];
  readonly tunnels: readonly TankTunnel[];
  /** When the day round ends, as a Date.now() time: the state's `dayEndsInMs` from when it arrived. */
  readonly dayEndsAt: number;
  /** The viewer's own tank's last turns, oldest first, for the "Tank kamu" feed. */
  readonly own: readonly OwnDecision[];
  /** The most recent tunnel in the own tank's feed today (owner, 2026-11-19). */
  readonly ownFreshStart: { readonly id: PlayerId; readonly tick: number } | null;
  /** The rebuilds for board growth seen on this stream today. */
  readonly reshuffles: number;
  /** When the weather notice ends, as a Date.now() time. */
  readonly weatherUntil: number;
}

export type LeagueLiveLoad =
  | { readonly kind: "connecting" }
  | { readonly kind: "ready"; readonly board: LeagueBoard }
  /** The league closed at the month close; `leagues` leagues exist now. */
  | { readonly kind: "closed"; readonly leagues: number };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A full sentence over a live board needs a little longer than the rebuild notice. */
const WEATHER_NOTICE_MS = 4_000;

/** Reads one event's data. Returns null for data that is not a league message, which the page ignores. */
export function parseLeagueMessage(data: string): LeagueStreamMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  if (raw["type"] === "state" && isRecord(raw["state"]) && Array.isArray(raw["state"]["tanks"]) && isRecord(raw["state"]["board"]) && isSnapshot(raw["state"]["board"])) {
    const board = raw["state"]["board"];
    if (board["layout"] !== undefined && !isLeagueLayout(board["layout"], board)) return null;
    const activity = parseLeagueActivity(raw["state"]["activity"]);
    if (activity === null) return null;
    const state = raw["state"] as unknown as LeagueLive;
    const change = raw["change"];
    if (change !== undefined && change !== "growth" && change !== "botFreshStart" && change !== "weather") return null;
    return { type: "state", state: { ...state, activity }, ...(change === undefined ? {} : { change }) };
  }
  if (raw["type"] === "tick" && isCompactTick(raw["tick"]) && (raw["own"] === null || isDecision(raw["own"]))) return raw as unknown as LeagueStreamMessage;
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
    const sameTurn = same && load.board.snapshot.tick === state.board.tick && message.change !== "growth";
    const tunnels = sameTurn ? [...load.board.tunnels] : [];
    if (sameTurn && (message.change === "botFreshStart" || message.change === "weather")) {
      const current = new Set(state.board.bots.map(({ id }) => id));
      const previous = new Map(load.board.snapshot.bots.map((bot) => [bot.id, bot]));
      for (const tank of load.board.live.tanks) {
        const from = previous.get(tank.id);
        if (tank.isBot && from !== undefined && !current.has(tank.id)) tunnels.push({ kind: "exit", from, look: tank.look });
      }
      for (const tank of state.tanks) {
        if (tank.isBot && !previous.has(tank.id)) tunnels.push({ kind: "enter", id: tank.id });
      }
    }
    const keepEvents = sameTurn && (tunnels.length > 0 || message.change === "weather");
    const sameCondition = same && arenaConditionOf(load.board.snapshot) === arenaConditionOf(state.board);
    const weatherUntil = sameTurn && message.change === "weather" && !sameCondition
      ? now + WEATHER_NOTICE_MS
      : sameCondition && message.change !== "growth" && state.board.tick >= load.board.snapshot.tick
        ? load.board.weatherUntil
        : 0;
    return {
      kind: "ready",
      board: {
        live: state,
        snapshot: state.board,
        throws: keepEvents ? load.board.throws : [],
        fires: keepEvents ? load.board.fires : [],
        tunnels,
        dayEndsAt: now + state.dayEndsInMs,
        own: same ? load.board.own : [],
        ownFreshStart: same ? load.board.ownFreshStart : null,
        reshuffles: same ? load.board.reshuffles + (message.change === "growth" ? 1 : 0) : 0,
        weatherUntil,
      },
    };
  }
  if (load.kind !== "ready") return load;
  // expandTick throws on a turn that does not fit the board; the stream then reconnects (useLeagueLive).
  const tick = expandTick(message.tick, load.board.snapshot);
  let snapshot = tick.snapshot;
  const tunnels: TankTunnel[] = [];
  let ownFreshStart = load.board.ownFreshStart;
  if (tick.freshStarts !== undefined) {
    const bots = new Map(snapshot.bots.map((bot) => [bot.id, bot]));
    const water = waterCapacityOf(snapshot);
    for (const { id, x, y } of tick.freshStarts) {
      const from = bots.get(id);
      if (from === undefined) throw new Error(`No tank "${id}" for a fresh start`);
      tunnels.push({ kind: "through", from });
      bots.delete(id);
      bots.set(id, { ...from, x, y, water });
      if (message.own?.botId === id) ownFreshStart = { id, tick: tick.tick };
    }
    snapshot = { ...snapshot, bots: [...bots.values()] };
  }
  const own =
    message.own === null
      ? load.board.own
      : [...load.board.own, { tick: tick.tick, decision: message.own, throwEvent: throwOf(tick.throws, message.own.botId) }].slice(-OWN_DECISIONS_KEPT);
  return { kind: "ready", board: { ...load.board, snapshot, throws: tick.throws, fires: tick.fires ?? [], tunnels, own, ownFreshStart } };
}
