/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { boardAspect, fittedSize } from "./FittedBoard.tsx";

describe("fittedSize", () => {
  test("a wide box gives a board as tall as the box, centred by its parent", () => {
    expect(fittedSize({ width: 1000, height: 400 }, 1.5)).toEqual({ width: 600, height: 400 });
  });

  test("a tall phone pane gives a board as wide as the pane", () => {
    expect(fittedSize({ width: 328, height: 410 }, boardAspect(10, 8))).toEqual({ width: 328, height: 266 });
  });

  test("the board never leaves the box and keeps its shape within a pixel", () => {
    for (const box of [{ width: 360, height: 470 }, { width: 520, height: 520 }, { width: 1, height: 900 }]) {
      const size = fittedSize(box, boardAspect(12, 9));
      expect(size.width).toBeLessThanOrEqual(box.width);
      expect(size.height).toBeLessThanOrEqual(box.height);
      expect(Math.abs(size.width / boardAspect(12, 9) - size.height)).toBeLessThan(1);
    }
  });

  test("an empty box gives an empty board", () => {
    expect(fittedSize({ width: 0, height: 400 }, 1.2)).toEqual({ width: 0, height: 0 });
  });
});
