/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { plainTankLook, type LeagueMonthRow, type LeagueRow } from "@game/arena";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { ChampionsView } from "./ChampionsPage.tsx";
import { en } from "./messages.ts";
import type { ChampionsLoad } from "./useChampions.ts";

const look = plainTankLook(4);
const rowAt = (rank: number): LeagueRow => ({ rank, name: `Tank ${rank}`, look, score: 500 - rank, games: 20, wins: 1 });
const monthRow = (rank: number | null, i: number): LeagueMonthRow => ({ rank, seatId: `seat-${i}`, name: `Tank ${i}`, look, score: 50 - i, countedDays: rank === null ? 3 : 9, gm: false });

const ready: ChampionsLoad = {
  kind: "ready",
  data: {
    month: "2026-11",
    rows: [monthRow(1, 1), monthRow(2, 2), monthRow(null, 3)],
    ownSeatId: "seat-2",
    rulesMonths: new Set(["2026-10"]),
    champions: {
      months: [{ month: "2026-10", champion: { ...rowAt(1), name: "Bima" }, top: [{ ...rowAt(1), name: "Bima" }, rowAt(2), rowAt(3)] }],
      tournamentWinners: [{ name: "Citra", look, wonAt: "2026-11-12T10:00:00Z", tanks: 16 }],
    },
  },
};

const render = (load: ChampionsLoad, part: "month" | "months" | "tournaments", language: "en" | "id" = "en") =>
  renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <ChampionsView load={load} part={part} onPart={() => undefined} onRetry={() => undefined} />
    </I18nProvider>,
  );

describe("ChampionsView", () => {
  test("each part shows its data, with the month's name and the visitor's row marked", () => {
    const month = render(ready, "month");
    expect(month).toContain("Ranking of November 2026");
    expect(month).toMatch(/aria-current="true"[^>]*data-player-id="seat-2"/);
    // The tanks with fewer counted days come after a line that says why they have no place.
    expect(month).toContain("Not ranked yet");
    expect(render(ready, "month", "id")).toContain("Belum masuk peringkat");
    expect(render(ready, "months")).toContain("Bima became champion with a month rating of 499.");
    expect(render(ready, "tournaments")).toContain("Citra beat 15 other tanks on 12 November 2026.");
    expect(render(ready, "months", "id")).toContain("Oktober 2026");
  });

  test("the page has Back beside its heading, in every state, so a visitor returns to the room or the chooser", () => {
    expect(render(ready, "month")).toMatch(/aria-label="Back"[^>]*data-champions-back/);
    expect(render({ kind: "loading" }, "month")).toContain("data-champions-back");
    expect(render(ready, "month", "id")).toMatch(/aria-label="Kembali"/);
  });

  test("a month whose rules are open has the button to its tanks' rules; other months have none", () => {
    expect(render(ready, "months")).toContain('data-month-rules-open="2026-10"');
    const closed: ChampionsLoad = ready.kind === "ready" ? { kind: "ready", data: { ...ready.data, rulesMonths: new Set() } } : ready;
    expect(render(closed, "months")).not.toContain("data-month-rules-open");
  });

  test("an empty record says so in each part", () => {
    const empty: ChampionsLoad = { kind: "ready", data: { month: "2026-11", rows: [], ownSeatId: null, rulesMonths: new Set(), champions: { months: [], tournamentWinners: [] } } };
    expect(render(empty, "month")).toContain(en.monthEmpty);
    expect(render(empty, "months")).toContain(en.monthsEmpty);
    expect(render(empty, "tournaments")).toContain(en.tournamentsEmpty);
  });

  test("loading and a failure are sentences, and the failure offers Try again", () => {
    expect(render({ kind: "loading" }, "month")).toContain(en.loading);
    const failed = render({ kind: "failed", failure: { ok: false, status: 0, error: { error: "network_error" }, code: "network_error" } }, "month");
    expect(failed).toContain("check your connection");
    expect(failed).toContain(en.retry);
  });
});
