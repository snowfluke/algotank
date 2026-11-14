// The statistics of the players in the arenas (docs/specs/revamp/81-metrics.md, K2): running
// totals per tank while a round plays, kept in memory, and sent to each player alone at the
// round's end (stats-protocol.ts). The round runner feeds it; it never changes a round.
//
// Per arena: the game it counts, and per human player a fixed-size record (the round's totals,
// the game's numbers, the last round's view). Nothing is kept per turn. A bot is not counted,
// because nobody reads its card.
//
// A player's record over a game:
// | From          | To            | Actor  | Guard / effect                                                 |
// |---------------|---------------|--------|----------------------------------------------------------------|
// | (none)        | in round      | runner | roundStarted lists the player; round 1 or a new game clears    |
// |               |               |        | the game's numbers                                             |
// | in round      | in round      | runner | turn: the turn's result is added (engine addTurn)              |
// | in round      | between rounds| runner | roundCompleted: the round's view and the game's sum are kept   |
// |               |               |        | for the player's stream; a credited account gets the round     |
// | in round      | between rounds| runner | roundAborted: the round's partial totals are dropped           |
// | any           | (none)        | server | forget: the arena closed, expired or was removed               |
//
// Account credit: a player who joined with a session cookie is credited to that account
// (credit, at join). Named limit: the credit and the totals live in memory, so after a restart
// the card of the running game is gone and the rest of that game is not credited.

import type { AccountId, ArenaId, OwnStats, PlayerId } from "@game/arena";
import { addNumbers, addTurn, EMPTY_NUMBERS, EMPTY_STATS, statsNumbers, statsView, turnsOf, type Snapshot, type StatsNumbers, type Strategy, type TankStats, type TickResult } from "@game/engine";
import type { AccountStatsStore } from "./account-stats.ts";

export interface StatsPlayer {
  readonly id: PlayerId;
  readonly strategy: Strategy;
}

/** How a completed round left the game: still going, or finished with its winner. */
export type RoundOutcome = { readonly kind: "goesOn" } | { readonly kind: "finished"; readonly winnerId: PlayerId };

interface PlayerRecord {
  /** The running round's totals and the strategy that plays it, or null between rounds. */
  round: { stats: TankStats; readonly strategy: Strategy } | null;
  gameTotal: StatsNumbers;
  roundsPlayed: number;
  own: OwnStats | null;
}

interface ArenaRecordOfStats {
  game: number;
  round: number;
  readonly players: Map<PlayerId, PlayerRecord>;
}

export interface ArenaStatsOptions {
  readonly accounts: AccountStatsStore;
  /** YYYY-MM now, in the league's time zone, for the account's months. */
  readonly month: () => string;
}

export class ArenaStats {
  private readonly arenas = new Map<ArenaId, ArenaRecordOfStats>();
  private readonly credits = new Map<ArenaId, Map<PlayerId, AccountId>>();

  constructor(private readonly options: ArenaStatsOptions) {}

  /** The player joined with this account's session, so its rounds count for the account. */
  credit(arenaId: ArenaId, playerId: PlayerId, accountId: AccountId): void {
    let byPlayer = this.credits.get(arenaId);
    if (byPlayer === undefined) {
      byPlayer = new Map();
      this.credits.set(arenaId, byPlayer);
    }
    byPlayer.set(playerId, accountId);
  }

  /** A round starts with these human players. Round 1 or another game number starts the game's numbers again. */
  roundStarted(arenaId: ArenaId, game: number, round: number, players: readonly StatsPlayer[]): void {
    let arena = this.arenas.get(arenaId);
    if (arena === undefined || arena.game !== game || round === 1) {
      arena = { game, round, players: new Map() };
      this.arenas.set(arenaId, arena);
      // A public arena never closes, so a game's start drops the credit of players who left it.
      const credits = this.credits.get(arenaId);
      const playing = new Set(players.map((p) => p.id));
      if (credits !== undefined) for (const id of [...credits.keys()]) if (!playing.has(id)) credits.delete(id);
    }
    arena.round = round;
    for (const record of arena.players.values()) record.round = null;
    for (const { id, strategy } of players) {
      const record = arena.players.get(id) ?? { round: null, gameTotal: EMPTY_NUMBERS, roundsPlayed: 0, own: null };
      record.round = { stats: EMPTY_STATS, strategy };
      arena.players.set(id, record);
    }
  }

  /** One turn. `before` is the snapshot the turn was played from. */
  turn(arenaId: ArenaId, before: Snapshot, result: TickResult): void {
    const arena = this.arenas.get(arenaId);
    if (arena === undefined) return;
    const turns = turnsOf(before, result);
    for (const [id, record] of arena.players) {
      if (record.round === null) continue;
      const turn = turns.get(id);
      if (turn === undefined) throw new Error(`Turn ${result.tick} of arena ${arenaId} has no tank ${id}.`);
      record.round.stats = addTurn(record.round.stats, turn);
    }
  }

  /**
   * The round ended: each player's view of it and the game's sum, for that player's stream.
   * A credited account gets the round, and at the game's end the game and a win.
   */
  roundCompleted(arenaId: ArenaId, outcome: RoundOutcome): ReadonlyMap<PlayerId, OwnStats> {
    const arena = this.arenas.get(arenaId);
    const messages = new Map<PlayerId, OwnStats>();
    if (arena === undefined) return messages;
    const credits = this.credits.get(arenaId);
    const month = this.options.month();
    for (const [id, record] of arena.players) {
      const played = record.round;
      const roundNumbers = played === null ? null : statsNumbers(played.stats);
      if (played !== null && roundNumbers !== null) {
        record.gameTotal = addNumbers(record.gameTotal, roundNumbers);
        record.roundsPlayed += 1;
        record.own = { game: arena.game, round: arena.round, last: statsView(played.stats, played.strategy), gameTotal: record.gameTotal };
        record.round = null;
        messages.set(id, record.own);
      }
      const accountId = credits?.get(id);
      const finished = outcome.kind === "finished" && record.roundsPlayed > 0;
      if (accountId === undefined || (roundNumbers === null && !finished)) continue;
      const add = {
        games: finished ? 1 : 0,
        wins: finished && outcome.winnerId === id ? 1 : 0,
        rounds: roundNumbers === null ? 0 : 1,
        shots: roundNumbers?.shots ?? 0,
        hits: roundNumbers?.hits ?? 0,
      };
      try {
        this.options.accounts.add(accountId, month, add);
      } catch (error) {
        // One account's file must not cost the others their round or the players their card.
        console.error(`The statistics of account ${accountId} could not be saved after a round of arena ${arenaId}:`, error);
      }
    }
    return messages;
  }

  /** The round counts for nothing (round-runner.ts abort): its partial totals go. */
  roundAborted(arenaId: ArenaId): void {
    const arena = this.arenas.get(arenaId);
    if (arena === undefined) return;
    for (const record of arena.players.values()) record.round = null;
  }

  /** The player's statistics of `game`, for a stream that opens, or null when there are none. */
  ownOf(arenaId: ArenaId, playerId: PlayerId, game: number): OwnStats | null {
    const arena = this.arenas.get(arenaId);
    if (arena === undefined || arena.game !== game) return null;
    return arena.players.get(playerId)?.own ?? null;
  }

  /** The arena is gone. */
  forget(arenaId: ArenaId): void {
    this.arenas.delete(arenaId);
    this.credits.delete(arenaId);
  }

  /** What it holds, for the test that nothing grows per turn. */
  holdings(): { readonly arenas: number; readonly players: number; readonly uses: number; readonly credits: number } {
    let players = 0;
    let uses = 0;
    let credits = 0;
    for (const byPlayer of this.credits.values()) credits += byPlayer.size;
    for (const arena of this.arenas.values()) {
      players += arena.players.size;
      for (const record of arena.players.values()) uses += record.round?.stats.uses.length ?? 0;
    }
    return { arenas: this.arenas.size, players, uses, credits };
  }
}
