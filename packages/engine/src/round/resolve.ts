// Step 3 of a tick: resolve the chosen moves one at a time, in the given order,
// against the positions as already changed in this tick. It takes moves as
// input, so it runs without a strategy.

import { POINTS_PER_HIT, canThrow, hitChancePercent, throwRange, waterAfterTick } from "../combat/combat.ts";
import { rulesOf } from "../combat/rule-sets.ts";
import type { RoundRules } from "../combat/rule-sets.ts";
import type { BotId, BotState, Build, Move, Rng, Snapshot, ThrowEvent } from "../types.ts";
import { TURN_EIGHTHS, rotate } from "../directions.ts";
import { cellAhead, cellKey, isInside } from "./grid.ts";
import type { ArenaSize } from "./grid.ts";

/** The fields of a bot that a tick changes through its own move or through throws. */
export type Placement = Pick<BotState, "id" | "x" | "y" | "direction" | "score" | "water">;

export interface TickMove {
  readonly botId: BotId;
  readonly move: Move;
}

export interface TickResolution {
  /** One entry per bot, in the snapshot's bot order. */
  readonly placements: readonly Placement[];
  /** In resolution order. Only T moves produce an entry. */
  readonly throws: readonly ThrowEvent[];
}

/** A bot while the tick resolves: the placement changes, the build does not. */
interface Slot {
  place: { -readonly [K in keyof Placement]: Placement[K] };
  readonly build: Build;
  readonly move: Move;
  /** True once this bot's throw at a bot used water this tick. */
  spent: boolean;
}

/**
 * `moves` needs exactly one entry per bot of the snapshot, and `order` must list
 * each bot id once. Both are checked, because a wrong input here would
 * change the outcome without any error.
 *
 * The rng is used only to roll a throw that has a target and enough water, one
 * draw per such throw. A throw at a bot from a tank that holds less than
 * the round's waterPerThrow is "dry": it draws nothing and moves no points.
 * The snapshot's ruleSetId decides the numbers.
 */
export function resolveTick(
  snapshot: Pick<Snapshot, "width" | "height" | "bots" | "ruleSetId">,
  moves: readonly TickMove[],
  order: readonly BotId[],
  rng: Rng,
): TickResolution {
  const size: ArenaSize = snapshot;
  const rules = rulesOf(snapshot);
  const bots = snapshot.bots;

  const moveOf = new Map<BotId, Move>();
  for (const { botId, move } of moves) {
    if (moveOf.has(botId)) throw new Error(`two moves for bot "${botId}"`);
    moveOf.set(botId, move);
  }

  const slots = new Map<BotId, Slot>();
  const occupant = new Map<string, BotId>();
  for (const bot of bots) {
    const move = moveOf.get(bot.id);
    if (move === undefined) throw new Error(`no move for bot "${bot.id}"`);
    if (slots.has(bot.id)) throw new Error(`snapshot has two bots with id "${bot.id}"`);
    slots.set(bot.id, {
      place: { id: bot.id, x: bot.x, y: bot.y, direction: bot.direction, score: bot.score, water: bot.water },
      build: bot.build,
      move,
      spent: false,
    });
    occupant.set(cellKey(bot), bot.id);
  }
  if (moveOf.size !== slots.size) throw new Error("a move names a bot that is not in the snapshot");
  if (order.length !== slots.size || new Set(order).size !== order.length) {
    throw new Error("order must list each bot once");
  }

  const throws: ThrowEvent[] = [];

  for (const botId of order) {
    const slot = slots.get(botId);
    if (slot === undefined) throw new Error(`order names a bot that is not in the snapshot: "${botId}"`);
    const me = slot.place;

    if (slot.move === "F") {
      // A diagonal step only needs its target cell free: it may pass between two held cells.
      const ahead = cellAhead(me, me.direction);
      if (isInside(size, ahead) && !occupant.has(cellKey(ahead))) {
        occupant.delete(cellKey(me));
        me.x = ahead.x;
        me.y = ahead.y;
        occupant.set(cellKey(me), botId);
      }
    } else if (slot.move === "T") {
      throws.push(resolveThrow(slot, size, rules, slots, occupant, rng));
    } else if (slot.move === "W") {
      // Waiting changes nothing; the refill below still counts it as a turn without a throw.
    } else {
      me.direction = rotate(me.direction, TURN_EIGHTHS[slot.move]);
    }
  }

  // Refill after all moves, so the water a throw checks is the water from before this tick.
  for (const slot of slots.values()) slot.place.water = waterAfterTick(slot.place.water, slot.spent, rules);

  return { placements: bots.map((bot) => ({ ...(slots.get(bot.id) as Slot).place })), throws };
}

function resolveThrow(
  thrower: Slot,
  size: ArenaSize,
  rules: RoundRules,
  slots: ReadonlyMap<BotId, Slot>,
  occupant: ReadonlyMap<string, BotId>,
  rng: Rng,
): ThrowEvent {
  const me = thrower.place;
  const range = throwRange(thrower.build, rules);
  // Along a diagonal the distance is the number of diagonal steps (Chebyshev), as everywhere.
  for (let distance = 1; distance <= range; distance++) {
    const cell = cellAhead(me, me.direction, distance);
    if (!isInside(size, cell)) break;
    const targetId = occupant.get(cellKey(cell));
    if (targetId === undefined) continue;

    // Water is spent only on a throw at a bot. A dry tank makes the throw do nothing and draws no number.
    if (!canThrow(thrower.place.water, rules)) return { throwerId: me.id, outcome: "dry", targetId, distance };
    thrower.spent = true;

    const target = slots.get(targetId) as Slot;
    const hitChance = hitChancePercent(thrower.build, target.build, distance, rules);
    const hit = rng.chance(hitChance);
    if (hit) {
      // The same amount leaves one bot and reaches the other, so scores sum to 0.
      me.score += POINTS_PER_HIT;
      target.place.score -= POINTS_PER_HIT;
    }
    return { throwerId: me.id, outcome: hit ? "hit" : "miss", targetId, distance, hitChance };
  }
  return { throwerId: me.id, outcome: "empty" };
}
