// Geometry for the whole arena and the window around a tank. World lengths here
// are in squares, so the camera can share the board's coordinate system.

import type { PublicBot } from "@game/arena";
import type { BotId } from "@game/engine";
import type { Box } from "../ui/fitList.ts";
/** The wall around the floor, 3 board units of 10 per square. */
export const WALL_SQUARES = 0.3;
/**
 * Tanks this many squares outside the window are drawn too. A tank and the window
 * each move at most one square per turn, so a tank two squares out can glide into
 * view during one turn; with one square it would appear in view without its glide.
 */
export const CULL_MARGIN = 2;

/** The part of the arena the window shows: its top-left corner and size, in squares. */
export interface CameraWindow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}

/** Px per square when the whole arena, wall included, fits the box; 0 for an empty box. */
export function wholeArenaCellPx(box: Box, arena: ArenaSize): number {
  if (box.width <= 0 || box.height <= 0) return 0;
  return Math.min(box.width / (arena.width + 2 * WALL_SQUARES), box.height / (arena.height + 2 * WALL_SQUARES));
}

/** One axis: start of a window of `size` around `centre` on an arena of `span` squares. */
function clampAxis(centre: number, size: number, span: number): number {
  const min = -WALL_SQUARES;
  const max = span + WALL_SQUARES - size;
  // A window wider than the arena shows the arena in its middle.
  if (max <= min) return (span - size) / 2;
  return Math.min(max, Math.max(min, centre - size / 2));
}

/**
 * The window of a box at `cellPx` per square around the centre of square
 * (`cellX`, `cellY`), clamped to the arena's walls.
 */
export function followWindow(box: Box, arena: ArenaSize, cellX: number, cellY: number, cellPx: number): CameraWindow {
  const width = box.width / cellPx;
  const height = box.height / cellPx;
  return {
    x: clampAxis(cellX + 0.5, width, arena.width),
    y: clampAxis(cellY + 0.5, height, arena.height),
    width,
    height,
  };
}

/**
 * Squares across the short side of the zoomed view, so tank details stay readable as the pane shrinks.
 */
export const ZOOM_SQUARES = 9;

/** Px per square of the zoomed view in this box. */
export function zoomCellPx(box: Box): number {
  return Math.min(box.width, box.height) / ZOOM_SQUARES;
}

/** True when square (x, y) lies inside the window grown by `margin` squares on each side. */
export function inWindow(view: CameraWindow, x: number, y: number, margin: number): boolean {
  return x + 1 > view.x - margin && x < view.x + view.width + margin && y + 1 > view.y - margin && y < view.y + view.height + margin;
}

/**
 * The tank the "Leader" window follows: the current one while it still shares the
 * most points, so a tie does not make the window jump between tanks; otherwise the
 * first tank with the most points in the snapshot's order. Null without tanks.
 */
export function leaderTarget(bots: readonly Pick<PublicBot, "id" | "score">[], current: BotId | null): BotId | null {
  let top = -Infinity;
  for (const bot of bots) top = Math.max(top, bot.score);
  if (current !== null && bots.some((bot) => bot.id === current && bot.score === top)) return current;
  return bots.find((bot) => bot.score === top)?.id ?? null;
}
