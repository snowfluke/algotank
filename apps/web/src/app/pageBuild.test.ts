import { describe, expect, test } from "bun:test";
import { isOlderPage } from "./pageBuild.ts";

describe("an older page", () => {
  test("is a built page whose entry script differs from the server's", () => {
    expect(isOlderPage("/assets/index-a.js", "/assets/index-b.js")).toBe(true);
    expect(isOlderPage("/assets/index-a.js", "/assets/index-a.js")).toBe(false);
    // The dev server has no built page; a server without one names nothing.
    expect(isOlderPage(null, "/assets/index-b.js")).toBe(false);
    expect(isOlderPage("/assets/index-a.js", null)).toBe(false);
  });
});
