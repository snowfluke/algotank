// Starts today's monthly day round again from 0 points: sets every seated tank's points and
// today's statistics in the league's checkpoint to 0. Seats, names, counted days and whether today
// counts for each tank stay. Owner, 2026-11-16: "this is just reset for today, it start from 0 again".
//
//   DATA_DIR=/var/lib/algotank bun apps/server/scripts/zero-today-points.ts 2026-11-16 [--dry-run]
//
// Run it only while the server is stopped: the server holds today's points in memory, writes them
// to the checkpoint at its stop and reads them back at its start. deploy/zero-today-points.sh
// stops the server, backs up, runs this and starts it again.
//
// Guard: the checkpoint must be on the given day, so a run cannot touch another day's points.

import { Database } from "bun:sqlite";
import { DEFAULT_DATA_DIR } from "../src/config.ts";
import { DATABASE_FILE } from "../src/db/open.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_STATS = { turns: 0, shots: 0, hits: 0, timesHit: 0, squaresMoved: 0, uses: [] };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const day = args.find((arg) => !arg.startsWith("--"));
if (day === undefined || !DAY.test(day) || args.length > 2) {
  console.error("Usage: bun apps/server/scripts/zero-today-points.ts <today, YYYY-MM-DD> [--dry-run]");
  process.exit(2);
}
const dataDir = process.env["DATA_DIR"] === undefined || process.env["DATA_DIR"] === "" ? DEFAULT_DATA_DIR : process.env["DATA_DIR"];

const db = new Database(`${dataDir}/${DATABASE_FILE}`, { readwrite: true, create: false, strict: true });
db.exec("PRAGMA busy_timeout = 5000");

const row = db.query<{ checkpoint_json: string }, []>("SELECT checkpoint_json FROM league_checkpoint WHERE id = 1").get();
if (row === null) {
  console.error("The database has no league checkpoint, so there is no day to start again.");
  process.exit(1);
}
const checkpoint = JSON.parse(row.checkpoint_json) as { day?: unknown; tanks?: { seatId: string; points: number; counts: boolean; stats: unknown }[] };
if (checkpoint.day !== day) {
  console.error(`The league is on day ${String(checkpoint.day)}, not ${day}. Nothing changes.`);
  process.exit(1);
}
const tanks = checkpoint.tanks ?? [];
console.log(`Day ${day}: ${tanks.length} seated tanks, points ${tanks.map((t) => t.points).join(", ") || "none"}.`);

if (dryRun) {
  console.log("Dry run: nothing changes.");
  process.exit(0);
}

const zeroed = { ...checkpoint, tanks: tanks.map((t) => ({ ...t, points: 0, stats: EMPTY_STATS })) };
db.query("UPDATE league_checkpoint SET checkpoint_json = ? WHERE id = 1").run(JSON.stringify(zeroed));
console.log(`Done: ${tanks.length} tanks start ${day} again from 0 points and empty statistics.`);
db.close();
