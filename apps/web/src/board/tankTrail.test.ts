import { describe, expect, test } from "bun:test";
import { nextTrail, stepAngle, type TrailState } from "./tankTrail.ts";

const walk = (cells: readonly [number, number][]): TrailState | undefined =>
  cells.reduce<TrailState | undefined>((state, [x, y]) => nextTrail(state, { x, y }), undefined);

describe("a game master's trail", () => {
  test("keeps the last 3 squares it left, the newest first", () => {
    const state = walk([[0, 0], [1, 0], [2, 0], [3, 1], [4, 1]]);
    expect(state?.at).toEqual({ x: 4, y: 1 });
    expect(state?.trail).toEqual([{ x: 3, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0 }]);
  });

  test("standing still keeps it, and a square the tank comes back to is not marked", () => {
    expect(walk([[0, 0], [1, 0], [1, 0]])?.trail).toEqual([{ x: 0, y: 0 }]);
    expect(walk([[0, 0], [1, 0], [0, 0]])?.trail).toEqual([{ x: 1, y: 0 }]);
  });

  test("a jump of more than one square, as at a reshuffle, starts it again", () => {
    expect(walk([[0, 0], [1, 0], [2, 0], [9, 9]])).toEqual({ at: { x: 9, y: 9 }, trail: [] });
  });

  test("a mark points along the step", () => {
    expect(stepAngle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(stepAngle({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(90);
    expect(stepAngle({ x: 1, y: 1 }, { x: 0, y: 0 })).toBe(-135);
  });
});
