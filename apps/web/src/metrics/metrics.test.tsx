/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminMetricsResponse, MetricsDay } from "@game/arena";
import { parseRoute, paths } from "../app/route.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import type { KeyValueStore } from "../session/storage.ts";
import { AdminMetricsView, type MetricsPart } from "./AdminMetricsPage.tsx";
import { pathOf, seriesOf, todayRows } from "./metricsView.ts";
import { reachStep } from "./track.ts";
import { isAdminMetricsResponse, type AdminMetricsLoad } from "./useAdminMetrics.ts";

const day = (d: string, counts: MetricsDay["counts"] = {}): MetricsDay => ({ day: d, counts });

const response: AdminMetricsResponse = {
  timeZone: "Asia/Jakarta",
  today: "2026-11-14",
  days: [
    day("2026-11-12", { "firstTimer.openedHome": 4, "firstTimer.enteredPractice": 3 }),
    day("2026-11-13", { visitors: 9, "roundPlayed.practice": 2, "tanksInRounds.practice": 15, "pageOpened.home": 5, "pageOpened.play": 2 }),
    day("2026-11-14", { visitors: 12, "pageOpened.home": 7, "firstTimer.openedHome": 6, "firstTimer.enteredPractice": 3, "firstTimer.watchedFirstRound": 2 }),
  ],
};

describe("the numbers of the admin page", () => {
  test("today against yesterday, with tanks per round from the two counters", () => {
    const rows = todayRows(response);
    expect(rows.find((r) => r.kind === "measure" && r.id === "visitors")).toMatchObject({ today: 12, yesterday: 9 });
    expect(rows.find((r) => r.kind === "measure" && r.id === "pageOpens")).toMatchObject({ today: 7, yesterday: 7 });
    expect(rows.find((r) => r.kind === "measure" && r.id === "tanksPerRound")).toMatchObject({ today: null, yesterday: 7.5 });
    expect(rows.find((r) => r.kind === "page" && r.page === "play")).toMatchObject({ today: 0, yesterday: 2 });
  });

  test("a series per chart, oldest first, and the path's shares of the first step", () => {
    const visitors = seriesOf(response).find((s) => s.id === "visitors");
    expect(visitors?.points.map((p) => p.value)).toEqual([0, 9, 12]);
    expect(visitors).toMatchObject({ total: 21, max: 12 });
    expect(pathOf(response).slice(0, 4)).toEqual([
      { step: "openedHome", count: 10, share: 1 },
      { step: "enteredPractice", count: 6, share: 0.6 },
      { step: "watchedFirstRound", count: 2, share: 0.2 },
      { step: "openedRules", count: 0, share: 0 },
    ]);
  });

  test("the answer's shape is checked at the boundary", () => {
    expect(isAdminMetricsResponse(response)).toBe(true);
    expect(isAdminMetricsResponse({ ...response, days: [{ day: "14 Nov", counts: {} }] })).toBe(false);
    expect(isAdminMetricsResponse({ ...response, days: [{ day: "2026-11-14", counts: { visitors: -1 } }] })).toBe(false);
  });

  test("/admin/metrics is its own page", () => {
    expect(parseRoute(paths.adminMetrics())).toEqual({ page: "adminMetrics" });
    expect(parseRoute("/admin")).toEqual({ page: "notFound" });
  });
});

function memoryStore(): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("the first visit on a device", () => {
  test("each step is reported once and only after the one before it", () => {
    const store = memoryStore();
    const firstTimer = () => false;
    expect(reachStep("enteredPractice", store, firstTimer)).toBe(false);
    expect(reachStep("openedHome", store, firstTimer)).toBe(true);
    expect(reachStep("openedHome", store, firstTimer)).toBe(false);
    expect(reachStep("watchedFirstRound", store, firstTimer)).toBe(false);
    expect(reachStep("enteredPractice", store, firstTimer)).toBe(true);
    expect(reachStep("watchedFirstRound", store, firstTimer)).toBe(true);
    expect([...store.data.values()]).toEqual(['["openedHome","enteredPractice","watchedFirstRound"]']);
  });

  test("a device that finished a game, or one whose store is blocked, starts no path", () => {
    expect(reachStep("openedHome", memoryStore(), () => true)).toBe(false);
    expect(reachStep("openedHome", null, () => false)).toBe(false);
  });
});

const render = (load: AdminMetricsLoad, part: MetricsPart, language: "en" | "id" = "en") =>
  renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <AdminMetricsView load={load} part={part} onPart={() => undefined} onRetry={() => undefined} />
    </I18nProvider>,
  );

describe("AdminMetricsView", () => {
  test("shows each part, and a 404 as the page that does not exist", () => {
    expect(render({ kind: "ready", data: response }, "today")).toContain("Today and yesterday");
    expect(render({ kind: "ready", data: response }, "path", "id")).toContain("Membuka halaman utama");
    expect(render({ kind: "notFound" }, "today")).toContain("Page not found");
    expect(render({ kind: "failed" }, "today")).toContain("did not load");
  });
});
