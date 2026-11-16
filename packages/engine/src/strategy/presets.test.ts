import { describe, expect, test } from "bun:test";
import { BUILD_BUDGET, buildCost } from "../combat/combat.ts";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID } from "../combat/rule-sets.ts";
import { MOVES } from "../types.ts";
import { runRound } from "../round/round.ts";
import { DEFAULT_PRESET_ID, PICKER_ORDER, PRESETS } from "./presets.ts";
import { parseStrategy } from "./parse.ts";
import { decide } from "./decide.ts";
import { STANDARD, bot, contextFor, snapshotOf, stubRng } from "./test-helpers.ts";

/** The thresholds of the presets are fixed at 3 and 6 water, which are one and two throws of the standard set. */
const WATER_PER_THROW = STANDARD.waterPerThrow;

function presetOf(id: string) {
  const preset = PRESETS.find((p) => p.id === id);
  if (preset === undefined) throw new Error(`preset "${id}" missing`);
  return preset;
}

describe("presets", () => {
  test("the table holds these ids and names, in this order", () => {
    expect(PRESETS.map((p) => [p.id, p.name])).toEqual([
      ["evader", "Evader"],
      ["leader-chaser", "Leader chaser"],
      ["dry-hunter", "Dry hunter"],
      ["ambusher", "Ambusher"],
      ["picker", "Picker"],
      ["backstabber", "Backstabber"],
      ["charger", "Charger"],
      ["random-walker", "Random walker"],
      ["item-hunter", "Item hunter"],
    ]);
  });

  test("the ids of the removed presets are gone", () => {
    for (const id of ["brawler", "sniper", "cut-line-switcher", "payback", "field-reader", "opportunist"]) {
      expect(PRESETS.some((p) => p.id === id), id).toBe(false);
    }
  });

  test("there are at least 6, with unique ids, and the default is a designed preset", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    // The Charger is the benchmark and the walker the baseline, so neither is what a new player starts from.
    expect(PRESETS.some((p) => p.id === DEFAULT_PRESET_ID)).toBe(true);
    expect(["charger", "random-walker"]).not.toContain(DEFAULT_PRESET_ID);
  });

  test("the picker shows every preset but the Charger once, the default first and the Random walker last", () => {
    expect(PICKER_ORDER[0]).toBe(DEFAULT_PRESET_ID);
    expect(PICKER_ORDER.at(-1)).toBe("random-walker");
    expect([...PICKER_ORDER].sort()).toEqual(PRESETS.map((p) => p.id).filter((id) => id !== "charger").sort());
  });

  test("every preset parses again from its own data, and its build is within the budget", () => {
    for (const preset of PRESETS) {
      const result = parseStrategy(JSON.parse(JSON.stringify(preset.strategy)));
      expect(result.ok ? [] : result.errors, preset.id).toEqual([]);
      expect(buildCost(preset.strategy.build), preset.id).toBeLessThanOrEqual(BUILD_BUDGET);
    }
  });

  test("each has a name, a one-sentence summary and a build that spends the whole budget", () => {
    for (const preset of PRESETS) {
      expect(preset.name.length, preset.id).toBeGreaterThan(0);
      expect(preset.summary.endsWith("."), preset.id).toBe(true);
      expect(buildCost(preset.strategy.build), preset.id).toBe(BUILD_BUDGET);
    }
  });

  test("the charger is the benchmark: one rule that throws, and a fallback that moves toward the nearest bot", () => {
    const [only, ...more] = presetOf("charger").strategy.modes;
    expect(more).toEqual([]);
    expect(only?.rules).toHaveLength(1);
    expect(only?.rules[0]?.action).toEqual({ action: "throw", params: {} });
    expect(only?.fallback).toEqual({ action: "moveToward", params: { target: "nearest" } });
  });

  test("the random walker is in the list as a baseline", () => {
    const walker = PRESETS.find((p) => p.id === "random-walker");
    expect(walker?.strategy.modes[0]?.fallback.action).toBe("wander");
  });

  test("the dry hunter scores above the charger against 7 chargers, so skill shows in the score", () => {
    const charger = presetOf("charger");
    const hunter = presetOf("dry-hunter");
    let total = 0;
    const seeds = 40;
    for (let seed = 1; seed <= seeds; seed++) {
      const seat = seed % 8;
      const players = Array.from({ length: 8 }, (_, i) => ({ id: `seat${i}`, strategy: (i === seat ? hunter : charger).strategy }));
      const result = runRound({ seed, ticksTotal: 150, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players, items: false });
      total += result.standings.find((s) => s.botId === `seat${seat}`)?.score ?? 0;
    }
    // The measured mean over 1000 finals is about +18. The charger's mean against itself is 0 by symmetry.
    expect(total / seeds).toBeGreaterThan(5);
  });

  test("the default preset wins some finals against the other presets", () => {
    const strategies = PRESETS.map((p) => ({ id: p.id, strategy: p.strategy }));
    let wins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const result = runRound({ seed, ticksTotal: 150, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players: strategies, items: true });
      if (result.standings[0]?.botId === DEFAULT_PRESET_ID) wins += 1;
    }
    expect(wins).toBeGreaterThan(0);
  });

  test("they play differently: no two presets share both build and rule list", () => {
    const keys = PRESETS.map((p) => JSON.stringify(p.strategy));
    expect(new Set(keys).size).toBe(PRESETS.length);
    // Seven of the eight presets share the build 0/3/3, so builds do not tell them apart; their rules do.
    expect(new Set(PRESETS.map((p) => JSON.stringify(p.strategy.build))).size).toBeGreaterThanOrEqual(2);
  });

  test("each preset gives a legal decision in every cell of a small arena, in each of its modes", () => {
    for (const preset of PRESETS) {
      for (const strategyMode of preset.strategy.modes) {
        for (let x = 0; x < 5; x++) {
          for (let y = 0; y < 4; y++) {
            for (const direction of ["N", "E", "S", "W"] as const) {
              const me = bot("me", x, y, direction, { modeId: strategyMode.id, build: preset.strategy.build });
              const others = [bot("o1", (x + 2) % 5, (y + 1) % 4, "W", { score: 3 }), bot("o2", (x + 3) % 5, (y + 2) % 4, "N", { score: -2 })];
              const snapshot = snapshotOf([me, ...others], { width: 5, height: 4, survivorsAfterRound: 2, tick: 50 });
              const decision = decide(contextFor(snapshot, "me"), preset.strategy, stubRng({ chance: [true, true, true], int: [0] }));
              expect(MOVES, preset.id).toContain(decision.move);
              expect(preset.strategy.modes.some((m) => m.id === decision.nextModeId), preset.id).toBe(true);
            }
          }
        }
      }
    }
  });

  test("the dry hunter throws at a bot in line whose tank cannot pay for a throw, and not at one that can throw back", () => {
    const hunter = presetOf("dry-hunter");
    const decideWith = (targetWater: number) => {
      const me = bot("me", 1, 3, "E", { modeId: "strike", build: hunter.strategy.build, water: WATER_PER_THROW });
      const snapshot = snapshotOf([me, bot("target", 4, 3, "N", { water: targetWater })]);
      return decide(contextFor(snapshot, "me"), hunter.strategy, stubRng());
    };
    expect(decideWith(WATER_PER_THROW - 1)).toMatchObject({ ruleId: "free-hit", move: "T" });
    expect(decideWith(WATER_PER_THROW).ruleId).not.toBe("free-hit");
  });

  test("the ambusher leaves rest with water for two throws and returns when it holds less than for one", () => {
    const ambusher = presetOf("ambusher");
    const nextMode = (modeId: string, water: number) => {
      const me = bot("me", 1, 1, "E", { modeId, build: ambusher.strategy.build, water });
      const snapshot = snapshotOf([me, bot("far", 7, 5, "N")]);
      return decide(contextFor(snapshot, "me"), ambusher.strategy, stubRng()).nextModeId;
    };
    expect(nextMode("rest", 2 * WATER_PER_THROW)).toBe("strike");
    expect(nextMode("rest", 2 * WATER_PER_THROW - 1)).toBe("rest");
    expect(nextMode("strike", WATER_PER_THROW)).toBe("strike");
    expect(nextMode("strike", WATER_PER_THROW - 1)).toBe("rest");
  });

  test("the water thresholds are fixed data: another set's cost does not move them", () => {
    const hunter = presetOf("dry-hunter");
    // Under dry-spell a throw costs 5, but the hunter still reads "3 water" as enough for a free hit.
    const me = bot("me", 1, 3, "E", { modeId: "strike", build: hunter.strategy.build, water: 3 });
    const snapshot = snapshotOf([me, bot("target", 3, 3, "N", { water: 0 })], { ruleSetId: "dry-spell" });
    expect(decide(contextFor(snapshot, "me"), hunter.strategy, stubRng())).toMatchObject({ ruleId: "free-hit", move: "T" });
  });

  test.each(RULE_SET_IDS)("under %s, every designed preset lands hits", (id) => {
    const designed = PRESETS.filter((p) => p.id !== "random-walker" && p.id !== "charger");
    const landed = new Map<string, number>(designed.map((p) => [p.id, 0]));
    for (let seed = 1; seed <= 6; seed++) {
      const players = PRESETS.map((p, i) => ({ id: `${p.id}`, strategy: p.strategy, seat: i }));
      const result = runRound({ seed, ticksTotal: 150, survivorsAfterRound: null, ruleSetId: id, players, items: false });
      const last = result.ticks[result.ticks.length - 1]?.snapshot;
      if (!last) throw new Error("test setup");
      for (const b of last.bots) if (landed.has(b.id)) landed.set(b.id, (landed.get(b.id) ?? 0) + b.hitsLanded);
    }
    for (const [presetId, hits] of landed) expect(hits, presetId).toBeGreaterThan(0);
  });
});
