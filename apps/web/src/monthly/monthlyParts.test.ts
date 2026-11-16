import { describe, expect, test } from "bun:test";
import { plainTankLook, type LeagueMonthRow, type LeagueRankingResponse, type LeagueTodayRow } from "@game/arena";
import { dayBefore, formatDayClock, gameMastersFirst, lastFinishedDay, leagueSwitchKind, leagueToShow, monthItems, withLivePoints } from "./monthlyParts.ts";

const look = plainTankLook(3);

describe("the monthly page's rules", () => {
  test("the day's clock shows hours, minutes and seconds, rounded up", () => {
    expect(formatDayClock(5 * 3600_000 + 12 * 60_000 + 43_200)).toBe("05:12:44");
    expect(formatDayClock(0)).toBe("00:00:00");
    expect(formatDayClock(-5)).toBe("00:00:00");
    expect(formatDayClock(86_400_000)).toBe("24:00:00");
  });

  test("yesterday crosses months and years", () => {
    expect(dayBefore("2026-12-01")).toBe("2026-11-30");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
    const record = (day: string) => ({ day, league: 1, top: [{ name: "Ana", look, points: 4 }] });
    expect(lastFinishedDay([record("2026-11-13")], "2026-11-14")).toMatchObject({ yesterday: true });
    expect(lastFinishedDay([record("2026-11-10")], "2026-11-14")).toMatchObject({ yesterday: false });
    expect(lastFinishedDay([], "2026-11-14")).toBeNull();
  });

  test("the league switch: none for 1, a row for 2 to 5, a list from 6", () => {
    expect([1, 2, 5, 6, 9].map(leagueSwitchKind)).toEqual(["none", "row", "row", "list", "list"]);
  });

  test("the league shown: the chosen one while it exists, else the owner's, else League 1", () => {
    expect(leagueToShow(3, 4, 2)).toBe(3);
    expect(leagueToShow(5, 4, 2)).toBe(2);
    expect(leagueToShow(5, 4, null)).toBe(1);
    expect(leagueToShow(-1, 1, 2)).toBe(1);
  });

  test("this month's ranking puts one line before the tanks without a place", () => {
    const row = (rank: number | null, i: number): LeagueMonthRow => ({ rank, seatId: `s${i}`, name: `T${i}`, look, score: 10 - i, countedDays: rank === null ? 2 : 8, gm: false });
    const gm = { text: "GM", title: "Game master" };
    const items = monthItems([row(1, 1), row(2, 2), row(null, 3), row(null, 4)], "not ranked", gm);
    expect(items.map((item) => (item.kind === "cut" ? "cut" : item.row.place))).toEqual([1, 2, "cut", null, null]);
    expect(monthItems([row(null, 1)], "x", gm).map((item) => item.kind)).toEqual(["cut", "row"]);
    expect(monthItems([row(1, 1)], "x", gm).map((item) => item.kind)).toEqual(["row"]);
    // The game master's row, last, has its badge and no place, and it does not open the "not ranked" part.
    const withGm = monthItems([row(1, 1), { ...row(null, 9), countedDays: 0, gm: true }], "not ranked", gm);
    expect(withGm.map((item) => (item.kind === "cut" ? "cut" : [item.row.place, item.row.badge?.text ?? null]))).toEqual([[1, null], [null, "GM"]]);
  });
});

describe("the game master's row on the monthly page", () => {
  test("comes first, and the other rows keep their order, the 'not ranked yet' line included", () => {
    const row = (rank: number | null, i: number, gm = false): LeagueMonthRow => ({ rank, seatId: `s${i}`, name: `T${i}`, look, score: 10 - i, countedDays: rank === null ? 2 : 8, gm });
    const gm = { text: "GM", title: "Game master" };
    const items = monthItems([row(1, 1), row(null, 2), row(null, 9, true)], "not ranked", gm);
    const pinned = gameMastersFirst(items, new Set(["s9"]));
    expect(pinned.map((item) => (item.kind === "cut" ? "cut" : item.row.tank.playerId))).toEqual(["s9", "s1", "cut", "s2"]);
    expect(gameMastersFirst(items, new Set())).toEqual(items);
  });
});

describe("today's ranking follows the board", () => {
  const row = (seatId: string, points: number, rank: number, seated = true, gm = false): LeagueTodayRow => ({ rank, seatId, name: seatId, look: plainTankLook(1), points, counts: true, seated, livePoints: seated, gm });
  const ranking: LeagueRankingResponse = {
    league: 1,
    month: "2026-11",
    day: "2026-11-14",
    today: [row("a", 10, 1), row("b", 5, 2), row("gone", 4, 3, false)],
    thisMonth: [],
  };
  const board = (scores: Record<string, number>, day = "2026-11-14", league = 1) => ({ league, day, snapshot: { bots: Object.entries(scores).map(([id, score]) => ({ id, score })) } });

  test("the points of the latest turn reorder the seated tanks; a tank that quit keeps its points", () => {
    const merged = withLivePoints(ranking, board({ a: 3, b: 8, bot1: 2 }));
    expect(merged?.today.map((r) => [r.rank, r.seatId, r.points])).toEqual([
      [1, "b", 8],
      [2, "gone", 4],
      [3, "a", 3],
    ]);
  });

  test("the game master takes no place as the points move: the other tanks' places skip it", () => {
    const withGm: LeagueRankingResponse = { ...ranking, today: [row("gm", 9, 0, true, true), ...ranking.today] };
    const merged = withLivePoints(withGm, board({ gm: 20, a: 3, b: 8 }));
    expect(merged?.today.map((r) => [r.rank, r.seatId])).toEqual([
      [0, "gm"],
      [1, "b"],
      [2, "gone"],
      [3, "a"],
    ]);
  });

  test("a player back after quitting keeps the quit tank's counted points, not the new tank's", () => {
    const back: LeagueTodayRow = { ...row("back", 7, 3), livePoints: false };
    const merged = withLivePoints({ ...ranking, today: [row("a", 10, 1), row("b", 5, 2), back] }, board({ a: 1, b: 2, back: -40 }));
    expect(merged?.today.find((r) => r.seatId === "back")?.points).toBe(7);
    expect(merged?.today.map((r) => r.seatId)).toEqual(["back", "b", "a"]);
  });

  test("a board of another day or league leaves the server's ranking as it is", () => {
    expect(withLivePoints(ranking, board({ a: 0, b: 99 }, "2026-11-15"))).toBe(ranking);
    expect(withLivePoints(ranking, board({ a: 0, b: 99 }, "2026-11-14", 2))).toBe(ranking);
    expect(withLivePoints(null, board({ a: 1 }))).toBeNull();
  });

  test("equal points keep the server's order", () => {
    expect(withLivePoints(ranking, board({ a: 6, b: 6 }))?.today.map((r) => r.seatId)).toEqual(["a", "b", "gone"]);
  });
});
