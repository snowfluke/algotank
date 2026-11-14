// Turns an intended direction into one move for this tick.
// Rules that every action shares:
// - A step toward a cell that holds a bot becomes a throw. The bot is 1 cell
//   ahead (diagonal included), so the throw has the best hit chance there is, and
//   a bot never turns back and forth or pushes against a blocker. "Held" is read
//   from the snapshot taken before the tick.
// - A step toward a wall is never asked for. The greedy steps in geometry.ts stay
//   inside the grid, and goForward turns when the cell ahead is a wall.
// - A turn of 45 or 90 degrees is one move. A turn of 135 degrees is two: the
//   90 degree turn first, so the bot is 45 degrees off after one move. A half
//   turn is two 90 degree turns; the first goes toward the free side, and a tie goes left.

import type { Direction, DecisionContext, Move } from "../types.ts";
import { eighthsBetween, rotate } from "../directions.ts";
import { inBounds, isFree, isOccupied, leftOf, neighbour, rightOf } from "./geometry.ts";

/** The first 90 degree turn of a half turn: toward the side with a free neighbour cell. Both free or both blocked gives a left turn. */
function halfTurnStart(ctx: DecisionContext): "L" | "R" {
  const { self, snapshot } = ctx;
  const leftFree = isFree(snapshot, neighbour(self, leftOf(self.direction)));
  const rightFree = isFree(snapshot, neighbour(self, rightOf(self.direction)));
  return rightFree && !leftFree ? "R" : "L";
}

/**
 * The turn of a bot whose next cell is a wall: 45 degrees toward the one free
 * cell beside the blocked one (left when both are free), so a diagonal driver
 * slides along the wall; when neither is free, 90 degrees as a half turn starts.
 */
function turnAtWall(ctx: DecisionContext): Move {
  const { self, snapshot } = ctx;
  const slightLeftFree = isFree(snapshot, neighbour(self, rotate(self.direction, -1)));
  const slightRightFree = isFree(snapshot, neighbour(self, rotate(self.direction, 1)));
  if (slightLeftFree) return "L45";
  if (slightRightFree) return "R45";
  return halfTurnStart(ctx);
}

/**
 * Starts a bot toward a direction. When it already faces that way the move is
 * `whenFacing`. Otherwise it turns the short way.
 */
export function steerTowards(ctx: DecisionContext, direction: Direction, whenFacing: Move): Move {
  const eighths = eighthsBetween(ctx.self.direction, direction);
  if (eighths === 0) return whenFacing;
  if (eighths === 1) return "R45";
  if (eighths === 7) return "L45";
  if (eighths === 4) return halfTurnStart(ctx);
  return eighths < 4 ? "R" : "L";
}

/** One step in a direction inside the grid: turn first, then F, or T when a bot holds the cell. */
export function stepTowards(ctx: DecisionContext, direction: Direction): Move {
  const held = isOccupied(ctx.snapshot, neighbour(ctx.self, direction));
  return steerTowards(ctx, direction, held ? "T" : "F");
}

/** F when the cell ahead is free, T when a bot holds it, and a turn at a wall. */
export function goForward(ctx: DecisionContext): Move {
  const { self, snapshot } = ctx;
  const ahead = neighbour(self, self.direction);
  if (!inBounds(snapshot, ahead)) return turnAtWall(ctx);
  return isOccupied(snapshot, ahead) ? "T" : "F";
}
