// Compares a strategy with the presets: the play style tab marks the matching one,
// and choosing a style over hand-made rules offers Undo.

import { PRESETS, sameData } from "@game/engine";
import type { Preset, StrategyInput } from "@game/engine";

export { sameData };

/** A saved build without Camouflage plays at level zero. */
export function sameStrategy(a: StrategyInput, b: StrategyInput): boolean {
  return sameData({ ...a, build: { camouflage: 0, ...a.build } }, { ...b, build: { camouflage: 0, ...b.build } });
}

/** The preset this strategy is, or null when the player changed rules or upgrades by hand. */
export function matchingPreset(strategy: StrategyInput): Preset | null {
  return PRESETS.find((preset) => sameStrategy(strategy, preset.strategy)) ?? null;
}
