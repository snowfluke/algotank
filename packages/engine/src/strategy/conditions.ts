// Conditions a rule can test. Add an entry here and the editor shows it.
// Conditions are facts about the snapshot and never draw random numbers.
// A condition about "the target" is false when the selector finds nobody, and
// a condition about enemies is false when there are none. "Negate" turns false into true.
// The first entry is the one the editor gives a new rule, so it must be valid with its defaults.

import { DIRECTIONS } from "../types.ts";
import type { BotState, ConditionDef, DecisionContext, ParamValues } from "../types.ts";
import {
  ATTRIBUTES,
  MAX_HIT_CHANCE,
  MAX_THROW_RANGE,
  MAX_WATER_CAPACITY,
  MIN_HIT_CHANCE,
  attributeLevel,
  canThrow,
  hitChancePercent,
  throwRange,
} from "../combat/combat.ts";
import { RULE_SETS, STANDARD_RULE_SET_ID, ruleSet, rulesOf } from "../combat/rule-sets.ts";
import { CARDINALS, chebyshev } from "../directions.ts";
import {
  bearingOf,
  botsThatCanHit,
  enemiesOf,
  firstBotInLine,
  inStraightLine,
  isFacingAway,
  roomAhead,
  wallDistance,
} from "./geometry.ts";
import {
  attributeParam,
  attributeValue,
  cellsParam,
  compares,
  comparisonParam,
  intParam,
  intValue,
  tableOf,
  withLiteralIds,
  targetParam,
  textValue,
} from "./define.ts";
import { cutMargin } from "./score.ts";
import { pickTarget } from "./targets.ts";

const BOTS = "Other bots";
const TARGET = "The target";
const ME = "About me";
const WALLS = "Walls and space";
const ROUND = "The round";

const MAX_BOT_COUNT = 64;
const MIN_SCORE = -100;
const MAX_SCORE = 500;
const MAX_POINTS_GAP = 30;
const MAX_TICKS = 300;
/** One bot per line through my cell and side of it: 8 directions. */
const MAX_AIMED_AT_ME = DIRECTIONS.length;
const MAX_BORDER_DISTANCE = 6;
const MAX_ATTRIBUTE_LEVEL = Math.max(...Object.values(ATTRIBUTES).map((attribute) => attribute.levels.length - 1));
/** Defaults of the water parameters. A default is only a starting value, so it follows the standard set. */
const STANDARD_WATER_PER_THROW = ruleSet(STANDARD_RULE_SET_ID).waterPerThrow;

function nearestEnemyDistance(ctx: DecisionContext): number | null {
  let nearest: number | null = null;
  for (const enemy of enemiesOf(ctx.snapshot, ctx.self)) {
    const distance = chebyshev(ctx.self, enemy);
    if (nearest === null || distance < nearest) nearest = distance;
  }
  return nearest;
}

function percentOfRoundLeft(ctx: DecisionContext): number {
  const { tick, ticksTotal } = ctx.snapshot;
  return ((ticksTotal - tick) * 100) / ticksTotal;
}

/** The chance, 0 to 100, that a throw made now hits. 0 when no bot is first in my line within my range, and 0 when my tank is too low to throw. */
function hitChanceNow(ctx: DecisionContext): number {
  const rules = rulesOf(ctx.snapshot);
  if (!canThrow(ctx.self.water, rules)) return 0;
  const hit = firstBotInLine(ctx.snapshot, ctx.self, throwRange(ctx.self.build, rules));
  return hit === null ? 0 : hitChancePercent(ctx.self.build, hit.bot.build, hit.distance, rules);
}

function targetWith(ctx: DecisionContext, params: ParamValues, test: (target: BotState) => boolean): boolean {
  const target = pickTarget(ctx, params);
  return target !== null && test(target);
}

const defs = withLiteralIds<ConditionDef>()([
  // --- Other bots ---------------------------------------------------------
  {
    id: "enemyAhead",
    group: BOTS,
    label: "A bot is the first in my throw line within a {n}-cell distance",
    params: [intParam("n", "Number of cells", 1, MAX_THROW_RANGE, 2)],
    test: (ctx, params) => firstBotInLine(ctx.snapshot, ctx.self, intValue(params, "n")) !== null,
  },
  {
    id: "enemyInRange",
    group: BOTS,
    label: "A bot is the first in my throw line within my range",
    params: [],
    test: (ctx) => firstBotInLine(ctx.snapshot, ctx.self, throwRange(ctx.self.build, rulesOf(ctx.snapshot))) !== null,
  },
  {
    id: "hitChance",
    group: BOTS,
    label: "My throw right now would hit with a chance of {compare} {percent} percent",
    params: [
      comparisonParam("atLeast", "atMost"),
      intParam("percent", "Percent", MIN_HIT_CHANCE, MAX_HIT_CHANCE, 50),
    ],
    // Read from the snapshot taken before the tick, so the real roll can differ
    // when an earlier move in the same tick changes the line.
    test: (ctx, params) => compares(params, hitChanceNow(ctx), intValue(params, "percent")),
  },
  {
    id: "aimedAtMe",
    group: BOTS,
    label: "The number of bots aimed at me is at least {k}",
    params: [intParam("k", "Number of bots", 1, MAX_AIMED_AT_ME, 1)],
    // "Aimed" means I am the first bot in that bot's throw line, within its own range.
    test: (ctx, params) => botsThatCanHit(ctx.snapshot, ctx.self).length >= intValue(params, "k"),
  },
  {
    id: "enemiesWithin",
    group: BOTS,
    label: "The number of bots within a {r}-cell distance of me is at least {n}",
    params: [intParam("n", "Number of bots", 1, MAX_BOT_COUNT, 2), cellsParam("r", 4)],
    test: (ctx, params) => {
      const radius = intValue(params, "r");
      const close = enemiesOf(ctx.snapshot, ctx.self).filter((enemy) => chebyshev(ctx.self, enemy) <= radius);
      return close.length >= intValue(params, "n");
    },
  },
  {
    id: "nearestEnemyAtMost",
    group: BOTS,
    label: "The nearest bot is within a {n}-cell distance",
    params: [cellsParam("n", 3)],
    test: (ctx, params) => {
      const distance = nearestEnemyDistance(ctx);
      return distance !== null && distance <= intValue(params, "n");
    },
  },
  {
    id: "nearestEnemyAtLeast",
    group: BOTS,
    label: "The nearest bot is at a {n}-cell distance or farther",
    params: [cellsParam("n", 5)],
    test: (ctx, params) => {
      const distance = nearestEnemyDistance(ctx);
      return distance !== null && distance >= intValue(params, "n");
    },
  },

  // --- The target ---------------------------------------------------------
  {
    id: "targetDistance",
    group: TARGET,
    label: "The target ({target}) is {compare} a {n}-cell distance away",
    params: [targetParam(), comparisonParam("atMost", "moreThan"), cellsParam("n", 3)],
    // Counted in cells along the way, a diagonal step as 1 (Chebyshev).
    test: (ctx, params) => targetWith(ctx, params, (target) => compares(params, chebyshev(ctx.self, target), intValue(params, "n"))),
  },
  {
    id: "targetBearing",
    group: TARGET,
    label: "The target ({target}) is {bearing} me",
    params: [
      targetParam(),
      {
        kind: "choice",
        key: "bearing",
        label: "Direction",
        options: [
          { value: "ahead", label: "ahead of" },
          { value: "left", label: "to the left of" },
          { value: "right", label: "to the right of" },
          { value: "behind", label: "behind" },
        ],
        default: "ahead",
      },
    ],
    test: (ctx, params) => targetWith(ctx, params, (target) => bearingOf(ctx.self, target) === textValue(params, "bearing")),
  },
  {
    id: "targetInRowOrColumn",
    group: TARGET,
    // The id keeps its old name so saved strategies stay valid; the meaning widened to diagonals.
    label: "The target ({target}) is in a straight line with me (row, column or diagonal)",
    params: [targetParam()],
    // The grid has no interior walls, so nothing but other bots can lie between two bots on a line.
    test: (ctx, params) => targetWith(ctx, params, (target) => inStraightLine(ctx.self, target)),
  },
  {
    id: "targetAimed",
    group: TARGET,
    label: "The target ({target}) is aimed at me",
    params: [targetParam()],
    test: (ctx, params) =>
      targetWith(ctx, params, (target) => botsThatCanHit(ctx.snapshot, ctx.self).some((shooter) => shooter.id === target.id)),
  },
  {
    id: "targetFacingAway",
    group: TARGET,
    label: "The target ({target}) is facing away from me",
    params: [targetParam()],
    test: (ctx, params) => targetWith(ctx, params, (target) => isFacingAway(target, ctx.self)),
  },
  {
    id: "targetPoints",
    group: TARGET,
    label: "The point lead of the target ({target}) over me is {compare} {n}",
    params: [
      targetParam(),
      comparisonParam("atLeast", "fewerThan"),
      intParam("n", "Points", -MAX_POINTS_GAP, MAX_POINTS_GAP, 0),
    ],
    test: (ctx, params) =>
      targetWith(ctx, params, (target) => compares(params, target.score - ctx.self.score, intValue(params, "n"))),
  },
  {
    id: "targetJustHit",
    group: TARGET,
    label: "The target ({target}) was hit on the last tick",
    params: [targetParam()],
    test: (ctx, params) => targetWith(ctx, params, (target) => target.wasHit),
  },
  {
    id: "targetBuild",
    group: TARGET,
    label: "The target ({target}) has {attribute} at level {level} or more",
    params: [targetParam(), attributeParam(), intParam("level", "Level", 0, MAX_ATTRIBUTE_LEVEL, 1)],
    test: (ctx, params) =>
      targetWith(ctx, params, (target) => attributeLevel(target.build, attributeValue(params)) >= intValue(params, "level")),
  },
  {
    id: "targetWater",
    group: TARGET,
    label: "The target ({target}) holds {compare} {n} water",
    params: [targetParam(), comparisonParam("atMost", "moreThan"), intParam("n", "Amount", 0, MAX_WATER_CAPACITY, STANDARD_WATER_PER_THROW - 1)],
    // The default is one unit short of a standard throw, so it means "the target cannot throw on this tick" under the standard set.
    test: (ctx, params) => targetWith(ctx, params, (target) => compares(params, target.water, intValue(params, "n"))),
  },

  // --- About me -----------------------------------------------------------
  {
    id: "myWater",
    group: ME,
    label: "My tank holds {compare} {n} water",
    params: [comparisonParam("atLeast", "fewerThan"), intParam("n", "Amount", 0, MAX_WATER_CAPACITY, STANDARD_WATER_PER_THROW)],
    test: (ctx, params) => compares(params, ctx.self.water, intValue(params, "n")),
  },
  {
    id: "hitWithin",
    group: ME,
    label: "I was hit within the last {n}-tick period",
    params: [intParam("n", "Number of ticks", 1, 50, 5)],
    // ticksSinceHit is 0 on the tick after a hit (round.ts), so 0 means "1 tick ago".
    test: (ctx, params) => ctx.self.ticksSinceHit !== null && ctx.self.ticksSinceHit < intValue(params, "n"),
  },
  {
    id: "landedWithin",
    group: ME,
    label: "I landed a hit within the last {n}-tick period",
    params: [intParam("n", "Number of ticks", 1, 50, 5)],
    test: (ctx, params) => ctx.self.ticksSinceLandedHit !== null && ctx.self.ticksSinceLandedHit < intValue(params, "n"),
  },
  {
    id: "modeTime",
    group: ME,
    label: "The number of ticks I have been in this mode is {compare} {n}",
    params: [comparisonParam("atLeast", "fewerThan"), intParam("n", "Number of ticks", 1, MAX_TICKS, 10)],
    // The only brake on a strategy that switches modes back and forth.
    test: (ctx, params) => compares(params, ctx.self.ticksInMode, intValue(params, "n")),
  },
  {
    id: "cutMargin",
    group: ME,
    label: "My lead over the cut line, in points, is {compare} {n}",
    params: [comparisonParam("atLeast", "fewerThan"), intParam("n", "Points", -MAX_POINTS_GAP, MAX_POINTS_GAP, 0)],
    test: (ctx, params) => compares(params, cutMargin(ctx.snapshot, ctx.self), intValue(params, "n")),
  },
  {
    id: "scoreAtMost",
    group: ME,
    label: "My score is at most {n}",
    params: [intParam("n", "Points", MIN_SCORE, MAX_SCORE, 0)],
    test: (ctx, params) => ctx.self.score <= intValue(params, "n"),
  },
  {
    id: "scoreAtLeast",
    group: ME,
    label: "My score is at least {n}",
    params: [intParam("n", "Points", MIN_SCORE, MAX_SCORE, 10)],
    test: (ctx, params) => ctx.self.score >= intValue(params, "n"),
  },

  // --- Walls and space ----------------------------------------------------
  {
    id: "wallAhead",
    group: WALLS,
    label: "A wall is within a {n}-cell distance in front of me",
    params: [cellsParam("n", 1)],
    test: (ctx, params) =>
      wallDistance(ctx.snapshot, ctx.self, ctx.self.direction) <= intValue(params, "n"),
  },
  {
    id: "wallSides",
    group: WALLS,
    label: "The number of sides on which walls touch me is {compare} {k}",
    params: [comparisonParam("atLeast", "fewerThan"), intParam("k", "Number of sides", 1, 3, 1)],
    // The arena edge is the wall. A bot has 4 sides (not 8 facings), and a corner touches two.
    test: (ctx, params) => {
      const touching = CARDINALS.filter((direction) => wallDistance(ctx.snapshot, ctx.self, direction) === 1).length;
      return compares(params, touching, intValue(params, "k"));
    },
  },
  {
    id: "borderDistance",
    group: WALLS,
    label: "My distance to the nearest border, in cells, is {compare} {n}",
    params: [comparisonParam("atMost", "moreThan"), intParam("n", "Number of cells", 0, MAX_BORDER_DISTANCE, 1)],
    // 0 means I stand on the border.
    test: (ctx, params) => {
      const nearest = Math.min(...CARDINALS.map((direction) => roomAhead(ctx.snapshot, ctx.self, direction)));
      return compares(params, nearest, intValue(params, "n"));
    },
  },

  // --- The round ----------------------------------------------------------
  {
    id: "timeLeft",
    group: ROUND,
    label: "The round has {compare} {n} percent of its time left",
    params: [comparisonParam("fewerThan", "moreThan"), intParam("n", "Percent", 0, 100, 25)],
    test: (ctx, params) => compares(params, percentOfRoundLeft(ctx), intValue(params, "n")),
  },
  {
    id: "roundType",
    group: ROUND,
    label: "This round is {round}",
    params: [
      {
        kind: "choice",
        key: "round",
        label: "Round type",
        options: [
          { value: "cut", label: "a cut round" },
          { value: "final", label: "the grand final" },
        ],
        default: "cut",
      },
    ],
    test: (ctx, params) => (ctx.snapshot.survivorsAfterRound === null) === (textValue(params, "round") === "final"),
  },
  {
    id: "ruleSet",
    group: ROUND,
    label: "This round's rules are {set}",
    params: [
      {
        kind: "choice",
        key: "set",
        label: "Rule set",
        options: Object.values(RULE_SETS).map((rules) => ({ value: rules.id, label: rules.name })),
        default: STANDARD_RULE_SET_ID,
      },
    ],
    // Lets a rule list prepare a mode for each set. A round draws its set before the first tick, so this fact never changes in a round.
    test: (ctx, params) => ctx.snapshot.ruleSetId === textValue(params, "set"),
  },
  {
    id: "fieldTrait",
    group: ROUND,
    label: "At least {percent} percent of the other bots have {attribute} at level {level} or more",
    params: [intParam("percent", "Percent", 1, 100, 50), attributeParam(), intParam("level", "Level", 1, MAX_ATTRIBUTE_LEVEL, 1)],
    // Builds are fixed for the round and public, so this fact is the same on every tick.
    test: (ctx, params) => {
      const others = enemiesOf(ctx.snapshot, ctx.self);
      const attribute = attributeValue(params);
      const level = intValue(params, "level");
      const matching = others.filter((other) => attributeLevel(other.build, attribute) >= level).length;
      return others.length > 0 && matching * 100 >= intValue(params, "percent") * others.length;
    },
  },
]);

export type ConditionId = (typeof defs)[number]["id"];

/** Every id of the table, in table order. */
export const CONDITION_IDS: readonly ConditionId[] = defs.map((def) => def.id);

export const CONDITIONS: Readonly<Record<string, ConditionDef>> = tableOf(defs);
