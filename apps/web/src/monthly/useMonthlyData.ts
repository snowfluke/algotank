// The answers "/monthly" reads besides the stream: the leagues (GET /api/monthly), the shown
// league's ranking and finished days, and the account's seat (GET /api/monthly/me). Each is read
// again when the stream sends a new state (a join, a quit, a new day), and the ranking and the
// seat also every few seconds, because points change every turn. A failed read keeps the last
// good answer and its failure, so the page can say that it is behind.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeagueDaysResponse, LeagueRankingResponse, MonthlyMeResponse, MonthlyOverviewResponse } from "@game/arena";
import { getLeagueDays, getLeagueRanking, getMonthlyMe, getMonthlyOverview, type ApiFailure, type ApiResult } from "../api/client.ts";

/** How often the ranking and the seat's points are read while the page is open. */
const MONTHLY_POLL_MS = 5000;

export interface Read<T> {
  readonly data: T | null;
  /** The last read's failure, or null after a good one. */
  readonly failure: ApiFailure | null;
}

const NOTHING = { data: null, failure: null };

/** Reads `load` whenever `key` changes and every `everyMs` (null: only on a key change). An answer for an old key is dropped. */
function useRead<T>(load: (() => Promise<ApiResult<T>>) | null, key: string, everyMs: number | null): Read<T> & { reload(): void } {
  const [read, setRead] = useState<Read<T>>(NOTHING);
  const [bump, setBump] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const enabled = load !== null;
  useEffect(() => {
    if (!enabled) {
      setRead(NOTHING);
      return;
    }
    let live = true;
    const run = () => {
      const current = loader.current;
      if (current === null) return;
      void current().then((result) => {
        if (!live) return;
        setRead((old) => (result.ok ? { data: result.data, failure: null } : { data: old.data, failure: result }));
      });
    };
    run();
    const timer = everyMs === null ? null : setInterval(run, everyMs);
    return () => {
      live = false;
      if (timer !== null) clearInterval(timer);
    };
  }, [enabled, key, everyMs, bump]);
  const reload = useCallback(() => setBump((n) => n + 1), []);
  return { ...read, reload };
}

export interface MonthlyData {
  readonly overview: Read<MonthlyOverviewResponse>;
  readonly ranking: Read<LeagueRankingResponse>;
  readonly days: Read<LeagueDaysResponse>;
  /** Null data while signed out. */
  readonly me: Read<MonthlyMeResponse>;
  reloadMe(): void;
  reloadOverview(): void;
}

/**
 * `league` is the league shown; `stateKey` changes with every state message of its stream
 * (useLeagueLive), `day` with the day round; `signedIn` turns the seat's reads on.
 */
export function useMonthlyData(league: number, stateKey: string, day: string, signedIn: boolean): MonthlyData {
  const overview = useRead(getMonthlyOverview, stateKey, null);
  const ranking = useRead(() => getLeagueRanking(league), `${league}|${stateKey}`, MONTHLY_POLL_MS);
  const days = useRead(() => getLeagueDays(league), `${league}|${day}`, null);
  const me = useRead(signedIn ? getMonthlyMe : null, stateKey, MONTHLY_POLL_MS);
  return { overview, ranking, days, me, reloadMe: me.reload, reloadOverview: overview.reload };
}
