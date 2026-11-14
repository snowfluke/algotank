// The monthly score and a league's ranking of the month (docs/specs/revamp/77-monthly-league.md,
// section 3). Pure, so every rule is tested on its own (score.test.ts).
//
// Rule, in one sentence for a player: "Skor bulananmu adalah rata-rata poin dari hari-hari yang
// tank kamu ikuti sejak awal hari."
// - A day score is the tank's points at the day's end, or at its quit.
// - A counted day is a day round the tank was seated for at the day's first turn.
// - The monthly score is the average of the counted day scores, to one decimal; 0 without one.
// - Ranking: tanks with MONTHLY_RANKED_DAYS (7) or more counted days first, by monthly score; then
//   the others, by monthly score, with no rank ("not ranked yet"). Ties: more counted days, then
//   the earlier seat.
// Example: counted days of 12, -3 and 7 points give (12 - 3 + 7) / 3 = 5.3, not ranked yet.
//
// The owner may still choose "average place" over "average points": that is an edit of
// monthlyScore and of the order in rankMonth only, because each counted day carries its place.

import { MONTHLY_RANKED_DAYS } from "@game/arena";

/** One counted day of a tank. */
export interface CountedDay {
  readonly points: number;
  /** The tank's place in its league that day, 1 for the day's winner. */
  readonly place: number;
}

/** What the ranking needs of one tank. */
export interface MonthEntry<Id> {
  readonly id: Id;
  readonly days: readonly CountedDay[];
  /** The seat's order of arrival; lower is earlier. */
  readonly seatOrder: number;
}

export interface MonthPlace<Id> {
  readonly id: Id;
  /** null: fewer than MONTHLY_RANKED_DAYS counted days. */
  readonly rank: number | null;
  readonly score: number;
  readonly countedDays: number;
}

/** The average points of the counted days, to one decimal; 0 without one. */
export function monthlyScore(days: readonly CountedDay[]): number {
  if (days.length === 0) return 0;
  const sum = days.reduce((total, day) => total + day.points, 0);
  return Math.round((sum * 10) / days.length) / 10;
}

/** Ranked tanks first, then the others; inside each: higher score, more counted days, the earlier seat. */
export function rankMonth<Id>(entries: readonly MonthEntry<Id>[]): MonthPlace<Id>[] {
  const scored = entries.map((entry) => ({ entry, score: monthlyScore(entry.days), ranked: entry.days.length >= MONTHLY_RANKED_DAYS }));
  scored.sort(
    (a, b) =>
      Number(b.ranked) - Number(a.ranked) || b.score - a.score || b.entry.days.length - a.entry.days.length || a.entry.seatOrder - b.entry.seatOrder,
  );
  let rank = 0;
  return scored.map(({ entry, score, ranked }) => ({ id: entry.id, rank: ranked ? ++rank : null, score, countedDays: entry.days.length }));
}
