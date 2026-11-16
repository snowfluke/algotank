// GET /api/admin/players (packages/arena/src/monthly-protocol.ts): the seated tanks of the monthly
// league with their owners' emails, for the host (owner, 2026-11-16: to check who is behind each
// tank before the month's prizes). Only the admin may call it (admin.ts). The answer carries
// personal data, so it is never logged; jsonResponse sends it with cache-control: no-store.

import type { AdminPlayer, AdminPlayersResponse } from "@game/arena";
import { requireAdmin, type AdminGate } from "../admin.ts";
import { jsonResponse } from "../http.ts";
import type { Router } from "../router.ts";
import type { MonthlyLeagues } from "./monthly.ts";

export interface AdminPlayerRouteDeps {
  readonly gate: AdminGate;
  readonly monthly: MonthlyLeagues;
}

export function registerAdminPlayerRoutes(router: Router, { gate, monthly }: AdminPlayerRouteDeps): void {
  router.add("GET", "/api/admin/players", (ctx) => {
    requireAdmin(gate, ctx.req);
    const { month, day, players } = monthly.seatedPlayers();
    const response: AdminPlayersResponse = {
      month,
      day,
      players: players.map(({ accountId, ...player }): AdminPlayer => {
        const account = gate.auth.accountById(accountId);
        return { ...player, account: account === null ? null : { email: account.email, emailVerified: account.emailVerified, createdAt: account.createdAt } };
      }),
    };
    return jsonResponse(response);
  });
}
