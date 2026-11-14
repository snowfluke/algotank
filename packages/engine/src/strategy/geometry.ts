// Geometry on the arena grid. The grid has hard walls and no wrap-around.
// Coordinates: x grows to the east, y grows to the south, "N" faces y - 1.

import { DIRECTIONS } from "../types.ts";
import type { BotState, Direction, Snapshot } from "../types.ts";
import { MAX_THROW_RANGE, throwRange } from "../combat/combat.ts";
import { rulesOf } from "../combat/rule-sets.ts";
import { DIRECTION_STEP, chebyshev, directionOfSigns, eighthsBetween, rotate, turnCost } from "../directions.ts";
import { indexOf } from "./snapshot-index.ts";

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** 90 degrees to the left. */
export function leftOf(direction: Direction): Direction {
  return rotate(direction, -2);
}

/** 90 degrees to the right. */
export function rightOf(direction: Direction): Direction {
  return rotate(direction, 2);
}

/** |dx| + |dy|. Only the greedy steps read it, to prefer a diagonal step while both gaps are open. */
function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function neighbour(cell: Cell, direction: Direction): Cell {
  const vector = DIRECTION_STEP[direction];
  return { x: cell.x + vector.x, y: cell.y + vector.y };
}

export function inBounds(snapshot: Snapshot, cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < snapshot.width && cell.y < snapshot.height;
}

/** True when a bot stands on the cell. */
export function isOccupied(snapshot: Snapshot, cell: Cell): boolean {
  return indexOf(snapshot).botsAt(cell.x, cell.y) !== undefined;
}

/** A cell a bot could step into: inside the grid and with no bot on it. */
export function isFree(snapshot: Snapshot, cell: Cell): boolean {
  return inBounds(snapshot, cell) && !isOccupied(snapshot, cell);
}

/**
 * Cells between this cell and the wall, looking in one direction. A bot on the
 * border has 0 toward the wall. Along a diagonal it is the smaller room of the two axes.
 */
export function roomAhead(snapshot: Pick<Snapshot, "width" | "height">, from: Cell, direction: Direction): number {
  const step = DIRECTION_STEP[direction];
  const roomX = step.x > 0 ? snapshot.width - 1 - from.x : step.x < 0 ? from.x : Number.POSITIVE_INFINITY;
  const roomY = step.y > 0 ? snapshot.height - 1 - from.y : step.y < 0 ? from.y : Number.POSITIVE_INFINITY;
  return Math.min(roomX, roomY);
}

/** Distance in cells to the wall in one direction: 1 means the next cell is a wall. */
export function wallDistance(snapshot: Snapshot, from: Cell, direction: Direction): number {
  return roomAhead(snapshot, from, direction) + 1;
}

export function enemiesOf(snapshot: Snapshot, self: BotState): readonly BotState[] {
  return snapshot.bots.filter((bot) => bot.id !== self.id);
}

// ---------------------------------------------------------------------------
// Who faces whom
// ---------------------------------------------------------------------------

/**
 * How many cells ahead of `from` the cell `to` lies, or 0 when it is not on the
 * line `from` faces. The line is a row, a column or a diagonal, and a diagonal
 * step counts as 1 cell.
 */
export function lineDistance(from: Cell & { readonly direction: Direction }, to: Cell): number {
  const vector = DIRECTION_STEP[from.direction];
  const steps = chebyshev(from, to);
  if (steps === 0) return 0;
  return to.x - from.x === vector.x * steps && to.y - from.y === vector.y * steps ? steps : 0;
}

/** True when two different cells share a row, a column or a diagonal: the lines a throw can travel. */
export function inStraightLine(a: Cell, b: Cell): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx !== 0 || dy !== 0) && (dx === 0 || dy === 0 || dx === dy);
}

/** The facing from `from` along the row, column or diagonal to `to`, or null when they share none. */
export function straightLineDirection(from: Cell, to: Cell): Direction | null {
  return inStraightLine(from, to) ? directionOfSigns(to.x - from.x, to.y - from.y) : null;
}

export interface BotInLine {
  readonly bot: BotState;
  readonly distance: number;
}

/**
 * The first bot on the line `from` faces within `maxDistance` cells. This is the bot a throw hits.
 * It walks the line cell by cell (MAX_THROW_RANGE cells at most in play), so it does not scan every bot.
 * Of two bots on one cell (only a hand-made snapshot has them) the first in snapshot order counts.
 */
export function firstBotInLine(snapshot: Snapshot, from: BotState, maxDistance: number): BotInLine | null {
  const index = indexOf(snapshot);
  const step = DIRECTION_STEP[from.direction];
  for (let distance = 1; distance <= maxDistance; distance++) {
    const bots = index.botsAt(from.x + step.x * distance, from.y + step.y * distance);
    if (bots === undefined) continue;
    const bot = bots.find((candidate) => candidate.id !== from.id);
    if (bot !== undefined) return { bot, distance };
  }
  return null;
}

/** Calls `visit` for every bot on the 8 lines out of a cell, up to `reach` cells away, with its distance. */
function forEachBotOnLinesFrom(snapshot: Snapshot, cell: Cell, reach: number, visit: (bot: BotState) => void): void {
  const index = indexOf(snapshot);
  for (const direction of DIRECTIONS) {
    const step = DIRECTION_STEP[direction];
    for (let distance = 1; distance <= reach; distance++) {
      const bots = index.botsAt(cell.x + step.x * distance, cell.y + step.y * distance);
      if (bots !== undefined) for (const bot of bots) visit(bot);
    }
  }
}

/**
 * Enemies whose throw, as the snapshot stands, would hit `target` (it is the first bot in their line within their range),
 * in snapshot order. Only a bot on one of the 8 lines through the target, within the longest throw, can be one,
 * so only those are checked. The answer is kept per snapshot, because a bot asks it several times per tick.
 */
export function botsThatCanHit(snapshot: Snapshot, target: BotState): readonly BotState[] {
  const index = indexOf(snapshot);
  const known = index.canHit.get(target.id);
  if (known !== undefined) return known;
  // The match is by id, as a throw names its target, so the walk starts at the snapshot's bot with that id.
  const placed = index.botById(target.id);
  const shooters: BotState[] = [];
  if (placed !== undefined) {
    const rules = rulesOf(snapshot);
    forEachBotOnLinesFrom(snapshot, placed, MAX_THROW_RANGE, (enemy) => {
      if (enemy.id === target.id) return;
      if (firstBotInLine(snapshot, enemy, throwRange(enemy.build, rules))?.bot.id === target.id) shooters.push(enemy);
    });
    shooters.sort((a, b) => index.positionOf(a.id) - index.positionOf(b.id));
  }
  index.canHit.set(target.id, shooters);
  return shooters;
}

/** True when a throw from any enemy could reach this cell if a bot stood there. Other bots do not shield it. */
export function isCellInLineOfFire(snapshot: Snapshot, cell: Cell, self: BotState): boolean {
  const rules = rulesOf(snapshot);
  let inLine = false;
  forEachBotOnLinesFrom(snapshot, cell, MAX_THROW_RANGE, (enemy) => {
    if (inLine || enemy.id === self.id) return;
    const distance = lineDistance(enemy, cell);
    inLine = distance >= 1 && distance <= throwRange(enemy.build, rules);
  });
  return inLine;
}

/** True when `target`'s back is toward `me`: the target looks into the half of the grid away from me. */
export function isFacingAway(target: BotState, me: Cell): boolean {
  const vector = DIRECTION_STEP[target.direction];
  return (me.x - target.x) * vector.x + (me.y - target.y) * vector.y < 0;
}

// ---------------------------------------------------------------------------
// Bearing: where a cell lies in the frame of a bot that faces a direction
// ---------------------------------------------------------------------------

export type Bearing = "ahead" | "left" | "right" | "behind";

/**
 * Which of four quarter sectors around `from` contains `to`. The sectors are 90
 * degrees wide and centred on ahead, right, behind and left of the facing, so
 * they form an X. A cell exactly on a border (45 degrees off the facing or off
 * behind) counts as ahead or behind, never as left or right. The test compares
 * the forward and sideways offsets; the facing and its right-hand vector have the
 * same length (1 or the square root of 2), so the comparison is a comparison of
 * angles. `to` must not be the cell of `from`.
 */
export function bearingOf(from: Cell & { readonly direction: Direction }, to: Cell): Bearing {
  const ahead = DIRECTION_STEP[from.direction];
  const right = DIRECTION_STEP[rightOf(from.direction)];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const forward = dx * ahead.x + dy * ahead.y;
  const sideways = dx * right.x + dy * right.y;
  if (forward === 0 && sideways === 0) throw new Error("bearingOf needs two different cells");
  if (Math.abs(forward) >= Math.abs(sideways)) return forward > 0 ? "ahead" : "behind";
  return sideways > 0 ? "right" : "left";
}

// ---------------------------------------------------------------------------
// Greedy steps. They take one step on the grid and plan no route. The grid has
// no interior walls, so a step that brings a bot closer to a cell inside the
// grid is always inside the grid.
//
// Both follow one rule: the step is diagonal while both the column and the row
// differ, and straight once one of them is equal. Toward a cell that is the step
// (sign dx, sign dy); away from it, the step (-sign dx, -sign dy).
// ---------------------------------------------------------------------------

/**
 * The direction of the one step that brings the bot closest to a cell: (sign dx,
 * sign dy). It lowers the Chebyshev distance by 1 and, of the steps that do, also
 * closes the most of the other gap, so no tie rule is needed. Bots do not count: a
 * bot on that cell is the caller's to throw at.
 */
export function stepToward(from: Cell, to: Cell): Direction {
  const direction = directionOfSigns(to.x - from.x, to.y - from.y);
  if (direction === null) throw new Error("stepToward needs a cell other than the bot's own");
  return direction;
}

/**
 * The direction of one step onto a free cell that takes the bot away from a cell,
 * or null when there is none. A step counts as away when it raises the Chebyshev
 * distance, or keeps it and raises |dx| + |dy|: so a bot at a wall slides along the
 * wall instead of standing. Order of preference, each one settling ties of the one before:
 * 1. the larger Chebyshev distance after the step;
 * 2. the smaller angle to the straight-away step (-sign dx, -sign dy), which is
 *    diagonal while both gaps are open and straight once one is closed;
 * 3. the fewer turn moves from the bot's facing;
 * 4. the more room before the wall;
 * 5. clockwise from N.
 */
export function stepAway(snapshot: Snapshot, from: BotState, to: Cell): Direction | null {
  const here = chebyshev(from, to);
  const hereSum = manhattan(from, to);
  const straightAway = directionOfSigns(from.x - to.x, from.y - to.y);
  if (straightAway === null) throw new Error("stepAway needs a cell other than the bot's own");
  let best: { direction: Direction; key: readonly number[] } | null = null;
  for (const direction of DIRECTIONS) {
    const next = neighbour(from, direction);
    if (!isFree(snapshot, next)) continue;
    const distance = chebyshev(next, to);
    if (distance < here || (distance === here && manhattan(next, to) <= hereSum)) continue;
    // Smaller is better in every place of the key.
    const key = [-distance, angleEighths(straightAway, direction), turnCost(from.direction, direction), -roomAhead(snapshot, from, direction)];
    if (best === null || compareKeys(key, best.key) < 0) best = { direction, key };
  }
  return best === null ? null : best.direction;
}

/** Eighths of a turn between two facings the short way round, 0 to 4. */
function angleEighths(a: Direction, b: Direction): number {
  const eighths = eighthsBetween(a, b);
  return Math.min(eighths, DIRECTIONS.length - eighths);
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const difference = (a[i] as number) - (b[i] as number);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The tangent of 22.5 degrees: a gap ratio above it is nearer a diagonal than a row or column. */
const TAN_22_5 = Math.SQRT2 - 1;

/**
 * The facing that points most nearly at a cell: of the 8, the one with the smallest
 * angle to it. Integer offsets never lie exactly between two facings (the tangent
 * of 22.5 degrees is irrational), so there is no tie. `to` must not be the cell of `from`.
 */
export function directionToFace(from: Cell, to: Cell): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) throw new Error("directionToFace needs a cell other than the bot's own");
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const diagonal = Math.min(ax, ay) > TAN_22_5 * Math.max(ax, ay);
  const direction = diagonal ? directionOfSigns(dx, dy) : ax > ay ? directionOfSigns(dx, 0) : directionOfSigns(0, dy);
  if (direction === null) throw new Error("unreachable: the offset is not zero");
  return direction;
}
