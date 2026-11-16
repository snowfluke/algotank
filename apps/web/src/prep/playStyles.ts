// The play styles as the first tab shows them: which one the strategy is, which card's
// scene moves, and up to two traits that the rules of one of the player's own play styles
// really have (the built-in cards say it with a sentence and a moving scene instead).
// Traits are read from the rules, not written per style, so they stay true when the
// rules change.

import { PICKER_ORDER, PRESET_IDS, PRESETS, isSequence } from "@game/engine";
import type { ActionRef, ConditionRef, PresetId, StrategyInput } from "@game/engine";
import { matchingPreset } from "../editor/compare.ts";
import { isOneOf } from "../vocabulary/ids.ts";

export const TRAIT_IDS = [
  "huntsRicher",
  "huntsDryTanks",
  "sneaksBehind",
  "refillsFirst",
  "shootsUpClose",
  "dodgesAim",
  "keepsDistance",
  "wanders",
  "chasesNearest",
  "shootsInRange",
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

const MAX_TRAITS = 2;

function actionsOf(strategy: StrategyInput): ActionRef[] {
  return strategy.modes.flatMap((mode) => [...mode.rules.flatMap((rule) => (isSequence(rule.action) ? rule.action.steps : [rule.action])), mode.fallback]);
}

function conditionsOf(strategy: StrategyInput): ConditionRef[] {
  return strategy.modes.flatMap((mode) => mode.rules.flatMap((rule) => rule.conditions));
}

const targets = (strategy: StrategyInput) => new Set(actionsOf(strategy).map((action) => action.params["target"]));

/** Each trait and the test of the rules that makes it true, in the order they are worth showing. */
const TESTS: Readonly<Record<TraitId, (strategy: StrategyInput) => boolean>> = {
  huntsRicher: (s) => targets(s).has("highestScore") || targets(s).has("nearestWithMorePoints"),
  huntsDryTanks: (s) => targets(s).has("nearestWithLessWater"),
  sneaksBehind: (s) => targets(s).has("nearestFacingAway"),
  refillsFirst: (s) =>
    conditionsOf(s).some((c) => c.condition === "myWater") && s.modes.some((mode) => mode.rules.some((rule) => rule.switchToMode !== null)),
  shootsUpClose: (s) => conditionsOf(s).some((c) => c.condition === "enemyAhead" && c.params["n"] === 1 && !c.negate),
  dodgesAim: (s) => conditionsOf(s).some((c) => c.condition === "aimedAtMe" && !c.negate),
  keepsDistance: (s) => actionsOf(s).some((a) => a.action === "moveAway" && a.params["target"] === "nearest"),
  wanders: (s) => actionsOf(s).some((a) => a.action === "wander"),
  chasesNearest: (s) => s.modes.some((mode) => mode.fallback.action === "moveToward" && mode.fallback.params["target"] === "nearest"),
  shootsInRange: (s) =>
    s.modes.some((mode) =>
      mode.rules.some((rule) => !isSequence(rule.action) && rule.action.action === "throw" && rule.conditions.length === 1 && rule.conditions[0]?.condition === "enemyInRange"),
    ),
};

export function traitsOf(strategy: StrategyInput): TraitId[] {
  return TRAIT_IDS.filter((trait) => TESTS[trait](strategy)).slice(0, MAX_TRAITS);
}

export interface PlayStyle {
  readonly id: PresetId;
  readonly strategy: StrategyInput;
}

/**
 * The 8 cards of the picker, in PICKER_ORDER: the most balanced play style first (presets.ts says how
 * it is measured). The Charger has no card; a saved Charger strategy still plays, and no card shows it as chosen.
 */
export const PLAY_STYLES: readonly PlayStyle[] = PICKER_ORDER.map((id) => {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`PICKER_ORDER names "${id}", which is not a preset.`);
  return { id: preset.id, strategy: preset.strategy };
});

/** The play style the strategy is, or null when the player changed it by hand. */
export function currentPlayStyle(strategy: StrategyInput): PresetId | null {
  const preset = matchingPreset(strategy);
  return preset !== null && isOneOf(PRESET_IDS, preset.id) ? preset.id : null;
}

/**
 * The one card whose scene moves, so a grid of 8 stays calm: the card under the pointer,
 * else the one with keyboard focus, else the chosen one, else none.
 */
export function movingStyle(hovered: PresetId | null, focused: PresetId | null, chosen: PresetId | null): PresetId | null {
  return hovered ?? focused ?? chosen;
}
