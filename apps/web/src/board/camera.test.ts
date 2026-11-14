/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { CULL_MARGIN, FOLLOW_CELL_PX, WALL_SQUARES, followWindow, inWindow, leaderTarget, needsFollowCamera, wholeArenaCellPx } from "./camera.ts";

// A 68 x 51 arena holds 512 tanks at the standard fill; a box of 280 x 420 px is a 10 by 15 square window.
const big = { width: 68, height: 51 };
const box = { width: 10 * FOLLOW_CELL_PX, height: 15 * FOLLOW_CELL_PX };

describe("follow camera", () => {
  test("the window turns on where the whole arena gives a square under 22 px", () => {
    expect(wholeArenaCellPx({ width: 390, height: 500 }, big)).toBeCloseTo(390 / 68.6);
    expect(needsFollowCamera({ width: 390, height: 500 }, big)).toBe(true);
    expect(needsFollowCamera({ width: 1840, height: 900 }, { width: 12, height: 9 })).toBe(false);
    expect(needsFollowCamera({ width: 0, height: 0 }, big)).toBe(false);
  });

  test("centres the window on the tank's square", () => {
    const view = followWindow(box, big, 30, 20);
    expect(view).toEqual({ x: 30.5 - 5, y: 20.5 - 7.5, width: 10, height: 15 });
  });

  test("stops at each wall, so the window never shows past it", () => {
    expect(followWindow(box, big, 0, 20).x).toBe(-WALL_SQUARES);
    expect(followWindow(box, big, 67, 20).x).toBe(68 + WALL_SQUARES - 10);
    expect(followWindow(box, big, 30, 0).y).toBe(-WALL_SQUARES);
    expect(followWindow(box, big, 30, 50).y).toBe(51 + WALL_SQUARES - 15);
  });

  test("stops in each corner on both axes", () => {
    const corners = [
      [0, 0, -WALL_SQUARES, -WALL_SQUARES],
      [67, 0, 68 + WALL_SQUARES - 10, -WALL_SQUARES],
      [0, 50, -WALL_SQUARES, 51 + WALL_SQUARES - 15],
      [67, 50, 68 + WALL_SQUARES - 10, 51 + WALL_SQUARES - 15],
    ] as const;
    for (const [cx, cy, x, y] of corners) {
      const view = followWindow(box, big, cx, cy);
      expect([view.x, view.y]).toEqual([x, y]);
    }
  });

  test("an arena smaller than the window sits in its middle on that axis", () => {
    const narrow = { width: 6, height: 40 };
    const view = followWindow(box, narrow, 5, 39);
    expect(view.x).toBe((6 - 10) / 2);
    expect(view.y).toBe(40 + WALL_SQUARES - 15);
    expect(followWindow(box, { width: 4, height: 4 }, 0, 0)).toEqual({ x: -3, y: -5.5, width: 10, height: 15 });
  });

  test("draws the tanks in the window and its margin only", () => {
    const view = followWindow(box, big, 30, 20);
    expect(inWindow(view, 30, 20, CULL_MARGIN)).toBe(true);
    // The window spans x 25.5 to 35.5; a margin of 2 reaches square 37 and down to square 23.
    expect(inWindow(view, 37, 20, CULL_MARGIN)).toBe(true);
    expect(inWindow(view, 38, 20, CULL_MARGIN)).toBe(false);
    expect(inWindow(view, 23, 20, CULL_MARGIN)).toBe(true);
    expect(inWindow(view, 22, 20, CULL_MARGIN)).toBe(false);
    expect(inWindow(view, 30, 30, 0)).toBe(false);
  });

  test("the leader window keeps its tank while it shares the lead, and moves to a new leader", () => {
    const bots = [
      { id: "a", score: 2 },
      { id: "b", score: 3 },
      { id: "c", score: 3 },
    ];
    expect(leaderTarget(bots, null)).toBe("b");
    expect(leaderTarget(bots, "c")).toBe("c");
    expect(leaderTarget(bots, "a")).toBe("b");
    expect(leaderTarget([], null)).toBeNull();
  });
});
