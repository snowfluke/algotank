// Target selectors. Each picks one enemy from the snapshot, or null.
// No selector draws a random number. A tie is settled by the selector's own
// measure first, then by lower distance (Chebyshev: a diagonal step counts as 1), then by the lower tie rank
// of an open round (BotState.tieRank), else by the lower id. Neither changes in a round, so a tie never flips.

import { attributeLevel, hitChancePercent, throwRange } from "../combat/combat.ts";
import { rulesOf } from "../combat/rule-sets.ts";
import type { AttributeId } from "../combat/combat.ts";
import type { BotState, DecisionContext, ParamValues, TargetSelectorDef } from "../types.ts";
import { chebyshev } from "../directions.ts";
import { botsThatCanHit, enemiesOf, firstBotInLine, isFacingAway } from "./geometry.ts";
import { tableOf, withLiteralIds, textValue } from "./define.ts";
import { scoreAcrossCut } from "./score.ts";
import { forEachBotNear } from "./snapshot-index.ts";

/** "The bot with the fewest other bots near it" looks at bots this close to me, and counts bots this close to each of them. */
const ISOLATION_SEARCH_RADIUS = 10;
const ISOLATION_NEIGHBOUR_RADIUS = 3;

type Compare = (a: BotState, b: BotState) => number;

function compareIds(a: BotState, b: BotState): number {
  if (a.tieRank !== undefined && b.tieRank !== undefined && a.tieRank !== b.tieRank) return a.tieRank - b.tieRank;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function pickBest(candidates: readonly BotState[], compare: Compare): BotState | null {
  let best: BotState | null = null;
  for (const candidate of candidates) {
    if (best === null || compare(candidate, best) < 0) best = candidate;
  }
  return best;
}

function byDistance(ctx: DecisionContext): Compare {
  return (a, b) => chebyshev(ctx.self, a) - chebyshev(ctx.self, b) || compareIds(a, b);
}

function byDistanceThen(ctx: DecisionContext, measure: (bot: BotState) => number): Compare {
  return (a, b) => measure(a) - measure(b) || byDistance(ctx)(a, b);
}

/** The enemy with the highest level of one attribute. */
function topBuild(attribute: AttributeId): TargetSelectorDef["pick"] {
  return (ctx) => {
    return pickBest(
      enemiesOf(ctx.snapshot, ctx.self),
      byDistanceThen(ctx, (bot) => -attributeLevel(bot.build, attribute)),
    );
  };
}

const defs = withLiteralIds<TargetSelectorDef>()([
  {
    id: "nearest",
    label: "the nearest bot",
    pick: (ctx) => pickBest(enemiesOf(ctx.snapshot, ctx.self), byDistance(ctx)),
  },
  {
    id: "inThrowLine",
    label: "the first bot in my throw line",
    pick: (ctx) => firstBotInLine(ctx.snapshot, ctx.self, throwRange(ctx.self.build, rulesOf(ctx.snapshot)))?.bot ?? null,
  },
  {
    id: "aimedAtMe",
    label: "the nearest bot that is aimed at me",
    pick: (ctx) => pickBest(botsThatCanHit(ctx.snapshot, ctx.self), byDistance(ctx)),
  },
  {
    id: "lastHitMe",
    label: "the bot that last hit me",
    pick: (ctx) => {
      const id = ctx.self.lastHitBy;
      if (id === null) return null;
      return enemiesOf(ctx.snapshot, ctx.self).find((bot) => bot.id === id) ?? null;
    },
  },
  {
    id: "highestScore",
    label: "the bot with the most points, or the one in second place when I lead",
    // Enemies only, so when I lead the best of the others is second place.
    pick: (ctx) => pickBest(enemiesOf(ctx.snapshot, ctx.self), byDistanceThen(ctx, (bot) => -bot.score)),
  },
  {
    id: "nearestWithMorePoints",
    label: "the nearest bot with more points than me",
    pick: (ctx) =>
      pickBest(
        enemiesOf(ctx.snapshot, ctx.self).filter((bot) => bot.score > ctx.self.score),
        byDistance(ctx),
      ),
  },
  {
    id: "nearestWithFewerPoints",
    label: "the nearest bot with fewer points than me",
    pick: (ctx) =>
      pickBest(
        enemiesOf(ctx.snapshot, ctx.self).filter((bot) => bot.score < ctx.self.score),
        byDistance(ctx),
      ),
  },
  {
    id: "cutRival",
    label: "the bot across the cut line whose score is closest to mine (in a final: the leader, or second place when I lead)",
    pick: (ctx) => {
      const across = scoreAcrossCut(ctx.snapshot, ctx.self);
      if (across === null) return null;
      return pickBest(
        enemiesOf(ctx.snapshot, ctx.self).filter((bot) => bot.score === across),
        byDistance(ctx),
      );
    },
  },
  {
    id: "nearestWithLessWater",
    label: "the nearest bot with less water in its tank than mine",
    pick: (ctx) =>
      pickBest(
        enemiesOf(ctx.snapshot, ctx.self).filter((bot) => bot.water < ctx.self.water),
        byDistance(ctx),
      ),
  },
  {
    id: "easiestHit",
    label: "the bot in my range that I am most likely to hit",
    pick: (ctx) => {
      const rules = rulesOf(ctx.snapshot);
      const range = throwRange(ctx.self.build, rules);
      const chance = (bot: BotState): number =>
        hitChancePercent(ctx.self.build, bot.build, chebyshev(ctx.self, bot), rules);
      return pickBest(
        enemiesOf(ctx.snapshot, ctx.self).filter((bot) => chebyshev(ctx.self, bot) <= range),
        byDistanceThen(ctx, (bot) => -chance(bot)),
      );
    },
  },
  {
    id: "mostIsolated",
    label: "the bot with the fewest other bots near it",
    pick: (ctx) => {
      // Counted once per candidate: the comparison asks again for the current best.
      const crowds = new Map<BotState, number>();
      const crowdAround = (bot: BotState): number => {
        let crowd = crowds.get(bot);
        if (crowd === undefined) {
          crowd = 0;
          forEachBotNear(ctx.snapshot, bot.x, bot.y, ISOLATION_NEIGHBOUR_RADIUS, (other) => {
            if (other.id !== bot.id && other.id !== ctx.self.id) crowd = (crowd as number) + 1;
          });
          crowds.set(bot, crowd);
        }
        return crowd;
      };
      return pickBest(
        enemiesOf(ctx.snapshot, ctx.self).filter((bot) => chebyshev(ctx.self, bot) <= ISOLATION_SEARCH_RADIUS),
        byDistanceThen(ctx, crowdAround),
      );
    },
  },
  { id: "topReach", label: "the bot with the highest Reach", pick: topBuild("reach") },
  { id: "topAim", label: "the bot with the highest Aim", pick: topBuild("aim") },
  { id: "topDodge", label: "the bot with the highest Dodge", pick: topBuild("dodge") },
  {
    id: "farthest",
    label: "the farthest bot",
    pick: (ctx) =>
      pickBest(
        enemiesOf(ctx.snapshot, ctx.self),
        (a, b) => chebyshev(ctx.self, b) - chebyshev(ctx.self, a) || compareIds(a, b),
      ),
  },
  {
    id: "nearestFacingAway",
    label: "the nearest bot that faces away from me",
    pick: (ctx) =>
      pickBest(
        enemiesOf(ctx.snapshot, ctx.self).filter((bot) => isFacingAway(bot, ctx.self)),
        byDistance(ctx),
      ),
  },
]);

export type TargetId = (typeof defs)[number]["id"];

/** Every id of the table, in table order. */
export const TARGET_IDS: readonly TargetId[] = defs.map((def) => def.id);

export const TARGET_SELECTORS: Readonly<Record<string, TargetSelectorDef>> = tableOf(defs);

/** Resolves the "target" parameter of a condition or action to a bot. Null when nobody qualifies. */
export function pickTarget(ctx: DecisionContext, params: ParamValues): BotState | null {
  const id = textValue(params, "target");
  const selector = TARGET_SELECTORS[id];
  if (selector === undefined) throw new Error(`Unknown target selector "${id}".`);
  return selector.pick(ctx);
}
