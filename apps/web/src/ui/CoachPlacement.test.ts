/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { placeCallout, placePill, type PlaceInput, type Rect } from "./CoachPlacement.ts";

const phone = { width: 360, height: 640 };
const size = { width: 300, height: 120 };
const base = { size, viewport: phone, obstacles: [], ringPad: 6, gap: 8, edge: 8 } satisfies Omit<PlaceInput, "target">;

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

describe("placeCallout", () => {
  test("goes below a target near the top, inside the screen", () => {
    const placed = placeCallout({ ...base, target: { left: 300, top: 10, width: 44, height: 44 } });
    expect(placed?.side).toBe("below");
    expect(placed?.left).toBeGreaterThanOrEqual(8);
    expect((placed?.left ?? 0) + size.width).toBeLessThanOrEqual(352);
  });

  test("goes above a target near the bottom", () => {
    expect(placeCallout({ ...base, target: { left: 20, top: 560, width: 320, height: 60 } })?.side).toBe("above");
  });

  test("never covers the target and its ring", () => {
    const target = { left: 30, top: 200, width: 300, height: 100 };
    const placed = placeCallout({ ...base, target });
    expect(placed).not.toBeNull();
    const rect = { left: placed?.left ?? 0, top: placed?.top ?? 0, ...size };
    expect(overlaps(rect, { left: 24, top: 194, width: 312, height: 112 })).toBe(false);
  });

  test("takes the side that covers fewer controls", () => {
    const target = { left: 30, top: 250, width: 300, height: 60 };
    // A row of buttons under the target, nothing above it.
    const obstacles = [0, 1, 2].map((i) => ({ left: 20 + i * 110, top: 360, width: 100, height: 44 }));
    const placed = placeCallout({ ...base, target, obstacles });
    expect(placed).toMatchObject({ side: "above", covers: 0 });
  });

  test("between sides that cover as many controls, takes the one that hides fewer sentences", () => {
    const target = { left: 30, top: 250, width: 300, height: 60 };
    const obstacles = [{ left: 150, top: 200, width: 60, height: 20 }, { left: 150, top: 360, width: 60, height: 20 }];
    const texts = [0, 1].map((i) => ({ left: 20, top: 330 + i * 30, width: 320, height: 24 }));
    expect(placeCallout({ ...base, target, obstacles, texts })?.side).toBe("above");
  });

  test("gives up when the target leaves no room on any side", () => {
    expect(placeCallout({ ...base, target: { left: 0, top: 60, width: 360, height: 520 } })).toBeNull();
  });

  test("never meets a keep-clear box, and goes just past one that lies beside the target", () => {
    // The header's tank at the top of a phone, and the status line with the countdown clock right under it.
    const target = { left: 150, top: 8, width: 44, height: 44 };
    const clock = { left: 280, top: 64, width: 72, height: 44 };
    const placed = placeCallout({ ...base, target, keepClear: [clock] });
    expect(placed).not.toBeNull();
    const rect = { left: placed?.left ?? 0, top: placed?.top ?? 0, ...size };
    expect(overlaps(rect, clock)).toBe(false);
    expect(rect.top).toBeGreaterThanOrEqual(clock.top + clock.height);
  });

  test("keeps off the bottom bar when the target sits in it", () => {
    const bar = { left: 0, top: 520, width: 360, height: 120 };
    const placed = placeCallout({ ...base, target: { left: 130, top: 580, width: 100, height: 52 }, keepClear: [bar] });
    expect(placed).not.toBeNull();
    expect((placed?.top ?? 0) + size.height).toBeLessThanOrEqual(bar.top);
  });

  test("the first-round tour's callout leaves the player's own tank free on a laptop board (row 8 of 73-after-first-timer-test.md)", () => {
    // The ranking pane at the right of a 1000 x 600 window is the target; the board fills the rest, and the own tank
    // sits where the best place beside the ranking (left of it, centred) would be.
    const target = { left: 680, top: 120, width: 300, height: 420 };
    const tank = { left: 500, top: 300, width: 40, height: 40 };
    const free = placeCallout({ ...base, viewport: { width: 1000, height: 600 }, target });
    expect(free).not.toBeNull();
    expect(overlaps({ left: free?.left ?? 0, top: free?.top ?? 0, ...size }, tank)).toBe(true);
    const placed = placeCallout({ ...base, viewport: { width: 1000, height: 600 }, target, keepClear: [tank] });
    expect(placed).not.toBeNull();
    expect(overlaps({ left: placed?.left ?? 0, top: placed?.top ?? 0, ...size }, tank)).toBe(false);
  });

  test("fits a 1000 x 600 window beside a tall target", () => {
    const placed = placeCallout({ ...base, viewport: { width: 1000, height: 600 }, target: { left: 16, top: 70, width: 320, height: 480 } });
    expect(placed?.side).toBe("right");
  });
});

describe("placePill", () => {
  test("sits beside the way to go, or at the bottom of the screen without one", () => {
    const pill = { ...base, size: { width: 200, height: 44 } };
    expect(placePill({ ...pill, anchor: { left: 120, top: 580, width: 100, height: 52 } }).top).toBeLessThan(580);
    expect(placePill({ ...pill, anchor: null })).toEqual({ left: 80, top: 588 });
  });

  test("without a way to point at, sits just above the bottom bar", () => {
    const pill = { ...base, size: { width: 200, height: 44 }, keepClear: [{ left: 0, top: 520, width: 360, height: 120 }] };
    expect(placePill({ ...pill, anchor: null })).toEqual({ left: 80, top: 468 });
  });
});
