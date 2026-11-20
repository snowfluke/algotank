/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { Rule, Strategy } from "../types.ts";
import { BUILT_IN_HANDICAP, BUILT_IN_LIKENESS, builtInStyleOf, checkBuiltIn, handicapOf, OWN_RULE_CHANGES, ruleChanges } from "./built-in.ts";
import { parseStrategy } from "./parse.ts";
import { PRESETS } from "./presets.ts";

const parse = (input: unknown): Strategy => {
  const parsed = parseStrategy(input);
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.strategy;
};
const preset = (id: string): Strategy => {
  const found = PRESETS.find((p) => p.id === id);
  if (found === undefined) throw new Error(id);
  return structuredClone(found.strategy) as Strategy;
};
type Editable = { modes: { rules: Rule[]; name: string }[]; build: unknown };
const edit = (id: string, change: (s: Editable) => void): Strategy => {
  const s = preset(id) as unknown as Editable;
  change(s);
  return parse(s);
};
const rareRule = (id: string, action: string): Rule => ({
  id, match: "all", chance: 1, switchToMode: null,
  conditions: [{ condition: "myWater", params: { compare: "atLeast", n: 0 }, negate: false }],
  action: { action, params: {} },
});

describe("builtInStyleOf: the cheap edits still count as the built-in style (owner, 2026-11-20)", () => {
  test("every built-in style is itself", () => {
    for (const p of PRESETS) expect(builtInStyleOf(p.strategy)).toBe(p.id);
  });

  test("changed numbers, reordered or duplicated rules, renamed modes and other upgrades are no change", () => {
    const evader = edit("evader", (s) => {
      for (const mode of s.modes) for (const rule of mode.rules) for (const c of rule.conditions) {
        for (const [key, value] of Object.entries(c.params)) if (typeof value === "number") (c.params as Record<string, number>)[key] = Math.max(1, value - 1);
      }
      s.modes[0]!.rules = [...s.modes[0]!.rules].reverse();
      s.modes[0]!.rules.push({ ...s.modes[0]!.rules[0]!, id: "copy" });
      s.modes[0]!.name = "Punyaku";
      s.build = { reach: 0, aim: 0, dodge: 0, camouflage: 2 };
    });
    expect(ruleChanges(evader, preset("evader"))).toBe(0);
    expect(builtInStyleOf(evader)).toBe("evader");
  });

  test(`${OWN_RULE_CHANGES} rules that almost never run change too few choices to count`, () => {
    const hunter = edit("item-hunter", (s) => {
      s.modes[0]!.rules = [rareRule("x1", "wander"), rareRule("x2", "wait"), ...s.modes[0]!.rules];
    });
    const check = checkBuiltIn(hunter);
    expect(check.closest.changes).toBeGreaterThanOrEqual(OWN_RULE_CHANGES);
    expect(check.alike.likeness).toBeGreaterThanOrEqual(BUILT_IN_LIKENESS);
    expect(check.style).toBe("item-hunter");
  });
});

describe("builtInStyleOf: rules of a child's own", () => {
  test("a tank written from an empty start is its own", () => {
    const own = parse({
      ...preset("evader"),
      modes: [{
        id: "main", name: "Main",
        rules: [
          { id: "r1", match: "all", chance: 100, switchToMode: null, conditions: [{ condition: "myWater", params: { compare: "fewerThan", n: 4 }, negate: false }], action: { action: "goToItem", params: { item: "any" } } },
          { id: "r2", match: "all", chance: 100, switchToMode: null, conditions: [{ condition: "enemyAhead", params: { n: 3 }, negate: false }], action: { action: "throw", params: {} } },
        ],
        fallback: { action: "moveToward", params: { target: "farthest" } },
      }],
    });
    expect(builtInStyleOf(own)).toBeNull();
    expect(handicapOf(own, "league")).toBe(0);
    expect(handicapOf(own, "room")).toBe(0);
  });

  test("a built-in style plays with the handicap of where it plays", () => {
    expect(handicapOf(preset("evader"), "league")).toBe(BUILT_IN_HANDICAP.league);
    expect(handicapOf(preset("evader"), "room")).toBe(BUILT_IN_HANDICAP.room);
  });
});
