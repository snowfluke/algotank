// Builders for the tests in this folder. Not part of the engine's public interface.

import type {
  ActionRef,
  BotState,
  ConditionRef,
  DecisionContext,
  Direction,
  ItemKind,
  Mode,
  ParamValues,
  Rng,
  Rule,
  RuleAction,
  Snapshot,
  Strategy,
} from "../types.ts";
import { STANDARD_RULE_SET_ID, ruleSet } from "../combat/rule-sets.ts";
import { ITEM_RULES, itemHandOf } from "../items/items.ts";
import type { Placement } from "../round/resolve.ts";
import { parseStrategy } from "./parse.ts";

const ZERO_BUILD = { reach: 0, aim: 0, dodge: 0 } as const;

/** The numbers of the standard set, which most tests play under. */
export const STANDARD = ruleSet(STANDARD_RULE_SET_ID);

export function bot(id: string, x: number, y: number, direction: Direction, overrides: Partial<BotState> = {}): BotState {
  const { item = null, itemsWaiting, itemUses = item === null ? 0 : ITEM_RULES.uses[item], ...rest } = overrides;
  return {
    id,
    x,
    y,
    direction,
    score: 0,
    wasHit: false,
    lastHitBy: null,
    ticksSinceHit: null,
    lastMove: null,
    modeId: "main",
    build: ZERO_BUILD,
    ticksInMode: 0,
    hitsLanded: 0,
    hitsTaken: 0,
    ticksSinceLandedHit: null,
    water: STANDARD.waterCapacity,
    ...itemHandOf({ item, itemsWaiting }),
    itemUses,
    effect: null,
    ...rest,
  };
}

/** The tank holding `item` with its full uses, as after a pick-up. */
export function holding(tank: BotState, item: ItemKind): BotState {
  return { ...tank, item, itemUses: ITEM_RULES.uses[item] };
}

export function withPlacement(tank: BotState, placement: Placement): BotState {
  const { itemsWaiting: _previousQueue, ...base } = tank;
  const { itemsWaiting: _newQueue, ...place } = placement;
  return { ...base, ...place, ...itemHandOf(placement) };
}

/** A 9 x 7 arena under the standard set. */
export function snapshotOf(bots: readonly BotState[], overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    width: 9,
    height: 7,
    tick: 0,
    ticksTotal: 100,
    survivorsAfterRound: 8,
    ruleSetId: STANDARD_RULE_SET_ID,
    bots,
    items: [],
    ...overrides,
  };
}

export function contextFor(snapshot: Snapshot, id: string): DecisionContext {
  const self = snapshot.bots.find((candidate) => candidate.id === id);
  if (self === undefined) throw new Error(`no bot "${id}" in the snapshot`);
  return { self, snapshot };
}

export interface StubRng extends Rng {
  /** Every draw so far, for example "chance:50" or "int:4". */
  readonly calls: string[];
}

/** Returns scripted answers in order and fails on a draw that the script does not cover. */
export function stubRng(script: { chance?: boolean[]; int?: number[] } = {}): StubRng {
  const chances = [...(script.chance ?? [])];
  const ints = [...(script.int ?? [])];
  const calls: string[] = [];
  return {
    calls,
    next() {
      calls.push("next");
      throw new Error("unexpected rng.next()");
    },
    int(maxExclusive) {
      calls.push(`int:${maxExclusive}`);
      const value = ints.shift();
      if (value === undefined) throw new Error("unexpected rng.int()");
      return value;
    },
    chance(percent) {
      calls.push(`chance:${percent}`);
      const value = chances.shift();
      if (value === undefined) throw new Error("unexpected rng.chance()");
      return value;
    },
    shuffle() {
      calls.push("shuffle");
      throw new Error("unexpected rng.shuffle()");
    },
  };
}

export function when(condition: string, params: ParamValues = {}, negate = false): ConditionRef {
  return { condition, params, negate };
}

export function act(action: string, params: ParamValues = {}): ActionRef {
  return { action, params };
}

export function rule(id: string, conditions: readonly ConditionRef[], action: RuleAction, extra: Partial<Rule> = {}): Rule {
  return { id, match: "all", conditions, action, chance: 100, switchToMode: null, ...extra };
}

export function mode(id: string, rules: readonly Rule[], fallback: ActionRef): Mode {
  return { id, name: id, rules, fallback };
}

/** Runs the input through parseStrategy and fails the test when it is rejected. */
export function strategyOf(modes: readonly Mode[], build: Record<string, number> = ZERO_BUILD): Strategy {
  const result = parseStrategy({ modes, build, ultimate: "dash" });
  if (!result.ok) throw new Error(`test strategy is invalid:\n${result.errors.join("\n")}`);
  return result.strategy;
}
