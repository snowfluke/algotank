import { describe, expect, test } from "bun:test";
import { allCells, arenaSize, cellAhead, isInside } from "./grid.ts";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID, ruleSet } from "../combat/rule-sets.ts";
import { RULES } from "./rules.ts";

const STANDARD = ruleSet(STANDARD_RULE_SET_ID);

describe("arenaSize", () => {
  test.each([
    [2, 8, 6],
    [8, 8, 6],
    [20, 13, 10],
    [64, 24, 18],
  ])("%i players", (players, width, height) => {
    expect(arenaSize(players, STANDARD)).toEqual({ width, height });
  });

  test("is about 15% occupied from 8 players up, and 4:3 within one cell", () => {
    for (let n = 8; n <= 64; n++) {
      const { width, height } = arenaSize(n, STANDARD);
      const fill = n / (width * height);
      expect(fill).toBeGreaterThan(0.12);
      expect(fill).toBeLessThan(0.19);
      expect(Math.abs(height - (width * 3) / 4)).toBeLessThanOrEqual(0.5);
    }
  });

  test("never falls below the minimum size, and never gets smaller with more players", () => {
    let previousCells = 0;
    for (let n = 1; n <= 64; n++) {
      const { width, height } = arenaSize(n, STANDARD);
      expect(width).toBeGreaterThanOrEqual(RULES.minGridWidth);
      expect(height).toBeGreaterThanOrEqual(RULES.minGridHeight);
      expect(width * height).toBeGreaterThanOrEqual(previousCells);
      expect(width * height).toBeGreaterThan(n * 2);
      previousCells = width * height;
    }
  });

  test.each(RULE_SET_IDS)("under %s, the cells hold bots at about the fill ratio of the set, once the minimum size allows it", (id) => {
    const rules = ruleSet(id);
    for (const n of [20, 40, 64]) {
      const { width, height } = arenaSize(n, rules);
      expect(n / (width * height)).toBeGreaterThan(rules.gridFillRatio * 0.75);
      expect(n / (width * height)).toBeLessThan(rules.gridFillRatio * 1.25);
    }
  });

  test("a lower fill ratio never gives a smaller arena", () => {
    for (let n = 2; n <= 64; n++) {
      const dense = arenaSize(n, { gridFillRatio: 0.2 });
      const sparse = arenaSize(n, { gridFillRatio: 0.1 });
      expect(sparse.width * sparse.height).toBeGreaterThanOrEqual(dense.width * dense.height);
    }
  });

  test("rejects a count that is not a positive integer", () => {
    expect(() => arenaSize(0, STANDARD)).toThrow();
    expect(() => arenaSize(2.5, STANDARD)).toThrow();
  });
});

describe("geometry", () => {
  test("N faces toward y - 1", () => {
    expect(cellAhead({ x: 3, y: 3 }, "N")).toEqual({ x: 3, y: 2 });
    expect(cellAhead({ x: 3, y: 3 }, "S", 2)).toEqual({ x: 3, y: 5 });
    expect(cellAhead({ x: 3, y: 3 }, "E", 3)).toEqual({ x: 6, y: 3 });
    expect(cellAhead({ x: 3, y: 3 }, "W")).toEqual({ x: 2, y: 3 });
  });

  test.each([
    ["NE", 5, 1],
    ["SE", 5, 5],
    ["SW", 1, 5],
    ["NW", 1, 1],
  ] as const)("a diagonal facing %s moves both coordinates: 2 steps from (3, 3) reach (%i, %i)", (direction, x, y) => {
    expect(cellAhead({ x: 3, y: 3 }, direction, 2)).toEqual({ x, y });
  });

  test("isInside and allCells agree", () => {
    const size = { width: 4, height: 3 };
    expect(allCells(size)).toHaveLength(12);
    expect(allCells(size).every((c) => isInside(size, c))).toBe(true);
    expect(isInside(size, { x: 4, y: 0 })).toBe(false);
    expect(isInside(size, { x: 0, y: -1 })).toBe(false);
  });
});
