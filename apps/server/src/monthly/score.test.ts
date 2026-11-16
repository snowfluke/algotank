import { describe, expect, test } from "bun:test";
import { MONTHLY_RANKED_DAYS } from "@game/arena";
import { monthlyScore, rankMonth, type CountedDay } from "./score.ts";

const days = (...points: number[]): CountedDay[] => points.map((p, i) => ({ points: p, place: i + 1 }));

describe("monthlyScore", () => {
  test("is the average of the counted days to one decimal, and 0 without one", () => {
    expect(monthlyScore(days(12, -3, 7))).toBe(5.3);
    expect(monthlyScore(days(-1, -2))).toBe(-1.5);
    expect(monthlyScore([])).toBe(0);
  });

  test("a quit day counts with the points the tank had when it left", () => {
    // The day of the quit is stored like any other counted day: 2 points at the quit.
    expect(monthlyScore(days(10, 2))).toBe(6);
  });
});

describe("rankMonth", () => {
  test("a tank without a counted day comes after the ranked ones and has no rank; one counted day is enough (MONTHLY_RANKED_DAYS)", () => {
    expect(MONTHLY_RANKED_DAYS).toBe(1);
    const ranked = rankMonth([
      { id: "none", days: [], seatOrder: 1 },
      { id: "one", days: days(-4), seatOrder: 2 },
      { id: "many", days: days(1, 1, 1, 1, 1, 1, 1), seatOrder: 3 },
    ]);
    expect(ranked).toEqual([
      { id: "many", rank: 1, score: 1, countedDays: 7 },
      { id: "one", rank: 2, score: -4, countedDays: 1 },
      { id: "none", rank: null, score: 0, countedDays: 0 },
    ]);
  });

  test("a tie goes to more counted days, then to the earlier seat", () => {
    const ranked = rankMonth([
      { id: "late", days: days(4, 4, 4, 4, 4, 4, 4), seatOrder: 9 },
      { id: "early", days: days(4, 4, 4, 4, 4, 4, 4), seatOrder: 3 },
      { id: "more", days: days(4, 4, 4, 4, 4, 4, 4, 4), seatOrder: 20 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["more", 1],
      ["early", 2],
      ["late", 3],
    ]);
  });

  test("not-ranked tanks are ordered by the same rule: with no counted day they tie, so the earlier seat goes first", () => {
    const ranked = rankMonth([
      { id: "b", days: [], seatOrder: 2 },
      { id: "a", days: [], seatOrder: 1 },
      { id: "ranked", days: days(-9), seatOrder: 3 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["ranked", 1],
      ["a", null],
      ["b", null],
    ]);
  });
});
