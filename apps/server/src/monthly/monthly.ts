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
// | seated | seated | server| the month close moves it up, down or not (month-close.ts)                 |
// Nothing else removes a seat. Named limit: a tank whose owner never returns stays seated.
//
// Name of an account: the first name it uses in a month is fixed until the month ends, also
// after a quit and a new seat. From the first day of a later month it may change once (a new seat
// with another name, or PUT /api/monthly/name). A name is refused when another account's seat
// uses it in any league or another account fixed it this month, so a month close that moves
// tanks between leagues cannot bring two tanks of one name together.
//
// Restart: the checkpoint (league-store.ts) holds the day and per seat today's points, whether
// the day counts and today's statistics (K2). Lost and named: positions, water, running step
// sequences, and after a crash up to one minute of points and statistics. A quit and a day close
// are saved at once. Statistics: a quit drops the seat's, a new seat starts at zero, a new day
// starts every seat at zero, and only the owner's /api/monthly/me carries them.

import {
  MONTHLY_SEATS,
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  parsePlayerName,
  parseTankLook,
  type AccountId,
  type LeagueDayRecord,
  type LeagueDaysResponse,
  type LeagueLive,
  type LeagueMonthRow,
  type LeagueRankingResponse,
  type LeagueRow,
  type LeagueTodayRow,
  type MonthlyMeResponse,
  type MonthlyOverviewResponse,
  type MonthRecord,
  type PlayerId,
  type PublicStatusResponse,
} from "@game/arena";
import { parseStrategy, statsView } from "@game/engine";
import { makeGameName } from "../game-names.ts";
import { HttpError, isRecord } from "../http.ts";
import { checkTypedName } from "../name-filter.ts";
import { toPublicSnapshot } from "../public-tick.ts";
import { newPlayerId } from "../secrets.ts";
import type { Clock, Scheduler } from "../timers.ts";
import type { CalendarDay, LeagueCalendar } from "./calendar.ts";
import { RECORD_TOP, type Champions } from "./champions.ts";
import { LeagueDay, type DayTank, type Random } from "./league-day.ts";
import { EMPTY_SEATS, type Checkpoint, type DayScore, type LeagueStore, type MonthState, type Seat, type SeatsState } from "./league-store.ts";
import { closeMonth } from "./month-close.ts";
import { rankMonth, type MonthPlace } from "./score.ts";
import type { LeagueStreams } from "./streams.ts";
import { NO_METRICS, type MetricsRecorder } from "../metrics/metrics.ts";

/** A turn of a day round, before PUBLIC_TIME_DIVISOR: 86,400 s / 0.9 s = 96,000 turns a day. */
export const MONTHLY_TICK_MS = 900;
const CHECKPOINT_MS = 60_000;

export interface MonthlyOptions {
  readonly store: LeagueStore;
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
}

const dayTankOf = (seat: Seat): DayTank => ({ id: seat.seatId, name: seat.name, look: seat.look, strategy: seat.strategy });

const serviceBusy = () => new HttpError(503, "The day round is being recorded. Please try again in a moment.");

export class MonthlyLeagues {
  private seats: SeatsState = EMPTY_SEATS;
  private month: MonthState = { month: "", days: [], records: [] };
  private today: CalendarDay = { day: "", month: "", startsAt: 0, endsAt: 0 };
  private readonly days = new Map<number, LeagueDay>();
  private closing = false;
  private stops: (() => void)[] = [];
  /** When the turn timer fired last, for how late the next turn fires. */
  private lastPulseAt = 0;

  constructor(private readonly options: MonthlyOptions) {}

  /** Reads the tables, resumes or closes the checkpoint's day, and starts the timers. Throws a PersistenceError for a damaged row. */
  start(): void {
    const { store, calendar, scheduler, tickMs } = this.options;
    this.seats = store.readSeats();
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
        const result = day.step();
        if (result !== null) this.options.streams.sendTick(league, result, this.seatIdsIn(league));
        // The planned new start that ends a loop (RESHUFFLE_TURNS): the pages draw the new squares from the state.
        if (day.reshuffleDue()) {
          day.rebuild(this.ticksLeft());
          this.sendState(league);
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
    return { ...this.today, tanks };
  }

  private ticksLeft(): number {
    return Math.max(1, Math.ceil((this.today.endsAt - this.options.now()) / this.options.tickMs));
  }

  /** New day rounds for every league. With a checkpoint each seat gets its points and "counts"; without one, 0 points and counts. */
  private openDay(checkpoint: Checkpoint | null): void {
    this.days.clear();
    for (let league = 1; league <= this.seats.leagues; league++) this.days.set(league, new LeagueDay(league, this.options.random));
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
      day.start(tanks, ticksLeft);
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
      const leaguesBefore = this.seats.leagues;
      if (next.month !== ended.month) {
        this.closeMonthOf(month);
        this.month = this.options.store.readMonth(next.month);
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
      const tanks = [...seated, ...quit].sort((a, b) => b.points - a.points || a.order - b.order);
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
    const leagueOne = (rankings[0] ?? []).filter((place) => place.rank !== null);
    const rowOf = (place: MonthPlace<AccountId>): LeagueRow => {
      const seat = this.seatOfAccount(place.id);
      const wins = month.records.filter((r) => r.top[0]?.accountId === place.id).length;
      return { rank: place.rank ?? 0, name: seat.name, look: seat.look, score: place.score, games: place.countedDays, wins };
    };
    const champion = leagueOne[0];
    const record: MonthRecord | null = champion === undefined ? null : { month: month.month, champion: rowOf(champion), top: leagueOne.slice(0, RECORD_TOP).map(rowOf) };
    this.options.champions.close(month.month, record);

    const result = closeMonth(rankings.map((ranking) => ranking.map((place) => place.id)), MONTHLY_SEATS);
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

  // -------------------------------------------------------------------------
  // Seats: take one, quit, rename.
  // -------------------------------------------------------------------------

  /** POST /api/monthly/seat. Validates the body here, at the boundary. */
  takeSeat(accountId: AccountId, body: unknown): MonthlyMeResponse {
    if (!isRecord(body)) throw new HttpError(400, "Send the tank: its look and its strategy, and its name when the player typed one.");
    const look = parseTankLook(body["look"]);
    if (look === null) throw new HttpError(400, "The tank's look is not valid.", { code: "look_invalid" });
    const parsed = parseStrategy(body["strategy"]);
    if (!parsed.ok) throw new HttpError(400, "The strategy is not valid.", { details: parsed.errors });
    if (this.closing) throw serviceBusy();
    if (this.seats.seats.has(accountId)) throw new HttpError(409, "Your account already has a tank in the monthly arena.", { code: "monthly_seat_taken" });

    const name = this.nameForSeat(accountId, body["name"]);
    let league = 0;
    for (let candidate = this.seats.leagues; candidate >= 1; candidate--) {
      if (this.seatsIn(candidate).length < MONTHLY_SEATS) {
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
    this.options.store.writeSeats(next);
    this.seats = next;
    if (!this.days.has(league)) this.days.set(league, new LeagueDay(league, this.options.random));
    // A tank that arrives during the day plays at once; the day does not count for it.
    this.dayOf(league).seat(dayTankOf(seat), 0, false, this.ticksLeft());
    this.sendState(league);
    return this.me(accountId);
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
    const seats = new Map(this.seats.seats);
    seats.delete(accountId);
    const next: SeatsState = { ...this.seats, seats };
    this.options.store.writeSeats(next);
    this.seats = next;
    day.unseat(seat.seatId);
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
      return { seatId: id, name: seat.name, look: seat.look, points, counts, seated: true, order: seat.order };
    });
    const seatedIds = new Set(seated.map((s) => s.seatId));
    const quit = this.month.days
      .filter((d) => d.day === this.today.day && d.league === league && !seatedIds.has(d.seatId))
      .map((d) => ({ seatId: d.seatId, name: d.name, look: d.look, points: d.points, counts: true, seated: false, order: d.order }));
    const today = [...seated, ...quit]
      .sort((a, b) => b.points - a.points || a.order - b.order)
      .map(({ order: _order, ...row }, i): LeagueTodayRow => ({ rank: i + 1, ...row }));
    const thisMonth = this.monthRanking(league, this.month).map((place): LeagueMonthRow => {
      const seat = this.seatOfAccount(place.id);
      return { rank: place.rank, seatId: seat.seatId, name: seat.name, look: seat.look, score: place.score, countedDays: place.countedDays };
    });
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

  /** The seated tanks of `league` ranked by `month`'s finished counted days (score.ts). */
  private monthRanking(league: number, month: MonthState): MonthPlace<AccountId>[] {
    return rankMonth(
      this.seatsIn(league).map((seat) => ({
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

  private sendState(league: number): void {
    this.options.streams.sendState(league, this.live(league));
  }
}
