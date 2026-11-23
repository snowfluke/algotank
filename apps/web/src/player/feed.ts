// Turns one decision of the player's tank into a sentence for the live feed, in
// the player's language, as something that happened: "Moved away from the nearest
// tank, because no rule fit." The action and the reason come from the vocabulary
// catalog, so the feed uses the same words as the rule editor and shows no
// internal name. The reason is the rule's conditions in words; they keep the
// present tense and the first person of the rule editor, because they are the rule
// as written. So the whole line is the tank speaking ("I", "my"), never "it" or
// "your tank".

import { isSequence } from "@game/engine";
import type { ActionId, ActionRef, Decision, Rule, StrategyInput } from "@game/engine";
import type { en as LiveText } from "../live/messages.ts";
import type { OwnDecision } from "../stream/streamState.ts";
import type { VocabularyText } from "../vocabulary/messages.ts";
import { actionDoneText, actionText, conditionText, modeName } from "../vocabulary/sentence.ts";

export interface FeedLine {
  /** 1 for the first turn. */
  readonly turn: number;
  readonly text: string;
}

type FeedText = (typeof LiveText)["feed"];

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Actions whose move is a step: when the engine returns a shot (T) for them, the
 * step was blocked by a tank or a wall, or the action found no tank to act on
 * (packages/engine/src/strategy/actions.ts and movement.ts). The other actions
 * shoot as part of what they say, such as "drive forward, shoot any tank in the way".
 */
const STEP_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>(["moveToward", "moveAway", "stepOutOfLine", "awayFromCrowd", "wander", "goToItem"]);

/** The rule that ran, and its action with the parameters from the strategy. */
export function decisionAction(decision: Decision, strategy: StrategyInput): { rule: Rule | undefined; action: ActionRef } {
  const mode = strategy.modes.find((m) => m.id === decision.modeId);
  const rule = decision.ruleId === null ? undefined : mode?.rules.find((r) => r.id === decision.ruleId);
  // On a turn of a sequence, the action is the step the tank is doing.
  const ruleAction = rule?.action;
  const ref =
    decision.ruleId === null ? mode?.fallback : ruleAction !== undefined && isSequence(ruleAction) ? ruleAction.steps[(decision.step?.index ?? 1) - 1] : ruleAction;
  // A strategy saved after the round started can lack the rule; the action id still names what happened.
  return { rule, action: ref?.action === decision.actionId ? ref : { action: decision.actionId, params: ref?.params ?? {} } };
}

/**
 * How a step action ended when its step could not go on: a shot, or a wait when the shot would do nothing, without
 * water or a tank in its line (the engine's RoundConfig.waitWhenDry and waitWhenNoTarget, 2026-11-23). Null when the
 * step went on.
 */
function blocked(decision: Decision): "shot" | "waited" | null {
  if (!(STEP_ACTIONS as ReadonlySet<string>).has(decision.actionId)) return null;
  return decision.move === "T" ? "shot" : decision.move === "W" ? "waited" : null;
}

function outcomeText(t: FeedText, entry: OwnDecision): string | null {
  switch (entry.throwEvent?.outcome) {
    case "hit":
      return entry.throwEvent.bucket === true ? t.bucketHit : t.hit;
    case "blocked":
      return t.blocked;
    case "deflected":
      return t.deflected;
    case "miss":
    case "dodged":
      return t.miss;
    case "empty":
      return t.nothing;
    case "dry":
      return t.dry;
    case undefined:
      return null;
  }
}

export function describeDecision(entry: OwnDecision, strategy: StrategyInput, v: VocabularyText, t: FeedText): FeedLine {
  const { decision } = entry;
  if (decision.ultimate !== undefined) return { turn: entry.tick + 1, text: t.ultimate(decision.ultimate) };
  const { rule, action } = decisionAction(decision, strategy);
  const stopped = blocked(decision);
  const what = capitalised(stopped !== null ? t.tried(actionText(v, action), actionDoneText(v, action)) : actionDoneText(v, action));
  // A pinwheel's spin checked no rule: the feed says so and nothing else.
  if (decision.spin === true) return { turn: entry.tick + 1, text: t.spin };
  let first: string;
  if (decision.ruleId === null) first = t.noRule(what);
  // A later step of a sequence did not read the rules, so it has no "because".
  else if (rule === undefined || (decision.step?.index ?? 1) > 1) first = t.plain(what);
  else if (rule.conditions.length === 0) first = t.always(what);
  else {
    const conditions = rule.conditions.map((c) => conditionText(v, c));
    first = t.because(what, conditions.join(rule.match === "all" ? t.and : t.or));
  }
  const sentences = [first];
  // The rule that ran may sit low in the list: a dizzy tank read its rules from the bottom up.
  if (decision.dizzy === true) sentences.push(t.dizzy);
  const ruleIndex = rule === undefined ? -1 : (strategy.modes.find((m) => m.id === decision.modeId)?.rules.indexOf(rule) ?? -1);
  if (decision.step !== undefined && ruleIndex >= 0) sentences.push(t.stepOf(ruleIndex + 1, decision.step.index, decision.step.count));
  if (stopped !== null) sentences.push(stopped === "shot" ? t.blockedShot : t.blockedWait);
  const outcome = outcomeText(t, entry);
  if (outcome !== null) sentences.push(outcome);
  if (decision.nextModeId !== decision.modeId) {
    const next = strategy.modes.find((m) => m.id === decision.nextModeId);
    sentences.push(t.switched(next === undefined ? v.unknown : modeName(v, next)));
  }
  return { turn: entry.tick + 1, text: sentences.join(" ") };
}
