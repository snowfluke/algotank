// Ready-made strategies. A player taps one to fill the rules and the build.
// Each preset is built through parseStrategy when this module loads, so a
// preset that breaks the rules (after a vocabulary or build change) fails the
// first import instead of shipping.
//
// The builds spend the whole budget of 6 points. Reach costs 2 per level (0 to 2),
// Aim and Dodge cost 1 per level (0 to 3). Seven builds spend all of it.
// Charger is the benchmark: scripts/simulate.ts measures every other preset against it.
//
// The order is the order players see. Keep the ids "charger" and "random-walker":
// scripts/simulate.ts reads them as the benchmark and the baseline.

import type { ActionRef, Build, ConditionRef, Mode, ParamValues, Preset, Rule, StrategyInput } from "../types.ts";
import { withLiteralIds } from "./define.ts";
import { parseStrategy } from "./parse.ts";

// The designed preset whose win rate in the mixed field of scripts/simulate.ts is
// closest to luck (12.5%). Eight directions, 1000 finals at 90 ticks: evader 12.7%,
// backstabber 11.8%. Pick it again after a rule change, and check that it still wins
// at least 12% alone against the server's bot lineup (simulate.ts --lineup=).
export const DEFAULT_PRESET_ID = "evader";

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
 * `chase` and the extra strike rules are the only differences between the Ambusher,
 * the Picker and the Backstabber.
 */
function burstAndRetreat(chase: string, extraStrikeRules: readonly Rule[] = []): StrategyInput {
  return {
    build: build(0, 3, 3),
    modes: [
      mode(
        "rest",
        "Rest",
        [
          rule("loaded", [holdsAtLeast(WATER_FOR_TWO_THROWS)], actOn("moveToward", chase), { switchTo: "strike" }),
          rule("dodge", [when("aimedAtMe", { k: 1 })], act("stepOutOfLine")),
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
    summary: "Steps out of the line of fire when a bot aims at it, throws at a bot in front of it only when that bot does not aim back, and otherwise walks toward the nearest bot.",
    strategy: {
      build: build(0, 3, 3),
      modes: [
        mode(
          "evade",
          "Evade",
          [
            rule("evade", [when("aimedAtMe", { k: 1 })], act("stepOutOfLine")),
            rule("free-shot", [THROW_AHEAD, when("targetAimed", { target: "inThrowLine" }, true)], act("throw")),
          ],
          actOn("moveToward", "nearest"),
        ),
      ],
    },
  },
  {
    id: "leader-chaser",
    name: "Leader chaser",
    summary: "Steps out of a line of fire, throws at a bot one cell ahead, and otherwise goes after the bot with the most points.",
    strategy: {
      build: build(0, 3, 3),
      modes: [
        mode(
          "chase",
          "Chase",
          [rule("duck", [when("aimedAtMe", { k: 1 })], act("stepOutOfLine")), rule("point-blank", [POINT_BLANK], act("throw"))],
          actOn("attack", "highestScore"),
        ),
      ],
    },
  },
  {
    id: "dry-hunter",
    name: "Dry hunter",
    summary: "Goes after the nearest bot with less water than it has, and throws when the bot in front cannot throw back.",
    strategy: {
      build: build(0, 3, 3),
      modes: [
        mode(
          "hunt",
          "Hunt",
          [
            rule("free-hit", [THROW_AHEAD, targetCannotThrow("inThrowLine"), holdsAtLeast(WATER_FOR_ONE_THROW)], act("throw")),
            rule("plenty", [POINT_BLANK, holdsAtLeast(WATER_FOR_TWO_THROWS)], act("throw")),
            rule("recover", [holdsFewerThan(WATER_FOR_ONE_THROW), when("aimedAtMe", { k: 1 })], act("stepOutOfLine")),
            // Without this rule a hunter that nobody undercuts stands still, and a field of hunters goes passive.
            rule("no-prey", [when("targetDistance", { target: "nearestWithLessWater", compare: "atMost", n: 20 }, true)], actOn("moveToward", "nearest")),
          ],
          actOn("attack", "nearestWithLessWater"),
        ),
      ],
    },
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
      rule("go-behind", [when("targetDistance", { target: "nearestFacingAway", compare: "atMost", n: 5 })], actOn("moveToward", "nearestFacingAway")),
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
]);

export type PresetId = (typeof sources)[number]["id"];

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
if (!PRESETS.some((preset) => preset.id === DEFAULT_PRESET_ID)) {
  throw new Error(`DEFAULT_PRESET_ID "${DEFAULT_PRESET_ID}" is not a preset.`);
}
