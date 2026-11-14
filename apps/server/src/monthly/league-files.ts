// The league's files, in DATA_DIR/monthly/ (docs/specs/revamp/77-monthly-league.md):
// | File               | Holds                                                               | Written                  |
// |--------------------|---------------------------------------------------------------------|--------------------------|
// | seats.json         | the seats, each account's name of a month, the moves not seen yet,  | at every seat change and |
// |                    | the number of leagues, and the last month whose close was applied   | at a month close         |
// | month-YYYY-MM.json | the counted days of the month and each finished day's top 3         | at a quit on a counted   |
// |                    |                                                                     | day and at a day close   |
// | today.json         | the checkpoint: the day, and per seat today's points, whether the   | every minute, at a clean |
// |                    | day counts, and today's statistics (K2; a file without them reads   | stop and at a day close  |
// |                    | as zeros)                                                           |                          |
// Nothing is written per turn. Every file is written atomically (0600 in a 0700 folder) and read
// through the checks below; a damaged file stops the start with its name, as the arena files do.
// A strategy is stored as the player sent it and goes through parseStrategy again at load.
// Without DATA_DIR nothing is written (tests).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlayerName, parseTankLook, type AccountId, type MonthMove, type PlayerId, type TankLook } from "@game/arena";
import { EMPTY_STATS, LIMITS, parseStrategy, type RuleUse, type Strategy, type TankStats } from "@game/engine";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "../arena-files.ts";
import { isRecord } from "../http.ts";

export const MONTHLY_FOLDER = "monthly";
const VERSION = 1;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

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
  readonly tanks: readonly { readonly seatId: PlayerId; readonly points: number; readonly counts: boolean; readonly stats: TankStats }[];
}

export const EMPTY_SEATS: SeatsState = { leagues: 1, nextOrder: 1, closedMonth: null, seats: new Map(), names: new Map(), moves: new Map() };

export class LeagueFiles {
  private readonly directory: string | null;

  constructor(dataDir: string | undefined) {
    this.directory = dataDir === undefined ? null : join(dataDir, MONTHLY_FOLDER);
  }

  readSeats(): SeatsState {
    const raw = this.read("seats.json");
    return raw === null ? EMPTY_SEATS : this.checked("seats.json", () => readSeatsFile(raw));
  }

  writeSeats(state: SeatsState): void {
    this.write("seats.json", {
      version: VERSION,
      leagues: state.leagues,
      nextOrder: state.nextOrder,
      closedMonth: state.closedMonth,
      seats: [...state.seats.values()],
      names: [...state.names].map(([accountId, record]) => ({ accountId, ...record })),
      moves: [...state.moves].map(([accountId, move]) => ({ accountId, move })),
    });
  }

  readMonth(month: string): MonthState {
    const name = `month-${month}.json`;
    const raw = this.read(name);
    return raw === null ? { month, days: [], records: [] } : this.checked(name, () => readMonthFile(raw, month));
  }

  writeMonth(state: MonthState): void {
    this.write(`month-${state.month}.json`, { version: VERSION, ...state });
  }

  readCheckpoint(): Checkpoint | null {
    const raw = this.read("today.json");
    return raw === null ? null : this.checked("today.json", () => readCheckpointFile(raw));
  }

  writeCheckpoint(checkpoint: Checkpoint): void {
    this.write("today.json", { version: VERSION, ...checkpoint });
  }

  private read(name: string): unknown {
    if (this.directory === null) return null;
    const path = join(this.directory, name);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new PersistenceError(`The league file ${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private checked<T>(name: string, read: () => T): T {
    try {
      return read();
    } catch (error) {
      if (error instanceof ShapeError) throw new PersistenceError(`The league file ${join(this.directory ?? "", name)} is not valid: ${error.message}.`);
      throw error;
    }
  }

  private write(name: string, value: unknown): void {
    if (this.directory === null) return;
    createPrivateDirectory(this.directory);
    try {
      writePrivateFileAtomically(this.directory, name, JSON.stringify(value));
    } catch (error) {
      throw new PersistenceError(`The league file ${join(this.directory, name)} could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Reading. Nothing from a file is trusted until it is checked here.
// ---------------------------------------------------------------------------

class ShapeError extends Error {}

function need(condition: boolean, what: string): asserts condition {
  if (!condition) throw new ShapeError(what);
}

const whole = (value: unknown, min: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const text = (value: unknown): value is string => typeof value === "string" && value !== "";

function look(value: unknown, where: string): TankLook {
  const parsed = parseTankLook(value);
  need(parsed !== null, `${where}.look must be a tank look`);
  return parsed;
}

function playerName(value: unknown, where: string): string {
  const parsed = parsePlayerName(value);
  need(parsed !== null, `${where}.name must follow the name rule`);
  return parsed;
}

function list(value: unknown, where: string): readonly unknown[] {
  need(Array.isArray(value), `${where} must be a list`);
  return value;
}

function readSeat(raw: unknown, where: string): Seat {
  need(isRecord(raw), `${where} must be an object`);
  const { seatId, accountId, league, order } = raw;
  need(text(seatId) && text(accountId) && whole(league, 1) && whole(order, 1), `${where} must have a seat id, an account, a league and an order`);
  const strategy = parseStrategy(raw["strategy"]);
  need(strategy.ok, `${where}.strategy must pass the strategy check`);
  return { seatId, accountId, league, name: playerName(raw["name"], where), look: look(raw["look"], where), strategy: strategy.strategy, order };
}

function readSeatsFile(raw: unknown): SeatsState {
  need(isRecord(raw) && raw["version"] === VERSION, `it must hold version ${VERSION}`);
  const { leagues, nextOrder, closedMonth } = raw;
  need(whole(leagues, 1) && whole(nextOrder, 1), "leagues and nextOrder must be whole numbers of at least 1");
  need(closedMonth === null || (typeof closedMonth === "string" && MONTH.test(closedMonth)), "closedMonth must be YYYY-MM or null");
  const seats = new Map<AccountId, Seat>();
  list(raw["seats"], "seats").forEach((entry, i) => {
    const seat = readSeat(entry, `seats[${i}]`);
    need(!seats.has(seat.accountId), `seats[${i}] is a second seat of one account`);
    need(seat.league <= leagues, `seats[${i}].league must be an open league`);
    need(seat.order < nextOrder, `seats[${i}].order must be below nextOrder`);
    seats.set(seat.accountId, seat);
  });
  need(new Set([...seats.values()].map((s) => s.seatId)).size === seats.size, "seats must have unique seat ids");
  const names = new Map<AccountId, { month: string; name: string }>();
  list(raw["names"], "names").forEach((entry, i) => {
    need(isRecord(entry) && text(entry["accountId"]) && typeof entry["month"] === "string" && MONTH.test(entry["month"]), `names[${i}] must name an account and a month`);
    names.set(entry["accountId"], { month: entry["month"], name: playerName(entry["name"], `names[${i}]`) });
  });
  const moves = new Map<AccountId, MonthMove>();
  list(raw["moves"], "moves").forEach((entry, i) => {
    need(isRecord(entry) && text(entry["accountId"]) && isRecord(entry["move"]), `moves[${i}] must name an account and a move`);
    const move = entry["move"];
    const kind = move["kind"];
    need(
      typeof move["month"] === "string" && MONTH.test(move["month"]) && whole(move["from"], 1) && whole(move["to"], 1) && (kind === "up" || kind === "down" || kind === "stayed"),
      `moves[${i}].move must have a month, from, to and a kind`,
    );
    moves.set(entry["accountId"], { month: move["month"], from: move["from"], to: move["to"], kind });
  });
  return { leagues, nextOrder, closedMonth, seats, names, moves };
}

function readMonthFile(raw: unknown, month: string): MonthState {
  need(isRecord(raw) && raw["version"] === VERSION && raw["month"] === month, `it must hold version ${VERSION} of the month ${month}`);
  const days = list(raw["days"], "days").map((entry, i): DayScore => {
    const where = `days[${i}]`;
    need(isRecord(entry), `${where} must be an object`);
    const { accountId, seatId, order, day, league, points, place } = entry;
    need(text(accountId) && text(seatId) && whole(order, 1) && typeof day === "string" && DAY.test(day) && day.startsWith(month), `${where} must name an account, a seat and a day of the month`);
    need(whole(league, 1) && integer(points) && (place === null || whole(place, 1)), `${where} must have a league, points and a place`);
    return { accountId, seatId, name: playerName(entry["name"], where), look: look(entry["look"], where), order, day, league, points, place };
  });
  const records = list(raw["records"], "records").map((entry, i): DayRecord => {
    const where = `records[${i}]`;
    need(isRecord(entry) && typeof entry["day"] === "string" && DAY.test(entry["day"]) && whole(entry["league"], 1), `${where} must have a day and a league`);
    const top = list(entry["top"], `${where}.top`).map((place, j) => {
      need(isRecord(place) && text(place["accountId"]) && integer(place["points"]), `${where}.top[${j}] must have an account and points`);
      return { accountId: place["accountId"], name: playerName(place["name"], `${where}.top[${j}]`), look: look(place["look"], `${where}.top[${j}]`), points: place["points"] };
    });
    need(top.length >= 1 && top.length <= 3, `${where}.top must hold 1 to 3 places`);
    return { day: entry["day"], league: entry["league"], top };
  });
  return { month, days, records };
}

function readCheckpointFile(raw: unknown): Checkpoint {
  need(isRecord(raw) && raw["version"] === VERSION, `it must hold version ${VERSION}`);
  const { day, month, startsAt, endsAt } = raw;
  need(typeof day === "string" && DAY.test(day) && typeof month === "string" && MONTH.test(month) && integer(startsAt) && integer(endsAt) && endsAt > startsAt, "it must hold a day, its month, its start and its end");
  const tanks = list(raw["tanks"], "tanks").map((entry, i) => {
    need(isRecord(entry) && text(entry["seatId"]) && integer(entry["points"]) && typeof entry["counts"] === "boolean", `tanks[${i}] must have a seat id, points and counts`);
    // A checkpoint written before the statistics existed has none: the seat resumes with zeros.
    const stats = entry["stats"] === undefined ? EMPTY_STATS : readStats(entry["stats"], `tanks[${i}].stats`);
    return { seatId: entry["seatId"], points: entry["points"], counts: entry["counts"], stats };
  });
  return { day, month, startsAt, endsAt, tanks };
}

/** One entry per rule and per "If no rule fits" of one strategy at most, so a damaged or hostile file cannot grow memory. */
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
