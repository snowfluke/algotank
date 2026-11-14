// The usage numbers of each day in the table `metrics_counter` (db/schema.ts): one row per day in
// LEAGUE_TIME_ZONE and counter key of DAY_COUNTERS (packages/arena/src/metrics-protocol.ts), each
// a whole number of at least 0; a missing row is 0. Nothing else is stored: no address, no hash,
// no salt, no account, no arena code. Metrics (metrics.ts) holds today's numbers in memory and
// writes them once a minute; rows older than METRICS_KEEP_DAYS are removed.

import type { Database, Statement } from "bun:sqlite";
import { isCounterKey, METRICS_KEEP_DAYS, type CounterKey, type MetricsDay } from "@game/arena";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DayCounts = Map<CounterKey, number>;

interface CounterRow {
  readonly day: string;
  readonly name: string;
  readonly value: number;
}

/** `day` moved by `days` calendar days. Dates only, so no time zone enters. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function toMetricsDay(day: string, counts: DayCounts): MetricsDay {
  return { day, counts: Object.fromEntries(counts) };
}

export class DayCounterStore {
  private readonly upsert: Statement<unknown, [string, string, number]>;
  private readonly inRange: Statement<CounterRow, [string, string]>;
  private readonly deleteOlder: Statement<unknown, [string]>;

  constructor(private readonly db: Database) {
    this.upsert = db.prepare("INSERT INTO metrics_counter (day, name, value) VALUES (?, ?, ?) ON CONFLICT (day, name) DO UPDATE SET value = excluded.value");
    this.inRange = db.prepare("SELECT day, name, value FROM metrics_counter WHERE day >= ? AND day <= ? ORDER BY day");
    this.deleteOlder = db.prepare("DELETE FROM metrics_counter WHERE day < ?");
  }

  /** Writes every counter of the day in one transaction. Throws the SQLite error; the caller logs it and tries again later. */
  write(day: string, counts: DayCounts): void {
    this.db.transaction(() => {
      for (const [name, value] of counts) this.upsert.run(day, name, value);
    }).immediate();
  }

  /**
   * The counts of every day from `from` to `to` (YYYY-MM-DD, inclusive) that has a row, in one
   * query. A counter that a later version retired is dropped, because a row lives METRICS_KEEP_DAYS days.
   */
  range(from: string, to: string): Map<string, DayCounts> {
    const days = new Map<string, DayCounts>();
    for (const row of this.inRange.all(from, to)) {
      if (!isCounterKey(row.name)) continue;
      let counts = days.get(row.day);
      if (counts === undefined) {
        counts = new Map();
        days.set(row.day, counts);
      }
      counts.set(row.name, row.value);
    }
    return days;
  }

  /** The counts of one day, empty when it has no row. */
  read(day: string): DayCounts {
    return this.range(day, day).get(day) ?? new Map();
  }

  /** Removes the rows older than METRICS_KEEP_DAYS before `today`. */
  prune(today: string): void {
    this.deleteOlder.run(shiftDay(today, -METRICS_KEEP_DAYS));
  }
}
