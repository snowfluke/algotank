// The counters of the server (docs/specs/revamp/81-metrics.md): usage numbers per day for the
// host (K1a) and the process's health series for /metrics (K1b). server.ts makes one Metrics and
// hands it to the parts that count; a part built without it (a unit test) gets NO_METRICS.
//
// Rules that keep counting from hurting play:
// - Every recording method catches its own error and logs it. A hook never throws into a route
//   or a turn.
// - A count changes memory only. The day file is written once a minute when it changed, and at a
//   clean stop; a failed write is logged and tried again the next minute, never fatal.
// - The day is a calendar day in LEAGUE_TIME_ZONE. A count after the day's end closes the day:
//   the closed day stays in memory until its file is written, and today starts at 0.
//
// Visitors: the server keeps, for today only and in memory only, a set of hashes of the client
// address, the browser's User-Agent and a random salt. The salt is new each day and is never
// written, and neither is any hash: the file holds only the number. A restart forgets the set, so
// a visitor who comes back after a restart on the same day counts twice (a named limit).

import { createHash, randomBytes } from "node:crypto";
import { DAY_COUNTERS, METRICS_KEEP_DAYS, PEAK_COUNTERS, type CounterKey, type DayCounterName, type LabelOf, type MetricsDay } from "@game/arena";
import type { MailSender } from "../mail.ts";
import type { LeagueCalendar, CalendarDay } from "../monthly/calendar.ts";
import type { Clock, Scheduler } from "../timers.ts";
import { DayFiles, shiftDay, toMetricsDay, type DayCounts } from "./day-files.ts";

const FLUSH_EVERY_MS = 60_000;
/** How often the open streams are sampled for today's peak. */
const STREAM_SAMPLE_MS = 5_000;
/** ponytail: past this many visitors in a day the set stops growing and new browsers are not counted; a counting sketch (HyperLogLog) would lift it. */
const MAX_VISITORS_PER_DAY = 1_000_000;

/** The label arguments of a day counter: its label when it has a list, and an amount (1 when not given). */
export type CountArgs<N extends DayCounterName> = [LabelOf<N>] extends [never] ? [by?: number] : [label: LabelOf<N>, by?: number];

export type TurnLoop = "arena" | "league";
export type HistogramName = "turnComputeMs" | "turnLateMs";
export type ErrorPlace = "request" | "round" | "league" | "stats";
export type EmailResult = "sent" | "failed";

/** What the hooks in other files call. One line each, so `metrics.` finds them all. */
export interface MetricsRecorder {
  count<N extends DayCounterName>(name: N, ...args: CountArgs<N>): void;
  /** A browser seen today; it counts once per day (see the file's header). */
  seeVisitor(address: string, browser: string): void;
  observe(name: HistogramName, loop: TurnLoop, ms: number): void;
  request(group: RouteGroup, status: number): void;
  error(place: ErrorPlace): void;
  email(result: EmailResult): void;
}

/** For a part built without the server's Metrics, such as a unit test's RoundRunner. */
export const NO_METRICS: MetricsRecorder = {
  count: () => {},
  seeVisitor: () => {},
  observe: () => {},
  request: () => {},
  error: () => {},
  email: () => {},
};

/** Fixed groups, so an arena code or a result id in a path never becomes a label. */
const ROUTE_GROUPS = ["arenas", "public", "auth", "account", "monthly", "champions", "results", "feature", "health", "metrics", "admin", "other_api", "page", "prometheus"] as const;
export type RouteGroup = (typeof ROUTE_GROUPS)[number];

export function routeGroupOf(pathname: string): RouteGroup {
  if (pathname === "/metrics") return "prometheus";
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return "page";
  const segment = pathname.split("/")[2] ?? "";
  return (ROUTE_GROUPS as readonly string[]).includes(segment) && segment !== "page" && segment !== "prometheus" ? (segment as RouteGroup) : "other_api";
}

/** Upper bounds in milliseconds. */
export const HISTOGRAM_BUCKETS_MS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500] as const;

export interface HistogramSnapshot {
  /** Cumulative counts per bound of HISTOGRAM_BUCKETS_MS. */
  readonly buckets: readonly number[];
  readonly count: number;
  readonly sum: number;
}

class Histogram {
  private readonly counts = HISTOGRAM_BUCKETS_MS.map(() => 0);
  private count = 0;
  private sum = 0;

  add(ms: number): void {
    const value = Math.max(0, ms);
    this.count += 1;
    this.sum += value;
    const index = HISTOGRAM_BUCKETS_MS.findIndex((bound) => value <= bound);
    if (index !== -1) this.counts[index] = (this.counts[index] ?? 0) + 1;
  }

  snapshot(): HistogramSnapshot {
    let running = 0;
    return { buckets: this.counts.map((n) => (running += n)), count: this.count, sum: this.sum };
  }
}

/** The process series of /metrics that Metrics keeps itself; server.ts adds the gauges. */
export interface ProcessSeries {
  readonly startedAt: number;
  readonly requests: ReadonlyMap<`${RouteGroup}|${string}`, number>;
  readonly errors: Readonly<Record<ErrorPlace, number>>;
  readonly emails: Readonly<Record<EmailResult, number>>;
  readonly rateLimited: number;
  readonly histograms: Readonly<Record<HistogramName, Readonly<Record<TurnLoop, HistogramSnapshot>>>>;
}

interface DayState {
  readonly day: CalendarDay;
  readonly counts: DayCounts;
  dirty: boolean;
}

export interface MetricsOptions {
  /** DATA_DIR; without it the numbers live in memory only. */
  readonly dataDir?: string;
  /** The day of a count: zoneCalendar(LEAGUE_TIME_ZONE). */
  readonly calendar: LeagueCalendar;
  readonly now: Clock;
  readonly scheduler: Scheduler;
}

const PEAKS: ReadonlySet<DayCounterName> = new Set(PEAK_COUNTERS);

export class Metrics implements MetricsRecorder {
  private readonly files: DayFiles | null;
  private current: DayState;
  /** Closed days whose file is not written yet. */
  private closed: DayState[] = [];
  private salt = randomBytes(16);
  private seen = new Set<string>();
  private pruneDue = true;
  private stops: (() => void)[] = [];

  private readonly startedAt: number;
  private readonly requests = new Map<`${RouteGroup}|${string}`, number>();
  private readonly errors: Record<ErrorPlace, number> = { request: 0, round: 0, league: 0, stats: 0 };
  private readonly emails: Record<EmailResult, number> = { sent: 0, failed: 0 };
  private rateLimited = 0;
  private readonly histograms: Record<HistogramName, Record<TurnLoop, Histogram>> = {
    turnComputeMs: { arena: new Histogram(), league: new Histogram() },
    turnLateMs: { arena: new Histogram(), league: new Histogram() },
  };

  constructor(private readonly options: MetricsOptions) {
    this.startedAt = options.now();
    let files: DayFiles | null = null;
    if (options.dataDir !== undefined) {
      try {
        files = new DayFiles(options.dataDir);
      } catch (error) {
        console.error("The usage numbers are kept in memory only:", error);
      }
    }
    this.files = files;
    const day = options.calendar.dayAt(options.now());
    // A restart on the same day continues its numbers (but not its visitor set, see the header).
    this.current = { day, counts: this.readDay(day.day), dirty: false };
  }

  /** Arms the minute's write and the stream sampling. `openStreams` counts every open event stream now. */
  start(openStreams: () => number): void {
    const { scheduler } = this.options;
    // One-shot timers that re-arm, so a test's manual scheduler does not run them on every turn.
    const every = (run: () => void, ms: number) => {
      let cancel = scheduler.after(function again() {
        run();
        cancel = scheduler.after(again, ms);
      }, ms);
      return () => cancel();
    };
    this.stops = [every(() => this.flush(), FLUSH_EVERY_MS), every(() => this.peak("openStreamsPeak", openStreams()), STREAM_SAMPLE_MS)];
  }

  /** Stops the timers and writes what changed, so a clean stop loses no count. */
  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    this.flush();
  }

  count<N extends DayCounterName>(name: N, ...args: CountArgs<N>): void {
    this.safely(() => {
      const hasLabels = DAY_COUNTERS[name] !== null;
      const by = ((hasLabels ? args[1] : args[0]) as number | undefined) ?? 1;
      const key = (hasLabels ? `${name}.${String(args[0])}` : name) as CounterKey;
      if (PEAKS.has(name)) throw new Error(`${name} is a peak; record it with peak().`);
      this.add(key, by);
    });
  }

  seeVisitor(address: string, browser: string): void {
    this.safely(() => {
      this.rollDay();
      if (this.seen.size >= MAX_VISITORS_PER_DAY) return;
      const hash = createHash("sha256").update(this.salt).update(address).update("\0").update(browser).digest("base64url");
      if (this.seen.has(hash)) return;
      this.seen.add(hash);
      this.add("visitors", 1);
    });
  }

  observe(name: HistogramName, loop: TurnLoop, ms: number): void {
    this.safely(() => this.histograms[name][loop].add(ms));
  }

  request(group: RouteGroup, status: number): void {
    this.safely(() => {
      const key = `${group}|${Math.floor(status / 100)}xx` as const;
      this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
      if (status === 429) this.rateLimited += 1;
    });
  }

  error(place: ErrorPlace): void {
    this.safely(() => (this.errors[place] += 1));
  }

  email(result: EmailResult): void {
    this.safely(() => (this.emails[result] += 1));
  }

  /** Today's numbers as they are now. */
  today(): MetricsDay {
    this.rollDay();
    return toMetricsDay(this.current.day.day, this.current.counts);
  }

  /** Every day from `from` to `to` (YYYY-MM-DD, inclusive), oldest first; today and unwritten days from memory. */
  days(from: string, to: string): MetricsDay[] {
    this.rollDay();
    const days: MetricsDay[] = [];
    for (let day = from, n = 0; day <= to && n <= METRICS_KEEP_DAYS; day = shiftDay(day, 1), n++) {
      const held = [this.current, ...this.closed].find((state) => state.day.day === day);
      days.push(toMetricsDay(day, held?.counts ?? this.readDay(day)));
    }
    return days;
  }

  process(): ProcessSeries {
    const snap = (name: HistogramName) => ({ arena: this.histograms[name].arena.snapshot(), league: this.histograms[name].league.snapshot() });
    return {
      startedAt: this.startedAt,
      requests: new Map(this.requests),
      errors: { ...this.errors },
      emails: { ...this.emails },
      rateLimited: this.rateLimited,
      histograms: { turnComputeMs: snap("turnComputeMs"), turnLateMs: snap("turnLateMs") },
    };
  }

  /** Writes every changed day. A failure is logged and the day stays changed, so the next minute tries again. */
  flush(): void {
    this.rollDay();
    const files = this.files;
    if (files === null) {
      this.closed = [];
      return;
    }
    for (const state of [...this.closed, this.current]) {
      if (!state.dirty) continue;
      try {
        files.write(state.day.day, state.counts);
        state.dirty = false;
      } catch (error) {
        console.error(`The usage numbers of ${state.day.day} could not be saved; the next minute tries again:`, error);
      }
    }
    this.closed = this.closed.filter((state) => state.dirty);
    if (this.pruneDue) {
      try {
        files.prune(this.current.day.day);
        this.pruneDue = false;
      } catch (error) {
        console.error("Old usage files could not be removed; the next minute tries again:", error);
      }
    }
  }

  private peak(name: (typeof PEAK_COUNTERS)[number], value: number): void {
    this.safely(() => {
      this.rollDay();
      if (value <= (this.current.counts.get(name) ?? 0)) return;
      this.current.counts.set(name, value);
      this.current.dirty = true;
    });
  }

  private add(key: CounterKey, by: number): void {
    if (!Number.isSafeInteger(by) || by < 0) throw new Error(`A count of ${key} must be a whole number of at least 0, not ${by}.`);
    this.rollDay();
    this.current.counts.set(key, (this.current.counts.get(key) ?? 0) + by);
    this.current.dirty = true;
  }

  /** Closes the day when the clock passed its end: new salt, empty visitor set, counts from 0. */
  private rollDay(): void {
    const now = this.options.now();
    if (now < this.current.day.endsAt) return;
    if (this.current.dirty) this.closed.push(this.current);
    const day = this.options.calendar.dayAt(now);
    this.current = { day, counts: this.readDay(day.day), dirty: false };
    this.salt = randomBytes(16);
    this.seen = new Set();
    this.pruneDue = true;
  }

  private readDay(day: string): DayCounts {
    if (this.files === null) return new Map();
    try {
      return this.files.read(day);
    } catch (error) {
      console.error(`The usage numbers of ${day} could not be read:`, error);
      return new Map();
    }
  }

  private safely(run: () => void): void {
    try {
      run();
    } catch (error) {
      // Counting must never stop a route or a turn: the error is logged and play goes on.
      console.error("A usage count failed:", error);
    }
  }
}

/** True when `after` has a rule with a step sequence and `before` had none: a new use of sequences. */
export function sequenceAdded(before: { readonly modes: readonly { readonly rules: readonly { readonly action: object }[] }[] } | null, after: typeof before): boolean {
  const has = (strategy: typeof before) => strategy !== null && strategy.modes.some((mode) => mode.rules.some((rule) => "steps" in rule.action));
  return has(after) && !has(before);
}

/** The mail sender with each send counted as sent or failed; the error still reaches the caller. */
export function countedSender(sender: MailSender, metrics: MetricsRecorder): MailSender {
  return {
    async sendMail(mail) {
      try {
        await sender.sendMail(mail);
      } catch (error) {
        metrics.email("failed");
        throw error;
      }
      metrics.email("sent");
    },
  };
}
