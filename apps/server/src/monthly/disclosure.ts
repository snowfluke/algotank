// What the monthly league opens to everyone (owner, 2026-11-17, "for fair play"; the visibility
// table is at the top of packages/arena/src/monthly-protocol.ts):
// - each tank's numbers of a finished day (league_day_numbers), written at the day's close and at
//   a quit, so a sheet can show the last finished day's;
// - every tank's rules as they stood at a month's close (league_month_rules), from the close of
//   FIRST_PUBLISHED_RULES_MONTH on. A month's copy is written once and never changed.
// Keyed by the public seat id; no account id leaves this file. monthly.ts writes, routes.ts reads.

import type { Database, Statement } from "bun:sqlite";
import { parseTankLook, type DayNumbers, type MonthTank, type PlayerId, type TankLook } from "@game/arena";
import { parseStrategy, type StrategyInput, type TankStats } from "@game/engine";
import { invalidRow, jsonColumn } from "../db/rows.ts";

/** One tank of a month's close, as monthly.ts hands it over. */
export interface MonthRulesRow extends MonthTank {
  readonly strategy: StrategyInput;
}

/** The numbers anyone may see from a tank's running totals: not the rule counts. */
export function dayNumbersOf(stats: TankStats): DayNumbers {
  return { turns: stats.turns, shots: stats.shots, hits: stats.hits, timesHit: stats.timesHit, squaresMoved: stats.squaresMoved };
}

interface NumbersRow {
  readonly turns: number;
  readonly shots: number;
  readonly hits: number;
  readonly times_hit: number;
  readonly squares_moved: number;
}

interface MonthTankRow {
  readonly seat_id: string;
  readonly league: number;
  readonly rank: number | null;
  readonly name: string;
  readonly look_json: string;
  readonly gm: number;
}

export class Disclosure {
  private readonly upsertNumbers: Statement<unknown, [string, string, number, number, number, number, number]>;
  private readonly selectNumbers: Statement<NumbersRow & { readonly day: string }, [string, string]>;
  private readonly insertRules: Statement<unknown, [string, string, number, number | null, string, string, number, string]>;
  private readonly selectMonths: Statement<{ readonly month: string }, []>;
  private readonly selectTanks: Statement<MonthTankRow, [string]>;
  private readonly selectRules: Statement<{ readonly strategy_json: string }, [string, string]>;

  constructor(db: Database) {
    this.upsertNumbers = db.prepare(
      `INSERT INTO league_day_numbers (day, seat_id, turns, shots, hits, times_hit, squares_moved) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (seat_id, day) DO UPDATE SET turns = excluded.turns, shots = excluded.shots, hits = excluded.hits,
         times_hit = excluded.times_hit, squares_moved = excluded.squares_moved`,
    );
    this.selectNumbers = db.prepare(
      "SELECT day, turns, shots, hits, times_hit, squares_moved FROM league_day_numbers WHERE seat_id = ? AND day < ? ORDER BY day DESC LIMIT 1",
    );
    // DO NOTHING: the copy of a month is the one taken at its close; a repeated close keeps it.
    this.insertRules = db.prepare(
      `INSERT INTO league_month_rules (month, seat_id, league, rank, name, look_json, gm, strategy_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (month, seat_id) DO NOTHING`,
    );
    this.selectMonths = db.prepare("SELECT DISTINCT month FROM league_month_rules ORDER BY month DESC");
    this.selectTanks = db.prepare(
      "SELECT seat_id, league, rank, name, look_json, gm FROM league_month_rules WHERE month = ? ORDER BY league, rank IS NULL, rank, name",
    );
    this.selectRules = db.prepare("SELECT strategy_json FROM league_month_rules WHERE month = ? AND seat_id = ?");
  }

  /** Each tank's numbers of `day`. Safe to repeat: a later write of the same day replaces the numbers. */
  writeDayNumbers(day: string, tanks: readonly { readonly seatId: PlayerId; readonly numbers: DayNumbers }[]): void {
    for (const { seatId, numbers: n } of tanks) this.upsertNumbers.run(day, seatId, n.turns, n.shots, n.hits, n.timesHit, n.squaresMoved);
  }

  /** The tank's numbers of its newest day before `today`, or null when it has none. */
  lastDayNumbers(seatId: PlayerId, today: string): { readonly day: string; readonly numbers: DayNumbers } | null {
    const row = this.selectNumbers.get(seatId, today);
    if (row === null) return null;
    return { day: row.day, numbers: { turns: row.turns, shots: row.shots, hits: row.hits, timesHit: row.times_hit, squaresMoved: row.squares_moved } };
  }

  /** The month's copy, written once: a second call for the same month adds nothing. */
  writeMonthRules(month: string, tanks: readonly MonthRulesRow[]): void {
    for (const t of tanks) this.insertRules.run(month, t.seatId, t.league, t.rank, t.name, JSON.stringify(t.look), t.gm ? 1 : 0, JSON.stringify(t.strategy));
  }

  publishedMonths(): readonly string[] {
    return this.selectMonths.all().map((row) => row.month);
  }

  /** The month's tanks, League 1 first and each league by place; null when the month has no copy. */
  monthTanks(month: string): readonly MonthTank[] | null {
    const rows = this.selectTanks.all(month);
    if (rows.length === 0) return null;
    return rows.map((row) => ({ seatId: row.seat_id, league: row.league, rank: row.rank, name: row.name, look: lookOf(row.look_json, `${month}/${row.seat_id}`), gm: row.gm === 1 }));
  }

  /** One tank's rules at the month's close; null when the month or the tank has no copy. */
  monthRules(month: string, seatId: PlayerId): StrategyInput | null {
    const row = this.selectRules.get(month, seatId);
    if (row === null) return null;
    const parsed = parseStrategy(jsonColumn("league_month_rules", `${month}/${seatId}`, "strategy_json", row.strategy_json));
    if (!parsed.ok) throw invalidRow("league_month_rules", `${month}/${seatId}`, "strategy_json must pass the strategy check.");
    return parsed.strategy;
  }
}

function lookOf(json: string, key: string): TankLook {
  const parsed = parseTankLook(jsonColumn("league_month_rules", key, "look_json", json));
  if (parsed === null) throw invalidRow("league_month_rules", key, "look_json must be a tank look.");
  return parsed;
}
