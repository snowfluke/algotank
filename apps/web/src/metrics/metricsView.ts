// What "/admin/metrics" shows, derived from the server's day counts (AdminMetricsResponse):
// the measures of a day, today against yesterday, the 30-day series and the first-visit path.
// Pure, so the tests check the numbers without a browser.

import { FIRST_TIMER_STEPS, METRIC_PAGES, type AdminMetricsResponse, type CounterKey, type DayCounterName, type FirstTimerStep, type MetricPage, type MetricsDay } from "@game/arena";

export type MeasureId =
  | "visitors"
  | "pageOpens"
  | "arenasCreated"
  | "joins"
  | "gamesStarted"
  | "gamesFinished"
  | "roundsPlayed"
  | "tanksPerRound"
  | "accountsRegistered"
  | "accountsVerified"
  | "signIns"
  | "seatsTaken"
  | "seatsQuit"
  | "chatLines"
  | "openStreamsPeak"
  | "stepRulesSaved"
  | "languageEn"
  | "languageId";

type Counts = MetricsDay["counts"];

/** The sum of a counter over its labels (or its one number). */
function total(counts: Counts, name: DayCounterName): number {
  let sum = 0;
  for (const [key, value] of Object.entries(counts) as [CounterKey, number][]) {
    if (key === name || key.startsWith(`${name}.`)) sum += value;
  }
  return sum;
}

const SUMS: Readonly<Record<Exclude<MeasureId, "tanksPerRound">, (counts: Counts) => number>> = {
  visitors: (c) => total(c, "visitors"),
  pageOpens: (c) => total(c, "pageOpened"),
  arenasCreated: (c) => total(c, "arenaCreated"),
  joins: (c) => total(c, "joined"),
  gamesStarted: (c) => total(c, "gameStarted"),
  gamesFinished: (c) => total(c, "gameFinished"),
  roundsPlayed: (c) => total(c, "roundPlayed"),
  accountsRegistered: (c) => total(c, "accountRegistered"),
  accountsVerified: (c) => total(c, "accountVerified"),
  signIns: (c) => total(c, "signedIn"),
  seatsTaken: (c) => total(c, "monthlySeatTaken"),
  seatsQuit: (c) => total(c, "monthlySeatQuit"),
  chatLines: (c) => total(c, "chatLine"),
  openStreamsPeak: (c) => total(c, "openStreamsPeak"),
  stepRulesSaved: (c) => total(c, "stepRuleSaved"),
  languageEn: (c) => c["languageUsed.en"] ?? 0,
  languageId: (c) => c["languageUsed.id"] ?? 0,
};

/** The rows of the "today" table, in this order. */
const MEASURES: readonly MeasureId[] = [
  "visitors",
  "pageOpens",
  "arenasCreated",
  "joins",
  "gamesStarted",
  "gamesFinished",
  "roundsPlayed",
  "tanksPerRound",
  "accountsRegistered",
  "accountsVerified",
  "signIns",
  "seatsTaken",
  "seatsQuit",
  "chatLines",
  "openStreamsPeak",
  "stepRulesSaved",
  "languageEn",
  "languageId",
];

/** A measure's value on a day; null for tanks per round on a day without rounds. */
function measure(counts: Counts, id: MeasureId): number | null {
  if (id !== "tanksPerRound") return SUMS[id](counts);
  const rounds = total(counts, "roundPlayed");
  return rounds === 0 ? null : Math.round((total(counts, "tanksInRounds") / rounds) * 10) / 10;
}

export type TodayRow =
  | { readonly kind: "measure"; readonly id: MeasureId; readonly today: number | null; readonly yesterday: number | null }
  | { readonly kind: "page"; readonly page: MetricPage; readonly today: number; readonly yesterday: number };

const EMPTY: Counts = {};

/** Today and the day before it, as the server sent them. */
function todayAndYesterday(response: AdminMetricsResponse): readonly [Counts, Counts] {
  const index = response.days.findIndex((d) => d.day === response.today);
  const today = response.days[index]?.counts ?? EMPTY;
  const yesterday = index > 0 ? (response.days[index - 1]?.counts ?? EMPTY) : EMPTY;
  return [today, yesterday];
}

export function todayRows(response: AdminMetricsResponse): TodayRow[] {
  const [today, yesterday] = todayAndYesterday(response);
  return [
    ...MEASURES.map((id): TodayRow => ({ kind: "measure", id, today: measure(today, id), yesterday: measure(yesterday, id) })),
    ...METRIC_PAGES.map((page): TodayRow => ({ kind: "page", page, today: today[`pageOpened.${page}`] ?? 0, yesterday: yesterday[`pageOpened.${page}`] ?? 0 })),
  ];
}

/** The small charts of the 30-day tab, in this order. */
const CHARTS: readonly Exclude<MeasureId, "tanksPerRound">[] = ["visitors", "pageOpens", "gamesStarted", "roundsPlayed", "joins", "accountsRegistered", "chatLines", "stepRulesSaved"];

export interface Series {
  readonly id: Exclude<MeasureId, "tanksPerRound">;
  /** Oldest first. */
  readonly points: readonly { readonly day: string; readonly value: number }[];
  readonly total: number;
  readonly max: number;
}

export function seriesOf(response: AdminMetricsResponse): Series[] {
  return CHARTS.map((id) => {
    const points = response.days.map((d) => ({ day: d.day, value: SUMS[id](d.counts) }));
    return { id, points, total: points.reduce((n, p) => n + p.value, 0), max: points.reduce((n, p) => Math.max(n, p.value), 0) };
  });
}

export interface PathStep {
  readonly step: FirstTimerStep;
  readonly count: number;
  /** count / the first step's count, from 0 to 1; 0 when the first step has none. */
  readonly share: number;
}

/**
 * The first-visit path over every day of the answer. Each device reports a step once and only
 * after the step before it (metrics/firstTimer.ts), so the shares fall from step to step; a
 * device whose path started before the range can still lift a later step a little.
 */
export function pathOf(response: AdminMetricsResponse): PathStep[] {
  const counts = FIRST_TIMER_STEPS.map((step) => response.days.reduce((n, d) => n + (d.counts[`firstTimer.${step}`] ?? 0), 0));
  const first = counts[0] ?? 0;
  return FIRST_TIMER_STEPS.map((step, i) => ({ step, count: counts[i] ?? 0, share: first === 0 ? 0 : (counts[i] ?? 0) / first }));
}
