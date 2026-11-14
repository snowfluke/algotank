/// <reference types="bun" />
// The round history model, the result route and the result page, through their public interfaces.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseTournamentResult, plainTankLook, type ResultResponse, type ResultRound, type TankColour, type TournamentResult } from "@game/arena";
import { parseRoute, paths } from "../app/route.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { historyOfResult, rankingOfResult } from "./history.ts";
import { ResultView } from "./ResultPage.tsx";
import { columnWindow } from "./RoundHistory.tsx";

const RESULT_ID = "AbCdEfGhIjKlMnOpQrStUv";

/** A knockout of `players` tanks: each round keeps max(8, half) by id order, so p1 wins. */
function knockout(players: number): TournamentResult {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  const rounds: ResultRound[] = [];
  let alive = ids;
  for (let round = 1; ; round++) {
    const isFinal = alive.length <= 8;
    const keep = isFinal ? 1 : Math.max(8, Math.ceil(alive.length / 2));
    rounds.push({
      round,
      isFinal,
      ruleSetId: "standard",
      standings: alive.map((playerId, i) => ({ playerId, rank: i + 1, score: 100 - i })),
      survivors: alive.slice(0, keep),
    });
    if (isFinal) break;
    alive = alive.slice(0, keep);
  }
  return {
    id: RESULT_ID,
    arenaId: "ABC234",
    arenaName: "Friday fight",
    kind: "presenter",
    finishedAt: Date.parse("2026-11-13T10:00:00Z"),
    game: 1,
    ticksPerRound: 100,
    tickMs: 900,
    ruleSetMode: "standard",
    joinPolicy: "account",
    players: ids.map((id, i) => ({ id, name: `Tank ${i + 1}`, look: plainTankLook(((i % 12) + 1) as TankColour), isBot: false })),
    rounds,
    ranking: ids.map((playerId, i) => ({ playerId, place: i + 1 })),
    winnerId: "p1",
  };
}

describe("round history model", () => {
  const result = knockout(16);

  test("the fixture is a result the server could store", () => {
    expect(parseTournamentResult(result).ok).toBe(true);
  });

  test("one column per round, the final last, with marks for through, out and the winner", () => {
    const model = historyOfResult(result, null);
    expect(model.columns.map((c) => [c.round, c.isFinal, c.rows.length, c.through])).toEqual([
      [1, false, 16, 8],
      [2, true, 8, 1],
    ]);
    const [first, final] = model.columns;
    expect(first!.rows.slice(7, 9).map((r) => r.mark)).toEqual(["through", "out"]);
    expect(final!.rows.map((r) => r.mark)).toEqual(["winner", "out", "out", "out", "out", "out", "out", "out"]);
  });

  test("without a viewer the winner is followed, and its row is kept on every column's page", () => {
    const model = historyOfResult(result, null);
    expect(model.followedId).toBe("p1");
    for (const column of model.columns) {
      expect(column.rows[column.keepIndex!]!.tank.playerId).toBe("p1");
      expect(column.rows.filter((r) => r.winner).map((r) => r.tank.playerId)).toEqual(["p1"]);
    }
  });

  test("a viewer who played is followed and marked as self; one who did not play is not", () => {
    const own = historyOfResult(result, "p12");
    expect(own.followedId).toBe("p12");
    expect(own.columns[0]!.keepIndex).toBe(11);
    expect(own.columns[1]!.keepIndex).toBeNull();
    expect(own.columns[0]!.rows[11]!.self).toBe(true);
    const stranger = historyOfResult(result, "nobody");
    expect(stranger.followedId).toBe("p1");
    expect(stranger.columns.flatMap((c) => c.rows).some((r) => r.self)).toBe(false);
  });

  test("512 tanks play 7 rounds: 512, 256, 128, 64, 32, 16 and a final of 8", () => {
    const model = historyOfResult(knockout(512), null);
    expect(model.columns.map((c) => c.rows.length)).toEqual([512, 256, 128, 64, 32, 16, 8]);
    expect(rankingOfResult(knockout(512))).toHaveLength(512);
  });

  test("the columns shown on a page never run past either end", () => {
    expect(columnWindow(7, 5, 0)).toEqual({ first: 0, last: 4 });
    expect(columnWindow(7, 5, 5)).toEqual({ first: 2, last: 6 });
    expect(columnWindow(7, 1, 7)).toEqual({ first: 6, last: 6 });
    expect(columnWindow(2, 9, 0)).toEqual({ first: 0, last: 1 });
  });
});

describe("result route", () => {
  test("/r/<id> opens the result page; a malformed id is not a page", () => {
    expect(parseRoute(paths.result(RESULT_ID))).toEqual({ page: "result", resultId: RESULT_ID });
    expect(parseRoute("/r/../etc")).toEqual({ page: "notFound" });
    expect(parseRoute("/r/short")).toEqual({ page: "notFound" });
    expect(parseRoute(paths.myResults())).toEqual({ page: "myResults" });
  });
});

describe("result page", () => {
  const render = (response: ResultResponse) =>
    renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <ResultView load={{ kind: "ready", response }} viewerId={null} part="winner" onPart={() => {}} onRetry={() => {}} />
      </I18nProvider>,
    );

  test("in Indonesian it names the page, the winner and the round history; the owner also gets the winner's email", () => {
    const owner = render({ result: knockout(16), emails: [{ playerId: "p1", email: "ana@example.org" }] });
    expect(owner).toContain("Hasil turnamen");
    expect(owner).toContain("Tank 1 menang!");
    expect(owner).toContain("data-winner-email");
    expect(owner).toContain("ana@example.org");
    const visitor = render({ result: knockout(16), emails: null });
    expect(visitor).not.toContain("data-winner-email");
  });

  test("an unknown or expired result says why", () => {
    const html = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <ResultView load={{ kind: "notFound" }} viewerId={null} part="winner" onPart={() => {}} onRetry={() => {}} />
      </I18nProvider>,
    );
    expect(html).toContain("lebih dari 180 hari");
  });
});
