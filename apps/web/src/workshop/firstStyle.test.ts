/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { checklistTicks } from "./firstStyle.ts";

describe("checklistTicks", () => {
  test("ticks a line once the tour has passed its step", () => {
    expect(checklistTicks({ kind: "running", step: 0 })).toEqual([false, false, false, false, false]);
    // Step 3 ("This list is your algorithm") comes after a start was picked.
    expect(checklistTicks({ kind: "running", step: 2 })).toEqual([true, false, false, false, false]);
    // After the test match ran, before the name.
    expect(checklistTicks({ kind: "waiting", step: 7 })).toEqual([true, true, true, true, false]);
    expect(checklistTicks({ kind: "running", step: 9 })).toEqual([true, true, true, true, true]);
  });

  test("a finished tour ticks every line", () => {
    expect(checklistTicks({ kind: "finished" })).toEqual([true, true, true, true, true]);
  });
});
