/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { arenaIdFromLink, parseRoute, paths } from "./route.ts";

describe("parseRoute", () => {
  test("maps every page", () => {
    expect(parseRoute("/")).toEqual({ page: "home" });
    expect(parseRoute("/join")).toEqual({ page: "join" });
    expect(parseRoute("/play")).toEqual({ page: "play" });
    expect(parseRoute("/sign-in")).toEqual({ page: "signIn" });
    expect(parseRoute("/new/private")).toEqual({ page: "create", kind: "private" });
    expect(parseRoute("/new/presenter")).toEqual({ page: "create", kind: "presenter" });
    expect(parseRoute("/kit")).toEqual({ page: "kit" });
    expect(parseRoute("/workshop")).toEqual({ page: "workshop" });
    expect(parseRoute("/champions")).toEqual({ page: "champions" });
    expect(parseRoute("/a/ABC")).toEqual({ page: "player", arenaId: "ABC" });
    expect(parseRoute("/a/ABC/host")).toEqual({ page: "host", arenaId: "ABC" });
    expect(parseRoute("/a/ABC/screen")).toEqual({ page: "screen", arenaId: "ABC" });
  });

  test("ignores a trailing slash", () => {
    expect(parseRoute("/a/ABC/")).toEqual({ page: "player", arenaId: "ABC" });
    expect(parseRoute("/join/")).toEqual({ page: "join" });
  });

  test("rejects unknown paths", () => {
    expect(parseRoute("/a")).toEqual({ page: "notFound" });
    expect(parseRoute("/a/abc/other")).toEqual({ page: "notFound" });
    expect(parseRoute("/a/abc/host/extra")).toEqual({ page: "notFound" });
    expect(parseRoute("/x")).toEqual({ page: "notFound" });
    expect(parseRoute("/new")).toEqual({ page: "notFound" });
    expect(parseRoute("/new/public")).toEqual({ page: "notFound" });
    expect(parseRoute("/join/extra")).toEqual({ page: "notFound" });
    expect(parseRoute("/toString")).toEqual({ page: "notFound" });
  });

  test("rejects a malformed escape", () => {
    expect(parseRoute("/a/%E0%A4%A")).toEqual({ page: "notFound" });
  });

  test("the arena id is upper case, because the server ignores case and tokens are stored per id", () => {
    expect(parseRoute("/a/k7m2qx")).toEqual({ page: "player", arenaId: "K7M2QX" });
    expect(parseRoute("/a/K7m2Qx/host")).toEqual({ page: "host", arenaId: "K7M2QX" });
    expect(parseRoute("/a/k7m2qx/screen")).toEqual({ page: "screen", arenaId: "K7M2QX" });
  });

  test("paths round-trip through parseRoute", () => {
    const id = "A B/C";
    expect(parseRoute(paths.host(id))).toEqual({ page: "host", arenaId: id });
    expect(parseRoute(paths.screen(id))).toEqual({ page: "screen", arenaId: id });
    expect(parseRoute(paths.player(id))).toEqual({ page: "player", arenaId: id });
    expect(parseRoute(paths.home())).toEqual({ page: "home" });
    expect(parseRoute(paths.join())).toEqual({ page: "join" });
    expect(parseRoute(paths.play())).toEqual({ page: "play" });
    expect(parseRoute(paths.kit())).toEqual({ page: "kit" });
    expect(parseRoute(paths.workshop())).toEqual({ page: "workshop" });
    expect(parseRoute(paths.champions())).toEqual({ page: "champions" });
    expect(paths.playIn("tournament")).toBe("/play?arena=tournament");
    expect(parseRoute(new URL(paths.playIn("practice"), "https://x").pathname)).toEqual({ page: "play" });
    expect(parseRoute(paths.monthly())).toEqual({ page: "monthly" });
    expect(parseRoute(paths.create("private"))).toEqual({ page: "create", kind: "private" });
    expect(parseRoute(paths.create("presenter"))).toEqual({ page: "create", kind: "presenter" });
  });
});

describe("arenaIdFromLink", () => {
  test("reads the id from a full link, a link without a scheme, and a path", () => {
    expect(arenaIdFromLink("https://play.example.com/a/k7m2qx")).toBe("K7M2QX");
    expect(arenaIdFromLink("play.example.com/a/K7M2QX/screen")).toBe("K7M2QX");
    expect(arenaIdFromLink("  /a/K7M2QX/host  ")).toBe("K7M2QX");
  });

  test("ignores a query and a fragment", () => {
    expect(arenaIdFromLink("https://x.test/a/K7M2QX?ref=qr#top")).toBe("K7M2QX");
  });

  test("returns null for text that is not an arena link", () => {
    expect(arenaIdFromLink("K7M2QX")).toBeNull();
    expect(arenaIdFromLink("https://x.test/join")).toBeNull();
    expect(arenaIdFromLink("https://x.test/a/K7M2QX/other")).toBeNull();
  });
});
