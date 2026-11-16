// Ready-made strategies. A player taps one to fill the rules and the build.
// Each preset is built through parseStrategy when this module loads, so a
// preset that breaks the rules (after a vocabulary or build change) fails the
// first import instead of shipping.
//
// The builds spend the whole budget of 6 points. Reach costs 2 per level (0 to 2),
// Aim and Dodge cost 1 per level (0 to 3). Seven builds spend all of it.
// Charger is the benchmark: scripts/simulate.ts measures every other preset against it.
//
// PICKER_ORDER, not this table, is the order players see. Keep the ids "charger" and
// "random-walker": scripts/simulate.ts reads them as the benchmark and the baseline.
// Append new presets, so the recorded fixtures keep their seats.

import type { ActionRef, Build, ConditionRef, Mode, ParamValues, Preset, Rule, StrategyInput } from "../types.ts";
import { withLiteralIds } from "./define.ts";
import { parseStrategy } from "./parse.ts";

// The order of the play style picker: the designed presets by how far their win rate in the
// mixed field of scripts/simulate.ts is from luck (12.5%), the closest first, so the first card
// a player sees is neither a sure win nor a sure loss. A tie puts the lower win rate first. The
// Random walker, the baseline, is always last. The Charger is not shown: it stays a preset for
// the bots and the scripts, and the Item hunter took its card (docs/specs/revamp/84-items.md).
// Measured 2026-11-15, items on, 800 finals of 60 turns (a practice round, so run
// simulate.ts with ticks=60), +/- 1.3: item-hunter 13.8, backstabber 14.6, picker 15.8,
// dry-hunter 8.4, evader 16.6, leader-chaser 17.9, ambusher 21.7, random-walker 1.8.
// Retuned 2026-11-16 (below), the same measure: item-hunter 18.8, ambusher 17.3, picker 17.3,
// backstabber 16.2, evader 14.1, dry-hunter 11.8, leader-chaser 11.7, random-walker 1.1. The
// order is kept for the tournament of 17 November, so the first card does not change the night
// before; by the rule above the dry hunter would come first now. Measure again after a rule change.
export const PICKER_ORDER = ["item-hunter", "backstabber", "picker", "dry-hunter", "evader", "leader-chaser", "ambusher", "random-walker"] as const;

// The first card of the picker, the play style a new player starts from. It must win at least
// 12% alone against the server's bot lineup (simulate.ts --lineup=): 24.3% at 60 turns (2026-11-16).
export const DEFAULT_PRESET_ID = PICKER_ORDER[0];

function when(condition: string, params: ParamValues = {}, negate = false): ConditionRef {
  return { condition, params, negate };
}

function act(action: string, params: ParamValues = {}): ActionRef {
  return { action, params };
}

/** An action whose only parameter is the target selector. */
function actOn(action: string, target: string): ActionRef {
  return act(action, { target });
}

interface RuleOptions {
  readonly match?: "all" | "any";
  readonly chance?: number;
  readonly switchTo?: string;
}

function rule(id: string, conditions: readonly ConditionRef[], action: ActionRef, options: RuleOptions = {}): Rule {
  return {
    id,
    match: options.match ?? "all",
    conditions,
    action,
    chance: options.chance ?? 100,
    switchToMode: options.switchTo ?? null,
  };
}

function mode(id: string, name: string, rules: readonly Rule[], fallback: ActionRef): Mode {
  return { id, name, rules, fallback };
}

function build(reach: number, aim: number, dodge: number): Build {
  return { reach, aim, dodge };
}

// --- The presets ------------------------------------------------------------

interface PresetSource {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly strategy: StrategyInput;
}

const THROW_AHEAD = when("enemyInRange");
const POINT_BLANK = when("enemyAhead", { n: 1 });

// Water thresholds are fixed data: 3 water is one throw of the standard set, and 6
// is two. A preset does not read the round's rule set, so under a set with another
// cost it plays with these thresholds. The rule sets keep a tank of at least 6
// water and a throw of at most 6 (combat/rule-sets.ts) so every preset can still strike.
const WATER_FOR_ONE_THROW = 3;
const WATER_FOR_TWO_THROWS = 6;
const holdsAtLeast = (water: number) => when("myWater", { compare: "atLeast", n: water });
const holdsFewerThan = (water: number) => when("myWater", { compare: "fewerThan", n: water });
/** True when the target cannot throw on this tick: its tank holds less water than one throw costs. */
const targetCannotThrow = (target: string) => when("targetWater", { target, compare: "atMost", n: WATER_FOR_ONE_THROW - 1 });

/**
 * Refill out of the lines of fire, run at a chosen bot once the tank holds the water
 * for two throws, throw from one cell, and leave when the water for one throw is gone.
 * `chase` and the extra rules are the only differences between the presets built on it.
 *
 * Retuned 2026-11-16 (owner: every preset equal for the monthly tournament). The Leader
 * chaser, the Dry hunter and the Item hunter now refill and strike like this, and the
 * Backstabber turns to a bot facing away only within 2 cells. Measured in the monthly
 * league's conditions (apps/server LeagueDay: open rounds, items, bots, a new start every
 * 333 turns), 7 designed presets x 4 tanks, 4 days of 96,000 turns, points per tank per day
 * (field mean 139, day-to-day sd 9 to 44): ambusher +31, item-hunter +26, dry-hunter +5,
 * backstabber -3, leader-chaser -8, picker -23, evader -28. Before: a spread of 7,774 points
 * a day, from ambusher +2,603 to item-hunter -5,171 in the same field.
 */
function burstAndRetreat(chase: string, extraStrikeRules: readonly Rule[] = [], extraRestRules: readonly Rule[] = []): StrategyInput {
  return {
    build: build(0, 3, 3),
    modes: [
      mode(
        "rest",
        "Rest",
        [
          rule("loaded", [holdsAtLeast(WATER_FOR_TWO_THROWS)], actOn("moveToward", chase), { switchTo: "strike" }),
          rule("dodge", [when("aimedAtMe", { k: 1 })], act("stepOutOfLine")),
          ...extraRestRules,
        ],
        actOn("moveAway", "nearest"),
      ),
      mode(
        "strike",
        "Strike",
        [
          rule("spent", [holdsFewerThan(WATER_FOR_ONE_THROW)], actOn("moveAway", "nearest"), { switchTo: "rest" }),
          rule("point-blank", [POINT_BLANK], act("throw")),
          ...extraStrikeRules,
        ],
        actOn("moveToward", chase),
      ),
    ],
  };
}

const sources = withLiteralIds<PresetSource>()([
  {
    id: "evader",
    name: "Evader",
    summary: "Steps out of the line of fire when a bot aims at it, throws at a bot in front of it only when that bot does not aim back, backs away to refill when its tank runs low, and otherwise walks toward the nearest bot.",
    strategy: {
      build: build(0, 3, 3),
      modes: [
        mode(
          "evade",
          "Evade",
          [
            rule("evade", [when("aimedAtMe", { k: 1 })], act("stepOutOfLine")),
            rule("free-shot", [THROW_AHEAD, when("targetAimed", { target: "inThrowLine" }, true)], act("throw")),
            rule("refill", [holdsFewerThan(WATER_FOR_ONE_THROW)], actOn("moveAway", "nearest")),
          ],
          actOn("moveToward", "nearest"),
        ),
      ],
    },
  },
  {
    id: "leader-chaser",
    name: "Leader chaser",
    summary: "Backs away to refill its tank, then runs at the nearest bot with more points than it has and throws from one cell until the tank runs low.",
    strategy: burstAndRetreat("nearestWithMorePoints", [
      // The leader has nobody richer to chase, so it takes the nearest bot instead of standing still.
      rule("top", [when("targetDistance", { target: "nearestWithMorePoints", compare: "atMost", n: 20 }, true)], actOn("moveToward", "nearest")),
    ]),
  },
  {
    id: "dry-hunter",
    name: "Dry hunter",
    summary: "Backs away to refill its tank, then runs at the nearest bot with less water, and throws at once at a bot in range that cannot throw back.",
    strategy: burstAndRetreat("nearestWithLessWater", [rule("free-hit", [THROW_AHEAD, targetCannotThrow("inThrowLine")], act("throw"))]),
  },
  {
    id: "ambusher",
    name: "Ambusher",
    summary: "Backs away to refill its tank, then runs at the nearest bot and throws from one cell until the tank runs low.",
    strategy: burstAndRetreat("nearest"),
  },
  {
    id: "picker",
    name: "Picker",
    summary: "Backs away to refill its tank, then runs only at the nearest bot that holds less water than it does.",
    strategy: burstAndRetreat("nearestWithLessWater"),
  },
  {
    id: "backstabber",
    name: "Backstabber",
    summary: "Backs away to refill its tank, then runs at the nearest bot, goes for a bot that faces away when one is near, and throws from one cell.",
    strategy: burstAndRetreat("nearest", [
      // 5 cells in Chebyshev distance covers about the area that 8 covered in |dx| + |dy| (121 cells against 145).
      rule("go-behind", [when("targetDistance", { target: "nearestFacingAway", compare: "atMost", n: 2 })], actOn("moveToward", "nearestFacingAway")),
    ]),
  },
  {
    id: "charger",
    name: "Charger",
    summary: "Throws when a bot stands in front of it and otherwise walks toward the nearest bot, which makes it the benchmark for every other preset.",
    strategy: {
      build: build(0, 3, 3),
      modes: [mode("charge", "Charge", [rule("throw-ahead", [THROW_AHEAD], act("throw"))], actOn("moveToward", "nearest"))],
    },
  },
  {
    id: "random-walker",
    name: "Random walker",
    summary: "Wanders at random and throws only when a bot happens to stand in front of it, so it is the baseline every other preset must beat.",
    strategy: {
      build: build(1, 2, 2),
      modes: [mode("wander", "Wander", [rule("throw-ahead", [THROW_AHEAD], act("throw"))], act("wander"))],
    },
  },
  {
    // Until 2026-11-16 the Charger with one rule on top (docs/specs/revamp/84-items.md); now the
    // refill-and-strike of burstAndRetreat, with the item rule while it refills.
    id: "item-hunter",
    name: "Item hunter",
    summary: "Drives to an item within 5 cells while it refills its tank, then runs at the nearest bot and throws from one cell until the tank runs low.",
    strategy: burstAndRetreat("nearest", [], [rule("grab", [when("itemNear", { item: "any", n: 5 })], act("goToItem", { item: "any" }))]),
  },
]);

export type PresetId = (typeof sources)[number]["id"];
// A picker id that is not a preset fails here at compile time.
PICKER_ORDER satisfies readonly PresetId[];

/** Every preset id, in the order of PRESETS. */
export const PRESET_IDS: readonly PresetId[] = sources.map((source) => source.id);

function parsePreset(source: PresetSource & { readonly id: PresetId }): Preset & { readonly id: PresetId } {
  const result = parseStrategy(source.strategy);
  if (!result.ok) {
    throw new Error(`Preset "${source.id}" is not a valid strategy:\n${result.errors.join("\n")}`);
  }
  return { id: source.id, name: source.name, summary: source.summary, strategy: result.strategy };
}

export const PRESETS: readonly (Preset & { readonly id: PresetId })[] = sources.map(parsePreset);

if (new Set(PRESETS.map((preset) => preset.id)).size !== PRESETS.length) {
  throw new Error("Two presets share an id.");
}
for (const id of PICKER_ORDER) {
  if (!PRESETS.some((preset) => preset.id === id)) throw new Error(`PICKER_ORDER names "${id}", which is not a preset.`);
}
