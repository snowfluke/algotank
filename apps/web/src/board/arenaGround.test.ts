import { describe, expect, test } from "bun:test";
import { RULE_SET_IDS } from "@game/engine";
import { ARENA_GROUNDS, MAX_GROUND_MARKS, groundMarks, groundMarksPath } from "./arenaGround.ts";

describe("the arena's ground", () => {
  test("every condition has a ground", () => {
    for (const id of RULE_SET_IDS) expect(ARENA_GROUNDS[id]).toBeDefined();
  });

  test("a board gives the same marks on every call, and different conditions give different marks", () => {
    expect(groundMarksPath(23, 17, "dry-spell")).toBe(groundMarksPath(23, 17, "dry-spell"));
    expect(groundMarksPath(23, 17, "dry-spell")).not.toBe(groundMarksPath(23, 17, "open-field"));
    expect(groundMarksPath(23, 17, "downpour")).toBe("");
  });

  test("a board of about 7,300 cells (open field, 512 tanks) has MAX_GROUND_MARKS marks at most; a small board has some", () => {
    for (const id of RULE_SET_IDS) expect(groundMarks(104, 70, id).length).toBeLessThanOrEqual(MAX_GROUND_MARKS);
    expect(groundMarks(104, 70, "open-field").length).toBeGreaterThan(MAX_GROUND_MARKS / 2);
    expect(groundMarks(11, 9, "open-field").length).toBeGreaterThan(10);
  });
});
