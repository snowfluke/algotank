/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ThrowEvent } from "@game/engine";
import { throwOf } from "./water.ts";

describe("water", () => {
  test("throwOf finds the throw of one bot and gives null for a bot that did not throw", () => {
    const throws: ThrowEvent[] = [
      { throwerId: "a", outcome: "empty" },
      { throwerId: "b", outcome: "dry", targetId: "a", distance: 1 },
    ];
    expect(throwOf(throws, "b")?.outcome).toBe("dry");
    expect(throwOf(throws, "c")).toBeNull();
  });
});
