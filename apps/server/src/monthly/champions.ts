// The months' champions, stored for good in the tables `champion_month` (every closed month) and
// `champion` (a month's top places, place 1 the champion), db/schema.ts. Read on each call. The
// month close (monthly.ts) adds one month at a time.
//
// | From   | To     | Actor               | Guard                                                     |
// |--------|--------|---------------------|-----------------------------------------------------------|
// | (none) | closed | server: month close | the month is not closed yet; a record when League 1 has a |
// |        |        |                     | tank with 7 or more counted days, otherwise no record     |
// Terminal state: closed. A closed month never changes, so closing it again does nothing.
//
// A close writes the month and its places in one transaction, so a failed write changes nothing.

import type { Database, Statement } from "bun:sqlite";
import { parsePlayerName, parseTankLook, type LeagueRow, type MonthRecord } from "@game/arena";
import { invalidRow, jsonColumn } from "../db/rows.ts";

/** Rows in a stored month record, the champion included. */
export const RECORD_TOP = 10;

interface PlaceRow {
  readonly month: string;
  readonly place: number;
  readonly rank: number;
  readonly name: string;
  readonly look_json: string;
  readonly score: number;
  readonly games: number;
  readonly wins: number;
}

const PLACE_COLUMNS = "month, place, rank, name, look_json, score, games, wins";

export class Champions {
  private readonly closedOne: Statement<{ readonly month: string }, [string]>;
  private readonly insertMonth: Statement<unknown, [string]>;
  private readonly insertPlace: Statement<unknown, [string, number, number, string, string, number, number, number]>;
  private readonly selectAll: Statement<PlaceRow, []>;
  private readonly selectLatest: Statement<PlaceRow, []>;

  constructor(private readonly db: Database) {
    this.closedOne = db.prepare("SELECT month FROM champion_month WHERE month = ?");
    this.insertMonth = db.prepare("INSERT INTO champion_month (month) VALUES (?)");
    this.insertPlace = db.prepare(`INSERT INTO champion (${PLACE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    this.selectAll = db.prepare(`SELECT ${PLACE_COLUMNS} FROM champion ORDER BY month DESC, place`);
    this.selectLatest = db.prepare(`SELECT ${PLACE_COLUMNS} FROM champion WHERE month = (SELECT max(month) FROM champion) ORDER BY place`);
  }

  isClosed(month: string): boolean {
    return this.closedOne.get(month) !== null;
  }

  /** Closes `month` with its record, or with none. A month closed before stays as it was. Throws when the save fails. */
  close(month: string, record: MonthRecord | null): void {
    this.db.transaction(() => {
      if (this.isClosed(month)) return;
      this.insertMonth.run(month);
      if (record === null) return;
      record.top.forEach((row, i) => this.insertPlace.run(month, i + 1, row.rank, row.name, JSON.stringify(row.look), row.score, row.games, row.wins));
    }).immediate();
  }

  /** Newest first. Throws a PersistenceError that names a damaged row. */
  records(): readonly MonthRecord[] {
    return toRecords(this.selectAll.all());
  }

  /** The newest month with a record, or null. */
  latest(): MonthRecord | null {
    return toRecords(this.selectLatest.all())[0] ?? null;
  }
}

/** Groups the place rows (ordered by month, then place) into month records. */
function toRecords(rows: readonly PlaceRow[]): MonthRecord[] {
  const records: MonthRecord[] = [];
  let top: LeagueRow[] = [];
  rows.forEach((row, i) => {
    const key = `${row.month}/${row.place}`;
    if (row.place !== top.length + 1) throw invalidRow("champion", key, `the places of ${row.month} must run from 1 without a gap.`);
    top.push(toLeagueRow(row, key));
    if (rows[i + 1]?.month === row.month) return;
    const [champion] = top;
    if (champion !== undefined) records.push({ month: row.month, champion, top });
    top = [];
  });
  return records;
}

function toLeagueRow(row: PlaceRow, key: string): LeagueRow {
  const name = parsePlayerName(row.name);
  if (name === null) throw invalidRow("champion", key, "the name does not follow the name rule.");
  const look = parseTankLook(jsonColumn("champion", key, "look_json", row.look_json));
  if (look === null) throw invalidRow("champion", key, "look_json is not a tank look.");
  if (!Number.isFinite(row.score)) throw invalidRow("champion", key, "the score is not a number.");
  return { rank: row.rank, name, look, score: row.score, games: row.games, wins: row.wins };
}
