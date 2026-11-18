// A rule's sequence of steps (docs/specs/revamp/76-email-and-sequences.md, S3): when
// the rule fires, the tank does step 1 on that turn and the next steps on the
// following turns without reading its rules, then reads the rules again.
//
// State machine of one tank's sequence. The actor of every transition is the
// turn loop (round.ts stepRound); the tank's place lives in the round's private
// state (RoundRuntime), never in the snapshot, so a round without sequences keeps
// its snapshots and decisions byte for byte.
//
// | From              | To                | Guard                                                                  |
// |-------------------|-------------------|------------------------------------------------------------------------|
// | reading rules     | running, at k = 2 | a rule with a sequence of n steps fires (conditions hold, chance roll  |
// |                   |                   | passes); the tank does step 1 on this turn                             |
// | running, at k     | running, at k + 1 | k < n; the tank does step k on this turn                               |
// | running, at k = n | reading rules     | the tank does step n on this turn; the rule's mode switch, if any,     |
// |                   |                   | applies from the next turn                                             |
// | any               | ended (terminal)  | the round's last turn is played; a sequence does not carry over        |
//
// No other transition exists: a hit, a blocked step or a dry shot does not stop a
// sequence. A step that cannot happen is skipped exactly as that atomic action is
// skipped as one action (a held square keeps the tank in place, a dry shot does
// nothing), and it still uses its turn. A running step draws no random number.

import type { ActionRef, Decision, DecisionContext, Mode, Move, Rng, Rule, RuleAction, StepSequence, Strategy } from "../types.ts";
import { ACTIONS, type ActionId } from "./actions.ts";

/**
 * The atomic actions: each is one move that does not depend on the arena. Shortcuts
 * such as "move toward" decide per turn, so they are not steps.
 */
export const STEP_ACTION_IDS = ["stepForward", "turn", "throw", "wait"] as const satisfies readonly ActionId[];
export type StepActionId = (typeof STEP_ACTION_IDS)[number];

export function isStepAction(id: string): id is StepActionId {
  return (STEP_ACTION_IDS as readonly string[]).includes(id);
}

export function isSequence(action: RuleAction): action is StepSequence {
  return "steps" in action;
}

/** A rule whose action is a sequence. */
export type SequenceRule = Rule & { readonly action: StepSequence };

/** A tank in the middle of a sequence: the step it does on its next turn. */
export interface RunningSequence {
  readonly modeId: string;
  readonly rule: SequenceRule;
  /** 0-based position of the next step; always at least 1 and below the step count. */
  readonly next: number;
}

function stepMove(ctx: DecisionContext, step: ActionRef, rng: Rng): Move {
  const def = ACTIONS[step.action];
  if (def === undefined || !isStepAction(step.action)) throw new Error(`"${step.action}" is not a step. Run the strategy through parseStrategy first.`);
  const move = def.toMove(ctx, step.params, rng);
  if (typeof move !== "string") throw new Error(`the step "${step.action}" returned no move; a step always acts`);
  return move;
}

/** The decision of step `index` (0-based) of the rule's sequence. */
export function stepDecision(ctx: DecisionContext, modeId: string, rule: SequenceRule, index: number, rng: Rng): Decision {
  const { steps } = rule.action;
  const step = steps[index];
  if (step === undefined) throw new Error(`rule "${rule.id}" has no step ${index + 1}`);
  const last = index === steps.length - 1;
  return {
    botId: ctx.self.id,
    modeId,
    ruleId: rule.id,
    actionId: step.action,
    move: stepMove(ctx, step, rng),
    nextModeId: last ? (rule.switchToMode ?? modeId) : modeId,
    step: { index: index + 1, count: steps.length },
  };
}

/** The next turn of a running sequence. It reads no rule. */
export function continueSequence(ctx: DecisionContext, running: RunningSequence, rng: Rng): Decision {
  return stepDecision(ctx, running.modeId, running.rule, running.next, rng);
}

/** Where the tank stands after this turn's decision: still in a sequence, or back to reading its rules (null). */
export function runningAfter(decision: Decision, strategy: Strategy): RunningSequence | null {
  const step = decision.step;
  if (step === undefined || step.index >= step.count) return null;
  const mode: Mode | undefined = strategy.modes.find((candidate) => candidate.id === decision.modeId);
  const rule = mode?.rules.find((candidate) => candidate.id === decision.ruleId);
  if (rule === undefined || !isSequence(rule.action)) throw new Error(`decision names rule "${decision.ruleId}" with steps, which mode "${decision.modeId}" does not have`);
  return { modeId: decision.modeId, rule: rule as SequenceRule, next: step.index };
}
