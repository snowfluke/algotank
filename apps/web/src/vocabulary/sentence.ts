// Turns conditions, actions, rules and modes into sentences in the player's
// language. The rule card reads the finished sentence; the rule editor reads the
// same parts and puts a control where a parameter goes, so both always agree.

import { ACTION_IDS, ACTIONS, ATTRIBUTES, CONDITION_IDS, CONDITIONS, TARGET_IDS, isRuleSetId, isSequence, ultimateCatchesTanks } from "@game/engine";
import type { ActionId, ActionRef, AttributeId, ConditionId, ConditionRef, Mode, ParamSpec, ParamValues, Rule, RuleAction, UltimateId } from "@game/engine";
import { ACTION_GROUPS, CHOICE_OPTIONS, CONDITION_GROUPS, PLAY_STYLE_MODES, isOneOf, type ActionGroupId, type ChoiceKey, type ConditionGroupId } from "./ids.ts";
import type { PhraseText, UnitText, VocabularyText } from "./messages.ts";
import { stepKindOf, type StepKind } from "./steps.ts";

type LabelPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "param"; readonly spec: ParamSpec };

/** Splits at {key} marks. `split` with a capture group returns the keys at the odd positions. */
const PARAM_MARK = /\{(\w+)\}/;

/**
 * Splits a catalog text into words and parameters. A parameter the text does not
 * mention goes to the end, so the player can still set it.
 */
export function labelParts(label: string, specs: readonly ParamSpec[]): LabelPart[] {
  const used = new Set<string>();
  const parts: LabelPart[] = [];
  label.split(PARAM_MARK).forEach((piece, index) => {
    if (index % 2 === 0) {
      if (piece !== "") parts.push({ kind: "text", text: piece });
      return;
    }
    const spec = specs.find((candidate) => candidate.key === piece);
    if (spec === undefined) {
      parts.push({ kind: "text", text: `{${piece}}` });
      return;
    }
    used.add(spec.key);
    parts.push({ kind: "param", spec });
  });
  for (const spec of specs) {
    if (!used.has(spec.key)) parts.push({ kind: "param", spec });
  }
  return parts;
}

export type SentencePart =
  | { readonly kind: "text"; readonly text: string }
  /** `unit` is the word after the number in this language, or null. */
  | { readonly kind: "param"; readonly spec: ParamSpec; readonly unit: UnitText | null };

function phraseParts(v: VocabularyText, phrase: PhraseText, specs: readonly ParamSpec[]): SentencePart[] {
  return labelParts(phrase.text, specs).map((part) => {
    if (part.kind === "text") return part;
    const unitId = phrase.units?.[part.spec.key];
    return { kind: "param", spec: part.spec, unit: unitId === undefined ? null : v.units[unitId] };
  });
}

/** The parts of a condition's sentence, or null for an id this version does not know. */
export function conditionParts(v: VocabularyText, conditionId: string): SentencePart[] | null {
  const def = CONDITIONS[conditionId];
  if (def === undefined || !isOneOf(CONDITION_IDS, conditionId)) return null;
  return phraseParts(v, v.conditions[conditionId], def.params);
}

export function actionParts(v: VocabularyText, actionId: string): SentencePart[] | null {
  const def = ACTIONS[actionId];
  if (def === undefined || !isOneOf(ACTION_IDS, actionId)) return null;
  return phraseParts(v, v.actions[actionId], def.params);
}

function choiceText(v: VocabularyText, key: string, value: string): string | null {
  if (key === "attribute") return Object.hasOwn(ATTRIBUTES, value) ? v.attributes[value as AttributeId].name : null;
  if (key === "set") return isRuleSetId(value) ? v.roundRules[value].name : null;
  if (!Object.hasOwn(CHOICE_OPTIONS, key)) return null;
  const choiceKey = key as ChoiceKey;
  const options = v.options[choiceKey] as Readonly<Record<string, string>>;
  return isOneOf(CHOICE_OPTIONS[choiceKey], value) ? (options[value] ?? null) : null;
}

/** The words for one option of a choice or target parameter, for the choices of a picker. */
export function optionText(v: VocabularyText, spec: ParamSpec, value: string): string {
  if (spec.kind === "target") return isOneOf(TARGET_IDS, value) ? v.targets[value] : v.unknown;
  return choiceText(v, spec.key, value) ?? v.unknown;
}

/** A number with its unit word, for example "3 squares" or "50%". */
export function amountText(n: number, unit: UnitText | null): string {
  return unit === null ? String(n) : `${n}${unit.gap}${unit.word(n)}`;
}

function partsText(v: VocabularyText, parts: readonly SentencePart[], values: ParamValues): string {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      const value = values[part.spec.key];
      if (value === undefined) return v.unknown;
      if (part.spec.kind === "int") return typeof value === "number" ? amountText(value, part.unit) : v.unknown;
      return optionText(v, part.spec, String(value));
    })
    .join("");
}

/** The comparison that is true exactly when the chosen one is false, on whole numbers. */
const OPPOSITE_COMPARE: Readonly<Record<(typeof CHOICE_OPTIONS.compare)[number], (typeof CHOICE_OPTIONS.compare)[number]>> = {
  atLeast: "fewerThan",
  fewerThan: "atLeast",
  atMost: "moreThan",
  moreThan: "atMost",
};

function withOppositeCompare(params: ParamValues): ParamValues {
  const compare = params.compare;
  return typeof compare === "string" && isOneOf(CHOICE_OPTIONS.compare, compare) ? { ...params, compare: OPPOSITE_COMPARE[compare] } : params;
}

/**
 * The condition as a sentence part. With "opposite" on (the negate switch), it reads the condition's own negative,
 * which each language words naturally: a plain opposite ("less than" for "not at least") where the
 * phrase says so, because a child reads that more easily than a "not" in front of a comparison.
 */
export function conditionText(v: VocabularyText, ref: ConditionRef): string {
  const def = CONDITIONS[ref.condition];
  if (def === undefined || !isOneOf(CONDITION_IDS, ref.condition)) return v.unknown;
  const phrase = v.conditions[ref.condition];
  if (!ref.negate) return partsText(v, phraseParts(v, phrase, def.params), ref.params);
  const params = phrase.notOpposite === true ? withOppositeCompare(ref.params) : ref.params;
  return partsText(v, phraseParts(v, { ...phrase, text: phrase.not }, def.params), params);
}

export function actionText(v: VocabularyText, ref: ActionRef): string {
  const parts = actionParts(v, ref.action);
  return parts === null ? v.unknown : partsText(v, parts, ref.params);
}

/** One step of a sequence as a sentence part: "turn left". */
function stepText(v: VocabularyText, step: ActionRef): string {
  const kind = stepKindOf(step);
  return kind === null ? actionText(v, step) : v.steps[kind].text;
}

/** A rule's action as a sentence part: the one action, or the steps joined in order ("move one square forward, then turn left"). */
function ruleActionText(v: VocabularyText, action: RuleAction): string {
  if (!isSequence(action)) return actionText(v, action);
  const [first, ...rest] = action.steps.map((step) => stepText(v, step));
  return rest.reduce((before, step) => v.rule.thenStep(before, step), first ?? v.unknown);
}

/** The action as something the tank did, for a turn that has passed: "moved away from the nearest tank". */
export function actionDoneText(v: VocabularyText, ref: ActionRef): string {
  const def = ACTIONS[ref.action];
  if (def === undefined || !isOneOf(ACTION_IDS, ref.action)) return v.unknown;
  const text = v.actions[ref.action];
  return partsText(v, phraseParts(v, { ...text, text: text.done }, def.params), ref.params);
}

/**
 * The same, about the tank in the third person, for a sentence that starts with
 * "Your tank": its targets read "… than it", not "… than me".
 */
export function actionDoneAboutText(v: VocabularyText, ref: ActionRef): string {
  return actionDoneText({ ...v, targets: v.targetsThirdPerson }, ref);
}

/** The mode's name as the player reads it: a play style's own mode in this language, any other name as typed. */
export function modeName(v: VocabularyText, mode: Pick<Mode, "id" | "name">): string {
  const id = mode.id;
  return Object.hasOwn(PLAY_STYLE_MODES, id) && PLAY_STYLE_MODES[id as keyof typeof PLAY_STYLE_MODES] === mode.name
    ? v.modeNames[id as keyof typeof PLAY_STYLE_MODES]
    : mode.name;
}

/** The chance and the mode switch of a rule, as sentences, when they apply. */
function ruleExtras(v: VocabularyText, rule: Rule, modes: readonly Mode[]): string[] {
  const sentences: string[] = [];
  if (rule.chance < 100) sentences.push(v.rule.chance(rule.chance));
  if (rule.switchToMode !== null) {
    const target = modes.find((mode) => mode.id === rule.switchToMode);
    sentences.push(v.rule.switchTo(target === undefined ? v.unknown : modeName(v, target)));
  }
  return sentences;
}

/** A rule's sentences from its conditions already in words: "When …, …." then the chance and the mode switch when they apply. */
function ruleSentences(v: VocabularyText, rule: Rule, conditions: readonly string[], modes: readonly Mode[]): string {
  return [v.rule.sentence(conditions, rule.match, ruleActionText(v, rule.action)), ...ruleExtras(v, rule, modes)].join(" ");
}

/** Up to this many condition blocks show on a rule card; more read as one block that counts them, so a card stays a few lines tall. */
const MAX_CONDITION_BLOCKS = 3;

/** One block of a sequence: its kind for the icon (null for a step this version cannot draw) and its short label. */
export interface StepBlock {
  readonly kind: StepKind | null;
  readonly name: string;
}

/** What a rule card draws after the arrow: one action block, or a row of step blocks. */
export type RuleActionParts =
  /** The action in words, and its id for the icon (null for an id this version does not know). */
  | { readonly kind: "one"; readonly id: ActionId | null; readonly text: string }
  | { readonly kind: "steps"; readonly steps: readonly StepBlock[] };

export function stepBlocks(v: VocabularyText, steps: readonly ActionRef[]): StepBlock[] {
  return steps.map((step) => {
    const kind = stepKindOf(step);
    return { kind, name: kind === null ? actionText(v, step) : v.steps[kind].name };
  });
}

function ruleActionParts(v: VocabularyText, action: RuleAction): RuleActionParts {
  if (isSequence(action)) return { kind: "steps", steps: stepBlocks(v, action.steps) };
  return { kind: "one", id: isOneOf(ACTION_IDS, action.action) ? action.action : null, text: actionText(v, action) };
}

/** A rule as the rules list draws it: blocks of words, not one sentence. The card's accessible name is ruleBriefText. */
export interface RuleParts {
  /** The conditions in words, one block each; a rule with more than MAX_CONDITION_BLOCKS ends with a block that counts the rest. */
  readonly conditions: readonly string[];
  /** "and" or "or" in this language, drawn between the condition blocks. */
  readonly joiner: string;
  readonly action: RuleActionParts;
  /** The name of the mode the rule switches to, or null when it stays. */
  readonly switchTo: string | null;
  /** The chance in percent when it is under 100, or null. */
  readonly chance: number | null;
}

export function ruleParts(v: VocabularyText, rule: Rule, modes: readonly Mode[]): RuleParts {
  const words = rule.conditions.map((c) => conditionText(v, c));
  const shown = MAX_CONDITION_BLOCKS - 1;
  const conditions = words.length > MAX_CONDITION_BLOCKS ? [...words.slice(0, shown), v.rule.moreConditions(words.length - shown, rule.match)] : words;
  const target = rule.switchToMode === null ? undefined : modes.find((mode) => mode.id === rule.switchToMode);
  return {
    conditions,
    joiner: v.rule.joiners[rule.match],
    action: ruleActionParts(v, rule.action),
    switchTo: rule.switchToMode === null ? null : target === undefined ? v.unknown : modeName(v, target),
    chance: rule.chance < 100 ? rule.chance : null,
  };
}

/** The whole rule: "When …, …." then the chance and the mode switch when they apply. */
export function ruleText(v: VocabularyText, rule: Rule, modes: readonly Mode[]): string {
  return ruleSentences(v, rule, rule.conditions.map((c) => conditionText(v, c)), modes);
}

/**
 * The rule as the rules list shows it: like ruleText, but a rule with more than 2
 * conditions names the first and counts the rest ("When … and 3 more conditions, …"),
 * so one rule never needs more than a few lines. The rule's own step shows it whole.
 */
export function ruleBriefText(v: VocabularyText, rule: Rule, modes: readonly Mode[]): string {
  const [first, ...rest] = rule.conditions;
  if (first === undefined || rest.length < 2) return ruleText(v, rule, modes);
  return ruleSentences(v, rule, [conditionText(v, first), v.rule.moreConditions(rest.length, rule.match)], modes);
}

export function fallbackText(v: VocabularyText, action: ActionRef): string {
  return v.rule.fallback(actionText(v, action));
}

// ---------------------------------------------------------------------------
// Grouped lists for the condition and action pickers
// ---------------------------------------------------------------------------

export interface PickGroup<T extends string> {
  readonly name: string;
  readonly items: readonly { readonly id: T; readonly name: string }[];
}

function groupIdOf<G extends string>(groups: Readonly<Record<G, string>>, engineGroup: string): G {
  const found = (Object.keys(groups) as G[]).find((key) => groups[key] === engineGroup);
  if (found === undefined) throw new Error(`The engine group "${engineGroup}" has no catalog id in vocabulary/ids.ts.`);
  return found;
}

/**
 * The area conditions and "Go to an area" name hybrid layouts, which arrive with the ultimates on 20 November
 * (owner, 2026-11-19: "hold it for 22 nov"), so the pickers offer them only from then. A saved rule that has one
 * still shows.
 */
const AREA_CONDITIONS: ReadonlySet<ConditionId> = new Set<ConditionId>(["myArea", "targetArea"]);
const AREA_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>(["goToArea"]);

/** The conditions under their group headings, in the engine's order. */
export function conditionGroups(v: VocabularyText, ultimate: UltimateId, hybridOn: boolean): PickGroup<ConditionId>[] {
  const groups = new Map<ConditionGroupId, { id: ConditionId; name: string }[]>();
  for (const id of CONDITION_IDS) {
    if (id === "ultimateCatches" && !ultimateCatchesTanks(ultimate)) continue;
    if (!hybridOn && AREA_CONDITIONS.has(id)) continue;
    const def = CONDITIONS[id];
    if (def === undefined) continue;
    const group = groupIdOf(CONDITION_GROUPS, def.group);
    groups.set(group, [...(groups.get(group) ?? []), { id, name: v.conditions[id].name }]);
  }
  return [...groups].map(([group, items]) => ({ name: v.conditionGroups[group], items }));
}

/**
 * Actions the one-action picker leaves out: "wait" came for the steps of a sequence
 * (S3), and the one-action list keeps the 12 choices the rules editor was designed with.
 * The engine still accepts it as one action, and a card still draws it.
 */
const STEP_ONLY_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>(["wait"]);

export function actionGroups(v: VocabularyText, hybridOn: boolean, fallback = false): PickGroup<ActionId>[] {
  const groups = new Map<ActionGroupId, { id: ActionId; name: string }[]>();
  for (const id of ACTION_IDS) {
    if (STEP_ONLY_ACTIONS.has(id)) continue;
    if (!hybridOn && AREA_ACTIONS.has(id)) continue;
    const def = ACTIONS[id];
    if (def === undefined || (fallback && def.ruleOnly)) continue;
    const group = groupIdOf(ACTION_GROUPS, def.group);
    groups.set(group, [...(groups.get(group) ?? []), { id, name: v.actions[id].name }]);
  }
  return [...groups].map(([group, items]) => ({ name: v.actionGroups[group], items }));
}
