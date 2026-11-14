// The gauges of GET /metrics, read at the moment of the scrape from the parts that hold them, so
// nothing is kept twice and nothing is counted per turn.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ARENA_KINDS, type ArenaKind } from "@game/arena";
import { MONTHLY_FOLDER } from "../monthly/league-files.ts";
import type { MonthlyLeagues } from "../monthly/monthly.ts";
import type { Store } from "../store.ts";
import type { HealthGauges } from "./prometheus.ts";

/** The league's checkpoint (monthly/league-files.ts). */
const CHECKPOINT_FILE = "today.json";

export interface HealthSources {
  readonly store: Store;
  readonly monthly: MonthlyLeagues;
  readonly dataDir: string | undefined;
  readonly openStreams: number;
  readonly now: number;
}

function checkpointAgeSeconds(dataDir: string | undefined, now: number): number | null {
  if (dataDir === undefined) return null;
  const path = join(dataDir, MONTHLY_FOLDER, CHECKPOINT_FILE);
  if (!existsSync(path)) return null;
  return Math.max(0, Math.round((now - statSync(path).mtimeMs) / 1000));
}

export function healthGauges({ store, monthly, dataDir, openStreams, now }: HealthSources): HealthGauges {
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
    checkpointAgeSeconds: checkpointAgeSeconds(dataDir, now),
  };
}
