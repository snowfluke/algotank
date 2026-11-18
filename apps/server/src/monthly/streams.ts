// The event streams of the leagues: GET /api/monthly/leagues/:league/events. A stream starts with
// the league's state and then gets every turn; a join, a quit or a new day sends the state again
// before the next turn. A fresh start moves the tank's index to the end for the next turn.
// Nothing is kept per turn: a turn is encoded once and written to the open streams.
// Watching needs no session and no presence is tracked, so nothing depends on an open page.
//
// `own` follows the stream's account, not the seat it had when the stream opened: each turn
// looks up the account's seat in the league, so a quit and a new seat on the same open page
// change `own` at the next turn without a new connection. A league that the month close
// closes gets `closed` and its streams end, so no page waits on a league that no longer runs.

import type { AccountId, LeagueLive, LeagueStateChange, LeagueStreamMessage, PlayerId } from "@game/arena";
import type { LeagueTurn } from "./league-day.ts";
import { HttpError } from "../http.ts";
import { toCompactTick } from "../public-tick.ts";
import { Connection } from "../stream.ts";

const encoder = new TextEncoder();

function encode(message: LeagueStreamMessage): Uint8Array {
  return encoder.encode(`event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`);
}

export interface LeagueStreamsOptions {
  readonly heartbeatMs: number;
  /** Open streams one league accepts before it answers 429. */
  readonly maxStreamsPerLeague: number;
}

export class LeagueStreams {
  private readonly byLeague = new Map<number, Set<Connection>>();
  /** The account each connection was opened with (its session cookie), or null for a viewer without one. */
  private readonly accounts = new Map<Connection, AccountId | null>();

  constructor(private readonly options: LeagueStreamsOptions) {}

  /** `accountId`: the stream's account, whose seat's decisions it gets as `own` while that seat plays in this league. */
  open(league: number, accountId: AccountId | null, state: LeagueLive): Response {
    if (this.count(league) >= this.options.maxStreamsPerLeague) throw new HttpError(429, "This league has reached its limit of open connections.");
    const connection = new Connection(null, false, this.options.heartbeatMs, [encode({ type: "state", state })], (gone) => {
      this.accounts.delete(gone);
      const set = this.byLeague.get(league);
      set?.delete(gone);
      if (set?.size === 0) this.byLeague.delete(league);
    });
    this.accounts.set(connection, accountId);
    let set = this.byLeague.get(league);
    if (set === undefined) {
      set = new Set();
      this.byLeague.set(league, set);
    }
    set.add(connection);
    return new Response(connection.body, {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
    });
  }

  sendState(league: number, state: LeagueLive, change?: LeagueStateChange): void {
    const connections = this.byLeague.get(league);
    if (connections === undefined) return;
    const chunk = encode({ type: "state", state, ...(change === undefined ? {} : { change }) });
    for (const connection of connections) connection.send(chunk);
  }

  /** `seats`: the seat id of each account seated in this league now. */
  sendTick(league: number, turn: LeagueTurn, seats: ReadonlyMap<AccountId, PlayerId>): void {
    const connections = this.byLeague.get(league);
    if (connections === undefined) return;
    // The compact tick is the large part and the same for every stream; only `own` differs.
    const head = `event: tick\ndata: {"type":"tick","tick":${JSON.stringify(toCompactTick(turn))},"own":`;
    const viewer = encoder.encode(`${head}null}\n\n`);
    for (const connection of connections) {
      const accountId = this.accounts.get(connection) ?? null;
      const seatId = accountId === null ? undefined : seats.get(accountId);
      const own = seatId === undefined ? undefined : turn.decisions.find((d) => d.botId === seatId);
      connection.send(own === undefined ? viewer : encoder.encode(`${head}${JSON.stringify(own)}}\n\n`));
    }
  }

  /** The month close left `league` empty: its streams get `closed` with the number of leagues left, then end. */
  closeLeague(league: number, leagues: number): void {
    const connections = this.byLeague.get(league);
    if (connections === undefined) return;
    const chunk = encode({ type: "closed", leagues });
    for (const connection of [...connections]) {
      connection.send(chunk);
      connection.close();
    }
  }

  count(league: number): number {
    return this.byLeague.get(league)?.size ?? 0;
  }

  closeAll(): void {
    for (const set of [...this.byLeague.values()]) for (const connection of [...set]) connection.close();
  }
}
