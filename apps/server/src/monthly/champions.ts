// The months' champions, stored for good: DATA_DIR/league/champions.json, the same file and
// shape the monthly room used before the league (docs/specs/revamp/67-public-arenas.md), so the
// champions of past months stay. The month close (monthly.ts) adds one month at a time.
//
// | From   | To     | Actor               | Guard                                                     |
// |--------|--------|---------------------|-----------------------------------------------------------|
// | (none) | closed | server: month close | the month is not closed yet; a record when League 1 has a |
// |        |        |                     | tank with 7 or more counted days, otherwise no record     |
// Terminal state: closed. A closed month never changes, so closing it again does nothing.
//
// Written atomically (0600 file in a 0700 folder), file first, then memory, so a failed write
// changes nothing. A damaged file stops the start with its name. Without DATA_DIR it lives in
// memory (tests).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlayerName, parseTankLook, type LeagueRow, type MonthRecord, type TankLook } from "@game/arena";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "../arena-files.ts";
import { isRecord } from "../http.ts";

/** The folder of the old monthly room; the champions file stays in it. */
export const LEAGUE_FOLDER = "league";
const CHAMPIONS_FILE = "champions.json";
/** Rows in a stored month record, the champion included. */
export const RECORD_TOP = 10;
const STORED_VERSION = 1;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

interface ChampionsFile {
  readonly version: typeof STORED_VERSION;
  /** Every closed month, with or without a record. */
  readonly closedMonths: readonly string[];
  /** Newest first. */
  readonly records: readonly MonthRecord[];
}

export class Champions {
  private readonly directory: string | null;
  private file: ChampionsFile = { version: STORED_VERSION, closedMonths: [], records: [] };

  /** `dataDir` is DATA_DIR, or undefined to keep the records in memory. Throws a PersistenceError that names a damaged file. */
  constructor(dataDir: string | undefined) {
    this.directory = dataDir === undefined ? null : join(dataDir, LEAGUE_FOLDER);
    if (this.directory === null) return;
    const path = join(this.directory, CHAMPIONS_FILE);
    if (existsSync(path)) this.file = readChampionsFile(path);
  }

  isClosed(month: string): boolean {
    return this.file.closedMonths.includes(month);
  }

  /** Closes `month` with its record, or with none. A month closed before stays as it was. Throws when the save fails. */
  close(month: string, record: MonthRecord | null): void {
    if (this.isClosed(month)) return;
    const records = record === null ? this.file.records : [record, ...this.file.records].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
    const next: ChampionsFile = { version: STORED_VERSION, closedMonths: [...this.file.closedMonths, month].sort(), records };
    if (this.directory !== null) {
      createPrivateDirectory(this.directory);
      try {
        writePrivateFileAtomically(this.directory, CHAMPIONS_FILE, JSON.stringify(next));
      } catch (error) {
        throw new PersistenceError(`The champions file ${join(this.directory, CHAMPIONS_FILE)} could not be saved: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.file = next;
  }

  /** Newest first. */
  records(): readonly MonthRecord[] {
    return this.file.records;
  }
}

// ---------------------------------------------------------------------------
// Reading the file. Nothing from it is trusted until it is checked here.
// ---------------------------------------------------------------------------

class ShapeError extends Error {}

function need(condition: boolean, what: string): asserts condition {
  if (!condition) throw new ShapeError(what);
}

function wholeNumber(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

function readLook(value: unknown, where: string): TankLook {
  const look = parseTankLook(value);
  need(look !== null, `${where}.look must be a tank look`);
  return look;
}

function readName(value: unknown, where: string): string {
  const name = parsePlayerName(value);
  need(name !== null, `${where}.name must follow the name rule`);
  return name;
}

function readRow(raw: unknown, where: string): LeagueRow {
  need(isRecord(raw), `${where} must be an object`);
  const { rank, score, games, wins } = raw;
  need(wholeNumber(rank, 1) && typeof score === "number" && Number.isFinite(score) && wholeNumber(games, 0) && wholeNumber(wins, 0), `${where} must have a rank, a score, games and wins`);
  return { rank, name: readName(raw["name"], where), look: readLook(raw["look"], where), score, games, wins };
}

function readChampionsFile(path: string): ChampionsFile {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The champions file ${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    need(isRecord(raw) && raw["version"] === STORED_VERSION, `it must hold version ${STORED_VERSION}`);
    const { closedMonths, records } = raw;
    need(Array.isArray(closedMonths) && closedMonths.every((m) => typeof m === "string" && MONTH.test(m)), "closedMonths must be a list of YYYY-MM");
    need(Array.isArray(records), "records must be a list");
    const read = records.map((r, i): MonthRecord => {
      need(isRecord(r) && typeof r["month"] === "string" && MONTH.test(r["month"]), `records[${i}].month must be YYYY-MM`);
      need(Array.isArray(r["top"]) && r["top"].length >= 1 && r["top"].length <= RECORD_TOP, `records[${i}].top must hold 1 to ${RECORD_TOP} rows`);
      return {
        month: r["month"],
        champion: readRow(r["champion"], `records[${i}].champion`),
        top: (r["top"] as unknown[]).map((row, j) => readRow(row, `records[${i}].top[${j}]`)),
      };
    });
    return { version: STORED_VERSION, closedMonths: closedMonths as string[], records: read };
  } catch (error) {
    if (error instanceof ShapeError) throw new PersistenceError(`The champions file ${path} is not valid: ${error.message}.`);
    throw error;
  }
}
