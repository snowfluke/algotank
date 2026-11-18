// Compatibility for strategies saved before ultimates (docs/specs/revamp/85-ultimates.md).
// The caller supplies the random draw so assignment never uses the round's seed.
import { sameData } from "../strategy/compare.ts";
import { PRESETS } from "../strategy/presets.ts";
import type { Mode, Rule, StrategyInput } from "../types.ts";
import { ULTIMATE_IDS, type UltimateId } from "./ultimates.ts";

type UnassignedStrategy = Omit<StrategyInput, "ultimate">;
type UltimateMatch =
  | { readonly kind: "exact" | "overlap"; readonly ultimate: UltimateId }
  | { readonly kind: "random" };

function sameModeRules(mode: Mode | undefined, preset: Mode): boolean {
  // The name only labels the mode in the editor. Its position, id and fallback affect play.
  return mode?.id === preset.id && sameData(mode.rules, preset.rules) && sameData(mode.fallback, preset.fallback);
}

function rulesAcrossModes(modes: readonly Mode[]): Rule[] {
  // A browser draft can have problems inside its modes. Compare what is there and let
  // parseStrategy report the problems when the draft is submitted.
  return modes.flatMap((mode) => Array.isArray(mode?.rules) ? mode.rules : []);
}

const presetRules = PRESETS.map(({ strategy }) => {
  const rules = rulesAcrossModes(strategy.modes);
  return { strategy, rules, ids: [...new Set(rules.map((rule) => rule.id))] };
});

function overlap(rules: readonly Rule[], preset: readonly Rule[]): number {
  const unmatched = [...preset];
  for (const rule of rules) {
    const index = unmatched.findIndex((candidate) => candidate.id === rule?.id && sameData(candidate, rule));
    // Each occurrence in the preset can count once, even when a draft repeats it across modes.
    if (index >= 0) unmatched.splice(index, 1);
  }
  return preset.length - unmatched.length;
}

/** The assignment step a strategy reaches. The SQLite dry run uses it without drawing an ultimate. */
export function matchUltimate(strategy: UnassignedStrategy): UltimateMatch {
  const exact = PRESETS.find(({ strategy: preset }) =>
    sameData(strategy.build, preset.build) &&
    strategy.modes.length === preset.modes.length &&
    preset.modes.every((mode, index) => sameModeRules(strategy.modes[index], mode)),
  );
  if (exact !== undefined) return { kind: "exact", ultimate: exact.strategy.ultimate };

  // Jaccard similarity (shared / all distinct), so a preset with extra rules the player never had scores lower
  // than the smaller preset the player started from. Rule ids come first: a style copied from a preset keeps the
  // preset's rule ids, and players often keep a rule and change its numbers, which content equality would miss
  // (an edited Dry hunter's free hit would make it a Picker). Rules equal in content break a tie of ids.
  // Measured on the 2026-11-17 backup: counting equal rules left 35 of 57 saved styles to random.
  const rules = rulesAcrossModes(strategy.modes);
  const ids = new Set(rules.map((rule) => rule?.id));
  const scored = presetRules.map((preset) => {
    const shared = overlap(rules, preset.rules);
    const sharedIds = preset.ids.filter((id) => ids.has(id)).length;
    return {
      ultimate: preset.strategy.ultimate,
      content: shared === 0 ? 0 : shared / (rules.length + preset.rules.length - shared),
      id: sharedIds === 0 ? 0 : sharedIds / (ids.size + preset.ids.length - sharedIds),
    };
  });
  const bestId = Math.max(...scored.map((score) => score.id));
  const byId = scored.filter((score) => score.id === bestId);
  const bestContent = Math.max(...byId.map((score) => score.content));
  const best = byId.filter((score) => score.content === bestContent);
  // Two presets can share an ultimate (Leader chaser and Charger both dash), so a tie between them is no tie.
  const ultimates = new Set(best.map((score) => score.ultimate));
  const [only] = ultimates;
  return bestId === 0 ? { kind: "random" } : ultimates.size === 1 && only !== undefined ? { kind: "overlap", ultimate: only } : { kind: "random" };
}

/** Picks and returns one ultimate. `random` supplies a value in [0, 1) and is called only on a tie or no match. */
export function assignUltimate(strategy: UnassignedStrategy, random: () => number): UltimateId {
  const match = matchUltimate(strategy);
  if (match.kind !== "random") return match.ultimate;
  const ultimate = ULTIMATE_IDS[Math.floor(random() * ULTIMATE_IDS.length)];
  if (ultimate === undefined) throw new RangeError("An ultimate assignment needs a random value from 0 up to 1.");
  return ultimate;
}
