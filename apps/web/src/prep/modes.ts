// Which mode a rule can switch the tank to, for the arrows of the mode strip
// (RulesList.tsx): a tank with modes has more than one list of rules and moves between
// them, and the arrows show where it can go (71-workshop-appeal.md, C3).

import type { StrategyInput } from "@game/engine";

/** The strip draws its arrows only for this many modes or fewer, and only when the chips fit one row. */
export const MAX_MODES_WITH_ARROWS = 4;

/** What the arrow between two neighbouring chips shows. */
export type NeighbourLink = "none" | "forward" | "back" | "both";

/** For each pair of neighbouring modes (i, i + 1): whether a rule of one switches to the other. */
export function neighbourLinks(strategy: StrategyInput): NeighbourLink[] {
  const switches = (from: number, to: number) => {
    const target = strategy.modes[to]?.id;
    return strategy.modes[from]?.rules.some((rule) => rule.switchToMode === target) ?? false;
  };
  return strategy.modes.slice(1).map((_, i) => {
    const forward = switches(i, i + 1);
    const back = switches(i + 1, i);
    return forward && back ? "both" : forward ? "forward" : back ? "back" : "none";
  });
}
