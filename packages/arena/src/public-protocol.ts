// The messages of the public arenas' status and the champions (docs/specs/revamp/67-public-arenas.md;
// the monthly arena became a league, docs/specs/revamp/77-monthly-league.md, whose own messages are
// in monthly-protocol.ts). The routes are listed at the bottom of types.ts.

import type { TankLook } from "./types.ts";

/** A person who won a tournament. A tournament that a bot wins records nothing. */
export interface TournamentWinner {
  readonly name: string;
  readonly look: TankLook;
  /** ISO 8601 time of the final's end. */
  readonly wonAt: string;
  /** How many tanks (people and bots) started the tournament's first round. */
  readonly tanks: number;
}

/**
 * One tank's line in a stored month record. Months closed by the league (from 2026-11): `score` is
 * the monthly score (the average of the counted day scores, to one decimal), `games` the counted
 * days and `wins` the days the tank won in its league. Months closed before: the sum of the 20
 * best game scores, the monthly games and the games won.
 */
export interface LeagueRow {
  /** 1 for the champion. Two rows never share a rank. */
  readonly rank: number;
  readonly name: string;
  readonly look: TankLook;
  readonly score: number;
  readonly games: number;
  readonly wins: number;
}

/** A month that ended with a champion: rank 1 of League 1 with at least 7 counted days. Other months record nothing. */
export interface MonthRecord {
  /** YYYY-MM in LEAGUE_TIME_ZONE. */
  readonly month: string;
  readonly champion: LeagueRow;
  /** League 1's top 10 with at least 7 counted days, the champion first. */
  readonly top: readonly LeagueRow[];
}

/** GET /api/public: one line of status per public kind, for the chooser. */
export interface PublicStatusResponse {
  readonly practice: {
    /** People in all practice arenas, waiting ones included. */
    readonly humans: number;
  };
  readonly tournament: {
    /** The phase of the one tournament arena; "break" is the 20 s between two rounds. */
    readonly phase: "lobby" | "running" | "break" | "finished";
    /** People in the tournament arena, waiting ones included. */
    readonly humans: number;
    /** Time until the next round starts (the lobby countdown or the break), or null when none is set. */
    readonly startsInMs: number | null;
    /** running: the round that runs; break: the round that comes next; finished: the final's number; lobby: null. */
    readonly round: number | null;
    /** Newest first, up to 5. */
    readonly recentWinners: readonly TournamentWinner[];
  };
  readonly monthly: {
    /** YYYY-MM in LEAGUE_TIME_ZONE. */
    readonly month: string;
    /** Seated tanks in every league: they all play now. */
    readonly tanks: number;
    readonly leagues: number;
    /** The newest month that ended with a champion, or null. */
    readonly lastChampion: MonthRecord | null;
  };
}

/** GET /api/champions. */
export interface ChampionsResponse {
  /** Newest first. */
  readonly months: readonly MonthRecord[];
  /** Newest first, up to 50. */
  readonly tournamentWinners: readonly TournamentWinner[];
}
