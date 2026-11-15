// Items on the board (docs/specs/revamp/84-items.md). Every number of the feature is in
// ITEM_RULES, so tuning edits this file only. The round loop (round/round.ts) calls the
// end-of-turn functions below in this order: pickUp, countDownEffects then the new effects
// of the turn's hits, ageItems, spawnItem. Throw resolution (round/resolve.ts) reads
// holderBlocks, actsOnOwnHit and effectOfHit.
//
// Random draws: only spawnItem draws, one int for the kind and one int for the square, and
// only on a turn that spawns. A round with items off never calls it.

import type { BoardItem, BotState, ItemKind, Pickup, Rng, Snapshot, TankEffect, TankEffectKind } from "../types.ts";
import { ITEM_KINDS } from "../types.ts";

export const ITEM_RULES = {
  /** An item can appear at the end of every turn whose number + 1 is a multiple of this. */
  spawnEvery: 10,
  /** At most one item on the board per this many tanks, and always at least 1. */
  tanksPerItem: 4,
  /** Turns an item stays on the board when nobody takes it. */
  turnsOnBoard: 30,
  /** Weight of each kind in the draw. */
  weights: { bucket: 3, umbrella: 3, pinwheel: 2, mudBall: 2 } satisfies Record<ItemKind, number>,
  /** Points a hit from a tank with a bucket moves, instead of POINTS_PER_HIT. */
  bucketHitPoints: 2,
  /** Turns an effect lasts after the hit that caused it. */
  effectTurns: { dizzy: 3, stuck: 2 } satisfies Record<TankEffectKind, number>,
} as const;

/** The effect each item gives the tank its holder hits. The bucket and the umbrella give none. */
const EFFECT_OF_ITEM: Readonly<Record<ItemKind, TankEffectKind | null>> = { bucket: null, umbrella: null, pinwheel: "dizzy", mudBall: "stuck" };

/** Items that act when their holder's throw hits: they are used up on that hit. */
export function actsOnOwnHit(item: ItemKind | null): boolean {
  return item === "bucket" || item === "pinwheel" || item === "mudBall";
}

/** Most items the board holds with this many tanks on it. */
export function itemCap(tanks: number): number {
  return Math.max(1, Math.floor(tanks / ITEM_RULES.tanksPerItem));
}

/** True when the tank's umbrella turns this hit into a block. */
export function holderBlocks(target: Pick<BotState, "item">): boolean {
  return target.item === "umbrella";
}

/** The effect the thrower's item puts on the tank it hits, or null. */
export function effectOfHit(thrower: Pick<BotState, "item">): TankEffectKind | null {
  return thrower.item === null ? null : EFFECT_OF_ITEM[thrower.item];
}

export function newEffect(kind: TankEffectKind): TankEffect {
  return { kind, turnsLeft: ITEM_RULES.effectTurns[kind] };
}

/** The effect after one more turn: one turn less, and none after the last. */
export function countDown(effect: TankEffect | null): TankEffect | null {
  if (effect === null || effect.turnsLeft <= 1) return null;
  return { kind: effect.kind, turnsLeft: effect.turnsLeft - 1 };
}

interface Cell {
  readonly x: number;
  readonly y: number;
}

/** A tank as pickUp sees it: where it ended the turn and what it holds. */
export interface Carrier {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  item: ItemKind | null;
}

/**
 * Tanks with an empty hand that ended the turn on an item take it. A tank that holds an item
 * leaves another on the board. Changes `carriers` in place and returns the items left.
 */
export function pickUp(items: readonly BoardItem[], carriers: readonly Carrier[]): { readonly items: BoardItem[]; readonly pickups: Pickup[] } {
  const onSquare = new Map<string, Carrier>();
  for (const carrier of carriers) onSquare.set(`${carrier.x},${carrier.y}`, carrier);
  const left: BoardItem[] = [];
  const pickups: Pickup[] = [];
  for (const item of items) {
    const carrier = onSquare.get(`${item.x},${item.y}`);
    if (carrier === undefined || carrier.item !== null) {
      left.push(item);
    } else {
      carrier.item = item.kind;
      pickups.push({ botId: carrier.id, item: item.kind });
    }
  }
  return { items: left, pickups };
}

/** One turn older: an item whose time is up leaves the board. */
export function ageItems(items: readonly BoardItem[]): BoardItem[] {
  return items.flatMap((item) => (item.turnsLeft <= 1 ? [] : [{ ...item, turnsLeft: item.turnsLeft - 1 }]));
}

function drawKind(rng: Rng): ItemKind {
  const total = ITEM_KINDS.reduce((sum, kind) => sum + ITEM_RULES.weights[kind], 0);
  let roll = rng.int(total);
  for (const kind of ITEM_KINDS) {
    roll -= ITEM_RULES.weights[kind];
    if (roll < 0) return kind;
  }
  throw new Error("the item weights do not add up");
}

/**
 * At the end of turn `tick` (0 for the first), one new item when the turn is a spawn turn,
 * the board holds fewer than the cap and a square has no tank and no item. Draws only then.
 */
export function spawnItem(snapshot: Pick<Snapshot, "width" | "height">, tick: number, tanks: readonly Cell[], items: readonly BoardItem[], rng: Rng): BoardItem | null {
  if ((tick + 1) % ITEM_RULES.spawnEvery !== 0 || items.length >= itemCap(tanks.length)) return null;
  const taken = new Set([...tanks, ...items].map((cell) => `${cell.x},${cell.y}`));
  const free: Cell[] = [];
  for (let y = 0; y < snapshot.height; y++) {
    for (let x = 0; x < snapshot.width; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
  }
  if (free.length === 0) return null;
  const kind = drawKind(rng);
  const square = free[rng.int(free.length)] as Cell;
  return { kind, x: square.x, y: square.y, turnsLeft: ITEM_RULES.turnsOnBoard };
}

/**
 * The nearest item of a kind ("any" for all) by Chebyshev distance, or undefined. A tie goes to
 * the smaller row, then the smaller column. One pass, because every tank of a 512-tank round may ask.
 */
export function nearestItem(snapshot: Pick<Snapshot, "items">, from: Cell, kind: ItemKind | "any"): BoardItem | undefined {
  let best: BoardItem | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of snapshot.items) {
    if (kind !== "any" && item.kind !== kind) continue;
    const distance = Math.max(Math.abs(item.x - from.x), Math.abs(item.y - from.y));
    if (distance < bestDistance || (distance === bestDistance && best !== undefined && (item.y < best.y || (item.y === best.y && item.x < best.x)))) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

/** True when the tank would take an item on its square: only with an empty hand. */
export function canTake(tank: Pick<BotState, "item">): boolean {
  return tank.item === null;
}
