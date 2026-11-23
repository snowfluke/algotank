import { describe, expect, test } from "bun:test";
import { PRESETS, parseStrategy, type StatsView, type StrategyInput } from "@game/engine";
import { waterTipOf, withWaterRule } from "./ruleTip.ts";

const preset = (id: string): StrategyInput => {
  const found = PRESETS.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no play style ${id}`);
  return found.strategy;
};

/** Statistics that match a strategy, with the turns of each mode's first rule. */
function statsFor(strategy: StrategyInput, firstRuleTurns: number): StatsView {
  return {
    spinTurns: 0,
    turns: 60,
    shots: 10,
    hits: 2,
    timesHit: 5,
    squaresMoved: 20,
    noRuleTurns: 0,
    modes: strategy.modes.map((mode) => ({ id: mode.id, name: mode.name, rules: mode.rules.map((_, i) => (i === 0 ? firstRuleTurns : 0)), fallback: 0 })),
  };
}

describe("the water tip", () => {
  test("a rule list that only shoots gets the tip, and the new rule goes on top and passes the engine's check", () => {
    const charger = preset("charger");
    const tip = waterTipOf(charger, statsFor(charger, 12));
    expect(tip).not.toBeNull();
    if (tip === null) return;
    const next = withWaterRule(charger, tip);
    expect(next).not.toBeNull();
    const mode = next?.modes.find((m) => m.id === tip.modeId);
    expect(mode?.rules[0]?.conditions[0]?.condition).toBe("myWater");
    expect(mode?.rules.length).toBe((charger.modes.find((m) => m.id === tip.modeId)?.rules.length ?? 0) + 1);
    expect(parseStrategy(next).ok).toBe(true);
    // Once the rule is there, the tip is gone.
    if (next !== null) expect(waterTipOf(next, statsFor(next, 12))).toBeNull();
  });

  test("the designed play styles get no tip: the default dodges first, and the others already watch their water", () => {
    for (const id of ["evader", "leader-chaser", "dry-hunter", "ambusher", "picker", "backstabber"]) {
      const strategy = preset(id);
      expect([id, waterTipOf(strategy, statsFor(strategy, 12))]).toEqual([id, null]);
    }
  });

  test("a mode that shoots first and then dodges gets no tip, because that shape was not measured", () => {
    const charger = preset("charger");
    const mode = charger.modes[0];
    if (mode === undefined) throw new Error("Charger has no mode");
    const dodge = { id: "dodge", match: "all" as const, conditions: [{ condition: "aimedAtMe", params: { k: 1 }, negate: false }], action: { action: "stepOutOfLine", params: {} }, chance: 100, switchToMode: null };
    const mixed: StrategyInput = { ...charger, modes: [{ ...mode, rules: [...mode.rules, dodge] }, ...charger.modes.slice(1)] };
    expect(waterTipOf(mixed, statsFor(mixed, 12))).toBeNull();
  });

  test("no tip when the shoot rule never ran, or when the statistics belong to another rule list", () => {
    const charger = preset("charger");
    expect(waterTipOf(charger, statsFor(charger, 0))).toBeNull();
    const edited = statsFor(charger, 12);
    const changed: StatsView = { ...edited, modes: edited.modes.map((mode) => ({ ...mode, rules: [...mode.rules, 0] })) };
    expect(waterTipOf(charger, changed)).toBeNull();
  });
});
