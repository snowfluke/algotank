import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STORED_ARENA_VERSION, applyEvent, createArena, parseStoredArena, plainTankLook } from "@game/arena";
import { PRESETS, ULTIMATE_IDS, type PresetId, type StrategyInput } from "@game/engine";
import { AccountStrategies } from "../account-strategies.ts";
import { DATABASE_FILE, openDatabase } from "./open.ts";
import { migrate } from "./schema.ts";
import { insertAccount, insertRow, memoryDatabase } from "./testing.ts";

const ACCOUNT = "account-1";
const ARENA = "ABCDEF";
const PREVIOUS_VERSION = 10;
const preset = (id: PresetId) => PRESETS.find((p) => p.id === id)!.strategy;
const legacy = ({ modes, build }: StrategyInput) => ({ modes, build });
const exact = legacy(preset("evader"));
const overlap = { ...legacy(preset("dry-hunter")), build: { reach: 1, aim: 1, dodge: 1 } };
const custom = {
  modes: [{ id: "my-mode", name: "Mine", rules: [], fallback: { action: "throw", params: {} } }],
  build: { reach: 0, aim: 0, dodge: 0 },
};

function previousDatabase() {
  const db = memoryDatabase();
  // Version 11 only rewrites existing data, so the empty schema is also the version 10 schema.
  db.run(`PRAGMA user_version = ${PREVIOUS_VERSION}`);
  insertAccount(db, ACCOUNT);
  const style = { account_id: ACCOUNT, name: "Saved", updated_at: 1 };
  insertRow(db, "account_strategy", { ...style, id: "style-0001", strategy_json: JSON.stringify({ ...exact, extra: 9 }) });
  insertRow(db, "account_strategy", { ...style, id: "style-0002", strategy_json: JSON.stringify({ ...exact, ultimate: "magnet" }) });
  const look = plainTankLook(1);
  const tank = { seat_id: "p1", league: 1, name: "Ayu", look_json: JSON.stringify(look) };
  insertRow(db, "league_seat", { ...tank, account_id: ACCOUNT, seat_order: 1, strategy_json: JSON.stringify(overlap) });
  insertRow(db, "league_month_rules", { ...tank, month: "2026-10", rank: 1, gm: 0, strategy_json: JSON.stringify(custom) });
  let arena = createArena(ARENA, {
    name: "Saved arena", kind: "presenter", botFill: false, joinPolicy: "anyone",
    ruleSetMode: "standard", tankCount: 8, ticksPerRound: 20, tickMs: 100,
  }, "standard");
  for (const [playerId, name] of [["p1", "Ayu"], ["p2", "Budi"]] as const) {
    const joined = applyEvent(arena, { kind: "join", playerId, name, look, strategy: preset("evader") });
    if (!joined.ok) throw new Error(joined.error);
    arena = joined.arena;
  }
  const config = {
    seed: 7, ticksTotal: 20, survivorsAfterRound: null, ruleSetId: "standard", items: false,
    players: [{ id: "p1", strategy: legacy(preset("picker")) }, { id: "p2", strategy: custom }],
  };
  const snapshot = {
    version: STORED_ARENA_VERSION, ownerAccountId: ACCOUNT, lastActivityAt: 3, playerAccounts: [], playerTokens: [],
    arena: { ...arena, players: [{ ...arena.players[0], strategy: exact }, { ...arena.players[1], strategy: preset("random-walker") }] },
    roundConfigs: [{ round: 1, config }],
  };
  insertRow(db, "arena", { id: ARENA, kind: "presenter", owner_account_id: ACCOUNT, status: "lobby", updated_at: 3, snapshot_json: JSON.stringify(snapshot) });
  return db;
}

test("the read-only dry run and migration visit each version 10 strategy, including replay players", () => {
  const directory = mkdtempSync(join(tmpdir(), "algotank-ultimates-"));
  const path = join(directory, DATABASE_FILE);
  try {
    using old = previousDatabase();
    writeFileSync(path, old.serialize());
    const bytes = readFileSync(path);
    const result = Bun.spawnSync([process.execPath, "run", join(import.meta.dir, "../../scripts/ultimate-dry-run.ts"), path]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim().split("\n")).toEqual([
      "Table\tExact\tBest overlap\tRandom",
      "account_strategy\t1\t0\t0",
      "league_seat\t0\t1\t0",
      "league_month_rules\t0\t0\t1",
      "arena\t2\t0\t1",
    ]);
    expect(readFileSync(path)).toEqual(bytes);

    using db = openDatabase({ kind: "file", dataDir: directory });
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: PREVIOUS_VERSION + 1 });
    const listed = new AccountStrategies(db).list(ACCOUNT);
    expect(listed.find((s) => s.id === "style-0001")?.strategy).toEqual(preset("evader"));
    expect(listed.find((s) => s.id === "style-0002")?.strategy.ultimate).toBe("magnet");
    const readStrategy = (table: "account_strategy" | "league_seat" | "league_month_rules", where = "") =>
      JSON.parse(db.query<{ strategy_json: string }, []>(`SELECT strategy_json FROM ${table} ${where}`).get()!.strategy_json);
    expect(readStrategy("account_strategy", "WHERE id = 'style-0001'")).toEqual({ ...exact, extra: 9, ultimate: "smoke" });
    expect(readStrategy("league_seat")).toEqual({ ...overlap, ultimate: "bigUmbrella" });
    const month = readStrategy("league_month_rules");
    expect(month).toEqual({ ...custom, ultimate: expect.any(String) });
    expect(ULTIMATE_IDS).toContain(month.ultimate);

    const row = db.query<{ snapshot_json: string }, []>("SELECT snapshot_json FROM arena").get()!;
    const restored = parseStoredArena(JSON.parse(row.snapshot_json));
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.stored.arena.players.map((p) => p.strategy.ultimate)).toEqual(["smoke", "splash"]);
    expect(restored.stored.roundConfigs[0]?.config.players[0]?.strategy).toEqual(preset("picker"));
    expect(ULTIMATE_IDS).toContain(restored.stored.roundConfigs[0]!.config.players[1]!.strategy.ultimate);
    migrate(db);
    expect(readStrategy("league_month_rules")).toEqual(month);
    expect(db.query("SELECT snapshot_json FROM arena").get()).toEqual(row);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an unreadable legacy strategy rolls back the data and the version", () => {
  using db = previousDatabase();
  db.run("UPDATE league_month_rules SET strategy_json = '[]'");
  const accountStyles = db.query("SELECT strategy_json FROM account_strategy").all();
  expect(() => migrate(db)).toThrow("league_month_rules");
  expect(db.query("SELECT strategy_json FROM account_strategy").all()).toEqual(accountStyles);
  expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: PREVIOUS_VERSION });
});
