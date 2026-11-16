import { describe, expect, test } from "bun:test";
import type { PublicBot } from "@game/arena";
import { CELL } from "./boardHelpers.ts";
import { botAtPoint, nameTagSpot, type BoardView } from "./tankPeek.ts";

const bot = (id: string, x: number, y: number) => ({ id, x, y }) as unknown as PublicBot;
const bots = [bot("a", 0, 0), bot("b", 3, 2)];

describe("the tank under the pointer", () => {
  test("is the tank on the square that holds the point, also at the square's edge", () => {
    expect(botAtPoint(bots, { x: 3 * CELL + 0.1, y: 2 * CELL + 9.9 })).toBe("b");
    expect(botAtPoint(bots, { x: 5, y: 5 })).toBe("a");
    expect(botAtPoint(bots, { x: 2 * CELL + 9.9, y: 2 * CELL + 5 })).toBeNull();
    // The wall around the floor is not a square.
    expect(botAtPoint(bots, { x: -1, y: 5 })).toBeNull();
  });
});

describe("where a name pill goes", () => {
  const view: BoardView = { left: -3, top: -3, right: 103, bottom: 103 };
  const pill = { width: 30, height: 6 };

  test("over the tank, and under it in the top row", () => {
    const middle = nameTagSpot({ x: 50, y: 55 }, pill, view);
    expect(middle.x).toBe(50);
    expect(middle.y).toBeLessThan(50);
    expect(nameTagSpot({ x: 50, y: 5 }, pill, view).y).toBeGreaterThan(10);
  });

  test("moved sideways so the whole pill stays inside the view, and centred when it is wider than the view", () => {
    expect(nameTagSpot({ x: 5, y: 55 }, pill, view).x).toBe(-3 + 15);
    expect(nameTagSpot({ x: 95, y: 55 }, pill, view).x).toBe(103 - 15);
    expect(nameTagSpot({ x: 5, y: 55 }, { width: 200, height: 6 }, view).x).toBe(50);
  });
});
