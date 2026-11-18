// One turn in a compact form for the live stream and the replay. A PublicTick
// names every tank by its id and repeats fields that never change in a round
// (build, arena size, rule set). With 512 tanks that is about 56 KB per turn per
// viewer. The compact form refers to tanks by their index in the round's spawn
// snapshot (`roundStart.snapshot.bots`, which the client already holds) and to
// directions, moves and outcomes by their index in the tables below, so a turn is
// a few arrays of numbers.
//
// The engine keeps the snapshot's bot order for the whole round (stepRound maps
// `before.bots` in place), so a spawn index names the same tank on every turn.
//
// Layout (all scalar values are integers):
//   bots[i]   = [x, y, direction index, score, water, flags, hitsLanded, hitsTaken]
//               for the tank at spawn index i. Flags bit 0: was hit this turn. Bits 1 to 3:
//               the held item's index in ITEM_KINDS + 1, or 0. Bits 4 and 5: the effect's
//               index in TANK_EFFECT_KINDS + 1, or 0. Bits 6 to 9: the effect's turns left.
//               The item and the effect use free bits, so a tank stays 8 values.
//   moves[k]  = [bot index, move index], in the order the moves resolved. This
//               carries PublicTick.order; PublicTick.moves is in spawn order.
//   throws[k] = [thrower index, outcome index, target index or -1, distance or -1,
//               hit chance or -1], in resolution order. "empty" has no target and
//               no distance, and "dry" has no hit chance; both write -1 there. The
//               outcome "bucketHit" exists only here: it is a hit with `bucket: true`.
//   items[k]  = [item index, x, y, turns left], the items on the board after the turn.
//   pickups[k]= [bot index, item index], the items taken on the turn.
//   itemsWaiting[k] = [bot index, first item index, optional second item index].
//   magnetFires[k]  = [bot index, x, y, [[item index, source x, source y], ...]].
//   Both Magnet fields are sparse and separate so older bundles still read the same bot rows.
//
// expandTick throws an Error on a compact tick that does not fit the spawn (an
// index out of range, a value of the wrong kind). The client treats that as a
// protocol error.

import { DIRECTIONS, ITEM_KINDS, MOVES, TANK_EFFECT_KINDS, ULTIMATE_RULES, itemHandOf, type BoardItem, type Direction, type ItemKind, type MagnetFire, type Move, type Pickup, type TankEffect, type ThrowEvent, type WaitingItems } from "@game/engine";
import type { PlayerId, PublicBot, PublicSnapshot, PublicTick } from "./types.ts";

/** One turn in a compact form. Indexes refer to the order of `roundStart.snapshot.bots`. */
export interface CompactTick {
  readonly tick: number;
  /** Per bot: [x, y, direction index, score, water, flags, hitsLanded, hitsTaken]. Flags bit 0: was hit this turn. */
  readonly bots: readonly (readonly number[])[];
  /** In the order the moves resolved: [bot index, move index]. */
  readonly moves: readonly (readonly [number, number])[];
  /** [thrower index, outcome index, target index or -1, distance, hit chance or -1]. */
  readonly throws: readonly (readonly number[])[];
  /** [item index, x, y, turns left]: the items on the board after the turn. */
  readonly items: readonly (readonly number[])[];
  /** [bot index, item index]: the items taken on the turn. */
  readonly pickups: readonly (readonly number[])[];
  readonly itemsWaiting?: readonly (readonly number[])[];
  readonly magnetFires?: readonly (readonly [number, number, number, readonly (readonly number[])[]])[];
}

/** Direction index to direction. The engine's own table, clockwise from north. */
export const COMPACT_DIRECTIONS: readonly Direction[] = DIRECTIONS;
/** Move index to move. The engine's own table. */
export const COMPACT_MOVES: readonly Move[] = MOVES;
/** Outcome index to throw outcome. Appended values keep the older indexes. "bucketHit" is a hit with `bucket: true`. */
export const COMPACT_OUTCOMES = ["empty", "dry", "miss", "hit", "blocked", "bucketHit", "dodged"] as const;
type CompactOutcome = (typeof COMPACT_OUTCOMES)[number];
/** Item index to item kind. The engine's own table. */
export const COMPACT_ITEMS: readonly ItemKind[] = ITEM_KINDS;

/** Bit 0 of a compact bot's flags: the tank was hit this turn. */
export const COMPACT_FLAG_WAS_HIT = 1;
const ITEM_SHIFT = 1;
const ITEM_MASK = 0b111;
const EFFECT_SHIFT = 4;
const EFFECT_MASK = 0b11;
const TURNS_SHIFT = 6;
const TURNS_MASK = 0b1111;

/** Number of values in one compact bot, throw, item and pickup. */
export const COMPACT_BOT_LENGTH = 8;
export const COMPACT_THROW_LENGTH = 5;
export const COMPACT_ITEM_LENGTH = 4;
export const COMPACT_PICKUP_LENGTH = 2;

function flagsOf(bot: PublicBot): number {
  const item = bot.item === null ? 0 : indexIn(COMPACT_ITEMS, bot.item, "item") + 1;
  const effect = bot.effect === null ? 0 : indexIn(TANK_EFFECT_KINDS, bot.effect.kind, "effect") + 1;
  const turns = bot.effect === null ? 0 : bot.effect.turnsLeft;
  if (turns > TURNS_MASK) throw new Error(`an effect of ${turns} turns does not fit the compact tick`);
  return (bot.wasHit ? COMPACT_FLAG_WAS_HIT : 0) | (item << ITEM_SHIFT) | (effect << EFFECT_SHIFT) | (turns << TURNS_SHIFT);
}

function itemOfFlags(flags: number): ItemKind | null {
  const index = (flags >> ITEM_SHIFT) & ITEM_MASK;
  return index === 0 ? null : entry(COMPACT_ITEMS, index - 1, "item");
}

function effectOfFlags(flags: number): TankEffect | null {
  const index = (flags >> EFFECT_SHIFT) & EFFECT_MASK;
  if (index === 0) return null;
  const turnsLeft = (flags >> TURNS_SHIFT) & TURNS_MASK;
  if (turnsLeft === 0) throw new Error("an effect has no turns left");
  return { kind: entry(TANK_EFFECT_KINDS, index - 1, "effect"), turnsLeft };
}

function wireOutcome(t: ThrowEvent): CompactOutcome {
  return t.outcome === "hit" && t.bucket === true ? "bucketHit" : t.outcome;
}

const NONE = -1;

function indexIn<T>(table: readonly T[], value: T, what: string): number {
  const index = table.indexOf(value);
  if (index < 0) throw new Error(`unknown ${what} "${String(value)}"`);
  return index;
}

/** `order` is the ids of `roundStart.snapshot.bots`, in that order. */
export function compactTick(tick: PublicTick, order: readonly PlayerId[]): CompactTick {
  const indexOf = new Map<PlayerId, number>();
  order.forEach((id, i) => indexOf.set(id, i));
  const idx = (id: PlayerId): number => {
    const i = indexOf.get(id);
    if (i === undefined) throw new Error(`tank "${id}" is not in the round`);
    return i;
  };

  const bots = tick.snapshot.bots;
  if (bots.length !== order.length) throw new Error(`the tick has ${bots.length} tanks, the round ${order.length}`);
  bots.forEach((bot, i) => {
    if (bot.id !== order[i]) throw new Error(`tank ${i} is "${bot.id}", the round has "${order[i]}" there`);
  });

  const moveOf = new Map<PlayerId, Move>();
  for (const { botId, move } of tick.moves) moveOf.set(botId, move);
  const itemsWaiting: number[][] = [];
  bots.forEach((bot, i) => {
    if (bot.itemsWaiting !== undefined) itemsWaiting.push([i, ...bot.itemsWaiting.map((kind) => indexIn(COMPACT_ITEMS, kind, "item"))]);
  });

  return {
    tick: tick.tick,
    bots: bots.map((bot) => [
      bot.x,
      bot.y,
      indexIn(COMPACT_DIRECTIONS, bot.direction, "direction"),
      bot.score,
      bot.water,
      flagsOf(bot),
      bot.hitsLanded,
      bot.hitsTaken,
    ]),
    moves: tick.order.map((id): [number, number] => {
      const move = moveOf.get(id);
      if (move === undefined) throw new Error(`no move for tank "${id}"`);
      return [idx(id), indexIn(COMPACT_MOVES, move, "move")];
    }),
    throws: tick.throws.map((t) => {
      const outcome = indexIn(COMPACT_OUTCOMES, wireOutcome(t), "outcome");
      if (t.outcome === "empty") return [idx(t.throwerId), outcome, NONE, NONE, NONE];
      if (t.outcome === "dry" || t.outcome === "dodged") return [idx(t.throwerId), outcome, idx(t.targetId), t.distance, NONE];
      return [idx(t.throwerId), outcome, idx(t.targetId), t.distance, t.hitChance];
    }),
    items: tick.snapshot.items.map((item) => [indexIn(COMPACT_ITEMS, item.kind, "item"), item.x, item.y, item.turnsLeft]),
    pickups: tick.pickups.map((p) => [idx(p.botId), indexIn(COMPACT_ITEMS, p.item, "item")]),
    ...(itemsWaiting.length === 0 ? {} : { itemsWaiting }),
    ...(tick.magnetFires === undefined ? {} : {
      magnetFires: tick.magnetFires.map(({ botId, at, items }) => [
        idx(botId), at.x, at.y, items.map(({ kind, from }) => [indexIn(COMPACT_ITEMS, kind, "item"), from.x, from.y]),
      ]),
    }),
  };
}

function integer(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${what} is not an integer`);
  return value;
}

function entry<T>(table: readonly T[], index: unknown, what: string): T {
  const value = table[integer(index, what)];
  if (value === undefined) throw new Error(`${what} ${String(index)} is out of range`);
  return value;
}

/** Rebuilds the PublicTick that compactTick was given. `spawn` is the round's `roundStart.snapshot`. */
export function expandTick(compact: CompactTick, spawn: PublicSnapshot): PublicTick {
  const spawnBots = spawn.bots;
  if (compact.bots.length !== spawnBots.length) {
    throw new Error(`the tick has ${compact.bots.length} tanks, the round ${spawnBots.length}`);
  }
  const botAt = (index: unknown, what: string): PublicBot => entry(spawnBots, index, what);
  const waitingOf = new Map<PlayerId, WaitingItems>();
  for (const values of compact.itemsWaiting ?? []) {
    if (values.length < 2 || values.length > ULTIMATE_RULES.magnet.handSize) throw new Error(`a waiting hand has ${values.length} values`);
    const [botIndex, first, second] = values;
    const { id } = botAt(botIndex, "waiting hand tank");
    if (waitingOf.has(id)) throw new Error(`two waiting hands for tank ${id}`);
    const head = entry(COMPACT_ITEMS, first, "waiting item");
    waitingOf.set(id, values.length === 2 ? [head] : [head, entry(COMPACT_ITEMS, second, "waiting item")]);
  }

  const bots = compact.bots.map((values, i): PublicBot => {
    if (values.length !== COMPACT_BOT_LENGTH) throw new Error(`tank ${i} has ${values.length} values`);
    const [x, y, direction, score, water, flags, hitsLanded, hitsTaken] = values;
    const base = spawnBots[i] as PublicBot;
    const bits = integer(flags, "flags");
    const itemsWaiting = waitingOf.get(base.id);
    return {
      id: base.id,
      x: integer(x, "x"),
      y: integer(y, "y"),
      direction: entry(COMPACT_DIRECTIONS, direction, "direction"),
      score: integer(score, "score"),
      wasHit: (bits & COMPACT_FLAG_WAS_HIT) !== 0,
      build: base.build,
      hitsLanded: integer(hitsLanded, "hitsLanded"),
      hitsTaken: integer(hitsTaken, "hitsTaken"),
      water: integer(water, "water"),
      ...itemHandOf({ item: itemOfFlags(bits), itemsWaiting }),
      effect: effectOfFlags(bits),
    };
  });

  if (compact.moves.length !== spawnBots.length) {
    throw new Error(`the tick has ${compact.moves.length} moves, the round ${spawnBots.length} tanks`);
  }
  const moveByIndex: (Move | undefined)[] = new Array(spawnBots.length);
  const order = compact.moves.map(([botIndex, moveIndex]) => {
    const i = integer(botIndex, "move tank");
    const bot = botAt(i, "move tank");
    if (moveByIndex[i] !== undefined) throw new Error(`two moves for tank ${i}`);
    moveByIndex[i] = entry(COMPACT_MOVES, moveIndex, "move");
    return bot.id;
  });
  const moves = spawnBots.map((bot, i) => ({ botId: bot.id, move: moveByIndex[i] as Move }));

  const throws = compact.throws.map((values): ThrowEvent => {
    if (values.length !== COMPACT_THROW_LENGTH) throw new Error(`a throw has ${values.length} values`);
    const [thrower, outcomeIndex, target, distance, hitChance] = values;
    const throwerId = botAt(thrower, "thrower").id;
    const outcome = entry(COMPACT_OUTCOMES, outcomeIndex, "outcome");
    if (outcome === "empty") return { throwerId, outcome };
    const targetId = botAt(target, "target").id;
    if (outcome === "dry" || outcome === "dodged") return { throwerId, outcome, targetId, distance: integer(distance, "distance") };
    const rolled = { throwerId, targetId, distance: integer(distance, "distance"), hitChance: integer(hitChance, "hit chance") };
    return outcome === "bucketHit" ? { ...rolled, outcome: "hit", bucket: true } : { ...rolled, outcome };
  });

  const items = compact.items.map((values): BoardItem => {
    if (values.length !== COMPACT_ITEM_LENGTH) throw new Error(`an item has ${values.length} values`);
    const [kind, x, y, turnsLeft] = values;
    return { kind: entry(COMPACT_ITEMS, kind, "item"), x: integer(x, "item x"), y: integer(y, "item y"), turnsLeft: integer(turnsLeft, "item turns") };
  });
  const pickups = compact.pickups.map((values): Pickup => {
    if (values.length !== COMPACT_PICKUP_LENGTH) throw new Error(`a pickup has ${values.length} values`);
    const [botIndex, kind] = values;
    return { botId: botAt(botIndex, "pickup tank").id, item: entry(COMPACT_ITEMS, kind, "item") };
  });
  const magnetFires = compact.magnetFires?.map((values): MagnetFire => {
    if (values.length !== 4) throw new Error(`a Magnet fire has ${values.length} values`);
    const [botIndex, x, y, pulled] = values;
    if (pulled.length > ULTIMATE_RULES.magnet.handSize) throw new Error(`Magnet pulled ${pulled.length} items`);
    return {
      botId: botAt(botIndex, "Magnet tank").id, at: { x: integer(x, "Magnet x"), y: integer(y, "Magnet y") }, kind: "magnet",
      items: pulled.map((item) => {
        if (item.length !== 3) throw new Error(`a pulled item has ${item.length} values`);
        return { kind: entry(COMPACT_ITEMS, item[0], "item"), from: { x: integer(item[1], "item x"), y: integer(item[2], "item y") } };
      }),
    };
  });

  return {
    tick: integer(compact.tick, "tick"),
    order,
    moves,
    throws,
    pickups,
    snapshot: {
      width: spawn.width,
      height: spawn.height,
      // A snapshot counts the ticks already played, so the state after tick t is at t + 1.
      tick: integer(compact.tick, "tick") + 1,
      ticksTotal: spawn.ticksTotal,
      survivorsAfterRound: spawn.survivorsAfterRound,
      ruleSetId: spawn.ruleSetId,
      bots,
      items,
    },
    ...(magnetFires === undefined ? {} : { magnetFires }),
  };
}
