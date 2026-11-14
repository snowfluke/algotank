import { describe, expect, test } from "bun:test";
import { DIRECTIONS } from "./types.ts";
import type { Direction } from "./types.ts";
import {
  CARDINALS,
  DIRECTION_STEP,
  TURN_EIGHTHS,
  chebyshev,
  directionOfSigns,
  eighthsBetween,
  isDiagonal,
  rotate,
  turnCost,
} from "./directions.ts";

describe("the eight facings", () => {
  test("run clockwise from N, 45 degrees apart, and every step moves to a neighbour cell", () => {
    expect(DIRECTIONS).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    for (const direction of DIRECTIONS) {
      const step = DIRECTION_STEP[direction];
      expect(chebyshev({ x: 0, y: 0 }, step)).toBe(1);
      expect(isDiagonal(direction)).toBe(step.x !== 0 && step.y !== 0);
      expect(directionOfSigns(step.x * 5, step.y * 5)).toBe(direction);
    }
    expect(DIRECTIONS.filter(isDiagonal)).toEqual(["NE", "SE", "SW", "NW"]);
    expect(CARDINALS.every((direction) => !isDiagonal(direction))).toBe(true);
  });

  test.each(DIRECTIONS)("from %s, the four turn moves rotate by 45 and 90 degrees, and opposite turns cancel", (direction) => {
    const index = DIRECTIONS.indexOf(direction);
    const at = (offset: number) => DIRECTIONS[(index + offset + 8) % 8] as Direction;
    expect(rotate(direction, TURN_EIGHTHS.R45)).toBe(at(1));
    expect(rotate(direction, TURN_EIGHTHS.R)).toBe(at(2));
    expect(rotate(direction, TURN_EIGHTHS.L45)).toBe(at(-1));
    expect(rotate(direction, TURN_EIGHTHS.L)).toBe(at(-2));
    expect(rotate(rotate(direction, TURN_EIGHTHS.R), TURN_EIGHTHS.L)).toBe(direction);
    expect(rotate(rotate(direction, TURN_EIGHTHS.R45), TURN_EIGHTHS.L45)).toBe(direction);
  });

  test("a turn of 45 or 90 degrees costs 1 move, 135 and 180 cost 2", () => {
    expect(turnCost("N", "N")).toBe(0);
    expect(turnCost("N", "NE")).toBe(1);
    expect(turnCost("N", "E")).toBe(1);
    expect(turnCost("N", "SE")).toBe(2);
    expect(turnCost("N", "S")).toBe(2);
    expect(turnCost("N", "SW")).toBe(2);
    expect(turnCost("N", "W")).toBe(1);
    expect(turnCost("N", "NW")).toBe(1);
    expect(eighthsBetween("NW", "NE")).toBe(2);
    expect(eighthsBetween("NE", "NW")).toBe(6);
  });

  test("Chebyshev distance counts a diagonal step as 1", () => {
    expect(chebyshev({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(4);
    expect(chebyshev({ x: 1, y: 1 }, { x: 4, y: 4 })).toBe(3);
    expect(chebyshev({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });

  test("the zero step has no direction", () => {
    expect(directionOfSigns(0, 0)).toBeNull();
  });
});
