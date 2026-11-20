import { describe, expect, test } from "bun:test";
import { MONTHLY_RANKED_DAYS } from "@game/arena";
import { bestDaysOf, dayRating, monthlyScore, rankMonth, type CountedDay } from "./score.ts";

/** Counted days whose winner had 1000 points, so 900 points rate 90. */
const days = (...points: number[]): CountedDay[] => points.map((p) => ({ points: p, winnerPoints: 1000 }));

describe("dayRating", () => {
  test("is the share of the day winner's points out of 100, to one decimal", () => {
    expect(dayRating({ points: 1000, winnerPoints: 1000 })).toBe(100);
    expect(dayRating({ points: 333, winnerPoints: 1000 })).toBe(33.3);
    expect(dayRating({ points: 1247, winnerPoints: 1248 })).toBe(99.9);
  });

  test("is 0 for 0 points or fewer", () => {
    expect(dayRating({ points: 0, winnerPoints: 500 })).toBe(0);
    expect(dayRating({ points: -40, winnerPoints: 500 })).toBe(0);
  });

  test("gives 100 to the tanks level with a winner of 0 points or fewer, and 0 to the others", () => {
    expect(dayRating({ points: 0, winnerPoints: 0 })).toBe(100);
    expect(dayRating({ points: -3, winnerPoints: -3 })).toBe(100);
    expect(dayRating({ points: -8, winnerPoints: -3 })).toBe(0);
  });

  test("makes a day with many points worth the same as a day with few", () => {
    expect(dayRating({ points: 1536, winnerPoints: 1536 })).toBe(dayRating({ points: 1213, winnerPoints: 1213 }));
  });
});

describe("bestDaysOf", () => {
  test("is two thirds of the league's days in the month, rounded up", () => {
    expect(bestDaysOf(14)).toBe(10);
    expect(bestDaysOf(30)).toBe(20);
    expect(bestDaysOf(31)).toBe(21);
    expect(bestDaysOf(1)).toBe(1);
  });
});

describe("monthlyScore", () => {
  test("adds up the best day ratings only, to one decimal, and is 0 without a counted day", () => {
    expect(monthlyScore(days(1000, 500, 995), 10)).toBe(249.5);
    expect(monthlyScore(days(1000, 500, 995), 2)).toBe(199.5);
    expect(monthlyScore([], 10)).toBe(0);
  });

  test("a quit day counts with the points the tank had when it left", () => {
    // The day of the quit is stored like any other counted day: 200 points at the quit.
    expect(monthlyScore(days(1000, 200), 10)).toBe(120);
  });
});

describe("rankMonth", () => {
  // November 2026 had 14 league days (17 to 30), so the best 10 count.
  const best = bestDaysOf(14);

  test("a tank that joins 2 days before the end cannot pass a leader that is near the top every day", () => {
    const ranked = rankMonth(
      [
        { id: "leader", days: days(...Array<number>(14).fill(990)), today: null, seatOrder: 1 },
        { id: "late", days: days(1000, 1000), today: null, seatOrder: 2 },
      ],
      best,
    );
    expect(ranked.map((r) => [r.id, r.score])).toEqual([
      ["leader", 990],
      ["late", 200],
    ]);
  });

  test("a tank that misses or loses a third of the days can still win", () => {
    const ranked = rankMonth(
      [
        // Seated from the first day, near the top every day.
        { id: "steady", days: days(...Array<number>(14).fill(980)), today: null, seatOrder: 1 },
        // Joined on the 4th day and won the 10 days after, with one bad day of new rules.
        { id: "joined later", days: days(...Array<number>(10).fill(1000), 100), today: null, seatOrder: 2 },
      ],
      best,
    );
    expect(ranked.map((r) => [r.id, r.rank, r.score])).toEqual([
      ["joined later", 1, 1000],
      ["steady", 2, 980],
    ]);
  });

  test("a tank without a counted day comes after the ranked ones and has no rank; one counted day is enough (MONTHLY_RANKED_DAYS)", () => {
    expect(MONTHLY_RANKED_DAYS).toBe(1);
    const ranked = rankMonth(
      [
        { id: "none", days: [], today: null, seatOrder: 1 },
        { id: "one", days: days(-4), today: null, seatOrder: 2 },
        { id: "many", days: days(10, 10, 10, 10, 10, 10, 10), today: null, seatOrder: 3 },
      ],
      best,
    );
    expect(ranked).toEqual([
      { id: "many", rank: 1, score: 7, countedDays: 7 },
      { id: "one", rank: 2, score: 0, countedDays: 1 },
      { id: "none", rank: null, score: 0, countedDays: 0 },
    ]);
  });

  test("a tie goes to more counted days, then to the earlier seat", () => {
    const ranked = rankMonth(
      [
        { id: "late", days: days(...Array<number>(10).fill(400)), today: null, seatOrder: 9 },
        { id: "early", days: days(...Array<number>(10).fill(400)), today: null, seatOrder: 3 },
        // An 11th day of 0 adds nothing to the best 10, so the rating ties.
        { id: "more", days: days(...Array<number>(10).fill(400), 0), today: null, seatOrder: 20 },
      ],
      best,
    );
    expect(ranked.map((r) => [r.id, r.rank, r.score])).toEqual([
      ["more", 1, 400],
      ["early", 2, 400],
      ["late", 3, 400],
    ]);
  });

  test("not-ranked tanks are ordered by the same rule: with no counted day they tie, so the earlier seat goes first", () => {
    const ranked = rankMonth(
      [
        { id: "b", days: [], today: null, seatOrder: 2 },
        { id: "a", days: [], today: null, seatOrder: 1 },
        { id: "ranked", days: days(-9), today: null, seatOrder: 3 },
      ],
      best,
    );
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["ranked", 1],
      ["a", null],
      ["b", null],
    ]);
  });
});
