/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { duplicateStateNames, STATES } from "./no-scroll-audit.mjs";

describe("the no-scroll audit's state table", () => {
  test("gives every state its own name, and finds a name used twice", () => {
    expect(duplicateStateNames(STATES)).toEqual([]);
    expect(duplicateStateNames([...STATES, STATES[0]])).toEqual([`${STATES[0].screen}/${STATES[0].state}`]);
  });
});
