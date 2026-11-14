// What the player's tank did in a test match, counted from the turns, and which
// short tips follow from it. Pure, so the counting rules are tested without a screen.

import type { ActionRef, BotId, StatsNumbers, StrategyInput, TickResult } from "@game/engine";
import { decisionAction } from "../player/feed.ts";

export interface MatchSummary {
  readonly turns: number;
  /** Shots at another tank that hit or missed (the engine's count). A shot into nothing and a dry shot do not count. */
  readonly shots: number;
  readonly hits: number;
  /** Shots with too little water: nothing left the nozzle. */
  readonly dryShots: number;
  /** Hits other tanks landed on this one. */
  readonly timesHit: number;
  /** The action, with its parameters, behind most of the tank's moves, or null for a match without turns. */
  readonly topAction: { readonly action: ActionRef; readonly turns: number } | null;
}

export type TipId = "noShots" | "oftenDry" | "hitMoreThanHitting" | "manyMisses";

/** Three dry shots in one match is a habit, not bad luck. */
const OFTEN_DRY = 3;
/** Below this share of hits, with enough shots to judge, Aim or a closer range helps. */
const LOW_HIT_SHARE = 0.35;
const SHOTS_TO_JUDGE = 6;

/**
 * `numbers` are the engine's count of the match (stats/stats.ts), so a shot, a hit and a hit
 * taken mean the same here as on the statistics card and the server. The dry shots and the
 * most used action are this summary's own.
 */
export function summarise(ticks: readonly TickResult[], botId: BotId, strategy: StrategyInput, numbers: Pick<StatsNumbers, "shots" | "hits" | "timesHit">): MatchSummary {
  const { shots, hits, timesHit } = numbers;
  let dryShots = 0;
  // Keyed by the action with its parameters, so "move toward the leader" and "move toward the nearest tank" count apart.
  const actions = new Map<string, { action: ActionRef; turns: number }>();
  for (const tick of ticks) {
    for (const event of tick.throws) {
      if (event.throwerId === botId && event.outcome === "dry") dryShots += 1;
    }
    const decision = tick.decisions.find((candidate) => candidate.botId === botId);
    if (decision === undefined) throw new Error(`Turn ${tick.tick} has no decision for "${botId}".`);
    const { action } = decisionAction(decision, strategy);
    const key = JSON.stringify([action.action, action.params]);
    actions.set(key, { action, turns: (actions.get(key)?.turns ?? 0) + 1 });
  }
  let topAction: MatchSummary["topAction"] = null;
  // The first action to reach the top count wins a tie, so the result does not depend on Map quirks.
  for (const entry of actions.values()) {
    if (topAction === null || entry.turns > topAction.turns) topAction = entry;
  }
  return { turns: ticks.length, shots, hits, dryShots, timesHit, topAction };
}

/** At most two tips, the most useful first, so the player gets one clear thing to change. */
export function summaryTips(summary: MatchSummary): TipId[] {
  const tips: TipId[] = [];
  if (summary.shots === 0) tips.push("noShots");
  if (summary.dryShots >= OFTEN_DRY) tips.push("oftenDry");
  if (summary.shots >= SHOTS_TO_JUDGE && summary.hits / summary.shots < LOW_HIT_SHARE) tips.push("manyMisses");
  if (summary.timesHit > summary.hits) tips.push("hitMoreThanHitting");
  return tips.slice(0, 2);
}
