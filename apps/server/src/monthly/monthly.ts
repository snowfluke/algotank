// The monthly arena as a league that always runs (docs/specs/revamp/77-monthly-league.md, sections
// 1 to 3 and 5). It is its own module, not a phase machine of the arena reducer, because it has no
// lobby, break or finished phase; it uses no Store, RoundRunner, presence or expiry sweep, so no
// rule about an open page can reach it.
//
// One timer, every turn (tickMs), steps each league that has tanks and closes the day when the
// clock passes its end; a second timer writes the checkpoint every minute. Nothing grows per
// turn: a turn changes the engine's snapshot and goes to the streams, and nothing keeps it.
// A turn runs no SQL: the seats and the day round are in memory, and the store (league-store.ts)
// is written at a seat change, at the minute's checkpoint and at the day's close, once a day.
//
// The day (league-day.ts has the per-league table and the bot rule):
// | From       | To         | Actor          | Guard / effect                                               |
// |------------|------------|----------------|--------------------------------------------------------------|
// | (start)    | day open   | server         | the checkpoint is today's: every seat resumes with its points |
// |            |            |                | and its "counts"; a seat it does not list: 0 points, no count|
// | (start)    | closing    | server         | the checkpoint's day has ended: that day closes with its     |
// |            |            |                | points, then today opens. Turns missed while down are lost   |
// | day open   | closing    | server (clock) | now >= the day's end                                         |
// | closing    | day open   | server         | the day's results are saved (and the month close, when the   |
// |            |            |                | month ends): every seat respawns with 0 points and counts    |
// | closing    | closing    | server         | a save failed: no turn, no seat change (503); the next turn  |
// |            |            |                | tries again. Every step is safe to run twice                 |
//
// Seat of an account (one over all leagues):
// | From   | To     | Actor | Guard                                                                    |
// |--------|--------|-------|--------------------------------------------------------------------------|
// | none   | seated | owner | signed in, no seat, a valid tank, the name rule below; the lowest league |
// |        |        |       | with a free seat, or a new lowest league when every league is full       |
// | seated | none   | owner | quit. On a counted day its points now become the day's score at once     |
// | none   | seated | owner | the same as the first row; after a quit on the same day the tank goes on |
// |        |        |       | from that day's saved score and today counts again: leaving is a pause, |
// |        |        |       | like "Change rules" (owner, 2026-11-17)                                  |
// | seated | seated | server| the month close moves it up, down or not (month-close.ts)                 |
// Nothing else removes a seat. Named limit: a tank whose owner never returns stays seated.
//
// Name of an account: the first name it uses in a month is fixed until the month ends, also
// after a quit and a new seat. From the first day of a later month it may change once (a new seat
// with another name, or PUT /api/monthly/name). A name is refused when another account's seat
// uses it in any league or another account fixed it this month, so a month close that moves
// tanks between leagues cannot bring two tanks of one name together.
//
// Restart: the checkpoint (league-store.ts) holds the day, each league's normal weather streak
// and each seat's points, whether the day counts and statistics (K2). Positions, water and running
// step sequences are lost, and a crash can lose up to one minute of changes. A quit and a day close
// are saved at once. Statistics: a quit drops the seat's, a new seat starts at zero, a new day
// starts every seat at zero, and only the owner's /api/monthly/me carries them.

import {
  FIRST_PUBLISHED_RULES_MONTH,
  MONTHLY_SEATS,
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  parsePlayerName,
  parseTankLook,
  type AccountId,
  type AdminPlayer,
  type LeagueActivityEvent,
  type LeagueDayRecord,
  type LeagueDaysResponse,
  type LeagueLive,
  type LeagueMonthRow,
  type LeagueRankingResponse,
  type LeagueRow,
  type LeagueStateChange,
  type LeagueTodayRow,
  type MonthlyMeResponse,
  type MonthlyOverviewResponse,
  type MonthRecord,
  type MonthTanksResponse,
  type MonthTankRulesResponse,
  type PlayerId,
  type PublishedMonthsResponse,
  type PublicStatusResponse,
  type TankLook,
  type TankSheetResponse,
} from "@game/arena";
import { parseStrategy, statsView } from "@game/engine";
import { makeGameName } from "../game-names.ts";
import { HttpError, isRecord } from "../http.ts";
import { checkTypedName } from "../name-filter.ts";
import { toPublicSnapshot } from "../public-tick.ts";
import { newPlayerId } from "../secrets.ts";
import { assignMissingUltimate } from "../ultimates/strategy.ts";
import type { Clock, Scheduler } from "../timers.ts";
import type { CalendarDay, LeagueCalendar } from "./calendar.ts";
import { RECORD_TOP, type Champions } from "./champions.ts";
import { LeagueDay, type DayTank, type Random } from "./league-day.ts";
import { EMPTY_SEATS, type Checkpoint, type DayScore, type LeagueStore, type MonthState, type Seat, type SeatsState } from "./league-store.ts";
import { closeMonth } from "./month-close.ts";
import { dayNumbersOf, type Disclosure } from "./disclosure.ts";
import type { GameMasters } from "./game-masters.ts";
import { rankMonth, type MonthPlace } from "./score.ts";
import type { LeagueStreams } from "./streams.ts";
import { NO_METRICS, type MetricsRecorder } from "../metrics/metrics.ts";

/** A turn of a day round, before PUBLIC_TIME_DIVISOR: 86,400 s / 0.9 s = 96,000 turns a day. */
export const MONTHLY_TICK_MS = 900;
const CHECKPOINT_MS = 60_000;

export interface MonthlyOptions {
  readonly store: LeagueStore;
  /** The game master accounts, whose tanks take no place (game-masters.ts). */
  readonly gameMasters: GameMasters;
  /** What the league opens to everyone: day numbers and, from a month's close, its rules (disclosure.ts). */
  readonly disclosure: Disclosure;
  readonly champions: Champions;
  readonly streams: LeagueStreams;
  readonly calendar: LeagueCalendar;
  readonly now: Clock;
  readonly scheduler: Scheduler;
  /** MONTHLY_TICK_MS divided by PUBLIC_TIME_DIVISOR, at least 100 ms. */
  readonly tickMs: number;
  /** Times the turns and counts a failed league round (metrics/metrics.ts). NO_METRICS when not given. */
  readonly metrics?: MetricsRecorder;
  /** Draws the leagues' bots (league-day.ts). Math.random when not given; tests fix it. */
  readonly random?: Random;
  /** Seats in one league: MONTHLY_SEATS when not given; the tests of several leagues use a small number. */
  readonly seatsPerLeague?: number;
}

/** A seated tank for the admin route (monthly/admin-routes.ts), which adds the account. */
export interface SeatedPlayer extends Omit<AdminPlayer, "account"> {
  readonly accountId: AccountId;
}

export interface SeatedPlayers {
  readonly month: string;
  readonly day: string;
  readonly players: readonly SeatedPlayer[];
}

const dayTankOf = (seat: Seat): DayTank => ({ id: seat.seatId, name: seat.name, look: seat.look, strategy: seat.strategy });

const serviceBusy = () => new HttpError(503, "The day round is being recorded. Please try again in a moment.");

const monthNotPublished = () => new HttpError(404, "The rules of that month are not open.", { code: "month_not_published" });

export class MonthlyLeagues {
  private seats: SeatsState = EMPTY_SEATS;
  private month: MonthState = { month: "", days: [], records: [] };
  private today: CalendarDay = { day: "", month: "", startsAt: 0, endsAt: 0 };
  private readonly days = new Map<number, LeagueDay>();
  // Keep state broadcasts from the turn loop free of activity queries.
  private activity = new Map<number, readonly LeagueActivityEvent[]>();
  private closing = false;
  /** Read at the start and after each admin change: the turn loop never asks the database. */
  private gameMasters: ReadonlySet<AccountId> = new Set();
  private stops: (() => void)[] = [];
  /** When the turn timer fired last, for how late the next turn fires. */
  private lastPulseAt = 0;

  private readonly seatsPerLeague: number;

  constructor(private readonly options: MonthlyOptions) {
    this.seatsPerLeague = options.seatsPerLeague ?? MONTHLY_SEATS;
  }

  /** Reads the tables, resumes or closes the checkpoint's day, and starts the timers. Throws a PersistenceError for a damaged row. */
  start(): void {
    const { store, calendar, scheduler, tickMs } = this.options;
    this.seats = store.readSeats();
    this.gameMasters = this.options.gameMasters.read();
    const now = this.options.now();
    const current = calendar.dayAt(now);
    const checkpoint = store.readCheckpoint();
    if (checkpoint !== null && checkpoint.day === current.day) {
      this.today = current;
      this.month = store.readMonth(current.month);
      this.openDay(checkpoint);
    } else if (checkpoint !== null && checkpoint.endsAt <= now) {
      this.today = { day: checkpoint.day, month: checkpoint.month, startsAt: checkpoint.startsAt, endsAt: checkpoint.endsAt };
      this.month = store.readMonth(checkpoint.month);
      this.openDay(checkpoint);
      this.closeDay();
    } else {
      if (checkpoint !== null) console.error(`The league checkpoint is for ${checkpoint.day}, after the clock's day ${current.day}; today starts without it.`);
      this.today = current;
      this.month = store.readMonth(current.month);
      this.openDay(null);
      this.checkpoint();
    }
    this.activity = store.openActivityMonth(this.today.month);
    this.stops = [scheduler.every(() => this.pulse(), tickMs), scheduler.every(() => this.checkpoint(), CHECKPOINT_MS)];
  }

  /** Stops the timers and writes the checkpoint, so a clean stop loses no points. */
  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    this.checkpoint();
  }

  // -------------------------------------------------------------------------
  // The clock: turns, the day's end, the checkpoint.
  // -------------------------------------------------------------------------

  /** One turn of every league, or the day's close. Runs on the timer, so it never throws. */
  private pulse(): void {
    const metrics = this.options.metrics ?? NO_METRICS;
    const firedAt = this.options.now();
    if (this.lastPulseAt > 0) metrics.observe("turnLateMs", "league", firedAt - this.lastPulseAt - this.options.tickMs);
    this.lastPulseAt = firedAt;
    if (this.closing || this.options.now() >= this.today.endsAt) {
      this.closeDay();
      return;
    }
    // performance.now(), because the injected clock does not move during one turn.
    const computeStart = performance.now();
    for (const [league, day] of this.days) {
      try {
        const turn = day.step();
        if (turn !== null) {
          this.options.streams.sendTick(league, turn, this.seatIdsIn(league));
          if (turn.weatherChanged) this.sendState(league, "weather");
          else if (turn.botsChanged) this.sendState(league, "botFreshStart");
        }
      } catch (error) {
        // A bug in the engine: this league's round starts again with the points kept, the others go on.
        console.error(`The day round of league ${league} failed; it starts again with the points kept:`, error);
        metrics.error("league");
        try {
          day.rebuild(this.ticksLeft());
          this.sendState(league);
        } catch (rebuildError) {
          // ponytail: a round that cannot be rebuilt is tried again on every turn and logged each time; a backoff would quiet the log.
          console.error(`The day round of league ${league} could not start again:`, rebuildError);
        }
      }
    }
    if (this.days.size > 0) metrics.observe("turnComputeMs", "league", performance.now() - computeStart);
  }

  /** Writes today's points. Runs on the timer, so a failure is logged and the next minute tries again. */
  private checkpoint(): void {
    if (this.closing) return;
    try {
      this.options.store.writeCheckpoint(this.checkpointOf());
    } catch (error) {
      console.error("The league checkpoint could not be saved:", error);
    }
  }

  private checkpointOf(): Checkpoint {
    const tanks = [...this.days.values()].flatMap((day) => day.standings().map(({ id, points, counts }) => ({ seatId: id, points, counts, stats: day.statsOf(id) })));
    const normalStreaks = [...this.days.values()].flatMap((day) => {
      const normalStreak = day.normalWeatherStreak();
      return normalStreak === 0 ? [] : [{ league: day.league, normalStreak }];
    });
    return { ...this.today, tanks, ...(normalStreaks.length === 0 ? {} : { normalStreaks }) };
  }

  private ticksLeft(): number {
    return Math.max(1, Math.ceil((this.today.endsAt - this.options.now()) / this.options.tickMs));
  }

  /** Start each league's day round, restoring its weather streak and each seat's record from the checkpoint. */
  private openDay(checkpoint: Checkpoint | null): void {
    this.days.clear();
    for (let league = 1; league <= this.seats.leagues; league++) this.days.set(league, new LeagueDay(league, this.options.random, this.options.now));
    const ticksLeft = this.ticksLeft();
    const seats = [...this.seats.seats.values()].sort((a, b) => a.order - b.order);
    // Each league seats its own tanks below, so a seat in a league with no day would be left out without a word.
    const outside = seats.filter((seat) => !this.days.has(seat.league));
    if (outside.length > 0) throw new Error(`Seats ${outside.map((seat) => seat.seatId).join(", ")} are in a league that has no day round.`);
    for (const [league, day] of this.days) {
      const tanks = seats
        .filter((seat) => seat.league === league)
        .map((seat) => {
          const saved = checkpoint?.tanks.find((t) => t.seatId === seat.seatId);
          return { tank: dayTankOf(seat), points: saved?.points ?? 0, counts: checkpoint === null ? true : (saved?.counts ?? false), stats: saved?.stats };
        });
      day.start(tanks, ticksLeft, checkpoint?.normalStreaks?.find((entry) => entry.league === league)?.normalStreak ?? 0);
    }
  }

  /**
   * The day's end: the day's results, the month close when the month ends, then the new day.
   * Each save is safe to repeat, so a failure keeps the league closing and the next turn retries.
   */
  private closeDay(): void {
    this.closing = true;
    try {
      const ended = this.today;
      const next = this.options.calendar.dayAt(this.options.now());
      const month = this.withDayClosed(this.month, ended.day);
      this.options.store.writeMonth(month);
      this.month = month;
      this.options.disclosure.writeDayNumbers(ended.day, this.dayNumbersOfSeated());
      const leaguesBefore = this.seats.leagues;
      if (next.month !== ended.month) {
        this.closeMonthOf(month);
        const nextMonth = this.options.store.readMonth(next.month);
        const nextActivity = this.options.store.openActivityMonth(next.month);
        this.month = nextMonth;
        this.activity = nextActivity;
      }
      this.today = next;
      this.openDay(null);
      this.options.store.writeCheckpoint(this.checkpointOf());
      this.closing = false;
      for (const league of this.days.keys()) this.sendState(league);
      // A league the month close emptied: its open pages learn which leagues exist instead of waiting.
      for (let league = this.seats.leagues + 1; league <= leaguesBefore; league++) this.options.streams.closeLeague(league, this.seats.leagues);
    } catch (error) {
      console.error(`The day ${this.today.day} of the monthly league could not be closed; the next turn tries again:`, error);
    }
  }

  /** The month with the day's places and records. A day closed before keeps its records. */
  private withDayClosed(month: MonthState, day: string): MonthState {
    let days = [...month.days];
    const records = [...month.records];
    for (const [league, round] of this.days) {
      const seated = round.standings().map(({ id, points, counts }) => {
        const seat = this.seatById(id);
        return { accountId: seat.accountId, seatId: id, name: seat.name, look: seat.look, order: seat.order, points, counts };
      });
      const seatedIds = new Set(seated.map((s) => s.seatId));
      const quit = days.filter((d) => d.day === day && d.league === league && !seatedIds.has(d.seatId)).map((d) => ({ ...d, counts: true }));
      // A game master's tank takes no place and is not in the day's top 3.
      const tanks = [...seated, ...quit].filter((tank) => !this.gameMasters.has(tank.accountId)).sort((a, b) => b.points - a.points || a.order - b.order);
      tanks.forEach((tank, index) => {
        if (!tank.counts) return;
        const score: DayScore = { accountId: tank.accountId, seatId: tank.seatId, name: tank.name, look: tank.look, order: tank.order, day, league, points: tank.points, place: index + 1 };
        const existing = days.findIndex((d) => d.accountId === tank.accountId && d.day === day);
        if (existing === -1) days.push(score);
        else if (days[existing]?.seatId === tank.seatId) days = days.map((d, i) => (i === existing ? { ...d, place: index + 1 } : d));
      });
      if (tanks.length > 0 && !records.some((r) => r.day === day && r.league === league)) {
        records.push({ day, league, top: tanks.slice(0, 3).map(({ accountId, name, look, points }) => ({ accountId, name, look, points })) });
      }
    }
    return { month: month.month, days, records };
  }

  /** The month close: the champion, then the moves between leagues. Runs once per month (closedMonth). */
  private closeMonthOf(month: MonthState): void {
    if (this.seats.closedMonth === month.month) return;
    const rankings = Array.from({ length: this.seats.leagues }, (_, i) => this.monthRanking(i + 1, month));
    if (month.month >= FIRST_PUBLISHED_RULES_MONTH) this.publishRules(month.month, rankings);
    const leagueOne = (rankings[0] ?? []).filter((place) => place.rank !== null);
    const rowOf = (place: MonthPlace<AccountId>): LeagueRow => {
      const seat = this.seatOfAccount(place.id);
      const wins = month.records.filter((r) => r.top[0]?.accountId === place.id).length;
      return { rank: place.rank ?? 0, name: seat.name, look: seat.look, score: place.score, games: place.countedDays, wins };
    };
    const champion = leagueOne[0];
    const record: MonthRecord | null = champion === undefined ? null : { month: month.month, champion: rowOf(champion), top: leagueOne.slice(0, RECORD_TOP).map(rowOf) };
    this.options.champions.close(month.month, record);

    const result = closeMonth(rankings.map((ranking) => ranking.map((place) => place.id)), this.seatsPerLeague);
    const seats = new Map(this.seats.seats);
    const moves = new Map(this.seats.moves);
    for (const [accountId, move] of result.moves) {
      const seat = this.seatOfAccount(accountId);
      seats.set(accountId, { ...seat, league: move.to });
      moves.set(accountId, { month: month.month, ...move });
    }
    const next: SeatsState = { ...this.seats, leagues: Math.max(1, result.leagues.length), closedMonth: month.month, seats, moves };
    this.options.store.writeSeats(next);
    this.seats = next;
  }

  /** Every seated tank's rules as they stand at the close, with its place (disclosure.ts). Written once per month. */
  private publishRules(month: string, rankings: readonly (readonly MonthPlace<AccountId>[])[]): void {
    const rows = [...this.seats.seats.values()].map((seat) => ({
      seatId: seat.seatId,
      league: seat.league,
      rank: rankings[seat.league - 1]?.find((place) => place.id === seat.accountId)?.rank ?? null,
      name: seat.name,
      look: seat.look,
      gm: this.gameMasters.has(seat.accountId),
      strategy: seat.strategy,
    }));
    this.options.disclosure.writeMonthRules(month, rows);
  }

  /** Each seated tank's numbers of the day so far. */
  private dayNumbersOfSeated(): { readonly seatId: PlayerId; readonly numbers: ReturnType<typeof dayNumbersOf> }[] {
    return [...this.days.values()].flatMap((round) => round.standings().map(({ id }) => ({ seatId: id, numbers: dayNumbersOf(round.statsOf(id)) })));
  }

  // -------------------------------------------------------------------------
  // What anyone may read about a tank (visibility table: monthly-protocol.ts).
  // -------------------------------------------------------------------------

  /** GET /api/monthly/tanks/:seatId: the last finished day's numbers, and the rules only of a game master's tank. */
  tankSheet(seatId: string | undefined): TankSheetResponse {
    const seat = [...this.seats.seats.values()].find((s) => s.seatId === seatId);
    if (seat === undefined) throw new HttpError(404, "No tank in the monthly arena has that id.", { code: "no_monthly_seat" });
    return {
      seatId: seat.seatId,
      rules: this.gameMasters.has(seat.accountId) ? seat.strategy : null,
      lastDay: this.options.disclosure.lastDayNumbers(seat.seatId, this.today.day),
    };
  }

  publishedMonths(): PublishedMonthsResponse {
    return { months: this.options.disclosure.publishedMonths() };
  }

  monthTanks(month: string | undefined): MonthTanksResponse {
    const tanks = month === undefined ? null : this.options.disclosure.monthTanks(month);
    if (month === undefined || tanks === null) throw monthNotPublished();
    return { month, tanks };
  }

  monthTankRules(month: string | undefined, seatId: string | undefined): MonthTankRulesResponse {
    if (month === undefined || seatId === undefined || this.options.disclosure.monthTanks(month) === null) throw monthNotPublished();
    const rules = this.options.disclosure.monthRules(month, seatId);
    if (rules === null) throw new HttpError(404, "That month has no tank with that id.", { code: "no_monthly_seat" });
    return { rules };
  }

  // -------------------------------------------------------------------------
  // Seats: take one, quit, rename.
  // -------------------------------------------------------------------------

  /** POST /api/monthly/seat. Validates the body here, at the boundary. */
  takeSeat(accountId: AccountId, body: unknown): MonthlyMeResponse {
    if (!isRecord(body)) throw new HttpError(400, "Send the tank: its look and its strategy, and its name when the player typed one.");
    const look = parseTankLook(body["look"]);
    if (look === null) throw new HttpError(400, "The tank's look is not valid.", { code: "look_invalid" });
    // A new seat fixes the submitted or assigned ultimate (85-ultimates.md).
    const parsed = parseStrategy(assignMissingUltimate(body["strategy"]));
    if (!parsed.ok) throw new HttpError(400, "The strategy is not valid.", { details: parsed.errors });
    if (this.closing) throw serviceBusy();
    if (this.seats.seats.has(accountId)) throw new HttpError(409, "Your account already has a tank in the monthly arena.", { code: "monthly_seat_taken" });

    const name = this.nameForSeat(accountId, body["name"]);
    let league = 0;
    for (let candidate = this.seats.leagues; candidate >= 1; candidate--) {
      if (this.seatsIn(candidate).length < this.seatsPerLeague) {
        league = candidate;
        break;
      }
    }
    const leagues = league === 0 ? this.seats.leagues + 1 : this.seats.leagues;
    if (league === 0) league = leagues;
    const seat: Seat = { seatId: newPlayerId(), accountId, league, name, look, strategy: parsed.strategy, order: this.seats.nextOrder };
    const next: SeatsState = {
      ...this.seats,
      leagues,
      nextOrder: this.seats.nextOrder + 1,
      seats: new Map(this.seats.seats).set(accountId, seat),
      names: new Map(this.seats.names).set(accountId, { month: this.today.month, name }),
    };
    this.saveSeatActivity(next, seat, "joined");
    if (!this.days.has(league)) this.days.set(league, new LeagueDay(league, this.options.random, this.options.now));
    // A tank that left today and comes back the same day goes on where it stopped, and today counts again: leaving
    // is a pause, like "Change rules" (owner, 2026-11-17: a rejoin started over at 0 and its day did not count). The
    // checkpoint is written before the saved score goes, so a crash in between keeps the points.
    const paused = this.month.days.find((d) => d.accountId === accountId && d.day === this.today.day);
    let grew: boolean;
    if (paused !== undefined) {
      grew = this.dayOf(league).seat(dayTankOf(seat), paused.points, true, this.ticksLeft());
      this.options.store.writeCheckpoint(this.checkpointOf());
      this.options.store.deleteDayScore(accountId, this.today.day);
      this.month = { ...this.month, days: this.month.days.filter((d) => d !== paused) };
    } else {
      // A tank that arrives during the day plays at once; the day does not count for it.
      grew = this.dayOf(league).seat(dayTankOf(seat), 0, false, this.ticksLeft());
    }
    this.sendState(league, grew ? "growth" : undefined);
    return this.me(accountId);
  }

  /**
   * The admin's removal (DELETE /api/admin/players/:seatId), for an owner who cannot sign in to
   * quit (owner, 2026-11-16). It is the owner's quit, so the day's score, the name and the
   * counted days stay as at any quit.
   */
  removeSeat(seatId: PlayerId): void {
    for (const seat of this.seats.seats.values()) {
      if (seat.seatId === seatId) {
        this.quit(seat.accountId);
        return;
      }
    }
    throw new HttpError(404, "No tank in the monthly arena has this seat.", { code: "no_monthly_seat" });
  }

  /** DELETE /api/monthly/seat. On a counted day the points now are the day's score, saved before the seat goes. */
  quit(accountId: AccountId): void {
    const seat = this.seats.seats.get(accountId);
    if (seat === undefined) throw new HttpError(404, "Your account has no tank in the monthly arena.", { code: "no_monthly_seat" });
    if (this.closing) throw serviceBusy();
    const day = this.dayOf(seat.league);
    const points = day.pointsOf(seat.seatId);
    if (day.countsToday(seat.seatId) && !this.month.days.some((d) => d.accountId === accountId && d.day === this.today.day)) {
      const score: DayScore = { accountId, seatId: seat.seatId, name: seat.name, look: seat.look, order: seat.order, day: this.today.day, league: seat.league, points, place: null };
      const month: MonthState = { ...this.month, days: [...this.month.days, score] };
      this.options.store.writeMonth(month);
      this.month = month;
    }
    // The numbers of the part of the day it played, so its sheet's "last day" is not lost with the seat.
    this.options.disclosure.writeDayNumbers(this.today.day, [{ seatId: seat.seatId, numbers: dayNumbersOf(day.statsOf(seat.seatId)) }]);
    const seats = new Map(this.seats.seats);
    seats.delete(accountId);
    const next: SeatsState = { ...this.seats, seats };
    this.saveSeatActivity(next, seat, "left");
    day.unseat(seat.seatId);
    this.sendState(seat.league);
  }

  /**
   * PUT /api/monthly/strategy ("Ubah aturan"): the seated tank plays these rules from the next
   * turn. Its seat, name, look, today's points and whether today counts all stay (owner,
   * 2026-11-16, after players who changed rules by a quit and a new seat saw their points at 0).
   */
  changeStrategy(accountId: AccountId, body: unknown): void {
    const seat = this.seats.seats.get(accountId);
    const input = isRecord(body) ? body["strategy"] : undefined;
    const parsed = parseStrategy(assignMissingUltimate(input, seat?.strategy.ultimate));
    if (!parsed.ok) throw new HttpError(400, "The strategy is not valid.", { details: parsed.errors });
    if (seat === undefined) throw new HttpError(404, "Your account has no tank in the monthly arena.", { code: "no_monthly_seat" });
    if (this.closing) throw serviceBusy();
    // The same rules again change nothing, so a save never restarts the tank's mode.
    if (JSON.stringify(seat.strategy) === JSON.stringify(parsed.strategy)) return;
    const next: SeatsState = { ...this.seats, seats: new Map(this.seats.seats).set(accountId, { ...seat, strategy: parsed.strategy }) };
    this.saveSeatActivity(next, seat, "changedRules");
    this.dayOf(seat.league).restrategy(seat.seatId, parsed.strategy);
    this.sendState(seat.league);
  }

  /** PUT /api/monthly/name: once in a month whose name is not set yet. */
  rename(accountId: AccountId, body: unknown): void {
    const raw = isRecord(body) ? body["name"] : undefined;
    const current = this.seats.names.get(accountId);
    if (current?.month === this.today.month) throw new HttpError(409, "Your name is set for this month. You can change it in the next month.", { code: "monthly_name_fixed" });
    if (this.closing) throw serviceBusy();
    const name = this.checkedNewName(accountId, raw);
    const seat = this.seats.seats.get(accountId);
    const next: SeatsState = {
      ...this.seats,
      seats: seat === undefined ? this.seats.seats : new Map(this.seats.seats).set(accountId, { ...seat, name }),
      names: new Map(this.seats.names).set(accountId, { month: this.today.month, name }),
    };
    this.options.store.writeSeats(next);
    this.seats = next;
    if (seat !== undefined) {
      this.dayOf(seat.league).rename(seat.seatId, name);
      this.sendState(seat.league);
    }
  }

  /**
   * A seated tank's look follows the account's "My tank" (owner, 2026-11-16: "Ubah penampilan",
   * and a tank seated without a flag may add one). The name stays this month's name, and today's
   * points and count stay. account-tank.ts calls it after every save of "My tank"; nothing happens
   * without a seat or when the look is the same. During the day's close the seat keeps its look,
   * and the next save of "My tank" brings it.
   */
  followLook(accountId: AccountId, look: TankLook): void {
    const seat = this.seats.seats.get(accountId);
    if (seat === undefined || this.closing) return;
    this.restyle(accountId, seat, look);
  }

  /**
   * PUT /api/monthly/look: "Change look" sends the edited look at Done, also when "My tank" cannot
   * reach the account (it sends nothing without a valid name on the device).
   */
  changeLook(accountId: AccountId, body: unknown): void {
    const look = parseTankLook(isRecord(body) ? body["look"] : undefined);
    if (look === null) throw new HttpError(400, "Send look as a tank look.");
    const seat = this.seats.seats.get(accountId);
    if (seat === undefined) throw new HttpError(404, "Your account has no tank in the monthly arena.", { code: "no_monthly_seat" });
    if (this.closing) throw serviceBusy();
    this.restyle(accountId, seat, look);
  }

  /** The seat's new look, between turns: stored, given to the day round, and sent to the viewers. Nothing when it is the same. */
  private restyle(accountId: AccountId, seat: Seat, look: TankLook): void {
    if (JSON.stringify(seat.look) === JSON.stringify(look)) return;
    const updated = { ...seat, look };
    const next: SeatsState = { ...this.seats, seats: new Map(this.seats.seats).set(accountId, updated) };
    this.saveSeatActivity(next, updated, "changedLook");
    this.dayOf(seat.league).restyle(seat.seatId, look);
    this.sendState(seat.league);
  }

  /** The public snapshot includes only fields the board shows (86-monthly-activity.md). */
  private saveSeatActivity(next: SeatsState, { league, seatId, name, look }: Seat, kind: LeagueActivityEvent["kind"]): void {
    const activity = this.options.store.writeSeats(next, {
      month: this.today.month,
      league,
      event: { kind, seatId, name, look, at: this.options.now() },
    });
    this.seats = next;
    this.activity.set(league, activity);
  }

  /** POST /api/monthly/me/move-seen. */
  moveSeen(accountId: AccountId): void {
    if (!this.seats.moves.has(accountId)) return;
    const moves = new Map(this.seats.moves);
    moves.delete(accountId);
    const next: SeatsState = { ...this.seats, moves };
    this.options.store.writeSeats(next);
    this.seats = next;
  }

  /** The name a new seat gets: this month's fixed name, a typed one, an earlier month's, or one from the game. */
  private nameForSeat(accountId: AccountId, raw: unknown): string {
    const record = this.seats.names.get(accountId);
    if (record?.month === this.today.month) {
      if (raw !== undefined && parsePlayerName(raw)?.toLowerCase() !== record.name.toLowerCase()) {
        throw new HttpError(409, `Your name this month is ${record.name}. You can change it in the next month.`, { code: "monthly_name_fixed" });
      }
      return record.name;
    }
    if (raw !== undefined) return this.checkedNewName(accountId, raw);
    const taken = this.takenNames(accountId);
    if (record !== undefined && !taken.has(record.name.toLowerCase())) return record.name;
    return makeGameName(taken);
  }

  private checkedNewName(accountId: AccountId, raw: unknown): string {
    const taken = this.takenNames(accountId);
    const checked = checkTypedName(raw, taken);
    if (!checked.ok) {
      if (checked.code === "name_blocked") throw new HttpError(400, "That name is not allowed. Please choose another one.", { code: "name_blocked", suggestion: checked.suggestion });
      throw new HttpError(400, `A name has ${PLAYER_NAME_MIN} to ${PLAYER_NAME_MAX} letters, digits or spaces.`, { code: "name_invalid" });
    }
    if (taken.has(checked.name.toLowerCase())) throw new HttpError(409, "Another tank in the monthly arena has that name. Please choose another one.", { code: "name_taken" });
    return checked.name;
  }

  /** Lower-case names other accounts hold: their seats in any league, and their names fixed this month. */
  private takenNames(accountId: AccountId): Set<string> {
    const taken = new Set<string>();
    for (const seat of this.seats.seats.values()) if (seat.accountId !== accountId) taken.add(seat.name.toLowerCase());
    for (const [holder, record] of this.seats.names) if (holder !== accountId && record.month === this.today.month) taken.add(record.name.toLowerCase());
    return taken;
  }

  // -------------------------------------------------------------------------
  // Reading.
  // -------------------------------------------------------------------------

  /** The league number of a route, or 404. */
  leagueOf(raw: string | undefined): number {
    const league = Number(raw);
    if (!Number.isSafeInteger(league) || league < 1 || league > this.seats.leagues) throw new HttpError(404, "That league does not exist.");
    return league;
  }


  live(league: number): LeagueLive {
    const view = this.dayOf(league).view(this.ticksLeft());
    return {
      league,
      month: this.today.month,
      day: this.today.day,
      dayEndsInMs: Math.max(0, this.today.endsAt - this.options.now()),
      tickMs: this.options.tickMs,
      phase: this.closing ? "closing" : this.dayOf(league).phase(),
      tanks: view.tanks,
      activity: this.activity.get(league) ?? [],
      board: toPublicSnapshot(view.board),
    };
  }

  overview(): MonthlyOverviewResponse {
    return {
      month: this.today.month,
      day: this.today.day,
      dayEndsInMs: Math.max(0, this.today.endsAt - this.options.now()),
      leagues: Array.from({ length: this.seats.leagues }, (_, i) => ({ league: i + 1, tanks: this.seatsIn(i + 1).length, phase: this.closing ? "closing" : this.dayOf(i + 1).phase() })),
      lastChampion: this.options.champions.latest(),
    };
  }

  /** The number of open leagues, from memory: the stream sampling timer reads it, so it runs no SQL. */
  leagueCount(): number {
    return this.seats.leagues;
  }

  publicStatus(): PublicStatusResponse["monthly"] {
    return { month: this.today.month, tanks: this.seats.seats.size, leagues: this.seats.leagues, lastChampion: this.options.champions.latest() };
  }

  ranking(league: number): LeagueRankingResponse {
    const day = this.dayOf(league);
    const seated = day.standings().map(({ id, points, counts }) => {
      const seat = this.seatById(id);
      return { accountId: seat.accountId, seatId: id, name: seat.name, look: seat.look, points, counts, seated: true, livePoints: true, order: seat.order };
    });
    const seatedIds = new Set(seated.map((s) => s.seatId));
    const quit = this.month.days
      .filter((d) => d.day === this.today.day && d.league === league && !seatedIds.has(d.seatId))
      .map((d) => ({ accountId: d.accountId, seatId: d.seatId, name: d.name, look: d.look, points: d.points, counts: true, seated: false, livePoints: false, order: d.order }));
    // A player who left today and came back has no saved row any more (takeSeat), so each player has one row.
    const rows = [...seated, ...quit];
    // A game master's tank stays in the list by its points, but takes no place: the tanks under it keep theirs.
    let place = 0;
    const today = rows
      .sort((a, b) => b.points - a.points || a.order - b.order)
      .map(({ order: _order, accountId, ...row }): LeagueTodayRow => {
        const gm = this.gameMasters.has(accountId);
        return { rank: gm ? 0 : ++place, ...row, gm };
      });
    const thisMonth = [
      ...this.monthRanking(league, this.month).map((p): LeagueMonthRow => {
        const seat = this.seatOfAccount(p.id);
        return { rank: p.rank, seatId: seat.seatId, name: seat.name, look: seat.look, score: p.score, countedDays: p.countedDays, gm: false };
      }),
      ...this.gameMasterSeatsIn(league).map((seat): LeagueMonthRow => ({ rank: null, seatId: seat.seatId, name: seat.name, look: seat.look, score: 0, countedDays: 0, gm: true })),
    ];
    return { league, month: this.today.month, day: this.today.day, today, thisMonth };
  }

  daysOf(league: number): LeagueDaysResponse {
    const days = this.month.records
      .filter((r) => r.league === league)
      .map((r): LeagueDayRecord => ({ day: r.day, league, top: r.top.map(({ name, look, points }) => ({ name, look, points })) }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    return { month: this.today.month, days };
  }

  me(accountId: AccountId): MonthlyMeResponse {
    const seat = this.seats.seats.get(accountId);
    const record = this.seats.names.get(accountId);
    let seatView: MonthlyMeResponse["seat"] = null;
    if (seat !== undefined) {
      const day = this.dayOf(seat.league);
      const place = this.monthRanking(seat.league, this.month).find((p) => p.id === accountId);
      seatView = {
        seatId: seat.seatId,
        league: seat.league,
        name: seat.name,
        look: seat.look,
        points: day.pointsOf(seat.seatId),
        countsToday: day.countsToday(seat.seatId),
        countedDays: place?.countedDays ?? 0,
        score: place?.score ?? 0,
        rank: place?.rank ?? null,
        strategy: seat.strategy,
        stats: statsView(day.statsOf(seat.seatId), seat.strategy),
      };
    }
    return {
      seat: seatView,
      name: record === undefined ? null : { name: record.name, month: record.month, canChange: record.month !== this.today.month },
      move: this.seats.moves.get(accountId) ?? null,
    };
  }

  /**
   * Every seated tank with its owner's account id and its month place, League 1 first, each league
   * in its month ranking's order. The account ids leave the server only through the admin route.
   */
  seatedPlayers(): SeatedPlayers {
    const players: SeatedPlayer[] = [];
    for (let league = 1; league <= this.seats.leagues; league++) {
      for (const place of this.monthRanking(league, this.month)) {
        const seat = this.seatOfAccount(place.id);
        players.push({ accountId: place.id, seatId: seat.seatId, league, name: seat.name, rank: place.rank, score: place.score, countedDays: place.countedDays, gm: false });
      }
      for (const seat of this.gameMasterSeatsIn(league)) {
        players.push({ accountId: seat.accountId, seatId: seat.seatId, league, name: seat.name, rank: null, score: 0, countedDays: 0, gm: true });
      }
    }
    return { month: this.today.month, day: this.today.day, players };
  }

  /**
   * PUT /api/admin/players/:seatId/gm: the seat's account becomes a game master, or stops being one.
   * Its tank keeps playing; from now on it takes no place (game-masters.ts). Days it already
   * placed in stay as they were.
   */
  /**
   * PUT /api/admin/players/:seatId/name: the host renames a seated tank (owner, 2026-11-17, after a
   * name had to be changed by hand on the server). The player's own name rule applies (letters,
   * the block list, not another account's name), but a name fixed this month is replaced, and the
   * account's day scores and day records of this month take the new name, so the old one leaves
   * every ranking. The account's later months are not touched.
   */
  adminRename(seatId: PlayerId, body: unknown): void {
    const seat = [...this.seats.seats.values()].find((s) => s.seatId === seatId);
    if (seat === undefined) throw new HttpError(404, "No tank in the monthly arena has this seat.", { code: "no_monthly_seat" });
    if (this.closing) throw serviceBusy();
    const name = this.checkedNewName(seat.accountId, isRecord(body) ? body["name"] : undefined);
    const next: SeatsState = {
      ...this.seats,
      seats: new Map(this.seats.seats).set(seat.accountId, { ...seat, name }),
      names: new Map(this.seats.names).set(seat.accountId, { month: this.today.month, name }),
    };
    const month: MonthState = {
      ...this.month,
      days: this.month.days.map((d) => (d.accountId === seat.accountId ? { ...d, name } : d)),
      records: this.month.records.map((r) => ({ ...r, top: r.top.map((p) => (p.accountId === seat.accountId ? { ...p, name } : p)) })),
    };
    this.options.store.writeMonth(month);
    this.month = month;
    this.options.store.writeSeats(next);
    this.seats = next;
    this.dayOf(seat.league).rename(seat.seatId, name);
    this.sendState(seat.league);
  }

  setGameMaster(seatId: PlayerId, gm: boolean): void {
    const seat = [...this.seats.seats.values()].find((s) => s.seatId === seatId);
    if (seat === undefined) throw new HttpError(404, "No tank in the monthly arena has this seat.", { code: "no_monthly_seat" });
    this.options.gameMasters.set(seat.accountId, gm);
    this.gameMasters = this.options.gameMasters.read();
  }

  /** What the league holds, for the test that nothing grows per turn. */
  holdings(): Record<string, number> {
    const counts: Record<string, number> = {
      seats: this.seats.seats.size,
      names: this.seats.names.size,
      moves: this.seats.moves.size,
      monthDays: this.month.days.length,
      monthRecords: this.month.records.length,
      leagues: this.days.size,
    };
    for (const [league, day] of this.days) {
      const { seated, onBoard } = day.holdings();
      counts[`league${league}Seated`] = seated;
      counts[`league${league}OnBoard`] = onBoard;
    }
    return counts;
  }

  // -------------------------------------------------------------------------

  /**
   * The seated tanks of `league` ranked by `month`'s finished counted days (score.ts). A game
   * master's tank is not in it, so it has no month rank, no move and no championship.
   */
  private monthRanking(league: number, month: MonthState): MonthPlace<AccountId>[] {
    return rankMonth(
      this.seatsIn(league).filter((seat) => !this.gameMasters.has(seat.accountId)).map((seat) => ({
        id: seat.accountId,
        days: month.days.filter((d) => d.accountId === seat.accountId && d.place !== null).map((d) => ({ points: d.points, place: d.place ?? 0 })),
        seatOrder: seat.order,
      })),
    );
  }

  /** Account to seat id of the tanks seated in `league`, for the streams' `own`. */
  private seatIdsIn(league: number): Map<AccountId, PlayerId> {
    return new Map(this.seatsIn(league).map((seat) => [seat.accountId, seat.seatId]));
  }

  private seatsIn(league: number): Seat[] {
    return [...this.seats.seats.values()].filter((seat) => seat.league === league);
  }

  private gameMasterSeatsIn(league: number): Seat[] {
    return this.seatsIn(league).filter((seat) => this.gameMasters.has(seat.accountId));
  }

  private seatById(seatId: PlayerId): Seat {
    for (const seat of this.seats.seats.values()) if (seat.seatId === seatId) return seat;
    throw new Error(`No seat has the id ${seatId}.`);
  }

  private seatOfAccount(accountId: AccountId): Seat {
    const seat = this.seats.seats.get(accountId);
    if (seat === undefined) throw new Error(`Account ${accountId} has no seat.`);
    return seat;
  }

  private dayOf(league: number): LeagueDay {
    const day = this.days.get(league);
    if (day === undefined) throw new Error(`League ${league} has no day round.`);
    return day;
  }

  private sendState(league: number, change?: LeagueStateChange): void {
    this.options.streams.sendState(league, this.live(league), change);
  }
}
