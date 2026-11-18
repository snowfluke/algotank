import { expect, test } from "bun:test";
import { DEFAULT_PRESET_ID, PRESETS, RULE_SET_IDS, runRound, ruleSet } from "@game/engine";
import { toPublicSnapshot, toPublicTick } from "./public-tick.ts";

// Sorted, so the test names the allow-list and not an order. The mode of a bot stays out.
// Items are public: every viewer sees them on the board and on the tank that holds one (84-items.md).
const PUBLIC_SNAPSHOT_KEYS = ["bots", "height", "items", "ruleSetId", "survivorsAfterRound", "tick", "ticksTotal", "width"];
const PUBLIC_BOT_KEYS = ["build", "direction", "effect", "hitsLanded", "hitsTaken", "id", "item", "score", "wasHit", "water", "x", "y"];

const strategy = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!.strategy;
const { spawn, ticks } = runRound({
  seed: 5,
  ticksTotal: 12,
  items: true,
  ultimates: false,
  survivorsAfterRound: null,
  ruleSetId: "dry-spell",
  players: ["a", "b", "c"].map((id) => ({ id, strategy })),
});

test("a public bot carries exactly the allowed fields, and water is one of them", () => {
  const bots = [...toPublicSnapshot(spawn).bots, ...ticks.flatMap((t) => toPublicTick(t).snapshot.bots)];
  expect(bots.length).toBeGreaterThan(0);
  for (const bot of bots) expect(Object.keys(bot).sort()).toEqual(PUBLIC_BOT_KEYS);
});

test("a public snapshot carries exactly the allowed fields, and the rule set is one of them", () => {
  for (const snapshot of [spawn, ...ticks.map((t) => t.snapshot)]) {
    const view = toPublicSnapshot(snapshot);
    expect(Object.keys(view).sort()).toEqual(PUBLIC_SNAPSHOT_KEYS);
    expect(view.ruleSetId).toBe("dry-spell");
  }
  expect(toPublicTick(ticks[0]!).snapshot.ruleSetId).toBe("dry-spell");
});

test("every rule set reaches the public snapshot unchanged", () => {
  for (const ruleSetId of RULE_SET_IDS) {
    const round = runRound({ seed: 5, ticksTotal: 3, survivorsAfterRound: null, ruleSetId, players: ["a", "b"].map((id) => ({ id, strategy })), items: true, ultimates: false });
    expect(toPublicSnapshot(round.spawn).ruleSetId).toBe(ruleSetId);
  }
});

test("the public water is the engine water, and a bot starts with the full tank of the round's rule set", () => {
  const capacity = ruleSet("dry-spell").waterCapacity;
  expect(capacity).toBe(6);
  expect(toPublicSnapshot(spawn).bots.every((bot) => bot.water === capacity)).toBe(true);
  const last = ticks[ticks.length - 1]!;
  expect(toPublicTick(last).snapshot.bots.map((b) => b.water)).toEqual(last.snapshot.bots.map((b) => b.water));
});
