/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { paths } from "../app/route.ts";
import { nextFromSearch, safeNextPath } from "./nextPath.ts";

describe("safeNextPath", () => {
  test("keeps a page of this app", () => {
    expect(safeNextPath("/new/private")).toBe("/new/private");
    expect(safeNextPath("/a/K7M2QX/host")).toBe("/a/K7M2QX/host");
    expect(nextFromSearch(`?next=${encodeURIComponent("/new/presenter")}`)).toBe("/new/presenter");
  });

  test("sends anything else to the start", () => {
    for (const raw of [null, "", "https://evil.example/", "//evil.example", "/\\evil.example", "/nope", "new/private", "/sign-in"]) {
      expect(safeNextPath(raw)).toBe(paths.home());
    }
  });

  test("paths.signIn round-trips through the search string", () => {
    const href = paths.signIn("/new/private");
    expect(nextFromSearch(href.slice(href.indexOf("?")))).toBe("/new/private");
  });
});
