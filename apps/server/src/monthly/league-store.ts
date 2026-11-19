// The league's tables (db/schema.ts, docs/specs/revamp/77-monthly-league.md):
// | Table                               | Holds                                                    | Written                  |
// |-------------------------------------|----------------------------------------------------------|--------------------------|
// | league_state, league_seat,          | the number of leagues, the next seat order, the last     | at every seat change and |
// | league_name, league_move            | month whose close was applied, the seats, each account's | at a month close         |
// |                                     | name of a month, the moves not seen yet                  |                          |
// | league_day_score, league_day_record | the counted days of each month and each finished day's  | at a quit on a counted   |
// |                                     | top 3                                                    | day and at a day close   |
// | league_checkpoint                   | one row: the day, and per seat today's points, whether   | every minute, at a clean |
// |                                     | the day counts, and today's statistics (K2), as JSON     | stop and at a day close  |
// | league_activity                     | this month's public activity (86-monthly-activity.md)  | with its seat change     |
// MonthlyLeagues (monthly.ts) holds all of it in memory, because the turn loop reads the seats,
// and calls this store at the moments above; nothing is written per turn. Each write is one
// transaction, and every row read goes through the checks below; a damaged row stops the start
// with its table and key. A strategy goes through parseStrategy again at load.

import { SQLiteError, type Database, type Statement } from "bun:sqlite";
import { LEAGUE_ACTIVITY_LIMIT, parseLeagueActivityEvent, parsePlayerName, parseTankLook, type AccountId, type LeagueActivityEvent, type MonthMove, type PlayerId, type TankLook } from "@game/arena";
import { LIMITS, parseStrategy, type RuleUse, type Strategy, type TankStats } from "@game/engine";
import { invalidRow, jsonColumn } from "../db/rows.ts";
import { HttpError, isRecord } from "../http.ts";

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ACTIVITY_MERGE_MS = 10 * 60 * 1000;

/** One account's tank in a league. Its name, look and strategy are fixed while it is seated. */
export interface Seat {
  readonly seatId: PlayerId;
  readonly accountId: AccountId;
  readonly league: number;
  readonly name: string;
  readonly look: TankLook;
  readonly strategy: Strategy;
  /** Arrival order over all seats, for "the earlier seat" in a tie. */
  readonly order: number;
}

export interface SeatsState {
  /** Open leagues; at least 1. An empty league stays open until the month close. */
  readonly leagues: number;
  readonly nextOrder: number;
  /** The month whose close was applied last, or null; a close runs once per month. */
  readonly closedMonth: string | null;
  readonly seats: ReadonlyMap<AccountId, Seat>;
  /** Each account's latest name and the month it was set in. */
  readonly names: ReadonlyMap<AccountId, { readonly month: string; readonly name: string }>;
  /** The month close's move of each account, until its owner has seen it. */
  readonly moves: ReadonlyMap<AccountId, MonthMove>;
}

/** One counted day of one tank. `place` is set when the day closes. */
export interface DayScore {
  readonly accountId: AccountId;
  readonly seatId: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  readonly order: number;
  readonly day: string;
  readonly league: number;
  readonly points: number;
  readonly place: number | null;
}

/** A finished day of one league: up to 3 places, the winner first. */
export interface DayRecord {
  readonly day: string;
  readonly league: number;
  readonly top: readonly { readonly accountId: AccountId; readonly name: string; readonly look: TankLook; readonly points: number }[];
}

export interface MonthState {
  readonly month: string;
  readonly days: readonly DayScore[];
  readonly records: readonly DayRecord[];
}

/** The checkpoint of a day round. */
export interface Checkpoint {
  readonly day: string;
  readonly month: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly normalStreaks?: readonly { readonly league: number; readonly normalStreak: number }[];
  readonly tanks: readonly { readonly seatId: PlayerId; readonly points: number; readonly counts: boolean; readonly stats: TankStats }[];
}

export const EMPTY_SEATS: SeatsState = { leagues: 1, nextOrder: 1, closedMonth: null, seats: new Map(), names: new Map(), moves: new Map() };

interface StateRow {
  readonly leagues: number;
  readonly next_order: number;
  readonly closed_month: string | null;
}

interface SeatRow {
  readonly account_id: string;
  readonly seat_id: string;
  readonly league: number;
  readonly name: string;
  readonly look_json: string;
  readonly strategy_json: string;
  readonly seat_order: number;
}

interface NameRow {
  readonly account_id: string;
  readonly month: string;
  readonly name: string;
}

interface MoveRow {
  readonly account_id: string;
  readonly month: string;
  readonly from_league: number;
  readonly to_league: number;
  readonly kind: string;
}

interface DayScoreRow {
  readonly account_id: string;
  readonly day: string;
  readonly seat_id: string;
  readonly name: string;
  readonly look_json: string;
  readonly seat_order: number;
  readonly league: number;
  readonly points: number;
  readonly place: number | null;
}

interface DayRecordRow {
  readonly day: string;
  readonly league: number;
  readonly place: number;
  readonly account_id: string;
  readonly name: string;
  readonly look_json: string;
  readonly points: number;
}

interface ActivityRow {
  readonly id: number;
  readonly league: number;
  readonly seat_id: string;
  readonly name: string;
  readonly look_json: string;
  readonly kind: string;
  readonly at: number;
}

interface ActivityWrite {
  readonly month: string;
  readonly league: number;
  readonly event: LeagueActivityEvent;
}

function readActivity(row: ActivityRow): LeagueActivityEvent {
  const key = String(row.id);
  if (!Number.isSafeInteger(row.league) || row.league < 1) throw invalidRow("league_activity", key, "the league must be a positive integer.");
  const look = jsonColumn("league_activity", key, "look_json", row.look_json);
  const event = parseLeagueActivityEvent({ seatId: row.seat_id, name: row.name, look, kind: row.kind, at: row.at });
  if (event === null) throw invalidRow("league_activity", key, "the activity event is invalid.");
  return event;
}

const SEAT_COLUMNS = "account_id, seat_id, league, name, look_json, strategy_json, seat_order";
const DAY_SCORE_COLUMNS = "account_id, day, seat_id, name, look_json, seat_order, league, points, place";
const DAY_RECORD_COLUMNS = "day, league, place, account_id, name, look_json, points";

export class LeagueStore {
  private readonly selectState: Statement<StateRow, []>;
  private readonly upsertState: Statement<unknown, [number, number, string | null]>;
  private readonly selectSeats: Statement<SeatRow, []>;
  private readonly deleteSeats: Statement<unknown, []>;
  private readonly insertSeat: Statement<unknown, [string, string, number, string, string, string, number]>;
  private readonly selectNames: Statement<NameRow, []>;
  private readonly deleteNames: Statement<unknown, []>;
  private readonly insertName: Statement<unknown, [string, string, string]>;
  private readonly selectMoves: Statement<MoveRow, []>;
  private readonly deleteMoves: Statement<unknown, []>;
  private readonly insertMove: Statement<unknown, [string, string, number, number, string]>;
  private readonly selectDayScores: Statement<DayScoreRow, [string, string]>;
  private readonly upsertDayScore: Statement<unknown, [string, string, string, string, string, number, number, number, number | null]>;
  private readonly removeDayScore: Statement<unknown, [string, string]>;
  private readonly selectDayRecords: Statement<DayRecordRow, [string, string]>;
  private readonly upsertDayRecord: Statement<unknown, [string, number, number, string, string, string, number]>;
  private readonly selectCheckpoint: Statement<{ readonly written_at: number; readonly checkpoint_json: string }, []>;
  private readonly upsertCheckpoint: Statement<unknown, [number, string]>;
  private readonly selectMonthActivity: Statement<ActivityRow, [string]>;
  private readonly selectLeagueActivity: Statement<ActivityRow, [string, number]>;
  private readonly deleteOlderActivity: Statement<unknown, [string]>;
  private readonly insertActivity: Statement<unknown, [string, number, string, string, string, string, number]>;
  private readonly refreshActivity: Statement<unknown, [string, string, number, number]>;
  private readonly trimActivity: Statement<unknown, [string, number, number]>;

  /** `now` dates the checkpoint row, for the health gauges. */
  constructor(
    private readonly db: Database,
    private readonly now: () => number,
  ) {
    this.selectState = db.prepare("SELECT leagues, next_order, closed_month FROM league_state WHERE id = 1");
    this.upsertState = db.prepare(
      "INSERT INTO league_state (id, leagues, next_order, closed_month) VALUES (1, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET leagues = excluded.leagues, next_order = excluded.next_order, closed_month = excluded.closed_month",
    );
    this.selectSeats = db.prepare(`SELECT ${SEAT_COLUMNS} FROM league_seat ORDER BY seat_order`);
    this.deleteSeats = db.prepare("DELETE FROM league_seat");
    this.insertSeat = db.prepare(`INSERT INTO league_seat (${SEAT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    this.selectNames = db.prepare("SELECT account_id, month, name FROM league_name");
    this.deleteNames = db.prepare("DELETE FROM league_name");
    this.insertName = db.prepare("INSERT INTO league_name (account_id, month, name) VALUES (?, ?, ?)");
    this.selectMoves = db.prepare("SELECT account_id, month, from_league, to_league, kind FROM league_move");
    this.deleteMoves = db.prepare("DELETE FROM league_move");
    this.insertMove = db.prepare("INSERT INTO league_move (account_id, month, from_league, to_league, kind) VALUES (?, ?, ?, ?, ?)");
    // A month's days run from YYYY-MM-01 to YYYY-MM-31 in text order.
    this.selectDayScores = db.prepare(`SELECT ${DAY_SCORE_COLUMNS} FROM league_day_score WHERE day >= ? AND day <= ? ORDER BY rowid`);
    this.upsertDayScore = db.prepare(
      `INSERT INTO league_day_score (${DAY_SCORE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, day) DO UPDATE SET seat_id = excluded.seat_id, name = excluded.name, look_json = excluded.look_json,
         seat_order = excluded.seat_order, league = excluded.league, points = excluded.points, place = excluded.place`,
    );
    this.removeDayScore = db.prepare("DELETE FROM league_day_score WHERE account_id = ? AND day = ?");
    this.selectDayRecords = db.prepare(`SELECT ${DAY_RECORD_COLUMNS} FROM league_day_record WHERE day >= ? AND day <= ? ORDER BY day, league, place`);
    this.upsertDayRecord = db.prepare(
      `INSERT INTO league_day_record (${DAY_RECORD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (day, league, place) DO UPDATE SET account_id = excluded.account_id, name = excluded.name, look_json = excluded.look_json, points = excluded.points`,
    );
    this.selectCheckpoint = db.prepare("SELECT written_at, checkpoint_json FROM league_checkpoint WHERE id = 1");
    this.upsertCheckpoint = db.prepare(
      "INSERT INTO league_checkpoint (id, written_at, checkpoint_json) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET written_at = excluded.written_at, checkpoint_json = excluded.checkpoint_json",
    );
    this.selectMonthActivity = db.prepare("SELECT * FROM league_activity WHERE month = ? ORDER BY league, id DESC");
    this.selectLeagueActivity = db.prepare("SELECT * FROM league_activity WHERE month = ? AND league = ? ORDER BY id DESC");
    this.deleteOlderActivity = db.prepare("DELETE FROM league_activity WHERE month < ?");
    this.insertActivity = db.prepare("INSERT INTO league_activity (month, league, seat_id, name, look_json, kind, at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    this.refreshActivity = db.prepare("UPDATE league_activity SET name = ?, look_json = ?, at = ? WHERE id = ?");
    this.trimActivity = db.prepare("DELETE FROM league_activity WHERE id IN (SELECT id FROM league_activity WHERE month = ? AND league = ? ORDER BY id DESC LIMIT -1 OFFSET ?)");
  }

  readSeats(): SeatsState {
    const state = this.selectState.get();
    const seatRows = this.selectSeats.all();
    if (state === null) {
      if (seatRows.length > 0) throw invalidRow("league_state", "1", "the row is missing while league_seat holds seats.");
      return EMPTY_SEATS;
    }
    const { leagues, next_order: nextOrder, closed_month: closedMonth } = state;
    if (closedMonth !== null && !MONTH.test(closedMonth)) throw invalidRow("league_state", "1", "closed_month must be YYYY-MM or null.");
    const seats = new Map<AccountId, Seat>();
    for (const row of seatRows) {
      const seat = checked("league_seat", row.account_id, () => readSeat(row));
      if (seat.league > leagues) throw invalidRow("league_seat", row.account_id, "the league must be an open league.");
      if (seat.order >= nextOrder) throw invalidRow("league_seat", row.account_id, "seat_order must be below next_order.");
      seats.set(seat.accountId, seat);
    }
    const names = new Map<AccountId, { month: string; name: string }>();
    for (const row of this.selectNames.all()) {
      names.set(
        row.account_id,
        checked("league_name", row.account_id, () => {
          need(MONTH.test(row.month), "the month must be YYYY-MM");
          return { month: row.month, name: playerName(row.name) };
        }),
      );
    }
    const moves = new Map<AccountId, MonthMove>();
    for (const row of this.selectMoves.all()) {
      const kind = row.kind;
      if (!MONTH.test(row.month) || (kind !== "up" && kind !== "down" && kind !== "stayed")) throw invalidRow("league_move", row.account_id, "the move must have a month and a kind.");
      moves.set(row.account_id, { month: row.month, from: row.from_league, to: row.to_league, kind });
    }
    return { leagues, nextOrder, closedMonth, seats, names, moves };
  }

  /**
   * Replaces the seats, names and moves in one transaction. The UNIQUE name is the second guard
   * of the name rule in monthly.ts and answers the same 409 name_taken.
   * ponytail: rewrites every seat at each change, O(seats); a write of the changed seat alone would scale further.
   */
  writeSeats(state: SeatsState): void;
  writeSeats(state: SeatsState, activity: ActivityWrite): readonly LeagueActivityEvent[];
  writeSeats(state: SeatsState, activity?: ActivityWrite): readonly LeagueActivityEvent[] | undefined {
    try {
      return this.db.transaction(() => {
        this.upsertState.run(state.leagues, state.nextOrder, state.closedMonth);
        this.deleteSeats.run();
        for (const seat of state.seats.values()) {
          this.insertSeat.run(seat.accountId, seat.seatId, seat.league, seat.name, JSON.stringify(seat.look), JSON.stringify(seat.strategy), seat.order);
        }
        this.deleteNames.run();
        for (const [accountId, record] of state.names) this.insertName.run(accountId, record.month, record.name);
        this.deleteMoves.run();
        for (const [accountId, move] of state.moves) this.insertMove.run(accountId, move.month, move.from, move.to, move.kind);
        // A recorded action and its seat change commit together (86-monthly-activity.md).
        if (activity !== undefined) return this.writeActivity(activity);
      }).immediate();
    } catch (error) {
      if (error instanceof SQLiteError && error.code === "SQLITE_CONSTRAINT_UNIQUE" && error.message.includes("league_seat.name")) {
        throw new HttpError(409, "Another tank in the monthly arena has that name. Please choose another one.", { code: "name_taken" });
      }
      throw error;
    }
  }

  /** Drop expired logs and load the public snapshots when opening the month, never during a turn. */
  openActivityMonth(month: string): Map<number, readonly LeagueActivityEvent[]> {
    return this.db.transaction(() => {
      this.deleteOlderActivity.run(month);
      const activity = new Map<number, LeagueActivityEvent[]>();
      for (const row of this.selectMonthActivity.all(month)) {
        const events = activity.get(row.league) ?? [];
        events.push(readActivity(row));
        activity.set(row.league, events);
      }
      return activity;
    }).immediate();
  }

  /** Runs inside writeSeats' transaction. The id breaks ties between changes at the same millisecond. */
  private writeActivity({ month, league, event }: ActivityWrite): readonly LeagueActivityEvent[] {
    const previous = this.selectLeagueActivity.all(month, league);
    const events = previous.map(readActivity);
    const newest = previous[0];
    const elapsed = newest === undefined ? Infinity : event.at - newest.at;
    if (newest?.seat_id === event.seatId && newest.kind === event.kind && elapsed >= 0 && elapsed <= ACTIVITY_MERGE_MS) {
      this.refreshActivity.run(event.name, JSON.stringify(event.look), event.at, newest.id);
      return [event, ...events.slice(1)];
    }
    this.insertActivity.run(month, league, event.seatId, event.name, JSON.stringify(event.look), event.kind, event.at);
    if (previous.length >= LEAGUE_ACTIVITY_LIMIT) this.trimActivity.run(month, league, LEAGUE_ACTIVITY_LIMIT);
    return [event, ...events.slice(0, LEAGUE_ACTIVITY_LIMIT - 1)];
  }

  readMonth(month: string): MonthState {
    const [from, to] = [`${month}-01`, `${month}-31`];
    const days = this.selectDayScores.all(from, to).map((row) => checked("league_day_score", `${row.account_id}/${row.day}`, () => readDayScore(row)));
    const records: { day: string; league: number; top: DayRecord["top"][number][] }[] = [];
    for (const row of this.selectDayRecords.all(from, to)) {
      const key = `${row.day}/${row.league}/${row.place}`;
      const place = checked("league_day_record", key, () => ({ accountId: row.account_id, name: playerName(row.name), look: look(row.look_json), points: row.points }));
      const record = records.find((r) => r.day === row.day && r.league === row.league);
      const top = record?.top ?? [];
      if (row.place !== top.length + 1) throw invalidRow("league_day_record", key, "the places of a day must run from 1 without a gap.");
      top.push(place);
      if (record === undefined) records.push({ day: row.day, league: row.league, top });
    }
    return { month, days, records };
  }

  /** Writes the month's days and records in one transaction. Within a month they only grow, so an upsert of each is the whole write. */
  writeMonth(state: MonthState): void {
    this.db.transaction(() => {
      for (const d of state.days) this.upsertDayScore.run(d.accountId, d.day, d.seatId, d.name, JSON.stringify(d.look), d.order, d.league, d.points, d.place);
      for (const r of state.records) r.top.forEach((p, i) => this.upsertDayRecord.run(r.day, r.league, i + 1, p.accountId, p.name, JSON.stringify(p.look), p.points));
    }).immediate();
  }

  /** Takes back a day's saved score: a tank that left today and came back goes on with it (monthly.ts takeSeat). */
  deleteDayScore(accountId: AccountId, day: string): void {
    this.removeDayScore.run(accountId, day);
  }

  readCheckpoint(): Checkpoint | null {
    const row = this.selectCheckpoint.get();
    if (row === null) return null;
    const raw = jsonColumn("league_checkpoint", "1", "checkpoint_json", row.checkpoint_json);
    return checked("league_checkpoint", "1", () => readCheckpointJson(raw));
  }

  writeCheckpoint(checkpoint: Checkpoint): void {
    this.upsertCheckpoint.run(this.now(), JSON.stringify(checkpoint));
  }

  /** When the checkpoint was written last, in milliseconds since 1970, or null before the first. For the health gauges. */
  checkpointWrittenAt(): number | null {
    return this.selectCheckpoint.get()?.written_at ?? null;
  }
}

// ---------------------------------------------------------------------------
// Reading. Nothing from a row is trusted until it is checked here.
// ---------------------------------------------------------------------------

class ShapeError extends Error {}

function need(condition: boolean, what: string): asserts condition {
  if (!condition) throw new ShapeError(what);
}

/** Runs a row's check and names the table and the key when it fails. */
function checked<T>(table: string, key: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ShapeError) throw invalidRow(table, key, `${error.message}.`);
    throw error;
  }
}

const whole = (value: unknown, min: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const text = (value: unknown): value is string => typeof value === "string" && value !== "";

function parseJson(value: string, what: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new ShapeError(`${what} is not JSON`);
  }
}

function look(json: string): TankLook {
  const parsed = parseTankLook(parseJson(json, "look_json"));
  need(parsed !== null, "look_json must be a tank look");
  return parsed;
}

function playerName(value: unknown): string {
  const parsed = parsePlayerName(value);
  need(parsed !== null, "the name must follow the name rule");
  return parsed;
}

function readSeat(row: SeatRow): Seat {
  need(text(row.seat_id) && text(row.account_id), "the seat must have a seat id and an account");
  const strategy = parseStrategy(parseJson(row.strategy_json, "strategy_json"));
  need(strategy.ok, "strategy_json must pass the strategy check");
  return { seatId: row.seat_id, accountId: row.account_id, league: row.league, name: playerName(row.name), look: look(row.look_json), strategy: strategy.strategy, order: row.seat_order };
}

function readDayScore(row: DayScoreRow): DayScore {
  need(DAY.test(row.day), "the day must be YYYY-MM-DD");
  need(text(row.seat_id), "the row must name a seat");
  return {
    accountId: row.account_id,
    seatId: row.seat_id,
    name: playerName(row.name),
    look: look(row.look_json),
    order: row.seat_order,
    day: row.day,
    league: row.league,
    points: row.points,
    place: row.place,
  };
}

function list(value: unknown, where: string): readonly unknown[] {
  need(Array.isArray(value), `${where} must be a list`);
  return value;
}

function readCheckpointJson(raw: unknown): Checkpoint {
  need(isRecord(raw), "the checkpoint must be an object");
  const { day, month, startsAt, endsAt } = raw;
  need(typeof day === "string" && DAY.test(day) && typeof month === "string" && MONTH.test(month) && integer(startsAt) && integer(endsAt) && endsAt > startsAt, "it must hold a day, its month, its start and its end");
  const tanks = list(raw["tanks"], "tanks").map((entry, i) => {
    need(isRecord(entry) && text(entry["seatId"]) && integer(entry["points"]) && typeof entry["counts"] === "boolean", `tanks[${i}] must have a seat id, points and counts`);
    return { seatId: entry["seatId"], points: entry["points"], counts: entry["counts"], stats: readStats(entry["stats"], `tanks[${i}].stats`) };
  });
  const normalStreaks = raw["normalStreaks"] === undefined ? undefined : list(raw["normalStreaks"], "normalStreaks").map((entry, i) => {
    need(isRecord(entry) && whole(entry["league"], 1) && whole(entry["normalStreak"], 0), `normalStreaks[${i}] must have a league and a normal streak`);
    return { league: entry["league"], normalStreak: entry["normalStreak"] };
  });
  return { day, month, startsAt, endsAt, tanks, ...(normalStreaks === undefined ? {} : { normalStreaks }) };
}

/** One entry per rule and per "If no rule fits" of one strategy at most, so a damaged row cannot grow memory. */
const MAX_RULE_USES = LIMITS.maxModes * (LIMITS.maxRulesPerMode + 1);

function readStats(raw: unknown, where: string): TankStats {
  need(isRecord(raw), `${where} must be an object`);
  const { turns, shots, hits, timesHit, squaresMoved } = raw;
  need(whole(turns, 0) && whole(shots, 0) && whole(hits, 0) && whole(timesHit, 0) && whole(squaresMoved, 0) && hits <= shots, `${where} must hold whole numbers of at least 0`);
  const uses = list(raw["uses"], `${where}.uses`).map((entry, i): RuleUse => {
    need(isRecord(entry) && text(entry["modeId"]) && (entry["ruleId"] === null || text(entry["ruleId"])) && whole(entry["turns"], 0), `${where}.uses[${i}] must have a mode, a rule or null, and turns`);
    return { modeId: entry["modeId"], ruleId: entry["ruleId"], turns: entry["turns"] };
  });
  need(uses.length <= MAX_RULE_USES, `${where}.uses must hold at most ${MAX_RULE_USES} entries`);
  return { turns, shots, hits, timesHit, squaresMoved, uses };
}
