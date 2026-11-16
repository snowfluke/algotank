/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { PublicBot, PublicSnapshot } from "@game/arena";
import { DIRECTIONS, DIRECTION_STEP, STANDARD_RULE_SET_ID } from "@game/engine";
import { bestOrientation, rotateDirection, rotateSnapshot } from "./boardOrientation.ts";

function bot(id: string, x: number, y: number, direction: PublicBot["direction"]): PublicBot {
  return { id, x, y, direction, score: 0, wasHit: false, build: {}, hitsLanded: 0, hitsTaken: 0, water: 6, item: null, effect: null };
}

const snapshot: PublicSnapshot = {
  width: 15,
  height: 11,
  tick: 7,
  ticksTotal: 100,
  survivorsAfterRound: null,
  ruleSetId: STANDARD_RULE_SET_ID,
  bots: [bot("a", 0, 0, "N"), bot("b", 14, 10, "SW"), bot("c", 3, 8, "E")],
  items: [{ kind: "bucket", x: 14, y: 0, turnsLeft: 4 }],
};

describe("rotateSnapshot", () => {
  test("a quarter turn swaps the size and sends the top-left square to the top-right", () => {
    const turned = rotateSnapshot(snapshot);
    expect([turned.width, turned.height]).toEqual([11, 15]);
    expect(turned.bots[0]).toMatchObject({ id: "a", x: 10, y: 0, direction: "E" });
    // The bottom-right square goes to the bottom-left one.
    expect(turned.bots[1]).toMatchObject({ id: "b", x: 0, y: 14, direction: "NW" });
    expect(turned.items[0]).toMatchObject({ kind: "bucket", x: 10, y: 14, turnsLeft: 4 });
  });

  test("four quarter turns give the input back", () => {
    const back = rotateSnapshot(rotateSnapshot(rotateSnapshot(rotateSnapshot(snapshot))));
    expect(back).toEqual(snapshot);
  });

  test("every square stays inside the turned board and no two tanks meet", () => {
    const turned = rotateSnapshot(snapshot);
    for (const cell of [...turned.bots, ...turned.items]) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(turned.width);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThan(turned.height);
    }
    expect(new Set(turned.bots.map((b) => `${b.x},${b.y}`)).size).toBe(turned.bots.length);
  });

  test("a step ahead before the turn is a step ahead after it", () => {
    for (const direction of DIRECTIONS) {
      const step = DIRECTION_STEP[direction];
      const before = { ...snapshot, bots: [bot("a", 5, 5, direction), bot("b", 5 + step.x, 5 + step.y, "N")] };
      const [a, b] = rotateSnapshot(before).bots as [PublicBot, PublicBot];
      const after = DIRECTION_STEP[a.direction];
      expect([b.x - a.x, b.y - a.y]).toEqual([after.x, after.y]);
    }
  });

  test("the direction turns four quarters to a full circle", () => {
    expect(rotateDirection("N")).toBe("E");
    expect(rotateDirection("W")).toBe("N");
    expect(DIRECTIONS.map((d) => rotateDirection(rotateDirection(rotateDirection(rotateDirection(d)))))).toEqual([...DIRECTIONS]);
  });
});

describe("bestOrientation", () => {
  const standard = { width: 15, height: 11 };
  test("a tall phone box turns a wide board upright", () => {
    // 11 x 15 squares in 328 x 400: min(328 / 11.6, 400 / 15.6) = 25.6, against 328 / 15.6 = 21.
    expect(bestOrientation({ width: 328, height: 400 }, standard)).toBe("upright");
  });

  test("a wide box and a box not yet measured keep the board sideways", () => {
    expect(bestOrientation({ width: 900, height: 400 }, standard)).toBe("sideways");
    expect(bestOrientation(null, standard)).toBe("sideways");
  });

  test("a tie stays sideways", () => {
    expect(bestOrientation({ width: 300, height: 300 }, { width: 10, height: 10 })).toBe("sideways");
  });
});
