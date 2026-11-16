// Takes every monthly seat whose account has no verified email out of the league, so the league
// holds verified accounts only (owner, 2026-11-16). It deletes the seat rows, as a quit does
// (Monthly.quit), but saves no day score: a removal is not a quit, so today does not count for
// the tank. The name and the month's counted days stay with the account, which can verify its
// email and take a seat again. It prints tank names only, never an email.
//
//   DATA_DIR=/var/lib/algotank bun apps/server/scripts/remove-unverified-seats.ts [--dry-run]
//
// Run it only while the server is stopped: the server keeps the seats in memory and would write
// them back. deploy/remove-unverified-seats.sh stops the server, backs up, runs this and starts it
// again. The day ignores a checkpoint entry whose seat is gone (Monthly.openDay).

import { Database } from "bun:sqlite";
import { DEFAULT_DATA_DIR } from "../src/config.ts";
import { DATABASE_FILE } from "../src/db/open.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
if (args.some((arg) => arg !== "--dry-run")) {
  console.error("Usage: bun apps/server/scripts/remove-unverified-seats.ts [--dry-run]");
  process.exit(2);
}
const dataDir = process.env["DATA_DIR"] === undefined || process.env["DATA_DIR"] === "" ? DEFAULT_DATA_DIR : process.env["DATA_DIR"];

const db = new Database(`${dataDir}/${DATABASE_FILE}`, { readwrite: true, create: false, strict: true });
db.exec("PRAGMA busy_timeout = 5000");

const UNVERIFIED = "FROM league_seat WHERE account_id IN (SELECT id FROM account WHERE email_verified = 0)";
const tanks = db.query<{ name: string }, []>(`SELECT name ${UNVERIFIED} ORDER BY seat_order`).all();
const seated = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM league_seat").get()?.n ?? 0;
console.log(`Seated tanks: ${seated}. Without a verified email: ${tanks.map((t) => t.name).join(", ") || "none"}.`);

if (dryRun) {
  console.log("Dry run: nothing changes.");
  process.exit(0);
}

const removed = db.query(`DELETE ${UNVERIFIED}`).run().changes;
console.log(`Removed ${removed} seat(s). Seated tanks now: ${db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM league_seat").get()?.n ?? 0}.`);
db.close();
