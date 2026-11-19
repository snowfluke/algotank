// The rules of a throw: the build attributes, the points, and the functions that
// turn a build and a rule set into a throw range, a hit chance and a water cost.
// The numbers that differ between rounds live in rule-sets.ts, and every function
// here takes the round's RoundRules. The build attributes and the points do not
// change from round to round, so they stay here.
//
// Two relations hold whatever the numbers are, and the tests check them as
// relations: a hit moves exactly POINTS_PER_HIT between two bots (ITEM_RULES.bucketHitPoints
// for a holder of a bucket, items/items.ts), so the scores of a round sum to 0, and closer
// than a set's first skill distance the chance does not depend on the builds.

import type { AttributeDef, Build } from "../types.ts";
import { RULE_SETS } from "./rule-sets.ts";
import type { RoundRules } from "./rule-sets.ts";

/** Points a player spends across the attributes below. */
export const BUILD_BUDGET = 7;

/** Points the target loses and the thrower gains for one hit. */
export const POINTS_PER_HIT = 1;

/** The water a tank holds after a tick. `spent` is true when the bot's throw at a bot used water. */
export function waterAfterTick(water: number, spent: boolean, rules: RoundRules, capacity = rules.waterCapacity): number {
  if (spent) return water - rules.waterPerThrow;
  return Math.min(capacity, water + rules.waterRefillPerTick);
}

/** True when a tank holds enough water for a throw at a bot. The round, the conditions and the screens all ask this function. */
export function canThrow(water: number, rules: RoundRules): boolean {
  return water >= rules.waterPerThrow;
}

const REACH_LEVELS = [
  { cost: 0, label: "0" },
  { cost: 2, label: "1" },
  { cost: 4, label: "2" },
] as const;

const SKILL_LEVELS = [
  { cost: 0, label: "0" },
  { cost: 1, label: "1" },
  { cost: 2, label: "2" },
  { cost: 3, label: "3" },
] as const;

const CAMOUFLAGE_LEVELS = [
  { cost: 0, label: "0" },
  { cost: 1, label: "1" },
  { cost: 2, label: "2" },
] as const;

// Owner's decision (2026-11-19): how far point-hunting rules notice a tank at each Camouflage level.
export const NOTICE = [Number.POSITIVE_INFINITY, 8, 5] as const;

export const ATTRIBUTES = {
  reach: {
    id: "reach",
    label: "Reach",
    effect: "Each level lets a throw reach one cell farther.",
    levels: REACH_LEVELS,
  },
  aim: {
    id: "aim",
    label: "Aim",
    effect: "Each level adds points to the hit chance of your throws. The round's rules set how many points and from how far.",
    levels: SKILL_LEVELS,
  },
  dodge: {
    id: "dodge",
    label: "Dodge",
    effect: "Each level takes points off the hit chance of throws at you. The round's rules set how many points and from how far.",
    levels: SKILL_LEVELS,
  },
  camouflage: {
    id: "camouflage",
    label: "Camouflage",
    effect: `Tanks that hunt by points notice your tank only from ${NOTICE[1]} squares at level 1 and ${NOTICE[2]} squares at level 2.`,
    levels: CAMOUFLAGE_LEVELS,
  },
} as const satisfies Record<string, AttributeDef>;

export type AttributeId = keyof typeof ATTRIBUTES;

export const MIN_HIT_CHANCE = 5;
export const MAX_HIT_CHANCE = 95;

const MAX_REACH_LEVEL = REACH_LEVELS.length - 1;
const ALL_RULE_SETS: readonly RoundRules[] = Object.values(RULE_SETS);

/**
 * Limits over every rule set. parseStrategy runs when a player submits, before
 * the round's rule set is known, so a parameter must accept what any set allows.
 */
export const MAX_THROW_RANGE = Math.max(...ALL_RULE_SETS.map((rules) => rules.baseRange)) + MAX_REACH_LEVEL;
export const MAX_WATER_CAPACITY = Math.max(...ALL_RULE_SETS.map((rules) => rules.waterCapacity));

/** The level a build holds in one attribute. */
export function attributeLevel(build: Build, id: AttributeId): number {
  const value = build[id];
  if (id === "camouflage" && value === undefined && !Object.hasOwn(build, id)) return 0;
  if (value === undefined) throw new Error(`build has no level for attribute "${id}"`);
  return value;
}

/** Total points a build spends. parseStrategy rejects a build above BUILD_BUDGET. */
export function buildCost(build: Build): number {
  let cost = 0;
  for (const id of Object.keys(ATTRIBUTES) as AttributeId[]) {
    const chosen = ATTRIBUTES[id].levels[attributeLevel(build, id)];
    if (chosen === undefined) throw new Error(`attribute "${id}" has no level ${build[id]}`);
    cost += chosen.cost;
  }
  return cost;
}

/** How many cells ahead a throw from this build reaches. */
export function throwRange(build: Build, rules: RoundRules): number {
  return rules.baseRange + attributeLevel(build, "reach");
}

/**
 * Probability, 0 to 100, that a throw at this distance hits. Closer than the
 * rule set's first skill distance the base chance applies to every build, so a
 * fight there is the same for all of them.
 */
export function hitChancePercent(thrower: Build, target: Build, distance: number, rules: RoundRules): number {
  const base = rules.baseHitChance[distance];
  if (base === undefined || distance < 1) throw new Error(`rule set "${rules.id}" has no hit chance for distance ${distance}`);
  if (distance < rules.firstDistanceWithSkill) return base;
  const adjusted = base + rules.hitChancePerLevel * (attributeLevel(thrower, "aim") - attributeLevel(target, "dodge"));
  return Math.min(MAX_HIT_CHANCE, Math.max(MIN_HIT_CHANCE, adjusted));
}
