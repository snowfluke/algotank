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
    { league: 1, rank: 1, name: "Ada", score: 120.5, countedDays: 2, account: { email: "ada@example.org", emailVerified: true, createdAt: "2026-11-02T03:00:00.000Z" } },
    { league: 1, rank: null, name: "Bobo", score: 0, countedDays: 0, account: { email: "bo@example.org", emailVerified: false, createdAt: "2026-11-16T03:00:00.000Z" } },
    { league: 1, rank: 2, name: "Cyan", score: 80, countedDays: 1, account: null },
  ],
};

const render = (load: AdminPlayersLoad, language: "en" | "id" = "en") =>
  renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <AdminPlayersView load={load} onRetry={() => undefined} />
    </I18nProvider>,
  );

describe("the admin's list of monthly players", () => {
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
  });
});
