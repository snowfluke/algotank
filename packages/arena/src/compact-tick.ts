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
// Layout (every value is an integer):
//   bots[i]   = [x, y, direction index, score, water, flags, hitsLanded, hitsTaken]
//               for the tank at spawn index i. Flags bit 0: was hit this turn.
//   moves[k]  = [bot index, move index], in the order the moves resolved. This
//               carries PublicTick.order; PublicTick.moves is in spawn order.
//   throws[k] = [thrower index, outcome index, target index or -1, distance or -1,
//               hit chance or -1], in resolution order. "empty" has no target and
//               no distance, and "dry" has no hit chance; both write -1 there.
//
// expandTick throws an Error on a compact tick that does not fit the spawn (an
// index out of range, a value of the wrong kind). The client treats that as a
// protocol error.

import { DIRECTIONS, MOVES, type Direction, type Move, type ThrowEvent } from "@game/engine";
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
}

/** Direction index to direction. The engine's own table, clockwise from north. */
export const COMPACT_DIRECTIONS: readonly Direction[] = DIRECTIONS;
/** Move index to move. The engine's own table. */
export const COMPACT_MOVES: readonly Move[] = MOVES;
/** Outcome index to throw outcome. */
export const COMPACT_OUTCOMES = ["empty", "dry", "miss", "hit"] as const satisfies readonly ThrowEvent["outcome"][];

/** Bit 0 of a compact bot's flags: the tank was hit this turn. */
export const COMPACT_FLAG_WAS_HIT = 1;

/** Number of values in one compact bot and one compact throw. */
export const COMPACT_BOT_LENGTH = 8;
export const COMPACT_THROW_LENGTH = 5;

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

  return {
    tick: tick.tick,
    bots: bots.map((bot) => [
      bot.x,
      bot.y,
      indexIn(COMPACT_DIRECTIONS, bot.direction, "direction"),
      bot.score,
      bot.water,
      bot.wasHit ? COMPACT_FLAG_WAS_HIT : 0,
      bot.hitsLanded,
      bot.hitsTaken,
    ]),
    moves: tick.order.map((id): [number, number] => {
      const move = moveOf.get(id);
      if (move === undefined) throw new Error(`no move for tank "${id}"`);
      return [idx(id), indexIn(COMPACT_MOVES, move, "move")];
    }),
    throws: tick.throws.map((t) => {
      const outcome = indexIn(COMPACT_OUTCOMES, t.outcome, "outcome");
      if (t.outcome === "empty") return [idx(t.throwerId), outcome, NONE, NONE, NONE];
      if (t.outcome === "dry") return [idx(t.throwerId), outcome, idx(t.targetId), t.distance, NONE];
      return [idx(t.throwerId), outcome, idx(t.targetId), t.distance, t.hitChance];
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

  const bots = compact.bots.map((values, i): PublicBot => {
    if (values.length !== COMPACT_BOT_LENGTH) throw new Error(`tank ${i} has ${values.length} values`);
    const [x, y, direction, score, water, flags, hitsLanded, hitsTaken] = values;
    const base = spawnBots[i] as PublicBot;
    return {
      id: base.id,
      x: integer(x, "x"),
      y: integer(y, "y"),
      direction: entry(COMPACT_DIRECTIONS, direction, "direction"),
      score: integer(score, "score"),
      wasHit: (integer(flags, "flags") & COMPACT_FLAG_WAS_HIT) !== 0,
      build: base.build,
      hitsLanded: integer(hitsLanded, "hitsLanded"),
      hitsTaken: integer(hitsTaken, "hitsTaken"),
      water: integer(water, "water"),
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
    if (outcome === "dry") return { throwerId, outcome, targetId, distance: integer(distance, "distance") };
    return { throwerId, outcome, targetId, distance: integer(distance, "distance"), hitChance: integer(hitChance, "hit chance") };
  });

  return {
    tick: integer(compact.tick, "tick"),
    order,
    moves,
    throws,
    snapshot: {
      width: spawn.width,
      height: spawn.height,
      // A snapshot counts the ticks already played, so the state after tick t is at t + 1.
      tick: integer(compact.tick, "tick") + 1,
      ticksTotal: spawn.ticksTotal,
      survivorsAfterRound: spawn.survivorsAfterRound,
      ruleSetId: spawn.ruleSetId,
      bots,
    },
  };
}
