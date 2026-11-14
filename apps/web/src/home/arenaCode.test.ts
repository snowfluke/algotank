/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { readArenaCode } from "./arenaCode.ts";

describe("readArenaCode", () => {
  test("accepts a code in any case, with spaces or dashes", () => {
    expect(readArenaCode("k7m2qx")).toEqual({ kind: "code", code: "K7M2QX" });
    expect(readArenaCode("  K7M 2QX ")).toEqual({ kind: "code", code: "K7M2QX" });
    expect(readArenaCode("k7m-2qx")).toEqual({ kind: "code", code: "K7M2QX" });
  });

  test("accepts a pasted link to any arena page", () => {
    expect(readArenaCode("https://algotank.example/a/k7m2qx")).toEqual({ kind: "code", code: "K7M2QX" });
    expect(readArenaCode("algotank.example/a/K7M2QX/screen?x=1")).toEqual({ kind: "code", code: "K7M2QX" });
  });

  test("tells empty input from input that is not a code", () => {
    expect(readArenaCode("   ")).toEqual({ kind: "empty" });
    expect(readArenaCode("K7M2Q")).toEqual({ kind: "invalid" });
    expect(readArenaCode("K7M2QXZ")).toEqual({ kind: "invalid" });
    expect(readArenaCode("K7M2Q!")).toEqual({ kind: "invalid" });
    expect(readArenaCode("https://algotank.example/join")).toEqual({ kind: "invalid" });
  });
});
