// The water tip after a practice game: for a rule list whose first rule shoots and that has no
// water rule, add "When my water is less than 3 -> step out of the line of fire" on top.
//
// Why only that pattern: 300 practice games per play style against the server's bot lineup
// (measured 2026-11-14) showed the added rule gains 2.24 places for Charger (one shoot rule) and
// 1.23 for Random walker, and does nothing or harm for the designed play styles: Evader, the
// default, has a dodge rule first (0.00), and Dry hunter already has a water rule (+0.99 worse
// with the other wording). A tip that is wrong is worse than none, so the pattern stays narrow.

import type { ActionRef, Rule, StatsView, StrategyInput } from "@game/engine";
import { addRule, moveRuleTo, replaceRule, ruleIdAt } from "../editor/edit.ts";

/** Where the tip applies: the mode, by id and by its number for the sentence. */
export interface WaterTip {
  readonly modeId: string;
}

/** Water for one throw in the standard rule set, the same threshold the play styles use (engine presets.ts). */
const WATER_FOR_ONE_THROW = 3;
const SHOOT_ACTIONS: ReadonlySet<string> = new Set(["throw", "attack"]);

function shoots(rule: Rule): boolean {
  return !("steps" in rule.action) && SHOOT_ACTIONS.has((rule.action as ActionRef).action);
}

function readsWater(rule: Rule): boolean {
  return rule.conditions.some((condition) => condition.condition === "myWater");
}

/**
 * The tip for the strategy the player has now and the statistics of the game just played, or
 * null. The statistics must describe this strategy (same modes, same number of rules), so an edit
 * made after the game turns the tip off instead of pointing at another rule.
 */
export function waterTipOf(strategy: StrategyInput, stats: StatsView): WaterTip | null {
  if (stats.modes.length !== strategy.modes.length) return null;
  for (const [index, mode] of strategy.modes.entries()) {
    const played = stats.modes[index];
    if (played === undefined || played.name !== mode.name || played.rules.length !== mode.rules.length) return null;
    const first = mode.rules[0];
    // The first rule shoots and ran in this game, and no rule of the mode looks at the tank's water.
    if (first !== undefined && shoots(first) && (played.rules[0] ?? 0) > 0 && !mode.rules.some(readsWater)) return { modeId: mode.id };
  }
  return null;
}

/** The strategy with the water rule on top of the tip's mode, or null when the mode is full. */
export function withWaterRule(strategy: StrategyInput, tip: WaterTip): StrategyInput | null {
  const mode = strategy.modes.find((m) => m.id === tip.modeId);
  if (mode === undefined) return null;
  const added = addRule(strategy, tip.modeId);
  const id = ruleIdAt(added, tip.modeId, mode.rules.length);
  if (added === strategy || id === undefined) return null;
  const rule: Rule = {
    id,
    match: "all",
    conditions: [{ condition: "myWater", params: { compare: "fewerThan", n: WATER_FOR_ONE_THROW }, negate: false }],
    action: { action: "stepOutOfLine", params: {} },
    chance: 100,
    switchToMode: null,
  };
  return moveRuleTo(replaceRule(added, tip.modeId, rule), tip.modeId, id, 0);
}
