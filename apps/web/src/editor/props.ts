// Props of the practice arena. The prep panel places it.

import type { RuleSetId, StrategyInput } from "@game/engine";

export interface PracticeProps {
  /** Practice runs in the browser against built-in bots. It needs no server. */
  readonly strategy: StrategyInput;
  /** Name shown for the player's own bot. */
  readonly name: string;
  /** The rule set Practice starts with: the announced next set, or the standard set. */
  readonly defaultRuleSetId: RuleSetId;
}
