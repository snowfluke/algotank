// The day files of the usage numbers: DATA_DIR/metrics/<YYYY-MM-DD>.json, one per day in
// LEAGUE_TIME_ZONE, mode 0600 in a 0700 folder, written atomically (arena-files.ts).
//
// Shape of a file (version 1):
//   { "version": 1, "day": "2026-11-14", "counts": { "visitors": 12, "pageOpened.home": 30, ... } }
// `counts` holds only keys of DAY_COUNTERS (packages/arena/src/metrics-protocol.ts), each a whole
// number of at least 0; a missing key is 0. Nothing else is stored: no address, no hash, no salt,
// no account, no arena code. A key that a later version retired is dropped when the file is read,
// because a file lives METRICS_KEEP_DAYS days. A file older than that is removed.

import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isCounterKey, METRICS_KEEP_DAYS, type CounterKey, type MetricsDay } from "@game/arena";
import { createPrivateDirectory, writePrivateFileAtomically } from "../arena-files.ts";

const METRICS_FOLDER = "metrics";
const VERSION = 1;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DayCounts = Map<CounterKey, number>;

/** `day` moved by `days` calendar days. Dates only, so no time zone enters. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The file's counts, or null when the file is not a day file of `day`. */
function parseDayFile(raw: unknown, day: string): DayCounts | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { version, day: fileDay, counts } = raw as Record<string, unknown>;
  if (version !== VERSION || fileDay !== day || typeof counts !== "object" || counts === null || Array.isArray(counts)) return null;
  const result: DayCounts = new Map();
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    if (isCounterKey(key)) result.set(key, value);
  }
  return result;
}

export function toMetricsDay(day: string, counts: DayCounts): MetricsDay {
  return { day, counts: Object.fromEntries(counts) };
}

export class DayFiles {
  private readonly directory: string;

  /** Throws a PersistenceError when the folder cannot be made. */
  constructor(dataDir: string) {
    this.directory = join(dataDir, METRICS_FOLDER);
    createPrivateDirectory(this.directory);
  }

  /** Throws the file system error; the caller logs it and tries again later. */
  write(day: string, counts: DayCounts): void {
    writePrivateFileAtomically(this.directory, `${day}.json`, JSON.stringify({ version: VERSION, ...toMetricsDay(day, counts) }));
  }

  /**
   * The counts of a day, empty when it has no file. A damaged file is renamed aside with a log
   * line, so the next write does not overwrite what may still be read by hand.
   */
  read(day: string): DayCounts {
    const path = join(this.directory, `${day}.json`);
    if (!existsSync(path)) return new Map();
    let parsed: DayCounts | null = null;
    try {
      parsed = parseDayFile(JSON.parse(readFileSync(path, "utf8")), day);
    } catch (error) {
      console.error(`The usage file ${path} cannot be read:`, error);
    }
    if (parsed !== null) return parsed;
    const aside = join(this.directory, `${day}.damaged-${Date.now()}`);
    renameSync(path, aside);
    console.error(`The usage file ${path} is not valid; it was moved to ${aside} and the day counts from 0.`);
    return new Map();
  }

  /** Removes the day files older than METRICS_KEEP_DAYS before `today`. */
  prune(today: string): void {
    const oldest = shiftDay(today, -METRICS_KEEP_DAYS);
    for (const name of readdirSync(this.directory)) {
      const day = DAY_FILE.exec(name)?.[1];
      if (day !== undefined && day < oldest) rmSync(join(this.directory, name), { force: true });
    }
  }
}
