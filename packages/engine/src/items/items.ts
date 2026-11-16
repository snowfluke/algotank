// Items on the board (docs/specs/revamp/84-items.md). Every number of the feature is in
// ITEM_RULES, so tuning edits this file only. The round loop (round/round.ts) calls the
// end-of-turn functions below in this order: pickUp, countDownEffects then the new effects
// of the turn's hits, ageItems, spawnItems. Throw resolution (round/resolve.ts) reads
// holderBlocks, actsOnOwnHit and effectOfHit.
//
// Random draws, in this order at the end of a turn: pickUp draws one chance for each pinwheel or
// mud ball a tank takes (the backfire), in the order of the board's item list; then spawnItems
// draws one int for the kind and one int for the square of each item it adds, only on a turn that
// spawns. A round with items off has no item, so neither draws.

import type { BoardItem, BotState, ItemKind, Pickup, Rng, Snapshot, TankEffect, TankEffectKind } from "../types.ts";
import { ITEM_KINDS } from "../types.ts";

export const ITEM_RULES = {
  /** An item can appear at the end of every turn whose number + 1 is a multiple of this. */
  spawnEvery: 10,
  /** At most one item on the board per this many tanks, and always at least 1. */
  tanksPerItem: 4,
  /**
   * Past this many tanks, items come more often, so each tank's share stays near its share at this
   * count (spawnTiming). With one item per 10 turns for every count, tanks past about 20 shared a
   * fixed number of items (2026-11-16, 3,000 turns: 3.9 pickups per tank per 1,000 turns at 20 tanks,
   * 2.0 at 40, 0.8 at 100). Whole extra items per spawn turn jumped from 3.9 at 20 tanks to 7.0 at 21,
   * so the wait between spawn turns shortens instead. Rounds of 20 tanks or fewer play as before.
   */
  tanksPerSpawn: 20,
  /** Turns an item stays on the board when nobody takes it. */
  turnsOnBoard: 30,
  /** Weight of each kind in the draw. */
  weights: { bucket: 3, umbrella: 3, pinwheel: 2, mudBall: 2 } satisfies Record<ItemKind, number>,
  /** Points a hit from a tank with a bucket moves, instead of POINTS_PER_HIT. */
  bucketHitPoints: 2,
  /**
   * Times a held item acts before it is used up: a bucket's hits, an umbrella's blocks, a
   * pinwheel's or a mud ball's hit. Owner, 2026-11-16: every item twice as strong, "bucket is +2
   * for 2 times, umbrella last 2 times more, dizzy 2 times more long" (was 1 each).
   */
  uses: { bucket: 2, umbrella: 2, pinwheel: 1, mudBall: 1 } satisfies Record<ItemKind, number>,
  /** Turns an effect lasts after the hit, or the backfire, that caused it. Doubled on 2026-11-16 (was dizzy 3, stuck 2). */
  effectTurns: { dizzy: 6, stuck: 4 } satisfies Record<TankEffectKind, number>,
  /**
   * Percent chance that a pinwheel or a mud ball backfires when a tank takes it: its effect lands
   * on the tank that took it, and the item is used up. Owner, 2026-11-16: "20% chance the item
   * will be affecting the user who gets it". The bucket and the umbrella never backfire.
   */
  backfirePercent: 20,
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
  itemUses: number;
}

/** A held item after it acted once: one use less, and gone after the last. */
export function useOnce(holder: { item: ItemKind | null; itemUses: number }): void {
  holder.itemUses -= 1;
  if (holder.itemUses <= 0) {
    holder.item = null;
    holder.itemUses = 0;
  }
}

export interface PickupResult {
  /** The items still on the board. */
  readonly items: BoardItem[];
  /** In the order of the board's item list. */
  readonly pickups: Pickup[];
  /** The tanks whose pinwheel or mud ball backfired, with the effect it put on them. */
  readonly backfires: ReadonlyMap<string, TankEffectKind>;
}

/**
 * Tanks with an empty hand that ended the turn on an item take it. A tank that holds an item
 * leaves another on the board. A pinwheel or a mud ball backfires on its taker with
 * ITEM_RULES.backfirePercent: the taker gets the item's effect and holds nothing. Changes
 * `carriers` in place.
 */
export function pickUp(items: readonly BoardItem[], carriers: readonly Carrier[], rng: Rng): PickupResult {
  const onSquare = new Map<string, Carrier>();
  for (const carrier of carriers) onSquare.set(`${carrier.x},${carrier.y}`, carrier);
  const left: BoardItem[] = [];
  const pickups: Pickup[] = [];
  const backfires = new Map<string, TankEffectKind>();
  for (const item of items) {
    const carrier = onSquare.get(`${item.x},${item.y}`);
    if (carrier === undefined || carrier.item !== null) {
      left.push(item);
      continue;
    }
    pickups.push({ botId: carrier.id, item: item.kind });
    const effect = EFFECT_OF_ITEM[item.kind];
    if (effect !== null && rng.chance(ITEM_RULES.backfirePercent)) backfires.set(carrier.id, effect);
    else {
      carrier.item = item.kind;
      carrier.itemUses = ITEM_RULES.uses[item.kind];
    }
  }
  return { items: left, pickups, backfires };
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
 * How often items come with this many tanks on the board: a spawn turn after every `every` turns,
 * adding `count` items before the cap. Up to ITEM_RULES.tanksPerSpawn tanks it is one item per
 * ITEM_RULES.spawnEvery turns. Past it the wait is spawnEvery × tanksPerSpawn ÷ tanks turns, rounded,
 * so the rate grows in steps of about one tenth; past 200 tanks every turn spawns, and `count` grows.
 */
export function spawnTiming(tanks: number): { readonly every: number; readonly count: number } {
  const { spawnEvery, tanksPerSpawn } = ITEM_RULES;
  if (tanks <= tanksPerSpawn) return { every: spawnEvery, count: 1 };
  const every = Math.max(1, Math.round((spawnEvery * tanksPerSpawn) / tanks));
  return { every, count: every === 1 ? Math.max(1, Math.round(tanks / (spawnEvery * tanksPerSpawn))) : 1 };
}

/**
 * At the end of turn `tick` (0 for the first), the new items: on a spawn turn (spawnTiming), its
 * count of them while the board holds fewer than the cap and a square has no tank and no item.
 * Each new item draws its kind and then its square; nothing draws on other turns.
 */
export function spawnItems(snapshot: Pick<Snapshot, "width" | "height">, tick: number, tanks: readonly Cell[], items: readonly BoardItem[], rng: Rng): BoardItem[] {
  const timing = spawnTiming(tanks.length);
  if ((tick + 1) % timing.every !== 0) return [];
  const room = Math.min(timing.count, itemCap(tanks.length) - items.length);
  if (room <= 0) return [];
  const taken = new Set([...tanks, ...items].map((cell) => `${cell.x},${cell.y}`));
  const free: Cell[] = [];
  for (let y = 0; y < snapshot.height; y++) {
    for (let x = 0; x < snapshot.width; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
  }
  const added: BoardItem[] = [];
  while (added.length < room && free.length > 0) {
    const kind = drawKind(rng);
    const [square] = free.splice(rng.int(free.length), 1) as [Cell];
    added.push({ kind, x: square.x, y: square.y, turnsLeft: ITEM_RULES.turnsOnBoard });
  }
  return added;
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
