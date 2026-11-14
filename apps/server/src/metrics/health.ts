// The gauges of GET /metrics, read at the moment of the scrape from the parts that hold them, so
// nothing is kept twice and nothing is counted per turn.

import { ARENA_KINDS, type ArenaKind } from "@game/arena";
import type { LeagueStore } from "../monthly/league-store.ts";
import type { MonthlyLeagues } from "../monthly/monthly.ts";
import type { Store } from "../store.ts";
import type { HealthGauges } from "./prometheus.ts";

export interface HealthSources {
  readonly store: Store;
  readonly monthly: MonthlyLeagues;
  /** The league's tables: the checkpoint row's time gives the checkpoint's age. */
  readonly leagueStore: LeagueStore;
  readonly openStreams: number;
  readonly now: number;
}

function checkpointAgeSeconds(league: LeagueStore, now: number): number | null {
  const writtenAt = league.checkpointWrittenAt();
  return writtenAt === null ? null : Math.max(0, Math.round((now - writtenAt) / 1000));
}

export function healthGauges({ store, monthly, leagueStore, openStreams, now }: HealthSources): HealthGauges {
  const arenas = Object.fromEntries(ARENA_KINDS.map((kind) => [kind, 0])) as Record<ArenaKind, number>;
  let roundsRunning = 0;
  for (const record of store.all()) {
    arenas[record.arena.settings.kind] += 1;
    if (record.arena.phase.kind === "running") roundsRunning += 1;
  }
  const memory = process.memoryUsage();
  const league = monthly.publicStatus();
  return {
    now,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    openStreams,
    arenas,
    roundsRunning,
    leagueSeats: league.tanks,
    leagues: league.leagues,
    checkpointAgeSeconds: checkpointAgeSeconds(leagueStore, now),
  };
}
