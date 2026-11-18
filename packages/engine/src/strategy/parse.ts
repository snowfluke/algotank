// The trust boundary for a strategy. The input comes from a browser, so every
// field is checked here and nothing after this point re-checks it. Every
// problem is reported twice: as a sentence that tells the player what to change
// (`errors`, read by the server and the scripts), and as a structured issue
// (`issues`, same order) that an interface turns into its own words next to the
// field the problem belongs to. On success the result is a copy that holds only
// the known fields.

import { ATTRIBUTES, BUILD_BUDGET, buildCost } from "../combat/combat.ts";
import type { AttributeId } from "../combat/combat.ts";
import type {
  ActionRef,
  Build,
  ConditionRef,
  Mode,
  ParamSpec,
  ParamValues,
  Rule,
  RuleAction,
  Strategy,
  StrategyInput,
} from "../types.ts";
import { isUltimateId } from "../ultimates/ultimates.ts";
import { ACTIONS } from "./actions.ts";
import { CONDITIONS } from "./conditions.ts";
import { LIMITS } from "./limits.ts";
import { STEP_ACTION_IDS, isStepAction } from "./sequence.ts";
import { TARGET_SELECTORS } from "./targets.ts";

// ---------------------------------------------------------------------------
// Structured issues
// ---------------------------------------------------------------------------

/**
 * Where a problem sits, as keys and list positions into the input, for example
 * ["modes", 0, "rules", 2, "conditions", 1, "params", "n"]. Positions, not ids:
 * an id can itself be the problem.
 */
export type IssuePath = readonly (string | number)[];

/** The values each kind of problem carries, so an interface can say it in its own words. */
export interface StrategyIssueParams {
  /** A part that must be an object is something else. */
  readonly notAnObject: { readonly part: "strategy" | "mode" | "rule" | "condition" | "action" };
  /** A condition or action with parameters has no parameter object. */
  readonly paramsMissing: Record<string, never>;
  readonly paramMissing: { readonly key: string };
  readonly paramOutOfRange: { readonly key: string; readonly min: number; readonly max: number };
  /** A choice or target parameter holds a value that is not one of its options. */
  readonly paramNotAnOption: { readonly key: string };
  readonly unknownCondition: Record<string, never>;
  readonly unknownAction: Record<string, never>;
  readonly unknownUltimate: Record<string, never>;
  /** A sequence has too few or too many steps, or its steps are not a list (actual null). */
  readonly stepCount: { readonly min: number; readonly max: number; readonly actual: number | null };
  /** A step names an action that is not atomic, such as "move toward". */
  readonly notAStep: Record<string, never>;
  readonly negateNotSwitch: Record<string, never>;
  readonly badId: { readonly part: "mode" | "rule"; readonly maxLength: number };
  readonly conditionCount: { readonly min: number; readonly max: number; readonly actual: number | null };
  readonly duplicateRuleId: Record<string, never>;
  readonly matchInvalid: Record<string, never>;
  readonly chanceOutOfRange: { readonly min: number; readonly max: number };
  readonly switchTargetMissing: Record<string, never>;
  readonly nameLength: { readonly max: number };
  readonly rulesNotList: Record<string, never>;
  readonly tooManyRules: { readonly max: number; readonly actual: number };
  readonly duplicateModeId: Record<string, never>;
  readonly modeCount: { readonly min: number; readonly max: number; readonly actual: number | null };
  readonly buildMissing: Record<string, never>;
  readonly unknownAttribute: { readonly key: string };
  readonly levelOutOfRange: { readonly attribute: AttributeId; readonly max: number };
  readonly overBudget: { readonly cost: number; readonly budget: number };
}

export type StrategyIssueCode = keyof StrategyIssueParams;

export type StrategyIssue = {
  readonly [C in StrategyIssueCode]: { readonly path: IssuePath; readonly code: C; readonly params: StrategyIssueParams[C] };
}[StrategyIssueCode];

const CODE_SET: Record<StrategyIssueCode, true> = {
  notAnObject: true,
  paramsMissing: true,
  paramMissing: true,
  paramOutOfRange: true,
  paramNotAnOption: true,
  unknownCondition: true,
  unknownAction: true,
  unknownUltimate: true,
  stepCount: true,
  notAStep: true,
  negateNotSwitch: true,
  badId: true,
  conditionCount: true,
  duplicateRuleId: true,
  matchInvalid: true,
  chanceOutOfRange: true,
  switchTargetMissing: true,
  nameLength: true,
  rulesNotList: true,
  tooManyRules: true,
  duplicateModeId: true,
  modeCount: true,
  buildMissing: true,
  unknownAttribute: true,
  levelOutOfRange: true,
  overBudget: true,
};

/** Every issue code. The record above makes a new code without an entry a compile error. */
export const STRATEGY_ISSUE_CODES = Object.keys(CODE_SET) as readonly StrategyIssueCode[];

/** The result of parseStrategy. It is a ParseResult whose failure also lists the issues. */
export type CheckedParseResult =
  | { readonly ok: true; readonly strategy: Strategy }
  | { readonly ok: false; readonly errors: readonly string[]; readonly issues: readonly StrategyIssue[] };

const NONE: Record<string, never> = {};

// ---------------------------------------------------------------------------

type Unknown = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so "constructor" or "__proto__" in the input finds nothing. */
function field(record: Unknown, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** A part of the strategy: its name in a sentence and its path for an issue. */
interface Place {
  readonly where: string;
  readonly path: IssuePath;
}

function inside(place: Place, where: string | null, ...path: (string | number)[]): Place {
  return { where: where === null ? place.where : `${place.where}, ${where}`, path: [...place.path, ...path] };
}

type IssueAt<C extends StrategyIssueCode> = { readonly code: C; readonly params: StrategyIssueParams[C] };

/** Collects a sentence and an issue for each problem, in the same order. */
class Problems {
  readonly messages: string[] = [];
  readonly issues: StrategyIssue[] = [];
  /** `path` is the place's own path unless the issue sits deeper, for example on one field. */
  add<C extends StrategyIssueCode>(place: Place, text: string, issue: IssueAt<C>, path: IssuePath = place.path): void {
    this.messages.push(`${place.where}: ${text}`);
    this.issues.push({ path, code: issue.code, params: issue.params } as StrategyIssue);
  }
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

function parseParam(spec: ParamSpec, raw: unknown, place: Place, problems: Problems): number | string | null {
  const path = [...place.path, "params", spec.key];
  if (raw === undefined) {
    problems.add(place, `the value for "${spec.label}" is missing. Choose one.`, { code: "paramMissing", params: { key: spec.key } }, path);
    return null;
  }
  switch (spec.kind) {
    case "int":
      if (!isWholeNumber(raw) || raw < spec.min || raw > spec.max) {
        problems.add(
          place,
          `"${spec.label}" must be a whole number from ${spec.min} to ${spec.max}.`,
          { code: "paramOutOfRange", params: { key: spec.key, min: spec.min, max: spec.max } },
          path,
        );
        return null;
      }
      return raw;
    case "choice":
      if (typeof raw !== "string" || !spec.options.some((option) => option.value === raw)) {
        const names = spec.options.map((option) => option.label).join(", ");
        problems.add(place, `"${spec.label}" must be one of: ${names}.`, { code: "paramNotAnOption", params: { key: spec.key } }, path);
        return null;
      }
      return raw;
    case "target":
      if (typeof raw !== "string" || TARGET_SELECTORS[raw] === undefined) {
        const names = Object.values(TARGET_SELECTORS).map((selector) => selector.label).join(", ");
        problems.add(place, `"${spec.label}" must be one of: ${names}.`, { code: "paramNotAnOption", params: { key: spec.key } }, path);
        return null;
      }
      return raw;
  }
}

/** Keeps only the parameters the table defines. */
function parseParams(specs: readonly ParamSpec[], raw: unknown, place: Place, problems: Problems): ParamValues {
  const source: Unknown = isRecord(raw) ? raw : {};
  if (specs.length > 0 && !isRecord(raw)) {
    problems.add(place, "the parameters are missing.", { code: "paramsMissing", params: NONE }, [...place.path, "params"]);
  }
  const clean: Record<string, number | string> = {};
  for (const spec of specs) {
    const value = parseParam(spec, field(source, spec.key), place, problems);
    if (value !== null) clean[spec.key] = value;
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Conditions, actions, rules, modes
// ---------------------------------------------------------------------------

function parseCondition(raw: unknown, place: Place, problems: Problems): ConditionRef | null {
  if (!isRecord(raw)) {
    problems.add(place, "the condition must be an object.", { code: "notAnObject", params: { part: "condition" } });
    return null;
  }
  const id = field(raw, "condition");
  const def = typeof id === "string" ? CONDITIONS[id] : undefined;
  if (def === undefined) {
    problems.add(
      place,
      `the condition ${JSON.stringify(id)} does not exist. Pick a condition from the list.`,
      { code: "unknownCondition", params: NONE },
      [...place.path, "condition"],
    );
    return null;
  }
  const negate = field(raw, "negate");
  if (typeof negate !== "boolean") {
    problems.add(place, 'the "is NOT" switch must be on or off.', { code: "negateNotSwitch", params: NONE }, [...place.path, "negate"]);
  }
  const params = parseParams(def.params, field(raw, "params"), place, problems);
  return { condition: def.id, params, negate: negate === true };
}

function parseAction(raw: unknown, place: Place, problems: Problems): ActionRef | null {
  if (!isRecord(raw)) {
    problems.add(place, "the action must be an object.", { code: "notAnObject", params: { part: "action" } });
    return null;
  }
  const id = field(raw, "action");
  const def = typeof id === "string" ? ACTIONS[id] : undefined;
  if (def === undefined) {
    problems.add(
      place,
      `the action ${JSON.stringify(id)} does not exist. Pick an action from the list.`,
      { code: "unknownAction", params: NONE },
      [...place.path, "action"],
    );
    return null;
  }
  return { action: def.id, params: parseParams(def.params, field(raw, "params"), place, problems) };
}

/** The action of a rule: one action, or a sequence of atomic steps when the object has "steps". */
function parseRuleAction(raw: unknown, place: Place, problems: Problems): RuleAction | null {
  if (!isRecord(raw) || !Object.hasOwn(raw, "steps")) return parseAction(raw, place, problems);
  const rawSteps = field(raw, "steps");
  const path = [...place.path, "steps"];
  const count = { min: LIMITS.minStepsPerSequence, max: LIMITS.maxStepsPerSequence };
  if (!Array.isArray(rawSteps) || rawSteps.length < count.min || rawSteps.length > count.max) {
    const has = Array.isArray(rawSteps) ? `, and this one has ${rawSteps.length}` : "";
    problems.add(
      place,
      `a sequence needs ${count.min} to ${plural(count.max, "step")}${has}. Remove a step or use one action.`,
      { code: "stepCount", params: { ...count, actual: Array.isArray(rawSteps) ? rawSteps.length : null } },
      path,
    );
    if (!Array.isArray(rawSteps)) return null;
  }
  const steps: ActionRef[] = [];
  let valid = rawSteps.length >= count.min;
  rawSteps.slice(0, count.max).forEach((rawStep, index) => {
    const stepPlace = inside(place, `step ${index + 1}`, "steps", index);
    const step = parseAction(rawStep, stepPlace, problems);
    if (step === null) {
      valid = false;
      return;
    }
    if (!isStepAction(step.action)) {
      const names = STEP_ACTION_IDS.map((id) => ACTIONS[id]?.label ?? id).join(", ");
      problems.add(stepPlace, `"${ACTIONS[step.action]?.label ?? step.action}" decides on its own, so it cannot be a step. Pick one of: ${names}.`, { code: "notAStep", params: NONE }, [...stepPlace.path, "action"]);
      valid = false;
      return;
    }
    steps.push(step);
  });
  return valid ? { steps } : null;
}

function parseId(raw: unknown, place: Place, what: "mode" | "rule", problems: Problems): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > LIMITS.maxIdLength) {
    problems.add(
      place,
      `the ${what} id must be text of 1 to ${LIMITS.maxIdLength} characters.`,
      { code: "badId", params: { part: what, maxLength: LIMITS.maxIdLength } },
      [...place.path, "id"],
    );
    return null;
  }
  return raw;
}

function parseConditions(raw: unknown, place: Place, problems: Problems): ConditionRef[] {
  const conditions: ConditionRef[] = [];
  const path = [...place.path, "conditions"];
  const count = { min: LIMITS.minConditionsPerRule, max: LIMITS.maxConditionsPerRule };
  if (!Array.isArray(raw)) {
    problems.add(
      place,
      `a rule needs ${LIMITS.minConditionsPerRule} to ${plural(LIMITS.maxConditionsPerRule, "condition")}.`,
      { code: "conditionCount", params: { ...count, actual: null } },
      path,
    );
    return conditions;
  }
  if (raw.length < LIMITS.minConditionsPerRule || raw.length > LIMITS.maxConditionsPerRule) {
    problems.add(
      place,
      `a rule needs ${LIMITS.minConditionsPerRule} to ${plural(LIMITS.maxConditionsPerRule, "condition")}, and this one has ${raw.length}.`,
      { code: "conditionCount", params: { ...count, actual: raw.length } },
      path,
    );
  }
  raw.slice(0, LIMITS.maxConditionsPerRule).forEach((item, index) => {
    const condition = parseCondition(item, inside(place, `condition ${index + 1}`, "conditions", index), problems);
    if (condition !== null) conditions.push(condition);
  });
  return conditions;
}

function parseRule(
  raw: unknown,
  place: Place,
  modeIds: ReadonlySet<string>,
  seenRuleIds: Set<string>,
  problems: Problems,
): Rule | null {
  if (!isRecord(raw)) {
    problems.add(place, "the rule must be an object.", { code: "notAnObject", params: { part: "rule" } });
    return null;
  }
  const id = parseId(field(raw, "id"), place, "rule", problems);
  if (id !== null) {
    if (seenRuleIds.has(id)) {
      problems.add(
        place,
        `another rule in this mode already uses the id "${id}". Give each rule its own id.`,
        { code: "duplicateRuleId", params: NONE },
        [...place.path, "id"],
      );
    }
    seenRuleIds.add(id);
  }

  const match = field(raw, "match");
  if (match !== "all" && match !== "any") {
    problems.add(place, 'the rule must match "all" or "any" of its conditions.', { code: "matchInvalid", params: NONE }, [...place.path, "match"]);
  }

  const conditions = parseConditions(field(raw, "conditions"), place, problems);
  const action = parseRuleAction(field(raw, "action"), inside(place, "action", "action"), problems);

  const chance = field(raw, "chance");
  if (!isWholeNumber(chance) || chance < LIMITS.minChance || chance > LIMITS.maxChance) {
    problems.add(
      place,
      `the chance must be a whole number from ${LIMITS.minChance} to ${LIMITS.maxChance} percent.`,
      { code: "chanceOutOfRange", params: { min: LIMITS.minChance, max: LIMITS.maxChance } },
      [...place.path, "chance"],
    );
  }

  const switchToMode = field(raw, "switchToMode");
  if (switchToMode !== null && (typeof switchToMode !== "string" || !modeIds.has(switchToMode))) {
    problems.add(
      place,
      "the mode to switch to does not exist. Pick one of your modes, or choose no switch.",
      { code: "switchTargetMissing", params: NONE },
      [...place.path, "switchToMode"],
    );
  }

  if (id === null || action === null || (match !== "all" && match !== "any") || !isWholeNumber(chance)) return null;
  return {
    id,
    match,
    conditions,
    action,
    chance,
    switchToMode: typeof switchToMode === "string" ? switchToMode : null,
  };
}

function modeLabel(raw: unknown, index: number): string {
  const name = isRecord(raw) ? field(raw, "name") : undefined;
  return typeof name === "string" && name.trim().length > 0 ? `Mode ${index + 1} ("${name.trim()}")` : `Mode ${index + 1}`;
}

function modePlace(raw: unknown, index: number): Place {
  return { where: modeLabel(raw, index), path: ["modes", index] };
}

function parseMode(raw: unknown, index: number, modeIds: ReadonlySet<string>, problems: Problems): Mode | null {
  const place = modePlace(raw, index);
  if (!isRecord(raw)) {
    problems.add(place, "the mode must be an object.", { code: "notAnObject", params: { part: "mode" } });
    return null;
  }
  const id = parseId(field(raw, "id"), place, "mode", problems);

  const rawName = field(raw, "name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length < 1 || name.length > LIMITS.maxNameLength) {
    problems.add(
      place,
      `the name must have 1 to ${LIMITS.maxNameLength} characters.`,
      { code: "nameLength", params: { max: LIMITS.maxNameLength } },
      [...place.path, "name"],
    );
  }

  const rules: Rule[] = [];
  const rawRules = field(raw, "rules");
  if (!Array.isArray(rawRules)) {
    problems.add(place, "the rules must be a list.", { code: "rulesNotList", params: NONE }, [...place.path, "rules"]);
  } else {
    if (rawRules.length > LIMITS.maxRulesPerMode) {
      problems.add(
        place,
        `a mode can have at most ${plural(LIMITS.maxRulesPerMode, "rule")}, and this one has ${rawRules.length}.`,
        { code: "tooManyRules", params: { max: LIMITS.maxRulesPerMode, actual: rawRules.length } },
        [...place.path, "rules"],
      );
    }
    const seenRuleIds = new Set<string>();
    rawRules.slice(0, LIMITS.maxRulesPerMode).forEach((rawRule, ruleIndex) => {
      const rule = parseRule(rawRule, inside(place, `rule ${ruleIndex + 1}`, "rules", ruleIndex), modeIds, seenRuleIds, problems);
      if (rule !== null) rules.push(rule);
    });
  }

  const fallback = parseAction(field(raw, "fallback"), inside(place, "fallback action", "fallback"), problems);
  if (id === null || fallback === null || name.length < 1) return null;
  return { id, name, rules, fallback };
}

/** Collects the ids of all modes first, so a rule can switch to a mode listed after it. */
function collectModeIds(rawModes: readonly unknown[], problems: Problems): ReadonlySet<string> {
  const ids = new Set<string>();
  rawModes.forEach((rawMode, index) => {
    const id = isRecord(rawMode) ? field(rawMode, "id") : undefined;
    if (typeof id !== "string") return;
    if (ids.has(id)) {
      const place = modePlace(rawMode, index);
      problems.add(
        place,
        `another mode already uses the id "${id}". Give each mode its own id.`,
        { code: "duplicateModeId", params: NONE },
        [...place.path, "id"],
      );
    }
    ids.add(id);
  });
  return ids;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function parseBuild(raw: unknown, problems: Problems): Build | null {
  const place: Place = { where: "Build", path: ["build"] };
  if (!isRecord(raw)) {
    problems.add(place, "the build must give a level for each attribute.", { code: "buildMissing", params: NONE });
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(ATTRIBUTES, key)) {
      problems.add(place, `"${key}" is not an attribute. Remove it.`, { code: "unknownAttribute", params: { key } }, ["build", key]);
    }
  }
  const build: Record<string, number> = {};
  let valid = true;
  for (const attribute of Object.values(ATTRIBUTES)) {
    const level = field(raw, attribute.id);
    const highest = attribute.levels.length - 1;
    if (!isWholeNumber(level) || level < 0 || level > highest) {
      problems.add(
        place,
        `${attribute.label} must be a whole number from 0 to ${highest}.`,
        { code: "levelOutOfRange", params: { attribute: attribute.id, max: highest } },
        ["build", attribute.id],
      );
      valid = false;
    } else {
      build[attribute.id] = level;
    }
  }
  if (!valid) return null;
  const cost = buildCost(build);
  if (cost > BUILD_BUDGET) {
    problems.add(
      place,
      `the build costs ${cost} points and the budget is ${BUILD_BUDGET}. Lower one or more levels.`,
      { code: "overBudget", params: { cost, budget: BUILD_BUDGET } },
    );
    return null;
  }
  return build;
}

// ---------------------------------------------------------------------------

export function parseStrategy(input: unknown): CheckedParseResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["The strategy must be an object with a list of modes and a build."],
      issues: [{ path: [], code: "notAnObject", params: { part: "strategy" } }],
    };
  }
  const problems = new Problems();

  const rawModes = field(input, "modes");
  const modes: Mode[] = [];
  const modesPlace: Place = { where: "Modes", path: ["modes"] };
  const modeCount = { min: LIMITS.minModes, max: LIMITS.maxModes };
  if (!Array.isArray(rawModes)) {
    problems.add(
      modesPlace,
      `a strategy needs ${LIMITS.minModes} to ${plural(LIMITS.maxModes, "mode")}.`,
      { code: "modeCount", params: { ...modeCount, actual: null } },
    );
  } else {
    if (rawModes.length < LIMITS.minModes || rawModes.length > LIMITS.maxModes) {
      problems.add(
        modesPlace,
        `a strategy needs ${LIMITS.minModes} to ${plural(LIMITS.maxModes, "mode")}, and this one has ${rawModes.length}.`,
        { code: "modeCount", params: { ...modeCount, actual: rawModes.length } },
      );
    }
    const limited = rawModes.slice(0, LIMITS.maxModes);
    const modeIds = collectModeIds(limited, problems);
    limited.forEach((rawMode, index) => {
      const mode = parseMode(rawMode, index, modeIds, problems);
      if (mode !== null) modes.push(mode);
    });
  }

  const build = parseBuild(field(input, "build"), problems);

  const ultimate = field(input, "ultimate");
  if (!isUltimateId(ultimate)) {
    problems.add({ where: "Ultimate", path: ["ultimate"] }, "the strategy needs one valid ultimate.", { code: "unknownUltimate", params: NONE });
    return { ok: false, errors: problems.messages, issues: problems.issues };
  }

  if (problems.messages.length > 0 || build === null) return { ok: false, errors: problems.messages, issues: problems.issues };
  // The only place a Strategy is made: every check above has passed.
  const checked: StrategyInput = { modes, build, ultimate };
  return { ok: true, strategy: checked as Strategy };
}
