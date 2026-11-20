// The monthly score and a league's ranking of the month (docs/specs/revamp/77-monthly-league.md,
// section 3). Pure, so every rule is tested on its own (score.test.ts).
//
// Rule, in two sentences for a player: "Each day, the day's winner gets a rating of 100 and every
// other tank its share of the winner's points. Your month rating adds up your best days."
// - A day score is the tank's points at the day's end, or at its quit.
// - A counted day is a day round the tank was seated for at the day's first turn.
// - A day rating is 100 times the day score over the points of the day's winner in the tank's
//   league, to one decimal: 0 for a score of 0 or less. When the winner has 0 points or fewer, the
//   tanks level with the winner get 100 and the others 0.
// - The month rating is the sum of the tank's best `bestDays` day ratings, to one decimal.
//   `bestDays` is two thirds of the days the league plays in the month, rounded up (bestDaysOf).
// - While a day plays, it counts as a day rated against its leader so far (live scoring, owner
//   2026-11-20: "can the monthly also a live scoring?"); the day close makes it final.
// - Ranking: every tank has a place, by month rating; ties go to more counted days (today included
//   while it plays), then the earlier seat. Since 2026-11-20 there is no "not ranked yet" (owner: "anyone
//   just joined can be in the ranking system?"): a tank without a day has a rating of 0, so it is last
//   without a rule of its own. The month's champion still needs a counted day (monthly.ts, closeMonthOf).
// Example: 14 days in the month give bestDays = ceil(14 * 2 / 3) = 10. A tank with ratings of 100,
// 50 and 99.5 has a month rating of 249.5 until it has more than 10 counted days.
//
// Why (owner, 2026-11-20: "this is not fair right. I want fairer monthly system"): the average of
// raw points let a tank that joined 2 days before the month's end win with 2 good days, because a
// day with more points counted the same as a day with fewer, and 1 day weighed as much as 14.
// A rating against the day's winner makes every day worth the same. Summing the best two thirds
// lets a tank miss or lose a third of the days (a late start, a bad day of new rules) and still
// win, but a tank cannot win the month with a few days. The trade-off: a tank that joins after
// the first third of the month can no longer catch a leader that wins every day.

/** One counted day of a tank. */
export interface CountedDay {
  readonly points: number;
  /** The points of that day's winner in the tank's league (a game master's tank is never the winner). */
  readonly winnerPoints: number;
}

/** What the ranking needs of one tank. */
export interface MonthEntry<Id> {
  readonly id: Id;
  /** The closed counted days. */
  readonly days: readonly CountedDay[];
  /** Today while it plays and counts for the tank, rated against today's leader so far; null otherwise. */
  readonly today: CountedDay | null;
  /** The seat's order of arrival; lower is earlier. */
  readonly seatOrder: number;
}

export interface MonthPlace<Id> {
  readonly id: Id;
  readonly rank: number;
  /** The month rating. */
  readonly score: number;
  /** The closed counted days; today is in the rating, not in this count. */
  readonly countedDays: number;
}

const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

/** How many of a tank's best days make its month rating, for a league that plays `leagueDays` days in the month. */
export function bestDaysOf(leagueDays: number): number {
  return Math.ceil((leagueDays * 2) / 3);
}

/** The day rating of 0 to 100: the day score against the day winner's points. */
export function dayRating({ points, winnerPoints }: CountedDay): number {
  if (winnerPoints <= 0) return points >= winnerPoints ? 100 : 0;
  return oneDecimal((100 * Math.max(0, Math.min(points, winnerPoints))) / winnerPoints);
}

/** The sum of the best `bestDays` day ratings, to one decimal; 0 without a counted day. */
export function monthlyScore(days: readonly CountedDay[], bestDays: number): number {
  const best = days.map(dayRating).sort((a, b) => b - a).slice(0, bestDays);
  return oneDecimal(best.reduce((total, rating) => total + rating, 0));
}

/** Every tank in order: higher month rating, more counted days (today included while it plays), the earlier seat. */
export function rankMonth<Id>(entries: readonly MonthEntry<Id>[], bestDays: number): MonthPlace<Id>[] {
  const scored = entries.map((entry) => {
    const all = entry.today === null ? entry.days : [...entry.days, entry.today];
    return { entry, played: all.length, score: monthlyScore(all, bestDays) };
  });
  scored.sort((a, b) => b.score - a.score || b.played - a.played || a.entry.seatOrder - b.entry.seatOrder);
  return scored.map(({ entry, score }, index) => ({ id: entry.id, rank: index + 1, score, countedDays: entry.days.length }));
}
