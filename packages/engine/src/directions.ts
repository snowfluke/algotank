// The eight facings and the arithmetic on them. The round, the strategy code and
// the board all read this one table, so a facing means the same everywhere.
//
// Rules of play for eight directions (docs/specs/revamp/62-diagonal.md):
//
// | Topic            | Rule                                                                                   |
// |------------------|----------------------------------------------------------------------------------------|
// | Directions       | N, NE, E, SE, S, SW, W, NW, clockwise. A bot spawns facing one of the 8, from the seed. |
// | Turn             | One move turns 45 (L45, R45) or 90 (L, R) degrees. 135 and 180 degrees cost 2 moves.    |
// | Drive            | F moves one cell in the facing, diagonal included. A diagonal step may pass between    |
// |                  | two occupied cells. A step into a held cell or a wall keeps the bot in place.           |
// | Shot             | Along the facing, in a straight line of cells (row, column or diagonal). It reaches   |
// |                  | the first bot on that line within range.                                               |
// | Distance         | Everywhere: the number of cells along the way, a diagonal step counting as 1          |
// |                  | (Chebyshev distance, see `chebyshev`).                                                 |
// | In line          | Row, column or diagonal (see `lineDistance` in strategy/geometry.ts).                  |
// | Bearing          | Four quarter sectors centred on ahead, right, behind, left. A cell exactly on a border |
// |                  | counts as ahead or behind (see `bearingOf`).                                           |
// | Toward and away  | See `stepToward` and `stepAway` in strategy/geometry.ts.                               |
// | Hit chance, range, water, points | Unchanged tables. Distance is the Chebyshev distance.                 |
// | Strategy JSON    | Every id and parameter key stays. "Turn" keeps left and right (90 degrees) and gains   |
// |                  | slightLeft and slightRight (45 degrees). "targetInRowOrColumn" now means row, column   |
// |                  | or diagonal.                                                                            |
// | Moves on the wire| F, L, R, T as before, plus L45 and R45 (types.ts, MOVES).                                |

import { DIRECTIONS } from "./types.ts";
import type { Direction, TurnMove } from "./types.ts";

export interface Step {
  readonly x: number;
  readonly y: number;
}

/** y grows downward, so "N" has y = -1. A diagonal step changes x and y by 1 each. */
export const DIRECTION_STEP: Readonly<Record<Direction, Step>> = {
  N: { x: 0, y: -1 },
  NE: { x: 1, y: -1 },
  E: { x: 1, y: 0 },
  SE: { x: 1, y: 1 },
  S: { x: 0, y: 1 },
  SW: { x: -1, y: 1 },
  W: { x: -1, y: 0 },
  NW: { x: -1, y: -1 },
};

/** The four facings along a row or a column, clockwise from north. A wall is one of these sides. */
export const CARDINALS = ["N", "E", "S", "W"] as const satisfies readonly Direction[];

/** Eighths of a full turn that each turn move adds, clockwise positive. */
export const TURN_EIGHTHS: Readonly<Record<TurnMove, number>> = { L: -2, R: 2, L45: -1, R45: 1 };

/** Position of a facing in DIRECTIONS: 0 is N, 2 is E, and so on clockwise. */
function directionIndex(direction: Direction): number {
  return DIRECTIONS.indexOf(direction);
}

/** The facing `eighths` eighths of a turn clockwise from `direction` (negative turns left). */
export function rotate(direction: Direction, eighths: number): Direction {
  const index = (((directionIndex(direction) + eighths) % DIRECTIONS.length) + DIRECTIONS.length) % DIRECTIONS.length;
  return DIRECTIONS[index] as Direction;
}

/** Clockwise eighths from one facing to another, 0 to 7: 1 is 45 degrees right, 4 is behind, 7 is 45 degrees left. */
export function eighthsBetween(from: Direction, to: Direction): number {
  return (directionIndex(to) - directionIndex(from) + DIRECTIONS.length) % DIRECTIONS.length;
}

/** Moves a turn from `from` to `to` costs: 0, 1 (45 or 90 degrees) or 2 (135 or 180 degrees). */
export function turnCost(from: Direction, to: Direction): 0 | 1 | 2 {
  const eighths = eighthsBetween(from, to);
  const shortest = Math.min(eighths, DIRECTIONS.length - eighths);
  return shortest === 0 ? 0 : shortest <= 2 ? 1 : 2;
}

export function isDiagonal(direction: Direction): boolean {
  const step = DIRECTION_STEP[direction];
  return step.x !== 0 && step.y !== 0;
}

/** The facing whose step is (sign x, sign y), or null for (0, 0). */
export function directionOfSigns(x: number, y: number): Direction | null {
  const sx = Math.sign(x);
  const sy = Math.sign(y);
  if (sx === 0 && sy === 0) return null;
  for (const direction of DIRECTIONS) {
    const step = DIRECTION_STEP[direction];
    if (step.x === sx && step.y === sy) return direction;
  }
  throw new Error(`no direction for the step (${sx}, ${sy})`);
}

/**
 * Cells between two cells when a diagonal step counts as 1: the larger of the
 * column gap and the row gap. Every distance in the game uses it.
 */
export function chebyshev(a: Step, b: Step): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Clockwise degrees of a facing from north: N 0, NE 45, E 90, and so on. */
export function directionDegreesFromNorth(direction: Direction): number {
  return directionIndex(direction) * (360 / DIRECTIONS.length);
}
