// The tread marks a game master's tank leaves on the squares it left (owner, 2026-11-17: "make
// GM's tank special ... trail for the last 3 tiles with different opacity"). Pure: ArenaBoard.tsx
// keeps one TrailState per tank with a trail and draws its marks under the items and tanks.
// - A step to a neighbouring square (diagonals too) puts the square it left first in the trail.
// - A jump of more than one square (the league's reshuffle, a new day) starts the trail again,
//   so no mark is left far from the tank.
// - Standing still keeps the trail; the square the tank stands on is never marked.

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface TrailState {
  /** Where the tank stands. */
  readonly at: Cell;
  /** The squares it left, the newest first, at most TRAIL_LENGTH. */
  readonly trail: readonly Cell[];
}

export const TRAIL_LENGTH = 3;

/** The opacity of each mark, the newest first. */
export const TRAIL_OPACITY: readonly number[] = [0.45, 0.3, 0.15];

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export function nextTrail(state: TrailState | undefined, now: Cell): TrailState {
  if (state === undefined) return { at: now, trail: [] };
  if (same(state.at, now)) return state;
  if (Math.max(Math.abs(state.at.x - now.x), Math.abs(state.at.y - now.y)) > 1) return { at: now, trail: [] };
  return { at: now, trail: [state.at, ...state.trail].filter((cell) => !same(cell, now)).slice(0, TRAIL_LENGTH) };
}

/** The angle in degrees of the step from `from` to `to` (0 is east, 90 is south, as the board draws). */
export function stepAngle(from: Cell, to: Cell): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}
