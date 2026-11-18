// The strategy documents stored before ultimates (85-ultimates.md). The migration and
// the read-only dry run visit the same locations, including the strategies used by replays.
import type { Database } from "bun:sqlite";
import { assignUltimate, hasStrategyBody, matchUltimate, parseStrategy, ULTIMATE_IDS, type StrategyInput, type UltimateId } from "@game/engine";
import { isRecord } from "../http.ts";
import { ultimateRandom } from "../ultimates/strategy.ts";
import { invalidRow, jsonColumn } from "./rows.ts";

const STRATEGY_TABLES = [
  { name: "account_strategy", key: "account_id || '/' || id", column: "strategy_json" },
  { name: "league_seat", key: "seat_id", column: "strategy_json" },
  { name: "league_month_rules", key: "month || '/' || seat_id", column: "strategy_json" },
  { name: "arena", key: "id", column: "snapshot_json" },
] as const;

type Table = (typeof STRATEGY_TABLES)[number];
type LegacyStrategy = Omit<StrategyInput, "ultimate">;
type Assign = (strategy: LegacyStrategy) => UltimateId;
type Counts = Readonly<{ table: Table["name"]; exact: number; overlap: number; random: number }>;

interface StrategyRow {
  readonly row_id: string;
  readonly key: string;
  readonly json: string;
}

function upgradeRow(table: Table, row: StrategyRow, assign: Assign): string | null {
  const json = jsonColumn(table.name, row.key, table.column, row.json);
  let changed = false;
  const upgrade = (raw: unknown, path: string): void => {
    if (isRecord(raw) && Object.hasOwn(raw, "ultimate")) return;
    if (!hasStrategyBody(raw)) throw invalidRow(table.name, row.key, `${path} must have modes and a build.`);
    const ultimate = assign(raw);
    const parsed = parseStrategy({ ...raw, ultimate });
    if (!parsed.ok) throw invalidRow(table.name, row.key, `${path} has problems: ${parsed.errors.join(" ")}`);
    // The row keeps its original JSON fields and order, including any fields the parser strips.
    Object.assign(raw, { ultimate });
    changed = true;
  };
  const upgradePlayers = (raw: unknown, path: string): void => {
    if (!isRecord(raw) || !Array.isArray(raw["players"])) throw invalidRow(table.name, row.key, `${path}.players must be a list.`);
    raw["players"].forEach((player, i) => upgrade(isRecord(player) ? player["strategy"] : undefined, `${path}.players[${i}].strategy`));
  };
  if (table.name === "arena") {
    if (!isRecord(json) || !Array.isArray(json["roundConfigs"])) throw invalidRow(table.name, row.key, "roundConfigs must be a list.");
    upgradePlayers(json["arena"], "arena");
    json["roundConfigs"].forEach((entry, i) => upgradePlayers(isRecord(entry) ? entry["config"] : undefined, `roundConfigs[${i}].config`));
  } else {
    upgrade(json, table.column);
  }
  return changed ? JSON.stringify(json) : null;
}

function strategyRows(db: Database, table: Table): StrategyRow[] {
  return db.query<StrategyRow, []>(
    `SELECT CAST(rowid AS TEXT) AS row_id, ${table.key} AS key, ${table.column} AS json FROM ${table.name}`,
  ).all();
}

export function migrateStrategyUltimates(db: Database): void {
  for (const table of STRATEGY_TABLES) {
    const update = db.prepare<unknown, [string, string]>(`UPDATE ${table.name} SET ${table.column} = ? WHERE rowid = ?`);
    for (const row of strategyRows(db, table)) {
      const json = upgradeRow(table, row, (strategy) => assignUltimate(strategy, ultimateRandom));
      if (json !== null) update.run(json, row.row_id);
    }
  }
}

export function countStrategyUltimates(db: Database): readonly Counts[] {
  return STRATEGY_TABLES.map((table) => {
    const counts = { exact: 0, overlap: 0, random: 0 };
    for (const row of strategyRows(db, table)) {
      upgradeRow(table, row, (strategy) => {
        const match = matchUltimate(strategy);
        counts[match.kind] += 1;
        // Use a fixed id for random cases so the dry run checks the same data without a draw.
        return match.kind === "random" ? ULTIMATE_IDS[0] : match.ultimate;
      });
    }
    return { table: table.name, ...counts };
  });
}
