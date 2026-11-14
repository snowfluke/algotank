// The heading of a running round ("Round 2", "Final", "The game"), with the rules' name in
// an arena that changes the rules. `roundKind` is the one rule for what a round is called:
// the room's status line (room/roomStatus.ts) and the result panes (player/ResultViews.tsx) use it too.

import type { RuleSetId } from "@game/engine";
import type { Catalog } from "../i18n/catalog.ts";

export interface HeadingPhase {
  readonly round: number;
  readonly isFinal: boolean;
  readonly ruleSetId: RuleSetId;
}

/**
 * What a round is called. A game of one round (8 tanks or fewer: practice, monthly, a small
 * private arena) is "the game", because it had no earlier rounds to make it a final; the last
 * round of a longer game is "the final"; any other round has its number.
 */
export type RoundKind = "game" | "final" | "round";

export function roundKind(phase: { readonly round: number; readonly isFinal: boolean }): RoundKind {
  if (!phase.isFinal) return "round";
  return phase.round === 1 ? "game" : "final";
}

export function roundHeading(phase: HeadingPhase, changesRules: boolean, m: Pick<Catalog, "live" | "vocabulary">): string {
  const kind = roundKind(phase);
  const base = kind === "game" ? m.live.headingGame : m.live.heading(phase.round, kind === "final");
  return changesRules ? m.live.headingWithRules(base, m.vocabulary.roundRules[phase.ruleSetId].name) : base;
}
