// Which way a board is drawn in its box. A phone is taller than wide, a board is wider than
// tall, so the same board has larger squares turned a quarter. The turn is done on the data,
// at the edge of the view, so the board draws it like any other arena: labels, water bars
// and "+1" texts stay upright, the flag flips by the heading it is given (tank/TankFlag.tsx),
// and tap-for-a-name (tankPeek.ts) finds the tank by the square it is given.
//
// Fields of a snapshot that hold a cell or a direction (packages/arena/src/types.ts,
// packages/engine/src/types.ts): width and height, every bot's x, y and direction, every
// item's x and y. A ThrowEvent holds ids and a distance only, so throws need no turn.

import type { PublicBot, PublicSnapshot } from "@game/arena";
import { DIRECTIONS, type BoardItem, type Direction } from "@game/engine";
import type { Box } from "../ui/fitList.ts";
import { wholeArenaCellPx, type ArenaSize } from "./camera.ts";

export type Orientation = "sideways" | "upright";

/** The facing a quarter turn clockwise from `direction`: two steps on the clockwise list N, NE, E, ... */
export function rotateDirection(direction: Direction): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % DIRECTIONS.length] as Direction;
}

function rotateCell<T extends { readonly x: number; readonly y: number }>(cell: T, height: number): T {
  return { ...cell, x: height - 1 - cell.y, y: cell.x };
}

/** Also used for a tank at the mouth of its tunnel, before it leaves the square. */
export function rotateBot(bot: PublicBot, height: number): PublicBot {
  return { ...rotateCell(bot, height), direction: rotateDirection(bot.direction) };
}

/**
 * The snapshot turned a quarter clockwise: the top-left square becomes the top-right one
 * and a tank facing north faces east. y grows downward, so (x, y) goes to (height - 1 - y, x).
 */
export function rotateSnapshot(snapshot: PublicSnapshot): PublicSnapshot {
  const { width, height } = snapshot;
  return {
    ...snapshot,
    width: height,
    height: width,
    bots: snapshot.bots.map((bot) => rotateBot(bot, height)),
    items: snapshot.items.map((item): BoardItem => rotateCell(item, height)),
  };
}

/**
 * The orientation that gives the larger square in `box`. Sideways before the first measurement
 * and on a tie. It depends only on the box and the arena's size, never on the turn, so it
 * changes only when one of them changes.
 */
export function bestOrientation(box: Box | null, arena: ArenaSize): Orientation {
  if (box === null) return "sideways";
  const upright = wholeArenaCellPx(box, { width: arena.height, height: arena.width });
  return upright > wholeArenaCellPx(box, arena) ? "upright" : "sideways";
}
