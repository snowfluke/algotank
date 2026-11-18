// Makes one monthly seat the game master (monthly/game-masters.ts) and, when a rules file is given,
// gives it those rules, both in one transaction: the organizer's tank (owner, 2026-11-17) must never
// play strong rules while it still takes a place. The admin page sets the mark too
// (PUT /api/admin/players/:seatId/gm); this is for a change while nobody can use the page. It prints
// tank names only, never an email.
//
//   DATA_DIR=/var/lib/algotank bun apps/server/scripts/set-game-master.ts <tank name> [<rules.json>] [--dry-run]
//
// Run it only while the server is stopped (as update-preset-seats.ts): the server keeps the seats and
// the game masters in memory. The rules go through parseStrategy, as at every load of league_seat.

import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { parseStrategy } from "@game/engine";
import { DEFAULT_DATA_DIR } from "../src/config.ts";
import { DATABASE_FILE } from "../src/db/open.ts";
import { isRecord } from "../src/http.ts";
import { assignMissingUltimate } from "../src/ultimates/strategy.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [name, rulesFile, ...rest] = args.filter((arg) => arg !== "--dry-run");
if (name === undefined || rest.length > 0) {
  console.error("Usage: bun apps/server/scripts/set-game-master.ts <tank name> [<rules.json>] [--dry-run]");
  process.exit(2);
}
const dataDir = process.env["DATA_DIR"] === undefined || process.env["DATA_DIR"] === "" ? DEFAULT_DATA_DIR : process.env["DATA_DIR"];

const db = new Database(`${dataDir}/${DATABASE_FILE}`, { readwrite: true, create: false, strict: true });
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA foreign_keys = ON");
const seats = db.query<{ seat_id: string; account_id: string; strategy_json: string }, [string]>("SELECT seat_id, account_id, strategy_json FROM league_seat WHERE name = ?").all(name);
if (seats.length !== 1) throw new Error(`Expected one seated tank named "${name}", found ${seats.length}.`);
const seat = seats[0]!;
let strategyJson: string | null = null;
if (rulesFile !== undefined) {
  // These are replacement rules for an existing seat, so its ultimate stays fixed (85-ultimates.md).
  const stored = parseStrategy(assignMissingUltimate(JSON.parse(seat.strategy_json)));
  if (!stored.ok) throw new Error(`The rules of ${name} are not valid: ${stored.errors.join("; ")}`);
  const input: unknown = JSON.parse(readFileSync(rulesFile, "utf8"));
  const result = parseStrategy(isRecord(input) ? { ...input, ultimate: stored.strategy.ultimate } : input);
  if (!result.ok) throw new Error(`The rules in ${rulesFile} are not valid: ${result.errors.join("; ")}`);
  strategyJson = JSON.stringify(result.strategy);
}
const already = db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM league_game_master WHERE account_id = ?").get(seat.account_id)?.n === 1;
console.log(`${name}: ${already ? "already the game master" : "becomes the game master"}${strategyJson === null ? "; its rules stay" : "; it gets the rules of the file"}.`);
if (dryRun) {
  console.log("Dry run: nothing changes.");
  process.exit(0);
}
db.transaction(() => {
  db.query("INSERT INTO league_game_master (account_id) VALUES (?) ON CONFLICT (account_id) DO NOTHING").run(seat.account_id);
  if (strategyJson !== null) db.query("UPDATE league_seat SET strategy_json = ? WHERE seat_id = ?").run(strategyJson, seat.seat_id);
})();
console.log(`Done: ${name} is the game master${strategyJson === null ? "" : " with its new rules"}.`);
db.close();
