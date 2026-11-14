/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { calloutShowsSkip, KEEP_CLEAR } from "./CoachMark.tsx";

const skip = { label: "Skip", onSkip: () => {} };

describe("the coach mark's callout", () => {
  test("the last step shows only its finish action, every other step also offers Skip", () => {
    expect(calloutShowsSkip({ next: { label: "Finish", finish: true, onNext: () => {} }, skip })).toBe(false);
    expect(calloutShowsSkip({ next: { label: "Next", finish: false, onNext: () => {} }, skip })).toBe(true);
    // A "do" step has no button of its own, so Skip stays.
    expect(calloutShowsSkip({ next: null, skip })).toBe(true);
    expect(calloutShowsSkip({ next: null, skip: null })).toBe(false);
  });
});

describe("what a callout never covers", () => {
  test("the player's own tank on a room's board, and not the workshop's test board, which the tour points at", () => {
    expect(KEEP_CLEAR).toContain('[data-arena-pane] [data-self="true"]');
    expect(KEEP_CLEAR).not.toMatch(/(^|,\s*)\[data-self/);
  });
});
