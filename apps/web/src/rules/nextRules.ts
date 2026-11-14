// What a player may know about the rules of the coming round. One pure function
// from the arena's mode and phase, so the lobby, the break, the editor and
// Practice all read the same answer.
//
// | Mode      | Phase          | nextRuleSetId | Result  |
// |-----------|----------------|---------------|---------|
// | standard  | any            | any           | none    |
// | announced | lobby, break   | an id         | known   |
// | surprise  | lobby, break   | null          | hidden  |
// | any       | running, done  | -             | none    |

import type { PublicArena } from "@game/arena";
import type { RoundRules, RuleSetId } from "@game/engine";
import { ruleSet, STANDARD_RULE_SET_ID } from "@game/engine";
import { CATALOGS, type Catalog } from "../i18n/catalog.ts";
import { languageStore } from "../i18n/language.ts";

export type NextRules =
  /** The arena plays the standard rules, or no round comes next. */
  | { readonly kind: "none" }
  /** Surprise mode: the rules appear when the round starts. */
  | { readonly kind: "hidden" }
  | { readonly kind: "known"; readonly ruleSetId: RuleSetId; readonly rules: RoundRules };

type RuleView = Pick<PublicArena, "settings" | "phase">;

export function nextRulesOf(arena: RuleView): NextRules {
  if (arena.settings.ruleSetMode === "standard") return { kind: "none" };
  const phase = arena.phase;
  if (phase.kind !== "lobby" && phase.kind !== "break") return { kind: "none" };
  if (phase.nextRuleSetId === null) {
    return arena.settings.ruleSetMode === "surprise" ? { kind: "hidden" } : { kind: "none" };
  }
  return { kind: "known", ruleSetId: phase.nextRuleSetId, rules: ruleSet(phase.nextRuleSetId) };
}

/** The text of the language the page shows now, for callers that pass none. */
const currentCatalog = (): Catalog => CATALOGS[languageStore.get()];

/**
 * The sentence for the lobby and the break, or null when there is nothing to say.
 * Rule set names and summaries come from the vocabulary text, so both languages have them.
 */
export function nextRulesSentence(next: NextRules, m: Catalog = currentCatalog()): string | null {
  switch (next.kind) {
    case "none":
      return null;
    case "hidden":
      return m.prep.nextRules.hidden;
    case "known": {
      const text = m.vocabulary.roundRules[next.ruleSetId];
      return `${m.prep.nextRules.known(text.name)} ${text.summary}`;
    }
  }
}

/** The rule set Practice starts with: the announced next set, or the standard set. */
export function defaultRuleSetId(next: NextRules): RuleSetId {
  return next.kind === "known" ? next.ruleSetId : STANDARD_RULE_SET_ID;
}
