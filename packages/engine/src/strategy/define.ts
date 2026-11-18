// Helpers for writing vocabulary entries (conditions, selectors, actions). They
// keep an entry short and make a mistake in one entry fail at module load.

import { ATTRIBUTES } from "../combat/combat.ts";
import type { AttributeId } from "../combat/combat.ts";
import type { ParamSpec, ParamValues } from "../types.ts";

/** Longest distance, in cells, that a distance parameter accepts. */
const MAX_DISTANCE = 20;

/**
 * Keeps each entry's id as a literal type, so `(typeof defs)[number]["id"]` names
 * every id of a table and the web catalog can require a text for each one. The
 * entries keep the type `Def`, so a lookup by a saved string still finds `Def | undefined`.
 */
export function withLiteralIds<Def extends { readonly id: string }>() {
  return <const Id extends string>(defs: readonly (Def & { readonly id: Id })[]): readonly (Def & { readonly id: Id })[] => defs;
}

/**
 * Builds a table keyed by id from a list of entries, so an id is written once.
 * The table has no prototype, so a lookup of "constructor" or "__proto__" finds nothing.
 */
export function tableOf<T extends { readonly id: string }>(defs: readonly T[]): Readonly<Record<string, T>> {
  const table: Record<string, T> = Object.create(null);
  for (const def of defs) {
    if (table[def.id] !== undefined) throw new Error(`Vocabulary has two entries with the id "${def.id}".`);
    table[def.id] = def;
  }
  return Object.freeze(table);
}

export function intParam(key: string, label: string, min: number, max: number, defaultValue: number): ParamSpec {
  return { kind: "int", key, label, min, max, default: defaultValue };
}

type IntSpec = Extract<ParamSpec, { readonly kind: "int" }>;

export function intOptionParam(key: string, label: string, options: readonly [number, ...number[]], defaultValue: number): IntSpec {
  return { kind: "int", key, label, min: Math.min(...options), max: Math.max(...options), default: defaultValue, options };
}

export function intParamAllows(spec: IntSpec, value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    (spec.options === undefined ? value >= spec.min && value <= spec.max : spec.options.includes(value));
}

export function cellsParam(key: string, defaultValue: number): ParamSpec {
  return intParam(key, "Number of cells", 1, MAX_DISTANCE, defaultValue);
}

export function targetParam(): ParamSpec {
  return { kind: "target", key: "target", label: "Target", default: "nearest" };
}

/** A choice among the build attributes. The value is the attribute id. */
export function attributeParam(): ParamSpec {
  return {
    kind: "choice",
    key: "attribute",
    label: "Attribute",
    options: Object.values(ATTRIBUTES).map((attribute) => ({ value: attribute.id, label: attribute.label })),
    default: Object.keys(ATTRIBUTES)[0] ?? "",
  };
}

/** Reads the attribute parameter back as an id of the table. parseStrategy has already checked it. */
export function attributeValue(params: ParamValues): AttributeId {
  const id = textValue(params, "attribute");
  if (!Object.hasOwn(ATTRIBUTES, id)) throw new Error(`Unknown attribute "${id}".`);
  return id as AttributeId;
}

const COMPARISONS = {
  atLeast: { label: "at least", holds: (actual: number, limit: number) => actual >= limit },
  atMost: { label: "at most", holds: (actual: number, limit: number) => actual <= limit },
  fewerThan: { label: "fewer than", holds: (actual: number, limit: number) => actual < limit },
  moreThan: { label: "more than", holds: (actual: number, limit: number) => actual > limit },
} as const;

export type Comparison = keyof typeof COMPARISONS;

/**
 * The "at least / fewer than" switch of a condition. The two options are the
 * first and the second comparison, and the first is the default. The key is
 * "compare", so a label writes `{compare} {n}`.
 */
export function comparisonParam(first: Comparison, second: Comparison): ParamSpec {
  return {
    kind: "choice",
    key: "compare",
    label: "Comparison",
    options: [first, second].map((value) => ({ value, label: COMPARISONS[value].label })),
    default: first,
  };
}

/** True when `actual` passes the comparison chosen in the "compare" parameter against `limit`. */
export function compares(params: ParamValues, actual: number, limit: number): boolean {
  const chosen = textValue(params, "compare");
  if (!Object.hasOwn(COMPARISONS, chosen)) throw new Error(`Unknown comparison "${chosen}".`);
  return COMPARISONS[chosen as Comparison].holds(actual, limit);
}

/** Reads a number parameter. parseStrategy has already checked it, so a miss is a bug. */
export function intValue(params: ParamValues, key: string): number {
  const value = params[key];
  if (typeof value !== "number") throw new Error(`Parameter "${key}" must be a number.`);
  return value;
}

export function textValue(params: ParamValues, key: string): string {
  const value = params[key];
  if (typeof value !== "string") throw new Error(`Parameter "${key}" must be text.`);
  return value;
}
