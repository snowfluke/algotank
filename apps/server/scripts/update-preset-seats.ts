// Gives every monthly seat whose rules are exactly a preset as it was before the retune of
// 2026-11-16 (presets-before-2026-11-16.json) or before the Item hunter stopped grabbing items
// under dry-spell (presets-before-2026-11-16-dry-spell.json) or before the Evader grabbed items and the
// Item hunter took only buckets (presets-before-2026-11-16-grab.json) that preset's rules as they are now
// (packages/engine/src/strategy/presets.ts). Owner, 2026-11-16: "if possible seated tanks should
// be affected as well", so a tank that took a preset plays the equal version. A seat whose rules a
// player edited, even by one value, keeps them: only its owner knows what the edit was for. Seats,
// names, today's points, counted days and statistics stay. It prints tank names only, never an email.
//
//   DATA_DIR=/var/lib/algotank bun apps/server/scripts/update-preset-seats.ts [--dry-run]
//
// Run it only while the server is stopped: the server keeps the seats in memory and would write
// them back. deploy/update-preset-seats.sh stops the server, backs up, runs this and starts it
// again. The day reads each seat's rules from league_seat at its start (league-store.ts).

import { Database } from "bun:sqlite";
import { PRESETS, parseStrategy, type Strategy } from "@game/engine";
import { DEFAULT_DATA_DIR } from "../src/config.ts";
import { DATABASE_FILE } from "../src/db/open.ts";
import { assignMissingUltimate } from "../src/ultimates/strategy.ts";
import BEFORE_RETUNE from "./presets-before-2026-11-16.json";
import BEFORE_DRY_SPELL from "./presets-before-2026-11-16-dry-spell.json";
import BEFORE_GRAB from "./presets-before-2026-11-16-grab.json";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
if (args.some((arg) => arg !== "--dry-run")) {
  console.error("Usage: bun apps/server/scripts/update-preset-seats.ts [--dry-run]");
  process.exit(2);
}
const dataDir = process.env["DATA_DIR"] === undefined || process.env["DATA_DIR"] === "" ? DEFAULT_DATA_DIR : process.env["DATA_DIR"];

/** JSON with sorted keys, so two equal strategies give the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parsed(input: unknown, what: string): Strategy {
  const result = parseStrategy(assignMissingUltimate(input));
  if (!result.ok) throw new Error(`${what} is not a valid strategy: ${result.errors.join("; ")}`);
  return result.strategy;
}

// A seat's ultimate stays fixed when a retune updates its rules (85-ultimates.md).
const rulesText = ({ modes, build }: Strategy): string => canonical({ modes, build });

/** Old preset text -> preset id, for the presets whose rules changed. */
const oldPresets = new Map<string, string>();
for (const snapshot of [BEFORE_RETUNE, BEFORE_DRY_SPELL, BEFORE_GRAB]) {
  for (const preset of PRESETS) {
    const before = (snapshot as Record<string, unknown>)[preset.id];
    if (before === undefined) continue;
    const oldText = rulesText(parsed(before, `The old preset ${preset.id}`));
    if (oldText !== rulesText(preset.strategy)) oldPresets.set(oldText, preset.id);
  }
}

const db = new Database(`${dataDir}/${DATABASE_FILE}`, { readwrite: true, create: false, strict: true });
db.exec("PRAGMA busy_timeout = 5000");
const seats = db.query<{ seat_id: string; name: string; strategy_json: string }, []>("SELECT seat_id, name, strategy_json FROM league_seat ORDER BY seat_order").all();
const updates = seats.flatMap((seat) => {
  const saved = parsed(JSON.parse(seat.strategy_json), `The rules of ${seat.name}`);
  const id = oldPresets.get(rulesText(saved));
  const preset = id === undefined ? undefined : PRESETS.find((p) => p.id === id);
  return preset === undefined ? [] : [{ seat, presetId: preset.id, strategy: { ...preset.strategy, ultimate: saved.ultimate } }];
});
const currentTexts = new Set(PRESETS.map((preset) => rulesText(preset.strategy)));
const onCurrent = seats.filter((seat) => currentTexts.has(rulesText(parsed(JSON.parse(seat.strategy_json), `The rules of ${seat.name}`)))).length;
console.log(`Seated tanks: ${seats.length}: ${updates.length} on an old preset that changed, ${onCurrent} on a preset of now, ${seats.length - updates.length - onCurrent} with their own rules.`);
console.log(`Playing an old preset that changed: ${updates.map((u) => `${u.seat.name} (${u.presetId})`).join(", ") || "none"}.`);

if (dryRun) {
  console.log("Dry run: nothing changes.");
  process.exit(0);
}

const update = db.query<unknown, [string, string]>("UPDATE league_seat SET strategy_json = ? WHERE seat_id = ?");
db.transaction(() => {
  for (const u of updates) update.run(JSON.stringify(u.strategy), u.seat.seat_id);
})();
console.log(`Updated ${updates.length} seat(s) to the presets of now.`);
db.close();
