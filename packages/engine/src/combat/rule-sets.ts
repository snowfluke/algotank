// A rule set supplies the numbers for one single-condition round or one
// area of a hybrid monthly round: the water tank, the throw range, the hit chance, how much Aim and
// Dodge count, and how crowded the arena is. Add a row here and every package
// that reads RULE_SETS (the arena draw, the editor, the simulation) picks it up.
//
// What a row may not do, because the presets and the build budget assume it
// (a test checks each one):
// - The tank holds at least 6 water and a throw costs at most 6, because the
//   presets strike at 6 water and stop under 3.
// - The hit table reaches base range + the largest Reach level.
// - Every chance stays between 5 and 95 after Aim and Dodge, so no throw is
//   certain and none is hopeless.
//
// "standard" holds the numbers the game was tuned with (docs/decisions). Do not
// edit it to tune another set.

/** The numbers of one rule set. */
export interface RoundRules {
  readonly id: string;
  /** Short and plain, shown to players. */
  readonly name: string;
  /** One sentence that says what differs from the standard set. */
  readonly summary: string;
  /** Most water a tank holds, and the water a bot starts a round with. */
  readonly waterCapacity: number;
  /** Water one throw at a bot spends, whether it hits or misses. A throw at an empty line spends none. */
  readonly waterPerThrow: number;
  /** Water a tank gains on a tick in which its bot spent none. */
  readonly waterRefillPerTick: number;
  /** Cells a throw reaches at Reach level 0. */
  readonly baseRange: number;
  /** Hit chance in percent before Aim and Dodge. Index is the distance in cells; index 0 is unused. */
  readonly baseHitChance: readonly number[];
  /** Points that one level of Aim adds and one level of Dodge takes off. */
  readonly hitChancePerLevel: number;
  /** Aim and Dodge change the chance from this distance in cells on. At closer range the base chance applies to every build. */
  readonly firstDistanceWithSkill: number;
  /**
   * Share of arena cells that bots occupy at spawn. The arena never gets smaller than
   * RULES.minGridWidth by RULES.minGridHeight (round/rules.ts), and 8 players at 0.15
   * already fill that minimum. A ratio above 0.15 therefore changes nothing in a final
   * of 8: a denser row needs a smaller minimum arena first.
   */
  readonly gridFillRatio: number;
}

// Each row below says in one sentence what it changes. With eight directions the
// presets in a field of 8 (scripts/simulate.ts, Table 5, 90 and 150 ticks) have
// three different leaders across the six rows, and the Ambusher leads four of them.
// A bot that hides in a corner wins less than luck (12.5%) in every row; a bot that
// stands still does too, except under dry-spell in rounds of 90 ticks (about 14%,
// scripts/probes.ts; docs/decisions, "Eight directions, 2026-11-12"). Run both
// scripts again after any change to a row.
const defs = [
  {
    id: "standard",
    name: "Standard",
    summary: "A throw reaches 3 cells and costs 3 of the 9 water that a tank holds.",
    waterCapacity: 9,
    waterPerThrow: 3,
    waterRefillPerTick: 1,
    baseRange: 3,
    baseHitChance: [0, 90, 60, 40, 35, 30],
    hitChancePerLevel: 6,
    firstDistanceWithSkill: 2,
    gridFillRatio: 0.15,
  },
  {
    id: "arms-length",
    name: "Arm's length",
    summary: "A throw reaches 1 cell instead of 3, so bots must stand next to each other to hit, unless they have Reach.",
    waterCapacity: 9,
    waterPerThrow: 3,
    waterRefillPerTick: 1,
    baseRange: 1,
    // Long enough for Reach 2 (1 + 2 = 3 cells). The values are the standard ones for those distances.
    baseHitChance: [0, 90, 60, 40],
    hitChancePerLevel: 6,
    firstDistanceWithSkill: 2,
    gridFillRatio: 0.15,
  },
  {
    id: "dry-spell",
    name: "Dry spell",
    summary: "A throw reaches 2 cells instead of 3, and it costs 5 of the 6 water that a tank holds.",
    waterCapacity: 6,
    // A cost of 4 was measured and not kept: the Statue still won 13.7% of 90-turn finals
    // (docs/decisions, "Large arenas, 2026-11-12").
    waterPerThrow: 5,
    waterRefillPerTick: 1,
    baseRange: 2,
    // Long enough for Reach 2 (2 + 2 = 4 cells).
    baseHitChance: [0, 90, 60, 40, 35],
    hitChancePerLevel: 6,
    firstDistanceWithSkill: 2,
    gridFillRatio: 0.15,
  },
  {
    id: "downpour",
    name: "Downpour",
    summary: "A throw reaches 1 cell instead of 3, and it costs 2 of the 12 water that a tank holds.",
    waterCapacity: 12,
    waterPerThrow: 2,
    waterRefillPerTick: 1,
    baseRange: 1,
    baseHitChance: [0, 90, 60, 40],
    hitChancePerLevel: 6,
    firstDistanceWithSkill: 2,
    gridFillRatio: 0.15,
  },
  {
    id: "open-field",
    name: "Open field",
    summary: "The arena has about twice as many cells, so bots start farther apart.",
    waterCapacity: 9,
    waterPerThrow: 3,
    waterRefillPerTick: 1,
    baseRange: 3,
    baseHitChance: [0, 90, 60, 40, 35, 30],
    hitChancePerLevel: 6,
    firstDistanceWithSkill: 2,
    gridFillRatio: 0.07,
  },
  {
    id: "sharp-eyes",
    name: "Sharp eyes",
    summary: "Aim and Dodge count from 1 cell and move the hit chance by 12 points per level instead of 6, so the build decides more throws.",
    waterCapacity: 9,
    waterPerThrow: 3,
    waterRefillPerTick: 1,
    baseRange: 3,
    baseHitChance: [0, 90, 60, 40, 35, 30],
    hitChancePerLevel: 12,
    firstDistanceWithSkill: 1,
    gridFillRatio: 0.15,
  },
] as const satisfies readonly RoundRules[];

export type RuleSetId = (typeof defs)[number]["id"];

/** Builds the table keyed by id. It fails at load when two rows share an id, so an id is written once. */
function tableById(rows: typeof defs): Readonly<Record<RuleSetId, RoundRules>> {
  const table: Record<string, RoundRules> = Object.create(null);
  for (const row of rows) {
    if (table[row.id] !== undefined) throw new Error(`two rule sets share the id "${row.id}"`);
    // A round reads these objects on every tick, so nothing may change a number after load.
    Object.freeze(row.baseHitChance);
    table[row.id] = Object.freeze(row);
  }
  // Every key is the id of a row of `defs`, which is what RuleSetId names.
  return Object.freeze(table) as Readonly<Record<RuleSetId, RoundRules>>;
}

/** Every rule set by id. The standard row is the one the other packages take their default values from. */
export const RULE_SETS: Readonly<Record<RuleSetId, RoundRules>> = tableById(defs);

export const STANDARD_RULE_SET_ID: RuleSetId = "standard";

export const RULE_SET_IDS: readonly RuleSetId[] = defs.map((def) => def.id);

/** True when the value is the id of a rule set. Use it at a boundary, before the value becomes a RuleSetId. */
export function isRuleSetId(value: unknown): value is RuleSetId {
  return typeof value === "string" && Object.hasOwn(RULE_SETS, value);
}

/** The rules of a single-condition snapshot. For a square in any arena, use rulesAt. */
export function rulesOf(snapshot: { readonly ruleSetId: string }): RoundRules {
  return ruleSet(snapshot.ruleSetId);
}

/** The rule set with this id. It throws on an unknown id, so a wrong id never plays under another set's numbers. */
export function ruleSet(id: string): RoundRules {
  if (!isRuleSetId(id)) throw new Error(`unknown rule set "${id}"`);
  return RULE_SETS[id];
}
