// Statistics for the kit's harnesses (the monthly page, the room): counted by the engine from a
// real round of the given strategy, so no harness shows a number that no round produced.

import { DEFAULT_PRESET_ID, parseStrategy, PRESETS, runRound, STANDARD_RULE_SET_ID, statsOfRound, statsView, type StatsView, type Strategy } from "@game/engine";

/** The statistics of `strategy` after `ticks` turns against one tank of each built-in play style. */
export function playedStats(strategy: Strategy, ticks: number, seed = 42): StatsView {
  const players = [{ id: "me", strategy }, ...PRESETS.map((preset, i) => ({ id: `bot-${i}`, strategy: preset.strategy }))];
  const { spawn, ticks: turns } = runRound({ seed, ticksTotal: ticks, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players });
  return statsView(statsOfRound(spawn, turns, "me"), strategy);
}

/**
 * The default play style with one more rule that needs 30 points, which a tank rarely reaches,
 * so the card's "never ran" sentence shows in the kit's harnesses (`rules=quiet`).
 */
export function quietRuleStrategy(): Strategy {
  const base = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)?.strategy;
  if (base === undefined) throw new Error("The engine has no default play style.");
  const [first, ...rest] = base.modes;
  if (first === undefined) throw new Error("The default play style has no mode.");
  const quiet = { id: "kit-quiet", match: "all", conditions: [{ condition: "scoreAtLeast", params: { n: 30 }, negate: false }], action: { action: "throw", params: {} }, chance: 100, switchToMode: null } as const;
  const parsed = parseStrategy({ ...base, modes: [{ ...first, rules: [...first.rules, quiet] }, ...rest] });
  if (!parsed.ok) throw new Error(`The kit's quiet-rule play style is not valid: ${parsed.errors.join(" ")}`);
  return parsed.strategy;
}
