/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { COLUMN_GAP_EM, FIT_FULL_PX, FIT_MIN_PX, fitWindow, planFit, ROW_HEIGHT_EM } from "./fitList.ts";

// The ranking box beside the board of 24 tanks at 1920x1080, with the tie note above it (measured in the built page).
const RANKING_BOX = { width: 675, height: 704 };
const RANKING = { maxPx: 36, columnEm: 12 };

describe("planFit", () => {
  test("24 tanks and the cut line fit at 26px or more, in more columns instead of smaller text", () => {
    const plan = planFit(25, RANKING_BOX, RANKING);
    expect(plan.fontPx).toBeGreaterThanOrEqual(FIT_FULL_PX);
    expect(plan.capacity).toBe(25);
    expect(plan.columns).toBe(2);
    // The rows and columns the plan asks for fit the box at its font size.
    expect(plan.rows * ROW_HEIGHT_EM * plan.fontPx).toBeLessThanOrEqual(RANKING_BOX.height);
    expect(plan.columns * RANKING.columnEm * plan.fontPx + (plan.columns - 1) * COLUMN_GAP_EM * plan.fontPx).toBeLessThanOrEqual(RANKING_BOX.width);
  });

  test("a short list keeps the largest text in one column", () => {
    expect(planFit(9, RANKING_BOX, RANKING)).toEqual({ fontPx: 36, columns: 1, rows: 9, capacity: 9 });
  });

  test("65 rows that do not fit at 20px keep 20px and show as many rows as the box holds", () => {
    const plan = planFit(65, RANKING_BOX, RANKING);
    expect(plan.fontPx).toBe(FIT_MIN_PX);
    expect(plan.capacity).toBeLessThan(65);
    expect(plan.capacity).toBe(plan.rows * plan.columns);
  });

  test("an empty or tiny box still gives one row and never a font below the floor", () => {
    const plan = planFit(10, { width: 0, height: 0 }, RANKING);
    expect(plan.fontPx).toBe(FIT_MIN_PX);
    expect(plan.capacity).toBe(1);
  });
});

describe("fitWindow", () => {
  test("shows every row when they fit", () => {
    expect(fitWindow(25, 25, 11)).toEqual({ kind: "all" });
  });

  test("without a focus row: the top rows, then the line that counts the rest", () => {
    expect(fitWindow(10, 5, null)).toEqual({ kind: "some", shown: [0, 1, 2, 3], moreAt: 4, hidden: 6 });
  });

  test("with the cut line far down: the top places, the line, then the places around the cut line", () => {
    const window = fitWindow(65, 20, 32);
    if (window.kind !== "some") throw new Error("expected a shortened list");
    expect(window.shown.length + 1).toBe(20);
    expect(window.hidden).toBe(65 - 19);
    expect(window.shown).toContain(32);
    expect(window.shown.slice(0, window.moreAt)).toEqual(Array.from({ length: window.moreAt }, (_, i) => i));
    // The rows after the line are one block that holds the cut line and places on both sides of it.
    const block = window.shown.slice(window.moreAt);
    expect(block.at(0)).toBeLessThan(32);
    expect(block.at(-1)).toBeGreaterThan(32);
  });

  test("a cut line near the end of the top rows still shows the places just below it", () => {
    // 64 tanks, the cut after place 32 at index 32, and room for 34 rows.
    const window = fitWindow(65, 34, 32);
    if (window.kind !== "some") throw new Error("expected a shortened list");
    expect(window.shown).toContain(32);
    expect(window.shown).toContain(35);
    expect(window.shown.length + 1).toBe(34);
  });

  test("a cut line inside the top rows needs no second block", () => {
    expect(fitWindow(30, 10, 4)).toEqual({ kind: "some", shown: [0, 1, 2, 3, 4, 5, 6, 7, 8], moreAt: 9, hidden: 21 });
  });
});
