import { plainTankLook } from "@game/arena";
import { expect, test } from "bun:test";
import { applyEvent, createArena, type Arena, type ArenaEvent, type ReplayResponse } from "@game/arena";
import { PRESETS, runRound, type RoundConfig } from "@game/engine";
import { toCompactTick, toPublicSnapshot } from "./public-tick.ts";
import { replayJson } from "./replay.ts";
import { Store, type ArenaRecord } from "./store.ts";
import { realTimeScheduler } from "./timers.ts";
import { memoryDatabase } from "./db/testing.ts";

const strategy = PRESETS[0]!.strategy;

/** A record whose round 1 completed with 3 players. */
function completedRecord(): { store: Store; record: ArenaRecord; config: RoundConfig } {
  const store = new Store({ db: memoryDatabase(), now: Date.now, scheduler: realTimeScheduler });
  let arena: Arena = createArena(
    "R1",
    { name: "Replay", kind: "private", ticksPerRound: 20, tickMs: 100, ruleSetMode: "announced", botFill: false, joinPolicy: "anyone", tankCount: 8 },
    "open-field",
  );
  const apply = (event: ArenaEvent) => {
    const result = applyEvent(arena, event);
    if (!result.ok) throw new Error(result.error);
    arena = result.arena;
  };
  for (const id of ["a", "b", "c"]) apply({ kind: "join", playerId: id, name: `Player ${id}`, strategy, look: plainTankLook(1) });
  apply({ kind: "startRound", seed: 11, ruleSetId: "open-field" });
  const config: RoundConfig = {
    seed: 11,
    ticksTotal: 20,
    items: true,
    ultimates: false,
    survivorsAfterRound: null,
    ruleSetId: "open-field",
    players: ["a", "b", "c"].map((id) => ({ id, strategy })),
  };
  apply({ kind: "roundCompleted", standings: runRound(config).standings, nextRuleSetId: null });
  const added = store.add(arena, "owner");
  if (!added.ok) throw new Error("the arena was not added");
  const record = added.record;
  store.setRoundConfig(record, 1, config);
  return { store, record, config };
}

test("the body is the ReplayResponse as JSON, byte for byte, and own comes from the stored decisions", () => {
  const { record, config } = completedRecord();
  const { spawn, ticks } = runRound(config);

  const viewer: ReplayResponse = { round: 1, spawn: toPublicSnapshot(spawn), ticks: ticks.map(toCompactTick), own: null };
  expect(replayJson(record, 1, null)).toBe(JSON.stringify(viewer));

  const own = ticks.flatMap((t) => t.decisions.filter((d) => d.botId === "b"));
  expect(replayJson(record, 1, "b")).toBe(JSON.stringify({ ...viewer, own }));
  // A player who was not in the round gets an empty list.
  expect(replayJson(record, 1, "stranger")).toBe(JSON.stringify({ ...viewer, own: [] }));
});

test("runs the round once, however many players ask", () => {
  const { record } = completedRecord();
  expect(record.replays.size).toBe(0);
  replayJson(record, 1, null);
  const stored = record.replays.get(1);
  expect(stored).toBeDefined();
  replayJson(record, 1, "a");
  replayJson(record, 1, "b");
  expect(record.replays.get(1)).toBe(stored);
  expect(record.replays.size).toBe(1);
});

test("a round that did not complete has no replay and fills no cache, even with a stored config", () => {
  const { store, record, config } = completedRecord();
  // A started round that was aborted keeps its config under the number it will reuse.
  store.setRoundConfig(record, 2, config);
  expect(replayJson(record, 2, null)).toBeUndefined();
  expect(record.replays.size).toBe(0);
});
