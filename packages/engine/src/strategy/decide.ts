// Picks one bot's move for one tick from its strategy.
//
// Random draws, in order: one rng.chance(chance) for each rule whose conditions
// hold and whose chance is below 100, then the draws inside the action that runs.
// A rule with chance 100 draws nothing. A condition never draws.
// The chance roll comes before the action is asked, so a rule whose action then
// cannot act (it returns null) has still used its roll. Such a rule is skipped
// as if its conditions had failed: it does not run, it does not switch the mode,
// and it is not the ruleId of the decision.
//
// A rule with a sequence of steps always acts: its first step is one move
// (strategy/sequence.ts). The steps after it run in the turn loop, not here.
//
// A dizzy tank (an item effect, items/items.ts) checks its rules from the bottom up; the
// fallback is still last. A running sequence is not affected: its steps never read rules.
// Its first turns do not come here: the turn loop spins it round instead (round/round.ts).
//
// A fallback that cannot act makes the bot throw ahead. A throw keeps the bot in
// place and spends water only when a bot stands in the line, and every mode must
// answer (see types.ts).

import type {
  ActionRef,
  ConditionRef,
  Decision,
  DecisionContext,
  Mode,
  Move,
  Rng,
  Rule,
  Strategy,
} from "../types.ts";
import { ACTIONS } from "./actions.ts";
import { CONDITIONS } from "./conditions.ts";
import { isSequence, stepDecision } from "./sequence.ts";

const CERTAIN = 100;

function conditionHolds(ctx: DecisionContext, ref: ConditionRef): boolean {
  const def = CONDITIONS[ref.condition];
  if (def === undefined) throw new Error(`Unknown condition "${ref.condition}". Run the strategy through parseStrategy first.`);
  return def.test(ctx, ref.params) !== ref.negate;
}

function ruleConditionsHold(ctx: DecisionContext, rule: Rule): boolean {
  return rule.match === "all"
    ? rule.conditions.every((ref) => conditionHolds(ctx, ref))
    : rule.conditions.some((ref) => conditionHolds(ctx, ref));
}

/** The move of an action, or null when the action cannot act. */
function moveFor(ctx: DecisionContext, ref: ActionRef, rng: Rng): Move | null {
  const def = ACTIONS[ref.action];
  if (def === undefined) throw new Error(`Unknown action "${ref.action}". Run the strategy through parseStrategy first.`);
  return def.toMove(ctx, ref.params, rng);
}

/** What a fallback that cannot act does. */
const FALLBACK_CANNOT_ACT: Move = "T";

function currentMode(ctx: DecisionContext, strategy: Strategy): Mode {
  const mode = strategy.modes.find((candidate) => candidate.id === ctx.self.modeId);
  if (mode === undefined) throw new Error(`Bot "${ctx.self.id}" is in mode "${ctx.self.modeId}", which its strategy does not have.`);
  return mode;
}

export function decide(ctx: DecisionContext, strategy: Strategy, rng: Rng): Decision {
  const decision = decideInOrder(ctx, strategy, rng);
  return ctx.self.effect?.kind === "dizzy" ? { ...decision, dizzy: true } : decision;
}

function decideInOrder(ctx: DecisionContext, strategy: Strategy, rng: Rng): Decision {
  const mode = currentMode(ctx, strategy);
  const rules = ctx.self.effect?.kind === "dizzy" ? [...mode.rules].reverse() : mode.rules;
  for (const rule of rules) {
    if (!ruleConditionsHold(ctx, rule)) continue;
    if (rule.chance < CERTAIN && !rng.chance(rule.chance)) continue;
    if (isSequence(rule.action)) return stepDecision(ctx, mode.id, { ...rule, action: rule.action }, 0, rng);
    const move = moveFor(ctx, rule.action, rng);
    if (move === null) continue;
    return {
      botId: ctx.self.id,
      modeId: mode.id,
      ruleId: rule.id,
      actionId: rule.action.action,
      move,
      nextModeId: rule.switchToMode ?? mode.id,
    };
  }
  return {
    botId: ctx.self.id,
    modeId: mode.id,
    ruleId: null,
    actionId: mode.fallback.action,
    move: moveFor(ctx, mode.fallback, rng) ?? FALLBACK_CANNOT_ACT,
    nextModeId: mode.id,
  };
}
