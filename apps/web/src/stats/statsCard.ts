// What the statistics card shows, as pure functions, so the rules are tested without a screen:
// the rows of the rules list, which rules never ran, and the hit rate.

import type { StatsNumbers, StatsView } from "@game/engine";
import type { VocabularyText } from "../vocabulary/messages.ts";
import { modeName } from "../vocabulary/sentence.ts";

/** A row of the rules list. Mode headings show only for a strategy with more than one mode. */
export type CardRow =
  | { readonly kind: "mode"; readonly key: string; readonly name: string }
  | { readonly kind: "rule"; readonly key: string; readonly mode: number; readonly rule: number; readonly turns: number; readonly neverRan: boolean }
  | { readonly kind: "fallback"; readonly key: string; readonly mode: number; readonly turns: number };

/** A rule that never ran: `rule` counts from 1 within its mode. */
export interface QuietRule {
  readonly mode: number;
  readonly modeName: string;
  readonly rule: number;
}

const modeTurns = (mode: StatsView["modes"][number]): number => mode.rules.reduce((sum, n) => sum + n, 0) + mode.fallback;

/**
 * The rules that never ran in a mode the tank played in. A rule of a mode the tank never
 * entered did not get a chance, so its condition is not the thing to look at.
 */
export function quietRules(view: StatsView, v: VocabularyText): QuietRule[] {
  return view.modes.flatMap((mode, m) =>
    modeTurns(mode) === 0 ? [] : mode.rules.flatMap((turns, r) => (turns === 0 ? [{ mode: m, modeName: modeName(v, mode), rule: r + 1 }] : [])),
  );
}

/** A built-in style's mode is named in the page's language (modeName), as the editor names it. */
export function cardRows(view: StatsView, v: VocabularyText): CardRow[] {
  const quiet = new Set(quietRules(view, v).map((q) => `${q.mode}/${q.rule}`));
  const withModes = view.modes.length > 1;
  return view.modes.flatMap((mode, m): CardRow[] => [
    ...(withModes ? [{ kind: "mode" as const, key: `mode-${m}`, name: modeName(v, mode) }] : []),
    ...mode.rules.map((turns, r): CardRow => ({ kind: "rule", key: `rule-${m}-${r}`, mode: m, rule: r + 1, turns, neverRan: quiet.has(`${m}/${r + 1}`) })),
    { kind: "fallback", key: `fallback-${m}`, mode: m, turns: mode.fallback },
  ]);
}

/** The share of shots that hit, in whole percent, or null without a shot. */
export function hitRate(numbers: Pick<StatsNumbers, "shots" | "hits">): number | null {
  return numbers.shots === 0 ? null : Math.round((numbers.hits / numbers.shots) * 100);
}

/** A bar's length as a share of the turns, 0 to 1. */
export function barShare(turns: number, total: number): number {
  return total <= 0 ? 0 : Math.min(1, Math.max(0, turns / total));
}

/** How many rules the never-ran sentence names before it gives only their number. */
export const QUIET_NAMED = 3;
