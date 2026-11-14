import { describe, expect, test } from "bun:test";
import { plainTankLook, type LeagueMonthRow } from "@game/arena";
import { dayBefore, formatDayClock, lastFinishedDay, leagueSwitchKind, leagueToShow, monthItems } from "./monthlyParts.ts";

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
    const row = (rank: number | null, i: number): LeagueMonthRow => ({ rank, seatId: `s${i}`, name: `T${i}`, look, score: 10 - i, countedDays: rank === null ? 2 : 8 });
    const items = monthItems([row(1, 1), row(2, 2), row(null, 3), row(null, 4)], "not ranked");
    expect(items.map((item) => (item.kind === "cut" ? "cut" : item.row.place))).toEqual([1, 2, "cut", null, null]);
    expect(monthItems([row(null, 1)], "x").map((item) => item.kind)).toEqual(["cut", "row"]);
    expect(monthItems([row(1, 1)], "x").map((item) => item.kind)).toEqual(["row"]);
  });
});
