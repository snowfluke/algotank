// Public interface of the engine. Import from "@game/engine", not from the
// folders below, so the folders can change without touching callers.
export * from "./types.ts";

// The eight facings and their geometry, shared by the round, the strategies and the board.
export { DIRECTION_STEP, directionDegreesFromNorth, isDiagonal } from "./directions.ts";

// round/ owns the rules of play: the grid, spawning, move resolution, throws,
// scoring and the final standings.
export { createRng } from "./round/rng.ts";
export { arenaSize } from "./round/grid.ts";
export { createRound, stepRound, runRound, standings } from "./round/round.ts";
// An open round of the monthly league: tanks join and leave between turns.
export { changeRoundRules, createOpenRound, freshStartRound, joinRound, leaveRound, replaceStrategy } from "./round/round.ts";
export type { OpenRoundConfig } from "./round/round.ts";
export { RULES } from "./round/rules.ts";

// combat/ owns every number that decides a throw. The numbers that change from
// round to round are the rows of RULE_SETS; the build attributes do not change.
export {
  ATTRIBUTES,
  BUILD_BUDGET,
  MAX_THROW_RANGE,
  MAX_WATER_CAPACITY,
  POINTS_PER_HIT,
  canThrow,
  waterAfterTick,
  buildCost,
  throwRange,
  hitChancePercent,
} from "./combat/combat.ts";
export type { AttributeId } from "./combat/combat.ts";
export { RULE_SETS, RULE_SET_IDS, STANDARD_RULE_SET_ID, isRuleSetId, ruleSet, rulesOf } from "./combat/rule-sets.ts";
export type { RoundRules, RuleSetId } from "./combat/rule-sets.ts";

// items/ owns the items on the board: when they appear, who takes them, what they do.
export { ITEM_RULES, itemCap } from "./items/items.ts";

// strategy/ owns what a player can configure: the vocabulary tables, the
// validator, the presets, and the function that picks a bot's move.
export { CONDITIONS, TARGET_SELECTORS, ACTIONS, CONDITION_IDS, TARGET_IDS, ACTION_IDS } from "./strategy/vocabulary.ts";
export type { ConditionId, TargetId, ActionId } from "./strategy/vocabulary.ts";
export { parseStrategy, STRATEGY_ISSUE_CODES } from "./strategy/parse.ts";
export type { CheckedParseResult, IssuePath, StrategyIssue, StrategyIssueCode, StrategyIssueParams } from "./strategy/parse.ts";
export { LIMITS } from "./strategy/limits.ts";
export { decide } from "./strategy/decide.ts";
// A rule's sequence of steps: which actions can be steps, and how to tell a sequence from one action.
export { STEP_ACTION_IDS, isSequence, isStepAction } from "./strategy/sequence.ts";
export type { StepActionId } from "./strategy/sequence.ts";
export { PRESETS, PRESET_IDS, DEFAULT_PRESET_ID, PICKER_ORDER } from "./strategy/presets.ts";
export type { PresetId } from "./strategy/presets.ts";
// stats/ owns a tank's statistics: running totals of fixed size, read from turn results.
export { EMPTY_NUMBERS, EMPTY_STATS, addNumbers, addTurn, statsNumbers, statsOfRound, statsView, turnsOf } from "./stats/stats.ts";
export type { ModeStats, RuleUse, StatsNumbers, StatsView, TankStats, TankTurn } from "./stats/stats.ts";
