/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { boardDetail } from "./boardHelpers.ts";
import { cellPixels } from "./useCellPixels.ts";

describe("cellPixels", () => {
  test("is the smaller of the width and height per square, as the SVG scales with meet", () => {
    expect(cellPixels(328, 246, 24, 18)).toBeCloseTo(13.67, 1);
    expect(cellPixels(960, 300, 24, 18)).toBeCloseTo(16.67, 1);
  });

  test("a 64 tank board on a 390px phone is too small for labels", () => {
    // 64 tanks under the standard set: 24 by 18 squares, plus the wall.
    const px = cellPixels(358, 270, 24.6, 18.6);
    expect(px).not.toBeNull();
    expect(boardDetail(px).labels).toBe(false);
  });

  test("an empty box (a hidden tab) gives 0, and a board without squares gives null", () => {
    expect(cellPixels(0, 100, 24, 18)).toBe(0);
    expect(cellPixels(100, 100, 0, 18)).toBeNull();
  });
});
