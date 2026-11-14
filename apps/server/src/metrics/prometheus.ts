// GET /metrics in the Prometheus text format (version 0.0.4), written by hand so the server needs
// no dependency for it. Each series is listed in docs/deployment/06-monitoring.md. Every label
// value comes from a fixed list in code, never from a request, so no identifier can appear.

import type { ArenaKind } from "@game/arena";
import { HISTOGRAM_BUCKETS_MS, type HistogramName, type HistogramSnapshot, type ProcessSeries, type TurnLoop } from "./metrics.ts";

/** What server.ts reads at the moment of the scrape. */
export interface HealthGauges {
  readonly now: number;
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly openStreams: number;
  readonly arenas: Readonly<Record<ArenaKind, number>>;
  readonly roundsRunning: number;
  readonly leagueSeats: number;
  readonly leagues: number;
  /** Seconds since the league's checkpoint file was written; null without one (no DATA_DIR yet). */
  readonly checkpointAgeSeconds: number | null;
}

type Labels = Readonly<Record<string, string>>;

function line(name: string, value: number, labels: Labels = {}): string {
  const entries = Object.entries(labels);
  const text = entries.length === 0 ? "" : `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  return `${name}${text} ${Number.isFinite(value) ? value : 0}`;
}

function family(name: string, type: "counter" | "gauge" | "histogram", help: string, lines: readonly string[]): string[] {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, ...lines];
}

const HISTOGRAM_HELP: Readonly<Record<HistogramName, [string, string]>> = {
  turnComputeMs: ["algotank_turn_compute_milliseconds", "Time to compute one turn of a round (arena) or of every league (league)."],
  turnLateMs: ["algotank_turn_late_milliseconds", "How much later than planned a turn's timer fired."],
};

function histogramLines(name: string, loop: TurnLoop, h: HistogramSnapshot): string[] {
  return [
    ...HISTOGRAM_BUCKETS_MS.map((bound, i) => line(`${name}_bucket`, h.buckets[i] ?? 0, { loop, le: String(bound) })),
    line(`${name}_bucket`, h.count, { loop, le: "+Inf" }),
    line(`${name}_sum`, h.sum, { loop }),
    line(`${name}_count`, h.count, { loop }),
  ];
}

export function prometheusText(series: ProcessSeries, gauges: HealthGauges): string {
  const out: string[] = [
    ...family("algotank_uptime_seconds", "gauge", "Seconds since the server started.", [line("algotank_uptime_seconds", Math.round((gauges.now - series.startedAt) / 1000))]),
    ...family("algotank_memory_rss_bytes", "gauge", "Memory the process holds (resident set size).", [line("algotank_memory_rss_bytes", gauges.rssBytes)]),
    ...family("algotank_memory_heap_used_bytes", "gauge", "JavaScript heap in use.", [line("algotank_memory_heap_used_bytes", gauges.heapUsedBytes)]),
    ...family("algotank_open_streams", "gauge", "Open event streams of arenas and leagues.", [line("algotank_open_streams", gauges.openStreams)]),
    ...family("algotank_arenas", "gauge", "Arenas the server holds, by kind.", Object.entries(gauges.arenas).map(([kind, n]) => line("algotank_arenas", n, { kind }))),
    ...family("algotank_rounds_running", "gauge", "Arena rounds that run now.", [line("algotank_rounds_running", gauges.roundsRunning)]),
  ];
  for (const name of ["turnComputeMs", "turnLateMs"] as const) {
    const [metric, help] = HISTOGRAM_HELP[name];
    out.push(...family(metric, "histogram", help, [...histogramLines(metric, "arena", series.histograms[name].arena), ...histogramLines(metric, "league", series.histograms[name].league)]));
  }
  out.push(
    ...family(
      "algotank_requests_total",
      "counter",
      "HTTP answers by route group and status class.",
      [...series.requests].sort(([a], [b]) => a.localeCompare(b)).map(([key, n]) => {
        const [group = "", status = ""] = key.split("|");
        return line("algotank_requests_total", n, { group, status });
      }),
    ),
    ...family("algotank_errors_total", "counter", "Errors caught and logged, by where they happened.", Object.entries(series.errors).map(([where, n]) => line("algotank_errors_total", n, { where }))),
    ...family("algotank_emails_total", "counter", "Emails handed to the mail server, by result.", Object.entries(series.emails).map(([result, n]) => line("algotank_emails_total", n, { result }))),
    ...family("algotank_rate_limited_total", "counter", "Requests refused with 429 by a rate limit.", [line("algotank_rate_limited_total", series.rateLimited)]),
    ...family("algotank_league_seats", "gauge", "Tanks seated in the monthly league.", [line("algotank_league_seats", gauges.leagueSeats)]),
    ...family("algotank_leagues", "gauge", "Leagues of the monthly league.", [line("algotank_leagues", gauges.leagues)]),
  );
  if (gauges.checkpointAgeSeconds !== null) {
    out.push(...family("algotank_league_checkpoint_age_seconds", "gauge", "Seconds since the league's checkpoint was written.", [line("algotank_league_checkpoint_age_seconds", gauges.checkpointAgeSeconds)]));
  }
  return `${out.join("\n")}\n`;
}
