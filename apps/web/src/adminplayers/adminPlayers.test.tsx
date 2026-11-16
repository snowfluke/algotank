/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminPlayersResponse } from "@game/arena";
import { parseRoute, paths } from "../app/route.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { AdminPlayersView } from "./AdminPlayersPage.tsx";
import { isAdminPlayersResponse, type AdminPlayersLoad } from "./useAdminPlayers.ts";

const response: AdminPlayersResponse = {
  month: "2026-11",
  day: "2026-11-16",
  players: [
    { seatId: "s-ada", league: 1, rank: 1, name: "Ada", score: 120.5, countedDays: 2, gm: false, account: { email: "ada@example.org", emailVerified: true, createdAt: "2026-11-02T03:00:00.000Z" } },
    { seatId: "s-bobo", league: 1, rank: null, name: "Bobo", score: 0, countedDays: 0, gm: false, account: { email: "bo@example.org", emailVerified: false, createdAt: "2026-11-16T03:00:00.000Z" } },
    { seatId: "s-cyan", league: 1, rank: 2, name: "Cyan", score: 80, countedDays: 1, gm: false, account: null },
  ],
};

const render = (load: AdminPlayersLoad, language: "en" | "id" = "en") =>
  renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <AdminPlayersView load={load} onRetry={() => undefined} onRemove={() => undefined} onGameMaster={() => undefined} />
    </I18nProvider>,
  );

describe("the admin's list of monthly players", () => {
  test("the game master's row has the GM badge, no place, and the switch back; a player's row offers Make GM", () => {
    const withGm: AdminPlayersResponse = { ...response, players: [...response.players, { seatId: "s-alel", league: 1, rank: null, name: "Alel", score: 0, countedDays: 0, gm: true, account: { email: "host@example.org", emailVerified: true, createdAt: "2026-11-01T03:00:00.000Z" } }] };
    const html = render({ kind: "ready", data: withGm });
    expect(html).toMatch(/data-badge[^>]*>GM<[\s\S]*?Alel/);
    expect(html).toContain("League 1, game master");
    expect(html).toContain(">Remove GM<");
    expect(html).toContain(">Make GM<");
    expect(render({ kind: "ready", data: withGm }, "id")).toContain(">Jadikan GM<");
  });

  test("/admin/players is its own page", () => {
    expect(parseRoute(paths.adminPlayers())).toEqual({ page: "adminPlayers" });
  });

  test("the answer's shape is checked at the boundary", () => {
    expect(isAdminPlayersResponse(response)).toBe(true);
    expect(isAdminPlayersResponse({ ...response, players: [{ ...response.players[0], league: 0 }] })).toBe(false);
    expect(isAdminPlayersResponse({ ...response, players: [{ ...response.players[0], account: { email: "ada@example.org" } }] })).toBe(false);
  });

  test("each tank shows its place, its owner's email and whether it is verified; a 404 is the page that does not exist", () => {
    const html = render({ kind: "ready", data: response });
    expect(html).toContain("The monthly arena has 3 tanks on 16 November 2026");
    expect(html).toContain("ada@example.org");
    expect(html).toContain("League 1, place 1");
    expect(html).toContain("League 1, not ranked yet");
    expect(html).toContain("Not verified");
    expect(html).toContain("No account");
    expect(render({ kind: "ready", data: response }, "id")).toContain("Belum terverifikasi");
    expect(render({ kind: "ready", data: { ...response, players: [] } })).toContain("No tank is in the monthly arena now.");
    expect(render({ kind: "notFound" })).toContain("Page not found");
    expect(render({ kind: "failed" })).toContain("did not load");
    // Each row has its own Remove button, named for a screen reader by its tank.
    expect(html).toContain('data-admin-remove="s-bobo"');
    expect(html).toContain('aria-label="Remove Bobo"');
  });
});
