// The read routes of the public arenas and the champions (listed at the bottom of
// packages/arena/src/types.ts, shapes in public-protocol.ts). Anyone may call them. The seat,
// join and ready routes change arenas and live in routes.ts; the monthly league's routes are in
// monthly/routes.ts.

import type { ChampionsResponse, PublicStatusResponse } from "@game/arena";
import { jsonResponse } from "./http.ts";
import type { Champions } from "./monthly/champions.ts";
import type { MonthlyLeagues } from "./monthly/monthly.ts";
import type { PublicArenas } from "./public-arenas.ts";
import type { Router } from "./router.ts";
import { WINNERS_KEPT, type TournamentWinners } from "./tournament-winners.ts";

export interface PublicRouteDeps {
  readonly publicArenas: PublicArenas;
  readonly monthly: MonthlyLeagues;
  readonly champions: Champions;
  readonly winners: TournamentWinners;
}

export function registerPublicRoutes(router: Router, { publicArenas, monthly, champions, winners }: PublicRouteDeps): void {
  router.add("GET", "/api/public", () => {
    const response: PublicStatusResponse = { ...publicArenas.status(), monthly: monthly.publicStatus() };
    return jsonResponse(response);
  });

  router.add("GET", "/api/champions", () => {
    const response: ChampionsResponse = { months: champions.records(), tournamentWinners: winners.recent(WINNERS_KEPT) };
    return jsonResponse(response);
  });
}
