import { describe, expect, test } from "bun:test";
import {
  ATTRIBUTES,
  BUILD_BUDGET,
  MAX_HIT_CHANCE,
  MAX_THROW_RANGE,
  MAX_WATER_CAPACITY,
  MIN_HIT_CHANCE,
  buildCost,
  canThrow,
  hitChancePercent,
  throwRange,
} from "./combat.ts";
import { RULE_SETS, STANDARD_RULE_SET_ID, ruleSet } from "./rule-sets.ts";
import type { RoundRules } from "./rule-sets.ts";
import type { Build } from "../types.ts";

const STANDARD = ruleSet(STANDARD_RULE_SET_ID);
const ALL_SETS: readonly RoundRules[] = Object.values(RULE_SETS);
const NONE: Build = { reach: 0, aim: 0, dodge: 0 };

/** Every build the attributes allow, spent or not. */
function allBuilds(): Build[] {
  const builds: Build[] = [];
  const [reach, aim, dodge] = [ATTRIBUTES.reach, ATTRIBUTES.aim, ATTRIBUTES.dodge];
  for (let r = 0; r < reach.levels.length; r++) {
    for (let a = 0; a < aim.levels.length; a++) {
      for (let d = 0; d < dodge.levels.length; d++) builds.push({ reach: r, aim: a, dodge: d });
    }
  }
  return builds;
}

/** The longest throw any build can make under one set. */
function longestThrow(rules: RoundRules): number {
  return Math.max(...allBuilds().map((build) => throwRange(build, rules)));
}

describe("build", () => {
  test("the attributes are reach, aim and dodge", () => {
    expect(Object.keys(ATTRIBUTES)).toEqual(["reach", "aim", "dodge"]);
  });

  test("some builds spend the whole budget, and none is cheaper than nothing", () => {
    const full = allBuilds().filter((build) => buildCost(build) === BUILD_BUDGET);
    expect(full.length).toBeGreaterThan(1);
    for (const build of allBuilds()) expect(buildCost(build)).toBeGreaterThanOrEqual(0);
  });

  test.each(ALL_SETS.map((rules) => rules.id))("under %s a level of reach is one more cell", (id) => {
    const rules = ruleSet(id);
    expect(throwRange(NONE, rules)).toBe(rules.baseRange);
    expect(throwRange({ ...NONE, reach: 1 }, rules)).toBe(rules.baseRange + 1);
    expect(longestThrow(rules)).toBe(rules.baseRange + ATTRIBUTES.reach.levels.length - 1);
  });
});

describe("the standard set keeps the numbers the game was tuned with", () => {
  test("range, hit table, skill and tank", () => {
    expect(STANDARD).toMatchObject({
      waterCapacity: 9,
      waterPerThrow: 3,
      waterRefillPerTick: 1,
      baseRange: 3,
      baseHitChance: [0, 90, 60, 40, 35, 30],
      hitChancePerLevel: 6,
      firstDistanceWithSkill: 2,
      gridFillRatio: 0.15,
    });
    expect(MAX_THROW_RANGE).toBe(5);
  });

  test("the chance for every build pair at every distance is the old formula", () => {
    const table = [0, 90, 60, 40, 35, 30];
    for (const thrower of allBuilds()) {
      for (const target of allBuilds()) {
        for (let distance = 1; distance <= 5; distance++) {
          const base = table[distance] as number;
          const expected =
            distance < 2 ? base : Math.min(95, Math.max(5, base + 6 * ((thrower.aim as number) - (target.dodge as number))));
          expect(hitChancePercent(thrower, target, distance, STANDARD)).toBe(expected);
        }
      }
    }
  });
});

describe("every rule set is valid", () => {
  test.each(ALL_SETS.map((rules) => rules.id))("%s", (id) => {
    const rules = ruleSet(id);
    expect(rules.id).toBe(id);
    expect(rules.name.length).toBeGreaterThan(0);
    expect(rules.summary.length).toBeGreaterThan(0);
    // The presets strike at 6 water and stop under 3.
    expect(rules.waterCapacity).toBeGreaterThanOrEqual(6);
    expect(rules.waterPerThrow).toBeGreaterThanOrEqual(1);
    expect(rules.waterPerThrow).toBeLessThanOrEqual(6);
    expect(rules.waterCapacity).toBeGreaterThanOrEqual(rules.waterPerThrow);
    expect(rules.waterRefillPerTick).toBeGreaterThanOrEqual(1);
    expect(rules.baseRange).toBeGreaterThanOrEqual(1);
    expect(rules.firstDistanceWithSkill).toBeGreaterThanOrEqual(1);
    expect(rules.hitChancePerLevel).toBeGreaterThanOrEqual(0);
    expect(rules.gridFillRatio).toBeGreaterThan(0);
    expect(rules.gridFillRatio).toBeLessThan(1);
    // The table reaches the longest throw of any build, and index 0 is unused.
    expect(rules.baseHitChance.length).toBeGreaterThan(longestThrow(rules));
    expect(rules.baseHitChance[0]).toBe(0);
  });

  test.each(ALL_SETS.map((rules) => rules.id))("%s: the chance stays between the minimum and the maximum for every build pair", (id) => {
    const rules = ruleSet(id);
    for (const thrower of allBuilds()) {
      for (const target of allBuilds()) {
        for (let distance = 1; distance <= longestThrow(rules); distance++) {
          const chance = hitChancePercent(thrower, target, distance, rules);
          expect(chance).toBeGreaterThanOrEqual(MIN_HIT_CHANCE);
          expect(chance).toBeLessThanOrEqual(MAX_HIT_CHANCE);
        }
      }
    }
  });

  test.each(ALL_SETS.map((rules) => rules.id))("%s: a farther throw is never likelier to hit than a nearer one, for the same builds", (id) => {
    const rules = ruleSet(id);
    for (const thrower of allBuilds()) {
      for (const target of allBuilds()) {
        for (let distance = 2; distance <= longestThrow(rules); distance++) {
          expect(hitChancePercent(thrower, target, distance, rules)).toBeLessThanOrEqual(
            hitChancePercent(thrower, target, distance - 1, rules),
          );
        }
      }
    }
  });
});

describe("hit chance", () => {
  test.each(ALL_SETS.map((rules) => rules.id))("%s: closer than the first skill distance the builds change nothing", (id) => {
    const rules = ruleSet(id);
    for (let distance = 1; distance < rules.firstDistanceWithSkill && distance <= longestThrow(rules); distance++) {
      const chances = new Set<number>();
      for (const thrower of allBuilds()) {
        for (const target of allBuilds()) chances.add(hitChancePercent(thrower, target, distance, rules));
      }
      expect([...chances], `distance ${distance}`).toHaveLength(1);
    }
  });

  test.each(ALL_SETS.map((rules) => rules.id))("%s: from the first skill distance a level of aim raises the chance and a level of dodge lowers it by the points of the set", (id) => {
    const rules = ruleSet(id);
    for (let distance = rules.firstDistanceWithSkill; distance <= longestThrow(rules); distance++) {
      const base = hitChancePercent(NONE, NONE, distance, rules);
      const withAim = hitChancePercent({ ...NONE, aim: 1 }, NONE, distance, rules);
      const withDodge = hitChancePercent(NONE, { ...NONE, dodge: 1 }, distance, rules);
      const step = rules.hitChancePerLevel;
      expect(withAim, `aim at ${distance}`).toBe(Math.min(MAX_HIT_CHANCE, base + step));
      expect(withDodge, `dodge at ${distance}`).toBe(Math.max(MIN_HIT_CHANCE, base - step));
      expect(withAim, `aim at ${distance}`).toBeGreaterThan(base);
      expect(withDodge, `dodge at ${distance}`).toBeLessThan(base);
    }
  });

  test.each(ALL_SETS.map((rules) => rules.id))("%s: equal aim and dodge cancel at every distance", (id) => {
    const rules = ruleSet(id);
    const skilled: Build = { reach: 0, aim: 3, dodge: 3 };
    for (let distance = 1; distance <= longestThrow(rules); distance++) {
      expect(hitChancePercent(skilled, skilled, distance, rules)).toBe(hitChancePercent(NONE, NONE, distance, rules));
    }
  });

  test("a set where skill counts from 1 cell lets the build change a throw at 1 cell", () => {
    const rules = ruleSet("sharp-eyes");
    const sharp: Build = { reach: 0, aim: 3, dodge: 0 };
    expect(hitChancePercent(sharp, NONE, 1, rules)).toBeGreaterThan(hitChancePercent(NONE, NONE, 1, rules));
    expect(hitChancePercent(sharp, NONE, 1, STANDARD)).toBe(hitChancePercent(NONE, NONE, 1, STANDARD));
  });

  test.each(ALL_SETS.map((rules) => rules.id))("%s: no chance exists for distance 0 or beyond the table", (id) => {
    const rules = ruleSet(id);
    expect(() => hitChancePercent(NONE, NONE, 0, rules)).toThrow();
    expect(() => hitChancePercent(NONE, NONE, rules.baseHitChance.length, rules)).toThrow();
  });
});

describe("canThrow", () => {
  test.each(ALL_SETS.map((rules) => rules.id))("%s: a tank can throw at a bot exactly when it holds the cost of one throw", (id) => {
    const rules = ruleSet(id);
    expect(canThrow(rules.waterPerThrow - 1, rules)).toBe(false);
    expect(canThrow(rules.waterPerThrow, rules)).toBe(true);
    expect(canThrow(rules.waterCapacity, rules)).toBe(true);
  });
});

describe("limits over every rule set", () => {
  test("the longest throw and the largest tank are the maximum over the table", () => {
    expect(MAX_THROW_RANGE).toBe(Math.max(...ALL_SETS.map(longestThrow)));
    expect(MAX_WATER_CAPACITY).toBe(Math.max(...ALL_SETS.map((rules) => rules.waterCapacity)));
    for (const rules of ALL_SETS) {
      expect(longestThrow(rules)).toBeLessThanOrEqual(MAX_THROW_RANGE);
      expect(rules.waterCapacity).toBeLessThanOrEqual(MAX_WATER_CAPACITY);
    }
  });
});
