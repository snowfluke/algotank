import { describe, expect, test } from "bun:test";
import { flagFlipped } from "./TankFlag.tsx";

describe("the flag keeps its first colour on top", () => {
  test("it flips when the tank faces partly west or straight down, and the board's growing angles give the same answer", () => {
    // Headings clockwise from east: E, SE, S, SW, W, NW, N, NE.
    const headings = [0, 45, 90, 135, 180, 225, 270, 315];
    expect(headings.map(flagFlipped)).toEqual([false, false, true, true, true, true, false, false]);
    expect(headings.map((h) => flagFlipped(h + 720))).toEqual(headings.map(flagFlipped));
    expect(headings.map((h) => flagFlipped(h - 360))).toEqual(headings.map(flagFlipped));
  });
});
