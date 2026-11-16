// The data of "/champions": the recorded champions (GET /api/champions), this month's
// ranking of League 1 (GET /api/monthly/leagues/1/ranking: ranked tanks first, then the tanks
// with fewer counted days, "not ranked yet"), and for a signed-in visitor their own seat
// (GET /api/monthly/me), so their row is marked and kept in view. The champion comes from
// League 1, so the page shows League 1 only; the monthly page shows every league.

import { useCallback, useEffect, useState } from "react";
import type { ChampionsResponse, LeagueMonthRow } from "@game/arena";
import { getChampions, getLeagueRanking, getMonthlyMe, getPublishedMonths, type ApiFailure } from "../api/client.ts";

export interface ChampionsData {
  readonly champions: ChampionsResponse;
  /** YYYY-MM of this month's ranking. */
  readonly month: string;
  /** This month's rows of League 1: ranked first, then the rows without a place. */
  readonly rows: readonly LeagueMonthRow[];
  /** The visitor's own seat when it plays in League 1, or null. */
  readonly ownSeatId: string | null;
  /** The closed months whose tanks' rules are open (GET /api/monthly/months), the newest first. */
  readonly rulesMonths: ReadonlySet<string>;
}

export type ChampionsLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly failure: ApiFailure }
  | { readonly kind: "ready"; readonly data: ChampionsData };

/** The visitor's seat in League 1. Signed out is no seat; another failure only loses the mark, so the page still shows. */
async function ownSeatInLeagueOne(signedIn: boolean): Promise<string | null> {
  if (!signedIn) return null;
  const me = await getMonthlyMe();
  if (!me.ok) {
    if (me.code !== "not_signed_in") console.error("The champions page could not read the visitor's monthly seat:", me.error);
    return null;
  }
  return me.data.seat !== null && me.data.seat.league === 1 ? me.data.seat.seatId : null;
}

/** The months with open rules. A failure only hides their buttons, so the page still shows; it is logged. */
async function rulesMonths(): Promise<ReadonlySet<string>> {
  const result = await getPublishedMonths();
  if (!result.ok) {
    console.error("The champions page could not read the months whose rules are open:", result.error);
    return new Set();
  }
  return new Set(result.data.months);
}

async function loadAll(signedIn: boolean): Promise<ChampionsLoad> {
  const [champions, ranking, ownSeatId, months] = await Promise.all([getChampions(), getLeagueRanking(1), ownSeatInLeagueOne(signedIn), rulesMonths()]);
  if (!champions.ok) return { kind: "failed", failure: champions };
  if (!ranking.ok) return { kind: "failed", failure: ranking };
  return { kind: "ready", data: { champions: champions.data, month: ranking.data.month, rows: ranking.data.thisMonth, ownSeatId, rulesMonths: months } };
}

export function useChampions(signedIn: boolean): { readonly load: ChampionsLoad; retry(): void } {
  const [load, setLoad] = useState<ChampionsLoad>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoad({ kind: "loading" });
    void loadAll(signedIn).then((next) => {
      if (live) setLoad(next);
    });
    return () => {
      live = false;
    };
  }, [attempt, signedIn]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { load, retry };
}
