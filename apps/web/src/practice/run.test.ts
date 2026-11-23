/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { ULTIMATES_FROM } from "@game/arena";
import { ARENA_LAYOUT_IDS, arenaConditionOf, createRng, DEFAULT_PRESET_ID, PRESETS, RULE_SET_IDS, STANDARD_RULE_SET_ID, parseStrategy, statsOfRound, statsView } from "@game/engine";
import type { Strategy } from "@game/engine";
import { OPPONENTS_MAX, PLAYER_ID, TICKS_DEFAULT, drawCondition, drawSeed, pickOpponents, runPractice } from "./run.ts";
import { DEFAULT_SPEED_ID, SPEED_MS, initialReplay, replayReducer } from "./replay.ts";
import { parseTestChoices } from "./testChoices.ts";

function presetStrategy(id: string): Strategy {
  const found = PRESETS.find((preset) => preset.id === id);
  if (found === undefined) throw new Error(`no preset ${id}`);
  return found.strategy;
}

/** A preset that fills every place in the "only" mix. Any preset works, so the test follows the table. */
const ONLY_PRESET = PRESETS[1];
if (ONLY_PRESET === undefined) throw new Error("the table has fewer than 2 presets");

const settings = {
  strategy: presetStrategy(DEFAULT_PRESET_ID),
  name: "Ayu",
  opponents: 7,
  mix: { kind: "eachOnce" } as const,
  ticks: TICKS_DEFAULT,
  seed: 12345,
  nowMs: ULTIMATES_FROM - 1,
  ruleSetId: STANDARD_RULE_SET_ID,
};

describe("pickOpponents", () => {
  test("one of each cycles through the presets and wraps", () => {
    const picked = pickOpponents(PRESETS.length + 2, { kind: "eachOnce" });
    expect(picked.slice(0, PRESETS.length).map((preset) => preset.id)).toEqual(PRESETS.map((preset) => preset.id));
    expect(picked[PRESETS.length]?.id).toBe(PRESETS[0]?.id);
  });

  test("only fills every place with one preset", () => {
    const picked = pickOpponents(4, { kind: "only", presetId: ONLY_PRESET.id });
    expect(picked.map((preset) => preset.id)).toEqual(Array(4).fill(ONLY_PRESET.id));
  });

  test("a count outside 1 to 15 or an unknown preset throws", () => {
    expect(() => pickOpponents(0, { kind: "eachOnce" })).toThrow();
    expect(() => pickOpponents(OPPONENTS_MAX + 1, { kind: "eachOnce" })).toThrow();
    expect(() => pickOpponents(2, { kind: "only", presetId: "nope" })).toThrow();
  });
});

describe("runPractice", () => {
  test("the selected start time enables ultimates for a new practice round at release", () => {
    expect(runPractice(settings).spawn.bots.every((bot) => bot.ultimate === undefined)).toBe(true);
    expect(runPractice({ ...settings, nowMs: ULTIMATES_FROM }).spawn.bots.every((bot) => bot.ultimate !== undefined)).toBe(true);
  });

  test("the same seed gives the same round", () => {
    const first = runPractice(settings);
    const second = runPractice(settings);
    expect(second.standings).toEqual(first.standings);
    expect(second.ticks.length).toBe(settings.ticks);
  });

  test("random draws a condition every RANDOM_CHANGE_TURNS turns from the seed, so a seed is the same match", () => {
    const known = new Set<string>([...RULE_SET_IDS, ...ARENA_LAYOUT_IDS]);
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(known.has(drawCondition(rng))).toBe(true);
    const long = { ...settings, ruleSetId: "random" as const, ticks: 160 };
    const conditions = (run: ReturnType<typeof runPractice>) => new Set([run.spawn, ...run.ticks.map((t) => t.snapshot)].map((s) => arenaConditionOf(s)));
    // Over a few seeds the weather changes during the match.
    expect([1, 2, 3, 4].some((seed) => conditions(runPractice({ ...long, seed })).size > 1)).toBe(true);
    expect(runPractice(long).standings).toEqual(runPractice(long).standings);
    // The statistics count every turn, also across a change of weather that moved tanks.
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(runPractice({ ...long, seed }).stats.turns).toBe(160);
  });

  test("a mixed arena of the league plays too, on its layout, and the same seed gives the same match", () => {
    for (const layout of ARENA_LAYOUT_IDS) {
      const first = runPractice({ ...settings, ruleSetId: layout });
      expect(first.spawn.layout?.id).toBe(layout);
      expect(first.ticks.length).toBe(settings.ticks);
      expect(first.standings.map((s) => s.botId)).toContain(PLAYER_ID);
      expect(runPractice({ ...settings, ruleSetId: layout }).standings).toEqual(first.standings);
    }
  });

  test("a new seed can give another round", () => {
    const a = runPractice(settings);
    const b = runPractice({ ...settings, seed: 999 });
    expect(JSON.stringify(b.spawn)).not.toBe(JSON.stringify(a.spawn));
  });

  test("bot names follow the given play-style names", () => {
    const run = runPractice({ ...settings, opponents: 2, mix: { kind: "only", presetId: ONLY_PRESET.id }, styleName: () => "Penyergap" });
    expect(run.names["bot-1"]).toBe("Penyergap 1");
    expect(run.names["bot-2"]).toBe("Penyergap 2");
  });

  test("names are unique per place and the player is ranked", () => {
    const run = runPractice({ ...settings, opponents: 3, mix: { kind: "only", presetId: ONLY_PRESET.id } });
    expect(Object.keys(run.names).length).toBe(4);
    expect(new Set(Object.values(run.names)).size).toBe(4);
    expect(run.names[PLAYER_ID]).toBe("Ayu");
    expect(run.player.botId).toBe(PLAYER_ID);
  });

  test("a round of more than 8 uses the cut line of the arena", () => {
    const big = runPractice({ ...settings, opponents: 15 });
    expect(big.spawn.survivorsAfterRound).toBe(8);
    const small = runPractice({ ...settings, opponents: 3 });
    expect(small.spawn.survivorsAfterRound).toBeNull();
  });
});

describe("runPractice rule sets", () => {
  test("the round runs under the chosen set", () => {
    const run = runPractice({ ...settings, ruleSetId: "dry-spell" });
    expect(run.spawn.ruleSetId).toBe("dry-spell");
    expect(run.ticks.at(-1)?.snapshot.ruleSetId).toBe("dry-spell");
    expect(run.spawn.bots.every((bot) => bot.water === 6)).toBe(true);
  });

  test("open field gives a larger arena than the standard set for the same players", () => {
    const standard = runPractice(settings);
    const open = runPractice({ ...settings, ruleSetId: "open-field" });
    expect(open.spawn.width * open.spawn.height).toBeGreaterThan(standard.spawn.width * standard.spawn.height);
  });
});

// The Try it card counts with the engine (stats/stats.ts), as the server does.
describe("the statistics of a test match", () => {
  test("the counts of all rows add up to the ticks of the round", () => {
    for (const preset of PRESETS) {
      const run = runPractice({ ...settings, strategy: preset.strategy });
      const view = statsView(statsOfRound(run.spawn, run.ticks, PLAYER_ID), run.strategy);
      // Spin and ultimate turns belong to no rule row (engine stats).
      const total = view.modes.reduce((sum, mode) => sum + mode.rules.reduce((s, n) => s + n, 0) + mode.fallback, 0) +
        view.spinTurns + (view.ultimateTurns ?? 0);
      expect(total).toBe(run.ticks.length);
    }
  });

  test("a rule id used in two modes is counted per mode", () => {
    // Rule ids only have to be unique inside one mode, so the second mode can reuse an id of the first.
    const base = PRESETS.find((preset) => preset.strategy.modes.length >= 2)?.strategy;
    const firstRuleId = base?.modes[0]?.rules[0]?.id;
    if (base === undefined || firstRuleId === undefined) throw new Error("no preset has two modes and a rule in the first");
    const strategy: Strategy = {
      ...base,
      modes: base.modes.map((mode, index) =>
        index === 1 ? { ...mode, rules: mode.rules.map((rule, at) => (at === 0 ? { ...rule, id: firstRuleId } : rule)) } : mode,
      ),
    };
    const parsed = parseStrategy(strategy);
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    const [first, second] = strategy.modes;
    expect(first?.rules.map((rule) => rule.id)).toContain(firstRuleId);
    expect(second?.rules.map((rule) => rule.id)).toContain(firstRuleId);
    const run = runPractice({ ...settings, strategy, opponents: 15, ticks: 300 });
    const view = statsView(statsOfRound(run.spawn, run.ticks, PLAYER_ID), run.strategy);
    const decisions = run.ticks.map((tick) => tick.decisions.find((d) => d.botId === PLAYER_ID)!);
    strategy.modes.forEach((mode, m) => {
      const expected = decisions.filter((d) => d.modeId === mode.id).length;
      const counted = view.modes[m]!;
      expect(counted.rules.reduce((sum, n) => sum + n, 0) + counted.fallback).toBe(expected);
    });
  });

  test("a rule that never runs shows 0", () => {
    const parsed = parseStrategy({
      build: presetStrategy(DEFAULT_PRESET_ID).build,
      ultimate: "dash",
      modes: [
        {
          id: "m",
          name: "Only",
          rules: [
            { id: "always", match: "all", conditions: [{ condition: "enemyInRange", params: {}, negate: true }, { condition: "enemyInRange", params: {}, negate: false }], action: { action: "throw", params: {} }, chance: 100, switchToMode: null },
          ],
          fallback: { action: "goForward", params: {} },
        },
      ],
    });
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    const run = runPractice({ ...settings, strategy: parsed.strategy });
    const mode = statsView(statsOfRound(run.spawn, run.ticks, PLAYER_ID), run.strategy).modes[0]!;
    expect(mode.rules[0]).toBe(0);
    expect(mode.fallback).toBe(run.ticks.length);
  });
});

describe("drawSeed", () => {
  test("gives a safe integer", () => {
    expect(Number.isSafeInteger(drawSeed())).toBe(true);
  });
});

describe("SPEED_MS", () => {
  test("the test match plays at the slower pace: 1200, 900, 500 and 200 ms per turn", () => {
    expect(SPEED_MS).toEqual({ slow: 1200, normal: 900, fast: 500, fastest: 200 });
    expect(SPEED_MS[DEFAULT_SPEED_ID]).toBe(900);
  });
});

describe("replayReducer", () => {
  test("seek shows the chosen frame inside the match, and pauses", () => {
    const playing = replayReducer(initialReplay(10), { type: "play" });
    expect(replayReducer(playing, { type: "seek", frame: 4 })).toEqual({ frame: 4, lastFrame: 10, playing: false });
    expect(replayReducer(playing, { type: "seek", frame: 99 }).frame).toBe(10);
    expect(replayReducer(playing, { type: "seek", frame: -3 }).frame).toBe(0);
  });

  test("advance pauses at the last frame and play there starts over", () => {
    let state = replayReducer(initialReplay(2), { type: "play" });
    state = replayReducer(replayReducer(state, { type: "advance" }), { type: "advance" });
    expect(state).toEqual({ frame: 2, lastFrame: 2, playing: false });
    expect(replayReducer(state, { type: "play" })).toEqual({ frame: 0, lastFrame: 2, playing: true });
  });
});

describe("the kept test options (testChoices.ts)", () => {
  test("read back what was kept, and give null for anything that is not a valid set", () => {
    const kept = { opponents: 4, mix: { kind: "only", presetId: PRESETS[0]!.id }, length: "long", ruleSetId: "random" } as const;
    expect(parseTestChoices(JSON.stringify(kept))).toEqual(kept);
    expect(parseTestChoices(JSON.stringify({ ...kept, ruleSetId: "hills" }))?.ruleSetId).toBe("hills");
    expect(parseTestChoices(JSON.stringify({ ...kept, ruleSetId: null }))?.ruleSetId).toBeNull();
    for (const bad of [{ ...kept, opponents: 99 }, { ...kept, length: "forever" }, { ...kept, ruleSetId: "moon" }, { ...kept, mix: { kind: "only", presetId: "nobody" } }]) {
      expect(parseTestChoices(JSON.stringify(bad))).toBeNull();
    }
    expect(parseTestChoices("not json")).toBeNull();
    expect(parseTestChoices(null)).toBeNull();
  });
});
