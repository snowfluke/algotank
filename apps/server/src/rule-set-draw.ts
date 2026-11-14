// Which rule set a round plays under. The arena package checks that an id fits the
// mode (announcementFitsMode); this file makes the draw and decides when it happens.
//
// | Mode      | Draw                                                              |
// |-----------|-------------------------------------------------------------------|
// | standard  | none: the standard id                                             |
// | announced | when the arena is created and when a round completes (the lobby   |
// |           | or break then holds the id)                                       |
// | surprise  | when the host starts the round, so no id exists earlier to leak;  |
// |           | from every rule set, so the last round tells nothing about it     |

import { randomInt } from "node:crypto";
import type { Arena, RuleSetMode } from "@game/arena";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID, type RuleSetId } from "@game/engine";

/**
 * Draws an id with the operating system's random source. It never repeats `previous`
 * while another rule set exists, so two announced rounds in a row do not play alike.
 * Pass null to draw from every rule set.
 */
export function drawRuleSetId(previous: RuleSetId | null): RuleSetId {
  const others = RULE_SET_IDS.filter((id) => id !== previous);
  const pool = others.length > 0 ? others : RULE_SET_IDS;
  const drawn = pool[randomInt(pool.length)];
  if (drawn === undefined) throw new Error("The engine has no rule sets to draw from.");
  return drawn;
}

/**
 * The announcement a lobby or break holds: the standard id, a drawn id, or null in
 * surprise mode. `previous` is the rule set of the round that just played, or null
 * for a new arena.
 */
export function announcementFor(mode: RuleSetMode, previous: RuleSetId | null): RuleSetId | null {
  switch (mode) {
    case "standard":
      return STANDARD_RULE_SET_ID;
    case "announced":
      return drawRuleSetId(previous);
    case "surprise":
      return null;
  }
}

/**
 * The rule set for the startRound event. A lobby or break that holds an announcement
 * starts under it. In surprise mode it holds none, so the draw happens now. In any
 * other phase the reducer rejects the start, so the id sent does not matter.
 */
export function ruleSetToStart(arena: Arena): RuleSetId {
  const { phase } = arena;
  if (phase.kind !== "lobby" && phase.kind !== "break") return STANDARD_RULE_SET_ID;
  // Surprise mode draws from every rule set: leaving out the last one would tell the players one set that cannot come.
  return phase.nextRuleSetId ?? drawRuleSetId(null);
}
