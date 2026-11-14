/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { toastLetsTapsThrough, toastLift } from "./Toast.tsx";

describe("toastLift", () => {
  test("puts the toast above a bottom bar that is on the screen", () => {
    // A 640 px phone whose bar (the Ready button and the tabs) starts 136 px from the bottom.
    expect(toastLift(504, 640)).toBe(136);
  });

  test("keeps the toast at the bottom without a bar, or when the bar is below the screen (the scrolling fallback)", () => {
    expect(toastLift(null, 640)).toBe(0);
    expect(toastLift(900, 390)).toBe(0);
  });
});

describe("toastLetsTapsThrough", () => {
  test("a toast that only tells something lets taps reach the controls under it; one with Undo keeps its buttons", () => {
    expect(toastLetsTapsThrough({})).toBe(true);
    expect(toastLetsTapsThrough({ onUndo: () => undefined })).toBe(false);
  });
});
