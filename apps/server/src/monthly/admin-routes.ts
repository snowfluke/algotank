// GET /api/admin/players (packages/arena/src/monthly-protocol.ts): the seated tanks of the monthly
// league with their owners' emails, for the host (owner, 2026-11-16: to check who is behind each
// tank before the month's prizes). DELETE /api/admin/players/:seatId takes one tank out, for an
// owner who cannot sign in to quit. Only the admin may call them (admin.ts); the DELETE also needs
// the Origin check of every change. The list carries personal data, so it is never logged;
// jsonResponse sends it with cache-control: no-store.

import type { AdminPlayer, AdminPlayersResponse } from "@game/arena";
import { requireAdmin, type AdminGate } from "../admin.ts";
import { HttpError, isRecord, jsonResponse, readJson } from "../http.ts";
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

  router.add("DELETE", "/api/admin/players/:seatId", (ctx) => {
    requireAdmin(gate, ctx.req);
    // After the admin check, so anyone else still gets the 404; this adds the Origin check.
    gate.auth.requireAccount(ctx.req);
    monthly.removeSeat(ctx.params["seatId"] ?? "");
    return new Response(null, { status: 204 });
  });

  router.add("PUT", "/api/admin/players/:seatId/gm", async (ctx) => {
    requireAdmin(gate, ctx.req);
    gate.auth.requireAccount(ctx.req);
    const body = await readJson(ctx.req);
    const gm = isRecord(body) ? body["gm"] : undefined;
    if (typeof gm !== "boolean") throw new HttpError(400, "Send gm as true or false.");
    monthly.setGameMaster(ctx.params["seatId"] ?? "", gm);
    return new Response(null, { status: 204 });
  });
}
