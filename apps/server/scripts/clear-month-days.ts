// Gives the monthly league a fresh start inside a month: deletes the counted days and the day
// records of the month before a given day, so the month's ranking counts from that day on.
// Seats, names, today's points and statistics stay. Owner, 2026-11-16: a tournament in the
// November league from 17 November, after a reset of the days before it.
//
//   DATA_DIR=/var/lib/algotank bun apps/server/scripts/clear-month-days.ts 2026-11-17 [--dry-run]
//
// Run it only while the server is stopped: the server keeps the league in memory and would write
// the deleted days back. deploy/clear-month-days.sh stops the server, backs up, runs this and
// starts it again.
//
// Guard: the league's checkpoint must be on the given day or later, so the day close of the day
// before has written its rows (they are deleted too). The delete stops before the given day, so a
// run on a later day still keeps that day and every day after it.

import { Database } from "bun:sqlite";
import { DEFAULT_DATA_DIR } from "../src/config.ts";
import { DATABASE_FILE } from "../src/db/open.ts";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const firstDay = args.find((arg) => !arg.startsWith("--"));
if (firstDay === undefined || !DAY.test(firstDay) || args.length > 2) {
  console.error("Usage: bun apps/server/scripts/clear-month-days.ts <first day to keep, YYYY-MM-DD> [--dry-run]");
  process.exit(2);
}
const monthStart = `${firstDay.slice(0, 7)}-01`;
const dataDir = process.env["DATA_DIR"] === undefined || process.env["DATA_DIR"] === "" ? DEFAULT_DATA_DIR : process.env["DATA_DIR"];

const db = new Database(`${dataDir}/${DATABASE_FILE}`, { readwrite: true, create: false, strict: true });
db.exec("PRAGMA busy_timeout = 5000");

const checkpoint = db.query<{ checkpoint_json: string }, []>("SELECT checkpoint_json FROM league_checkpoint WHERE id = 1").get();
if (checkpoint === null) {
  console.error("The database has no league checkpoint, so there is no running month to clear.");
  process.exit(1);
}
const checkpointDay: unknown = (JSON.parse(checkpoint.checkpoint_json) as { day?: unknown }).day;
// Days are YYYY-MM-DD, so their text order is their calendar order.
if (typeof checkpointDay !== "string" || checkpointDay < firstDay || checkpointDay.slice(0, 7) !== firstDay.slice(0, 7)) {
  console.error(`The league is on day ${String(checkpointDay)}. Run this on ${firstDay} or later in the same month, after 00:00 in LEAGUE_TIME_ZONE.`);
  process.exit(1);
}

const range = [monthStart, firstDay] as const;
const count = (table: string) => db.query<{ n: number }, [string, string]>(`SELECT COUNT(*) AS n FROM ${table} WHERE day >= ? AND day < ?`).get(...range)?.n ?? 0;
const days = db.query<{ day: string; n: number }, [string, string]>("SELECT day, COUNT(*) AS n FROM league_day_score WHERE day >= ? AND day < ? GROUP BY day ORDER BY day").all(...range);
console.log(`Counted days from ${monthStart} to before ${firstDay}: ${days.map((d) => `${d.day} (${d.n} tanks)`).join(", ") || "none"}`);
console.log(`Rows: ${count("league_day_score")} in league_day_score, ${count("league_day_record")} in league_day_record.`);

if (dryRun) {
  console.log("Dry run: nothing is deleted.");
  process.exit(0);
}

db.transaction(() => {
  db.query("DELETE FROM league_day_score WHERE day >= ? AND day < ?").run(...range);
  db.query("DELETE FROM league_day_record WHERE day >= ? AND day < ?").run(...range);
})();
console.log(`Deleted. Rows left before ${firstDay}: ${count("league_day_score")} in league_day_score, ${count("league_day_record")} in league_day_record.`);
db.close();
