// Every change to a strategy goes through a function in this file. The
// components only call these functions, so a change to a rule of editing
// (a limit, a default, an id scheme) is a change to this file alone.
//
// Each function returns a new value and never changes its input. When an edit
// is not allowed (a limit, or the last mode), the function returns its input
// unchanged and the matching `can...` function says so, so a component can
// disable the control instead of failing.

import {
  ACTIONS,
  CONDITIONS,
  LIMITS,
  TARGET_SELECTORS,
  intParamAllows,
  isSequence,
  isStepAction,
} from "@game/engine";
import type {
  ActionRef,
  ConditionRef,
  Mode,
  ParamSpec,
  ParamValues,
  Rule,
  StrategyInput,
} from "@game/engine";

// ---------------------------------------------------------------------------
// Ids and defaults
// ---------------------------------------------------------------------------

/** The smallest `prefix-N` that no id in `taken` uses. It is short, so it stays under LIMITS.maxIdLength. */
export function newId(prefix: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n += 1) {
    const id = `${prefix}-${n}`;
    if (!taken.has(id)) return id;
  }
}

function ruleIdsOf(strategy: StrategyInput): Set<string> {
  return new Set(strategy.modes.flatMap((mode) => mode.rules.map((rule) => rule.id)));
}

function modeIdsOf(strategy: StrategyInput): Set<string> {
  return new Set(strategy.modes.map((mode) => mode.id));
}

function isValidParam(spec: ParamSpec, value: number | string | undefined): boolean {
  switch (spec.kind) {
    case "int":
      return intParamAllows(spec, value);
    case "choice":
      return typeof value === "string" && spec.options.some((option) => option.value === value);
    case "target":
      return typeof value === "string" && TARGET_SELECTORS[value] !== undefined;
  }
}

/**
 * Keeps the old value of a parameter only when the new entry has a parameter
 * with the same key, the same kind, the same label and the same unit, and the
 * value fits. A key such as `n` means cells in one entry and points in another,
 * so the label decides whether the value means the same thing.
 * ponytail: label equality stands in for "same unit"; give ParamSpec an explicit unit id if two labels ever mean one thing.
 */
function carryParams(
  specs: readonly ParamSpec[],
  previous: ParamValues,
  previousSpecs: readonly ParamSpec[],
): ParamValues {
  return Object.fromEntries(
    specs.map((spec) => {
      const old = previous[spec.key];
      const before = previousSpecs.find((candidate) => candidate.key === spec.key);
      const sameMeaning =
        before !== undefined &&
        before.kind === spec.kind &&
        before.label === spec.label &&
        unitOf(before) === unitOf(spec);
      return [spec.key, sameMeaning && old !== undefined && isValidParam(spec, old) ? old : spec.default];
    }),
  );
}

function unitOf(spec: ParamSpec): string | undefined {
  return spec.kind === "int" ? spec.unit : undefined;
}

function firstKey<T>(table: Readonly<Record<string, T>>, what: string): string {
  const [first] = Object.keys(table);
  if (first === undefined) throw new Error(`The ${what} table is empty.`);
  return first;
}

/** Builds a condition of any kind. A kind that is not in the table is a bug in the caller. */
export function conditionOf(conditionId: string, previous?: ConditionRef): ConditionRef {
  const def = CONDITIONS[conditionId];
  if (def === undefined) throw new Error(`Unknown condition "${conditionId}".`);
  return {
    condition: def.id,
    params: carryParams(def.params, previous?.params ?? {}, CONDITIONS[previous?.condition ?? ""]?.params ?? []),
    negate: previous?.negate ?? false,
  };
}

export function actionOf(actionId: string, previous?: ActionRef): ActionRef {
  const def = ACTIONS[actionId];
  if (def === undefined) throw new Error(`Unknown action "${actionId}".`);
  return {
    action: def.id,
    params: carryParams(def.params, previous?.params ?? {}, ACTIONS[previous?.action ?? ""]?.params ?? []),
  };
}

function defaultCondition(): ConditionRef {
  return conditionOf(firstKey(CONDITIONS, "condition"));
}

function defaultAction(): ActionRef {
  return actionOf(firstKey(ACTIONS, "action"));
}

// ---------------------------------------------------------------------------
// Rule: changes inside one rule
// ---------------------------------------------------------------------------

export function canAddCondition(rule: Rule): boolean {
  return rule.conditions.length < LIMITS.maxConditionsPerRule;
}

export function canRemoveCondition(rule: Rule): boolean {
  return rule.conditions.length > LIMITS.minConditionsPerRule;
}

export function addCondition(rule: Rule): Rule {
  if (!canAddCondition(rule)) return rule;
  return { ...rule, conditions: [...rule.conditions, defaultCondition()] };
}

export function removeCondition(rule: Rule, index: number): Rule {
  if (!canRemoveCondition(rule)) return rule;
  return { ...rule, conditions: rule.conditions.filter((_, i) => i !== index) };
}

/** Replaces the condition at `index`. */
export function setCondition(rule: Rule, index: number, next: ConditionRef): Rule {
  return { ...rule, conditions: rule.conditions.map((old, i) => (i === index ? next : old)) };
}

/** Picks another kind of condition for `index`, and keeps the "is not" switch and the parameters that still fit. */
export function changeConditionKind(rule: Rule, index: number, conditionId: string): Rule {
  const old = rule.conditions[index];
  return old === undefined ? rule : setCondition(rule, index, conditionOf(conditionId, old));
}

export function setParam(params: ParamValues, key: string, value: number | string): ParamValues {
  return { ...params, [key]: value };
}

export function setChance(rule: Rule, chance: number): Rule {
  return { ...rule, chance };
}

// ---------------------------------------------------------------------------
// Rule: one action, or steps in order (76-email-and-sequences.md, S3)
// ---------------------------------------------------------------------------

/** The steps of a rule, or null when it does one action. */
export function stepsOf(rule: Rule): readonly ActionRef[] | null {
  return isSequence(rule.action) ? rule.action.steps : null;
}

/**
 * Turns the rule's one action into steps: the action stays as step 1 when it is a
 * step, and the rule gets the fewest steps a sequence has. Steps stay as they are.
 */
export function toSteps(rule: Rule): Rule {
  if (isSequence(rule.action)) return rule;
  const first = isStepAction(rule.action.action) ? rule.action : actionOf("stepForward");
  const filler = [actionOf("turn"), actionOf("stepForward"), actionOf("turn")];
  return { ...rule, action: { steps: [first, ...filler].slice(0, LIMITS.minStepsPerSequence) } };
}

/** Turns steps back into one action: step 1. */
export function toOneAction(rule: Rule): Rule {
  if (!isSequence(rule.action)) return rule;
  return { ...rule, action: rule.action.steps[0] ?? actionOf("stepForward") };
}

function withSteps(rule: Rule, change: (steps: readonly ActionRef[]) => readonly ActionRef[]): Rule {
  const steps = stepsOf(rule);
  return steps === null ? rule : { ...rule, action: { steps: change(steps) } };
}

export function canAddStep(rule: Rule): boolean {
  const steps = stepsOf(rule);
  return steps !== null && steps.length < LIMITS.maxStepsPerSequence;
}

export function canRemoveStep(rule: Rule): boolean {
  const steps = stepsOf(rule);
  return steps !== null && steps.length > LIMITS.minStepsPerSequence;
}

/** Adds "step forward" at the end; the player then picks its kind. */
export function addStep(rule: Rule): Rule {
  return canAddStep(rule) ? withSteps(rule, (steps) => [...steps, actionOf("stepForward")]) : rule;
}

export function removeStep(rule: Rule, index: number): Rule {
  return canRemoveStep(rule) ? withSteps(rule, (steps) => steps.filter((_, i) => i !== index)) : rule;
}

export function setStep(rule: Rule, index: number, step: ActionRef): Rule {
  return withSteps(rule, (steps) => steps.map((current, i) => (i === index ? step : current)));
}

/** Swaps a step with its neighbour; a step at the end stays. */
export function moveStep(rule: Rule, index: number, by: -1 | 1): Rule {
  return withSteps(rule, (steps) => {
    const to = index + by;
    const moving = steps[index];
    const other = steps[to];
    if (moving === undefined || other === undefined) return steps;
    return steps.map((step, i) => (i === index ? other : i === to ? moving : step));
  });
}

// ---------------------------------------------------------------------------
// Strategy: rules
// ---------------------------------------------------------------------------

function modeById(strategy: StrategyInput, modeId: string): Mode | undefined {
  return strategy.modes.find((mode) => mode.id === modeId);
}

function mapMode(strategy: StrategyInput, modeId: string, change: (mode: Mode) => Mode): StrategyInput {
  return { ...strategy, modes: strategy.modes.map((mode) => (mode.id === modeId ? change(mode) : mode)) };
}

export function canAddRule(strategy: StrategyInput, modeId: string): boolean {
  const mode = modeById(strategy, modeId);
  return mode !== undefined && mode.rules.length < LIMITS.maxRulesPerMode;
}

/** A rule made only of table defaults. Its id is unused in the whole strategy. */
function newRule(strategy: StrategyInput): Rule {
  return {
    id: newId("rule", ruleIdsOf(strategy)),
    match: "all",
    conditions: [defaultCondition()],
    action: defaultAction(),
    chance: LIMITS.maxChance,
    switchToMode: null,
  };
}

export function addRule(strategy: StrategyInput, modeId: string): StrategyInput {
  if (!canAddRule(strategy, modeId)) return strategy;
  const rule = newRule(strategy);
  return mapMode(strategy, modeId, (mode) => ({ ...mode, rules: [...mode.rules, rule] }));
}

/** The id of the rule at `index` in a mode, or undefined. Used to find a rule that an edit just created. */
export function ruleIdAt(strategy: StrategyInput, modeId: string, index: number): string | undefined {
  return modeById(strategy, modeId)?.rules[index]?.id;
}

export function replaceRule(strategy: StrategyInput, modeId: string, next: Rule): StrategyInput {
  return mapMode(strategy, modeId, (mode) => ({
    ...mode,
    rules: mode.rules.map((rule) => (rule.id === next.id ? next : rule)),
  }));
}

export function deleteRule(strategy: StrategyInput, modeId: string, ruleId: string): StrategyInput {
  return mapMode(strategy, modeId, (mode) => ({ ...mode, rules: mode.rules.filter((rule) => rule.id !== ruleId) }));
}

/**
 * Puts a deleted rule back at `index`, for Undo. The rule gets a new id when
 * another rule took its id in the meantime, and nothing changes when the mode
 * is gone or full.
 */
export function restoreRule(strategy: StrategyInput, modeId: string, index: number, rule: Rule): StrategyInput {
  if (!canAddRule(strategy, modeId)) return strategy;
  const restored = ruleIdsOf(strategy).has(rule.id) ? { ...rule, id: newId("rule", ruleIdsOf(strategy)) } : rule;
  return mapMode(strategy, modeId, (mode) => {
    const rules = [...mode.rules];
    rules.splice(Math.min(Math.max(index, 0), rules.length), 0, restored);
    return { ...mode, rules };
  });
}

/** Inserts a copy right after the original. */
export function duplicateRule(strategy: StrategyInput, modeId: string, ruleId: string): StrategyInput {
  if (!canAddRule(strategy, modeId)) return strategy;
  const copyId = newId("rule", ruleIdsOf(strategy));
  return mapMode(strategy, modeId, (mode) => {
    const at = mode.rules.findIndex((rule) => rule.id === ruleId);
    const original = mode.rules[at];
    if (original === undefined) return mode;
    const rules = [...mode.rules];
    rules.splice(at + 1, 0, { ...original, id: copyId });
    return { ...mode, rules };
  });
}

/** Moves a rule so it ends at position `toIndex`. The move buttons and drag both call this. */
export function moveRuleTo(strategy: StrategyInput, modeId: string, ruleId: string, toIndex: number): StrategyInput {
  return mapMode(strategy, modeId, (mode) => {
    const from = mode.rules.findIndex((rule) => rule.id === ruleId);
    const moving = mode.rules[from];
    if (moving === undefined) return mode;
    const to = Math.min(Math.max(toIndex, 0), mode.rules.length - 1);
    if (to === from) return mode;
    const rules = mode.rules.filter((rule) => rule.id !== ruleId);
    rules.splice(to, 0, moving);
    return { ...mode, rules };
  });
}

/** Moves a rule one place up (-1) or down (1). */
export function moveRule(strategy: StrategyInput, modeId: string, ruleId: string, step: -1 | 1): StrategyInput {
  const index = modeById(strategy, modeId)?.rules.findIndex((rule) => rule.id === ruleId) ?? -1;
  return index < 0 ? strategy : moveRuleTo(strategy, modeId, ruleId, index + step);
}

export function setFallback(strategy: StrategyInput, modeId: string, fallback: ActionRef): StrategyInput {
  return mapMode(strategy, modeId, (mode) => ({ ...mode, fallback }));
}

// ---------------------------------------------------------------------------
// Strategy: modes
// ---------------------------------------------------------------------------

export function canAddMode(strategy: StrategyInput): boolean {
  return strategy.modes.length < LIMITS.maxModes;
}

export function canDeleteMode(strategy: StrategyInput): boolean {
  return strategy.modes.length > LIMITS.minModes;
}

/** `nameFor(n)` is "Mode n" in the player's language; the first n that no mode uses wins. */
function uniqueModeName(strategy: StrategyInput, nameFor: (n: number) => string): string {
  const names = new Set(strategy.modes.map((mode) => mode.name));
  for (let n = strategy.modes.length + 1; ; n += 1) {
    const name = nameFor(n);
    if (!names.has(name)) return name;
  }
}

export function addMode(strategy: StrategyInput, nameFor: (n: number) => string): StrategyInput {
  if (!canAddMode(strategy)) return strategy;
  const mode: Mode = {
    id: newId("mode", modeIdsOf(strategy)),
    name: uniqueModeName(strategy, nameFor),
    rules: [],
    fallback: defaultAction(),
  };
  return { ...strategy, modes: [...strategy.modes, mode] };
}

export function renameMode(strategy: StrategyInput, modeId: string, name: string): StrategyInput {
  return mapMode(strategy, modeId, (mode) => ({ ...mode, name: name.slice(0, LIMITS.maxNameLength) }));
}

export interface ModeDeletionImpact {
  /** Rules inside the mode, which go with it. */
  readonly rules: number;
  /** Rules in other modes that switch to it, which then stay in their own mode. */
  readonly switches: number;
}

/** What deleteMode would lose, so the editor can ask before it deletes. */
export function modeDeletionImpact(strategy: StrategyInput, modeId: string): ModeDeletionImpact {
  const rules = modeById(strategy, modeId)?.rules.length ?? 0;
  const switches = strategy.modes
    .filter((mode) => mode.id !== modeId)
    .reduce((sum, mode) => sum + mode.rules.filter((rule) => rule.switchToMode === modeId).length, 0);
  return { rules, switches };
}

/** Removes a mode and every "switch to" that pointed at it. The last mode stays. */
export function deleteMode(strategy: StrategyInput, modeId: string): StrategyInput {
  if (!canDeleteMode(strategy)) return strategy;
  const modes = strategy.modes
    .filter((mode) => mode.id !== modeId)
    .map((mode) => ({
      ...mode,
      rules: mode.rules.map((rule) => (rule.switchToMode === modeId ? { ...rule, switchToMode: null } : rule)),
    }));
  return { ...strategy, modes };
}

/** The first mode is the start mode. */
export function moveModeToFirst(strategy: StrategyInput, modeId: string): StrategyInput {
  const chosen = modeById(strategy, modeId);
  if (chosen === undefined) return strategy;
  return { ...strategy, modes: [chosen, ...strategy.modes.filter((mode) => mode.id !== modeId)] };
}
