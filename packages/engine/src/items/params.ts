// The item parameters of the rule pieces in strategy/conditions.ts and strategy/actions.ts.
// The values are the ids of ITEM_KINDS and TANK_EFFECT_KINDS, plus "any"; the web
// catalog gives each value its words.

import { ITEM_KINDS, TANK_EFFECT_KINDS } from "../types.ts";
import type { ItemKind, ParamSpec, ParamValues, TankEffectKind } from "../types.ts";
import { textValue } from "../strategy/define.ts";

export const ANY_ITEM = "any";

const ITEM_LABELS: Readonly<Record<ItemKind, string>> = { bucket: "a bucket", umbrella: "an umbrella", pinwheel: "a pinwheel", mudBall: "a mud ball" };
const EFFECT_LABELS: Readonly<Record<TankEffectKind, string>> = { dizzy: "dizzy", stuck: "stuck" };

/** Any item or one kind. */
export function itemParam(): ParamSpec {
  return {
    kind: "choice",
    key: "item",
    label: "Item",
    options: [{ value: ANY_ITEM, label: "any item" }, ...ITEM_KINDS.map((value) => ({ value, label: ITEM_LABELS[value] }))],
    default: ANY_ITEM,
  };
}

export function effectParam(): ParamSpec {
  return {
    kind: "choice",
    key: "effect",
    label: "Effect",
    options: TANK_EFFECT_KINDS.map((value) => ({ value, label: EFFECT_LABELS[value] })),
    default: TANK_EFFECT_KINDS[0],
  };
}

function oneOf<T extends string>(table: readonly T[], value: string, what: string): T {
  if (!(table as readonly string[]).includes(value)) throw new Error(`Unknown ${what} "${value}". Run the strategy through parseStrategy first.`);
  return value as T;
}

export function itemValue(params: ParamValues): ItemKind | typeof ANY_ITEM {
  const value = textValue(params, "item");
  return value === ANY_ITEM ? ANY_ITEM : oneOf(ITEM_KINDS, value, "item");
}

export function effectValue(params: ParamValues): TankEffectKind {
  return oneOf(TANK_EFFECT_KINDS, textValue(params, "effect"), "effect");
}

/** True when a tank's hand matches the parameter: "any" is any item. */
export function holds(item: ItemKind | null, wanted: ItemKind | typeof ANY_ITEM): boolean {
  return item !== null && (wanted === ANY_ITEM || item === wanted);
}
