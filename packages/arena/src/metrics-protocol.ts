// Usage numbers for the host (docs/specs/revamp/81-metrics.md, K1a). The server counts what it
// already handles; the page adds a few named events. A counter is a number per day and nothing
// else: no address, no account, no arena code and no free text ever becomes a key or a value.
//
// Routes:
// POST /api/metrics/event        MetricEventRequest -> 204. 400 for a name or label not in the
//                                lists below, 429 rate_limited per client address.
// GET  /api/admin/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
//                                (account in ADMIN_EMAILS; verified when the server sends email)
//                                -> AdminMetricsResponse. Everyone else gets the 404 of a route
//                                that does not exist. Without from and to: the last 30 days.
// GET  /metrics                  (Authorization: Bearer METRICS_TOKEN) -> Prometheus text
//                                (server health, K1b). Without METRICS_TOKEN the route does not exist.

import { ARENA_KINDS } from "./types.ts";

/** The pages whose opens are counted. "arena" is a room page; "result" a stored result. */
export const METRIC_PAGES = ["home", "play", "workshop", "arena", "monthly", "champions", "result"] as const;
export type MetricPage = (typeof METRIC_PAGES)[number];

/** The first-timer path, in order. A device reports each step once, and only after the step before it. */
export const FIRST_TIMER_STEPS = ["openedHome", "enteredPractice", "watchedFirstRound", "openedRules", "changedRule", "playedSecondRound"] as const;
export type FirstTimerStep = (typeof FIRST_TIMER_STEPS)[number];

export const METRIC_LANGUAGES = ["en", "id"] as const;
export type MetricLanguage = (typeof METRIC_LANGUAGES)[number];

/**
 * Every day counter, and the labels it is split by (null: one number). This is the one list: the
 * server's hooks, the check of the day's rows and the admin page's labels are all keyed by it.
 */
export const DAY_COUNTERS = {
  /** Browsers seen today, counted once each (see apps/server/src/metrics/day-counts.ts). */
  visitors: null,
  pageOpened: METRIC_PAGES,
  arenaCreated: ARENA_KINDS,
  /** A new seat taken by a person; a seat handed back to a second device is not a join. */
  joined: ARENA_KINDS,
  gameStarted: ARENA_KINDS,
  gameFinished: ARENA_KINDS,
  roundPlayed: ARENA_KINDS,
  /** The tanks of every round played, summed; divided by roundPlayed it is the tanks per round. */
  tanksInRounds: ARENA_KINDS,
  accountRegistered: null,
  accountVerified: null,
  signedIn: null,
  monthlySeatTaken: null,
  monthlySeatQuit: null,
  chatLine: null,
  /** The highest number of open event streams at once today (a maximum, not a sum). */
  openStreamsPeak: null,
  /** Page loads and language switches, by the language shown. */
  languageUsed: METRIC_LANGUAGES,
  firstTimer: FIRST_TIMER_STEPS,
  /** A rule set saved that has a step sequence where the saved one before it had none. */
  stepRuleSaved: null,
  /** The card after a practice game (apps/web/src/ruletip): the encouragement shown, the water tip shown, the water tip applied. */
  ruleTip: ["encouraged", "waterShown", "waterApplied"],
} as const satisfies Readonly<Record<string, readonly string[] | null>>;

export type DayCounterName = keyof typeof DAY_COUNTERS;

/** The label type of a counter: never for a counter without labels. */
export type LabelOf<N extends DayCounterName> = (typeof DAY_COUNTERS)[N] extends readonly (infer L extends string)[] ? L : never;

/** A key of a day's counts: the name, or "name.label" for a counter with labels. */
export type CounterKey = {
  [N in DayCounterName]: (typeof DAY_COUNTERS)[N] extends readonly (infer L extends string)[] ? `${N}.${L}` : N;
}[DayCounterName];

/** The counters kept as a maximum instead of a sum. */
export const PEAK_COUNTERS = ["openStreamsPeak"] as const satisfies readonly DayCounterName[];

/** Every key, in the list's order. */
export const COUNTER_KEYS: readonly CounterKey[] = (Object.keys(DAY_COUNTERS) as DayCounterName[]).flatMap((name): CounterKey[] => {
  const labels: readonly string[] | null = DAY_COUNTERS[name];
  return (labels === null ? [name] : labels.map((label) => `${name}.${label}`)) as CounterKey[];
});

const KEY_SET: ReadonlySet<string> = new Set(COUNTER_KEYS);
export const isCounterKey = (value: string): value is CounterKey => KEY_SET.has(value);

/** The events the page may send; the server counts every other counter itself. */
export const PAGE_EVENTS = ["pageOpened", "languageUsed", "firstTimer", "ruleTip"] as const satisfies readonly DayCounterName[];
export type PageEventName = (typeof PAGE_EVENTS)[number];

export type MetricEventRequest = { [N in PageEventName]: { readonly name: N; readonly label: LabelOf<N> } }[PageEventName];

/** Checks a body at the boundary: a name from PAGE_EVENTS and a label from that name's list. */
export function parseMetricEvent(body: unknown): MetricEventRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { name, label } = body as Record<string, unknown>;
  if (typeof label !== "string") return null;
  const event = PAGE_EVENTS.find((n) => n === name);
  if (event === undefined) return null;
  const labels: readonly string[] = DAY_COUNTERS[event];
  return labels.includes(label) ? ({ name: event, label } as MetricEventRequest) : null;
}

/** One day's numbers. A key that is missing is 0. */
export interface MetricsDay {
  /** YYYY-MM-DD in LEAGUE_TIME_ZONE. */
  readonly day: string;
  readonly counts: Readonly<Partial<Record<CounterKey, number>>>;
}

export interface AdminMetricsResponse {
  /** LEAGUE_TIME_ZONE, the zone of every day. */
  readonly timeZone: string;
  /** Today in that zone; its numbers are the live ones. */
  readonly today: string;
  /** Every day from `from` to `to`, oldest first; a day with no file has empty counts. */
  readonly days: readonly MetricsDay[];
}

/** The longest range one admin request may ask for, the same as the days kept. */
export const METRICS_KEEP_DAYS = 400;
/** The range of a request without from and to. */
export const METRICS_DEFAULT_DAYS = 30;
