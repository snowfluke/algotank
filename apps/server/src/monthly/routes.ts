// The monthly league's routes (listed in packages/arena/src/monthly-protocol.ts). Watching needs
// no session; taking a seat, quitting and renaming need the account (auth.requireAccount checks
// the session and the Origin). Each body is checked in monthly.ts, where it enters.
//
// Seat, quit and rename write the league's tables and send every viewer a new state, so they share
// one limit per account (not per address: a classroom shares one address). The limit counts
// tries, also refused ones, because a refused seat still parses a strategy.

import type { AccountId } from "@game/arena";
import { HttpError, readJson, jsonResponse } from "../http.ts";
import type { Auth } from "../auth/index.ts";
import type { SlidingWindowLimit } from "../rate-limit.ts";
import type { Router } from "../router.ts";
import type { MonthlyLeagues } from "./monthly.ts";
import type { LeagueStreams } from "./streams.ts";
import type { MetricsRecorder } from "../metrics/metrics.ts";

/** Seats, quits and renames one account may try per minute: a quit and a new seat, a few times over, with room for mistakes. */
export const MONTHLY_CHANGES_PER_MINUTE = 12;

export interface MonthlyRouteDeps {
  readonly auth: Auth;
  readonly monthly: MonthlyLeagues;
  readonly streams: LeagueStreams;
  /** MONTHLY_CHANGES_PER_MINUTE per account; the server sweeps it with its other limits. */
  readonly changes: SlidingWindowLimit;
  /** The usage numbers (metrics/metrics.ts). */
  readonly metrics: MetricsRecorder;
}

function limitChanges(changes: SlidingWindowLimit, accountId: AccountId): void {
  const check = changes.check(accountId);
  if (!check.ok) {
    throw new HttpError(429, "Too many changes to the monthly arena. Wait a moment and try again.", { code: "rate_limited", retryAfterSeconds: check.retryAfterSeconds });
  }
  changes.record(accountId);
}

export function registerMonthlyRoutes(router: Router, { auth, monthly, streams, changes, metrics }: MonthlyRouteDeps): void {
  router.add("GET", "/api/monthly", () => jsonResponse(monthly.overview()));

  router.add("GET", "/api/monthly/leagues/:league/events", (ctx) => {
    const league = monthly.leagueOf(ctx.params["league"]);
    // The stream lives all day; its heartbeat comes less often than Bun's default idle timeout.
    ctx.server.timeout(ctx.req, 0);
    // EventSource sends the session cookie by itself; a GET changes nothing, so no Origin check.
    const account = auth.accountOf(ctx.req);
    return streams.open(league, account?.id ?? null, monthly.live(league));
  });

  router.add("GET", "/api/monthly/leagues/:league/ranking", (ctx) => jsonResponse(monthly.ranking(monthly.leagueOf(ctx.params["league"]))));

  router.add("GET", "/api/monthly/leagues/:league/days", (ctx) => jsonResponse(monthly.daysOf(monthly.leagueOf(ctx.params["league"]))));

  router.add("GET", "/api/monthly/me", (ctx) => jsonResponse(monthly.me(auth.requireAccount(ctx.req).id)));

  router.add("POST", "/api/monthly/seat", async (ctx) => {
    const account = auth.requireAccount(ctx.req);
    limitChanges(changes, account.id);
    const body = await readJson(ctx.req);
    const seat = monthly.takeSeat(account.id, body);
    metrics.count("monthlySeatTaken");
    return jsonResponse(seat, 201);
  });

  router.add("DELETE", "/api/monthly/seat", (ctx) => {
    const account = auth.requireAccount(ctx.req);
    limitChanges(changes, account.id);
    monthly.quit(account.id);
    metrics.count("monthlySeatQuit");
    return new Response(null, { status: 204 });
  });

  router.add("PUT", "/api/monthly/name", async (ctx) => {
    const account = auth.requireAccount(ctx.req);
    limitChanges(changes, account.id);
    monthly.rename(account.id, await readJson(ctx.req));
    return new Response(null, { status: 204 });
  });

  router.add("POST", "/api/monthly/me/move-seen", (ctx) => {
    monthly.moveSeen(auth.requireAccount(ctx.req).id);
    return new Response(null, { status: 204 });
  });
}
