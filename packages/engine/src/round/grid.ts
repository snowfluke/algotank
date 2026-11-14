// Arena size and the geometry the round needs.

import type { Direction } from "../types.ts";
import { DIRECTION_STEP } from "../directions.ts";
import type { RoundRules } from "../combat/rule-sets.ts";
import { RULES } from "./rules.ts";

export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/**
 * About `rules.gridFillRatio` of the cells hold a bot at spawn, in a 4:3 grid.
 * The result is never below the minimum size, so two bots still have room to move.
 */
export function arenaSize(playerCount: number, rules: Pick<RoundRules, "gridFillRatio">): ArenaSize {
  if (!Number.isSafeInteger(playerCount) || playerCount < 1) {
    throw new Error(`playerCount must be a positive integer, got ${playerCount}`);
  }
  const { aspectWidth, aspectHeight, minGridWidth, minGridHeight } = RULES;
  const { gridFillRatio } = rules;
  const cells = playerCount / gridFillRatio;
  // Round the width first, then derive the height, so the ratio stays 4:3 to within one cell.
  const width = Math.max(minGridWidth, Math.round(Math.sqrt((cells * aspectWidth) / aspectHeight)));
  const height = Math.max(minGridHeight, Math.round((width * aspectHeight) / aspectWidth));
  return { width, height };
}

export function isInside(size: ArenaSize, cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < size.width && cell.y < size.height;
}

/** The cell `steps` cells from `from` along `direction`, diagonals included. It may lie outside the grid. */
export function cellAhead(from: Cell, direction: Direction, steps = 1): Cell {
  const step = DIRECTION_STEP[direction];
  return { x: from.x + step.x * steps, y: from.y + step.y * steps };
}

/** Key for a Map or Set of cells. */
export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

/** Every cell of the grid, row by row. */
export function allCells(size: ArenaSize): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) cells.push({ x, y });
  }
  return cells;
}
