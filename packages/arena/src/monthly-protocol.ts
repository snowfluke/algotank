// The monthly arena as a league that always runs (docs/specs/revamp/77-monthly-league.md).
// It is not an arena of the reducer in arena.ts: it has no lobby, no break and no finished
// phase. The server runs it in apps/server/src/monthly/. This file holds its messages.
//
// Words: a league is one monthly arena (League 1 is the top one); a seat is one account's tank
// in a league; a day round is the one round a league plays on one calendar day; a counted day
// is a day round that goes into a tank's monthly score.
//
// Routes. "Account" means the session cookie (auth-protocol.ts); a request that changes state
// with it must send an Origin header that matches the Host. Watching needs no session.
// GET    /api/monthly                          -> MonthlyOverviewResponse
// GET    /api/monthly/leagues/:league/events   -> text/event-stream of LeagueStreamMessage; with the session
//                                                cookie of an account, `own` carries the decisions of its seat
//                                                while that seat is in this league (also a seat taken after the
//                                                stream opened)
// GET    /api/monthly/leagues/:league/ranking  -> LeagueRankingResponse (today and this month)
// GET    /api/monthly/leagues/:league/days     -> LeagueDaysResponse (this month's finished days)
// GET    /api/monthly/me                       (account) -> MonthlyMeResponse
// POST   /api/monthly/seat                     (account) TakeSeatRequest -> MonthlyMeResponse, 201. 409
//                                                monthly_seat_taken, 409 monthly_name_fixed (a different
//                                                name than this month's), 409 name_taken, 400 name_invalid,
//                                                400 name_blocked with `suggestion`, 400 for a strategy that
//                                                fails parseStrategy (`details`)
// DELETE /api/monthly/seat                     (account) -> 204; quit. 404 no_monthly_seat
// PUT    /api/monthly/name                     (account) RenameRequest -> 204; once in a month whose name is
//                                                not set yet (409 monthly_name_fixed), and the seated tank
//                                                takes it at once
// PUT    /api/monthly/strategy                 (account) ChangeStrategyRequest -> 204; the seated tank plays these
//                                                rules from the next turn; its seat, points and today's count stay.
//                                                404 no_monthly_seat, 400 for a strategy that fails parseStrategy.
// PUT    /api/monthly/look                     (account) ChangeLookRequest -> 204; the seated tank's look, at any
//                                                time ("Change look"); its name and points stay. 404 no_monthly_seat,
//                                                400 for a look that fails parseTankLook. A save of "My tank" also
//                                                gives the seat its look (server monthly.ts followLook).
// POST   /api/monthly/me/move-seen             (account) -> 204; the month close's move is shown once
// Seat, quit, rename, strategy and look share one limit per account: past it they answer 429 rate_limited with
// `retryAfterSeconds`.
// GET    /api/public                           -> PublicStatusResponse.monthly (public-protocol.ts)
// GET    /api/champions                        -> ChampionsResponse; the months are League 1's champions
// GET    /api/admin/players                    (account in ADMIN_EMAILS; verified when the server sends
//                                                email) -> AdminPlayersResponse. Everyone else gets the 404
//                                                of a route that does not exist.
// DELETE /api/admin/players/:seatId             (the same account, and the Origin check) -> 204; takes the
//                                                tank out as its owner's quit does. 404 no_monthly_seat
// PUT    /api/admin/players/:seatId/gm          (the same account, and the Origin check) SetGameMasterRequest
//                                                -> 204; makes the seat's account a game master or not.
//                                                404 no_monthly_seat

import type { Decision, StatsView, StrategyInput } from "@game/engine";
import type { CompactTick } from "./compact-tick.ts";
import type { MonthRecord } from "./public-protocol.ts";
import type { PlayerId, PublicSnapshot, TankLook } from "./types.ts";

/**
 * Seats in one league. When every league is full, a new lowest league opens. 512 since 2026-11-16
 * (was 16), so every player of a month plays on one board and in one ranking (owner: a tournament
 * in the November league). The board is sized for the tanks seated, not for this number
 * (apps/server/src/monthly/league-day.ts, boardTanksFor).
 */
export const MONTHLY_SEATS = 512;
/** A league's board is sized for at least this many tanks, so a few tanks still meet. */
export const MONTHLY_BOARD_MIN_TANKS = 16;
/**
 * A tank with fewer counted days in a month is listed after the others, as "not ranked yet".
 * 1 since 2026-11-16 (was 7), so a tank that joins late in the month can still win: one
 * monthly day is 96,000 turns, and five simulated days of the same field of 8 play styles
 * gave each style's day points a spread (sd) of 76 to 367 against gaps of hundreds to
 * thousands between styles (measured before the tie ranks and new starts of 2026-11-16).
 * Close rivals can still swap places on one day's luck.
 */
export const MONTHLY_RANKED_DAYS = 1;

/**
 * A league's day (apps/server/src/monthly/league-day.ts holds the table):
 * idle: no seated tank, no turn runs; withBot: seated tanks and at least one bot; withoutBot:
 * seated tanks and no bot; closing: the day's end is being recorded. Bots are drawn again at every
 * new start of the round.
 */
export type LeagueDayPhase = "idle" | "withBot" | "withoutBot" | "closing";

/** A tank on a league's board. `id` is the seat's own id, never an account id. */
export interface LeagueTank {
  readonly id: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  readonly isBot: boolean;
}

/** What a viewer sees of a league now: sent on connect and after every join, quit and day change. */
export interface LeagueLive {
  /** 1 is the top league. */
  readonly league: number;
  /** YYYY-MM. */
  readonly month: string;
  /** YYYY-MM-DD, the day round that plays now. */
  readonly day: string;
  /** Time until the day round ends, measured when the message is sent. */
  readonly dayEndsInMs: number;
  /** Milliseconds between two turns. */
  readonly tickMs: number;
  readonly phase: LeagueDayPhase;
  /** The tanks in the board's order: the indexes of every following compact tick refer to this list. */
  readonly tanks: readonly LeagueTank[];
  /** The board now. With no tank it is the empty board, which keeps its size all day. */
  readonly board: PublicSnapshot;
}

/**
 * Messages on GET /api/monthly/leagues/:league/events, one server-sent event each, named by `type`.
 *
 * The stream (the page's side is in apps/web/src/monthly/leagueLive.ts):
 * | From   | Message | To     | Note                                                                 |
 * |--------|---------|--------|----------------------------------------------------------------------|
 * | (open) | state   | open   | always the first message                                             |
 * | open   | state   | open   | a join, a quit, a rename or a new day: the tanks of later turns      |
 * | open   | tick    | open   | one turn, against the tanks of the last state                        |
 * | open   | closed  | (end)  | the month close left this league empty; the server ends the stream   |
 * Terminal: closed. An ended connection without `closed` is a dropped one; the browser opens it again.
 */
export type LeagueStreamMessage =
  | { readonly type: "state"; readonly state: LeagueLive }
  /** One turn. `own` is the decision of the stream's account's tank, or null. */
  | { readonly type: "tick"; readonly tick: CompactTick; readonly own: Decision | null }
  /** The league closed at the month close. `leagues` is how many leagues exist now (League 1 to `leagues`). */
  | { readonly type: "closed"; readonly leagues: number };

/** GET /api/monthly. */
export interface MonthlyOverviewResponse {
  readonly month: string;
  readonly day: string;
  readonly dayEndsInMs: number;
  /** League 1 first. */
  readonly leagues: readonly { readonly league: number; readonly tanks: number; readonly phase: LeagueDayPhase }[];
  /** The newest month with a champion, or null. */
  readonly lastChampion: MonthRecord | null;
}

/** One tank in today's ranking: seated tanks with their points now, and tanks that quit today on a counted day. */
export interface LeagueTodayRow {
  /**
   * The place among today's tanks; 0 for a game master, who takes no place (`gm`). 0, not null:
   * pages built before 2026-11-17 accept only a number here.
   */
  readonly rank: number;
  readonly seatId: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  readonly points: number;
  /** True when today goes into the monthly score: the tank was seated at the day's first turn. */
  readonly counts: boolean;
  /** False for a tank that quit today. */
  readonly seated: boolean;
  /** The organizer's tank (server monthly/game-masters.ts): a "GM" badge, and no place. */
  readonly gm: boolean;
}

/** One seated tank in this month's ranking of its league. */
export interface LeagueMonthRow {
  /** null: fewer than MONTHLY_RANKED_DAYS counted days ("not ranked yet"); such rows come after the ranked ones. */
  readonly rank: number | null;
  readonly seatId: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  /** The average of the counted day scores, to one decimal; 0 without a counted day. */
  readonly score: number;
  readonly countedDays: number;
  /** As in LeagueTodayRow: a game master has no counted day, so its rank is null. */
  readonly gm: boolean;
}

/** GET /api/monthly/leagues/:league/ranking. */
export interface LeagueRankingResponse {
  readonly league: number;
  readonly month: string;
  readonly day: string;
  readonly today: readonly LeagueTodayRow[];
  readonly thisMonth: readonly LeagueMonthRow[];
}

/** A tank in a finished day's result. */
export interface LeagueDayPlace {
  readonly name: string;
  readonly look: TankLook;
  readonly points: number;
}

/** A finished day of one league: its winner and top 3 ("Juara hari ini"). */
export interface LeagueDayRecord {
  readonly day: string;
  readonly league: number;
  /** Up to 3, the winner first. */
  readonly top: readonly LeagueDayPlace[];
}

/** GET /api/monthly/leagues/:league/days. */
export interface LeagueDaysResponse {
  readonly month: string;
  /** This month's finished days of the league, newest first. A day without a tank has no record. */
  readonly days: readonly LeagueDayRecord[];
}

/** What the month close did to a seat, shown to its owner once. */
export interface MonthMove {
  /** The month that closed. */
  readonly month: string;
  readonly from: number;
  readonly to: number;
  readonly kind: "up" | "down" | "stayed";
}

/** GET /api/monthly/me. */
export interface MonthlyMeResponse {
  readonly seat: {
    readonly seatId: PlayerId;
    readonly league: number;
    readonly name: string;
    readonly look: TankLook;
    /** Today's points now. */
    readonly points: number;
    /** True when today goes into the monthly score. */
    readonly countsToday: boolean;
    readonly countedDays: number;
    /** As in LeagueMonthRow. */
    readonly score: number;
    readonly rank: number | null;
    /** The seat's strategy as it was submitted, for the "Tank kamu" feed on any device. */
    readonly strategy: StrategyInput;
    /** What the seat's rules did today (stats-protocol.ts); zeros after a quit and a new seat, and at a new day. Only in the owner's own answer. */
    readonly stats: StatsView;
  } | null;
  /** The account's name in the league, or null before its first seat. */
  readonly name: {
    readonly name: string;
    /** The month in which the name was set. */
    readonly month: string;
    /** True when the name was set in an earlier month, so it can change once now. */
    readonly canChange: boolean;
  } | null;
  /** Not seen yet; null otherwise. */
  readonly move: MonthMove | null;
}

/** Body of POST /api/monthly/seat. The name and the rules are fixed while it is seated; the look can change (PUT /api/monthly/look). */
export interface TakeSeatRequest {
  /** Without it: this month's name, an earlier month's name, or a name from the game, in that order. */
  readonly name?: string;
  readonly look: TankLook;
  readonly strategy: StrategyInput;
}

/** Body of PUT /api/monthly/strategy. */
export interface ChangeStrategyRequest {
  readonly strategy: StrategyInput;
}

/** Body of PUT /api/monthly/look. */
export interface ChangeLookRequest {
  readonly look: TankLook;
}

/** Body of PUT /api/monthly/name. */
export interface RenameRequest {
  readonly name: string;
}

/**
 * Error codes of the monthly routes, besides name_invalid, name_blocked and name_taken:
 * - monthly_seat_taken: the account already has a seat (409).
 * - no_monthly_seat: a quit without a seat (404).
 * - monthly_name_fixed: the account's name of this month is set; it changes in the next month (409).
 */
export type MonthlyErrorCode = "monthly_seat_taken" | "no_monthly_seat" | "monthly_name_fixed";

/**
 * One seated tank and its owner's account, for the host (owner, 2026-11-16: to check who is behind
 * each tank before the month's prizes). Only GET /api/admin/players sends an email.
 */
export interface AdminPlayer {
  /** The seat's id, which DELETE /api/admin/players/:seatId takes. */
  readonly seatId: PlayerId;
  readonly league: number;
  /** As in LeagueMonthRow. */
  readonly rank: number | null;
  readonly name: string;
  readonly score: number;
  readonly countedDays: number;
  /** As in LeagueTodayRow; PUT /api/admin/players/:seatId/gm sets it. */
  readonly gm: boolean;
  /** null: the seat names an account that no longer exists. */
  readonly account: {
    readonly email: string;
    readonly emailVerified: boolean;
    /** ISO time. */
    readonly createdAt: string;
  } | null;
}

/** Body of PUT /api/admin/players/:seatId/gm. */
export interface SetGameMasterRequest {
  readonly gm: boolean;
}

/** GET /api/admin/players: every seated tank, League 1 first, each league in its month ranking's order. */
export interface AdminPlayersResponse {
  readonly month: string;
  readonly day: string;
  readonly players: readonly AdminPlayer[];
}
