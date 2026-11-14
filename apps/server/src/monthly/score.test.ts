import { describe, expect, test } from "bun:test";
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
  test("tanks with fewer than 7 counted days come after the ranked ones and have no rank", () => {
    const ranked = rankMonth([
      { id: "few", days: days(50, 50), seatOrder: 1 },
      { id: "many", days: days(1, 1, 1, 1, 1, 1, 1), seatOrder: 2 },
    ]);
    expect(ranked).toEqual([
      { id: "many", rank: 1, score: 1, countedDays: 7 },
      { id: "few", rank: null, score: 50, countedDays: 2 },
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

  test("not-ranked tanks are ordered by the same rule", () => {
    const ranked = rankMonth([
      { id: "b", days: days(3), seatOrder: 2 },
      { id: "a", days: days(3), seatOrder: 1 },
      { id: "none", days: [], seatOrder: 0 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "none"]);
    expect(ranked.every((r) => r.rank === null)).toBe(true);
  });
});
