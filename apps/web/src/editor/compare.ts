// Compares a strategy with the presets: the play style tab marks the matching one,
// and choosing a style over hand-made rules offers Undo.

import { PRESETS } from "@game/engine";
import type { Preset, StrategyInput } from "@game/engine";

/** Structural equality of plain data. Key order does not matter, which JSON.stringify would get wrong. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

/** The preset this strategy is, or null when the player changed rules or upgrades by hand. */
export function matchingPreset(strategy: StrategyInput): Preset | null {
  return PRESETS.find((preset) => sameData(strategy, preset.strategy)) ?? null;
}
