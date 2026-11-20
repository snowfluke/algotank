// Wires the store, the stream hub, the round runner, the public arenas, the expiry
// sweep and the routes into one Bun server.

import type { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { MONTHLY_RULE_CHANGES_PER_HOUR, type HealthResponse } from "@game/arena";
import { AccountStrategies, registerAccountStrategyRoutes } from "./account-strategies.ts";
import { AccountTanks, registerAccountTankRoutes } from "./account-tank.ts";
import { AccountStatsStore, registerAccountStatsRoutes } from "./stats/account-stats.ts";
import { ArenaStats } from "./stats/arena-stats.ts";
import { openDatabase } from "./db/open.ts";
import { reportOldJsonFolders } from "./db/old-folders.ts";
import { closeArena, DEFAULT_ARENA_TTL_HOURS, EXPIRY_SWEEP_MS, startExpirySweep, type ArenaParts } from "./arena-lifetime.ts";
import { AuthError, createAuth } from "./auth/index.ts";
import { SlidingWindowLimit } from "./rate-limit.ts";
import { AutoSteps } from "./auto-steps.ts";
import { ChatLimits, ChatStore } from "./chat.ts";
import { registerChatRoutes } from "./chat-routes.ts";
import { errorResponse, HttpError, jsonResponse } from "./http.ts";
import { DEFAULT_LEAGUE_TIME_ZONE, shortDayCalendar, zoneCalendar, type ShortDays } from "./monthly/calendar.ts";
import { Champions } from "./monthly/champions.ts";
import { LeagueStore } from "./monthly/league-store.ts";
import { Disclosure } from "./monthly/disclosure.ts";
import { GameMasters } from "./monthly/game-masters.ts";
import { MONTHLY_TICK_MS, MonthlyLeagues } from "./monthly/monthly.ts";
import { registerAdminPlayerRoutes } from "./monthly/admin-routes.ts";
import { registerAdminMeRoute } from "./admin.ts";
import { MONTHLY_CHANGES_PER_MINUTE, registerMonthlyRoutes } from "./monthly/routes.ts";
import { LeagueStreams } from "./monthly/streams.ts";
import { DEFAULT_PUBLIC_ARENA_MAX, PublicArenas } from "./public-arenas.ts";
import { scaledPublicRules, scaledTickMs } from "./public-kinds.ts";
import { registerPublicRoutes } from "./public-routes.ts";
import { registerResultRoutes, ResultStore, watchFinishedGames } from "./results.ts";
import { watchScheduledStarts } from "./scheduled-start.ts";
import { TournamentWinners } from "./tournament-winners.ts";
import { createRouter, type ArenaRateLimits } from "./routes.ts";
import { ROUND_START_DELAY_MS, RoundRunner } from "./round-runner.ts";
import type { MailSender } from "./mail.ts";
import { countedSender, Metrics, routeGroupOf } from "./metrics/metrics.ts";
import { healthGauges } from "./metrics/health.ts";
import type { HealthGauges } from "./metrics/prometheus.ts";
import { prometheusResponse, registerMetricsRoutes } from "./metrics/routes.ts";
import { pageBuildOf, requestOrigin, serveStatic } from "./static.ts";
import { ArenaGoneError, Store } from "./store.ts";
import { DEFAULT_ARENA_MESSAGE_INTERVAL_MS, DEFAULT_MAX_STREAMS_PER_ARENA, StreamHub } from "./stream.ts";
import { realTimeScheduler, type Clock, type Scheduler } from "./timers.ts";
import type { RouteContext } from "./router.ts";

const DEFAULT_STATIC_DIR = fileURLToPath(new URL("../../web/dist", import.meta.url));
const DEFAULT_HEARTBEAT_MS = 15_000;
const HOUR_MS = 60 * 60 * 1000;
/** POST /api/public/seat requests per minute per client address. */
const SEATS_PER_MINUTE = 30;
/**
 * Joins per minute per client address. The phones of one event share one address behind the
 * venue's network, so the limit lets a full presenter arena (512 players) join within a minute,
 * with room for retries: 1,200 is about 2.3 joins per player.
 */
const JOINS_PER_MINUTE = 1200;
/** POST /api/metrics/event per client address: a page sends a few per page open; a class behind one address sends more. */
const METRIC_EVENTS_PER_MINUTE = 600;

export interface ServerOptions {
  /** 0 picks a free port. */
  readonly port: number;
  /** HOST: the address to listen on. Every interface when not given. */
  readonly hostname?: string;
  /** Where the built web app lives. */
  readonly staticDir?: string;
  /**
   * DATA_DIR: everything the server keeps goes in its database algotank.sqlite (db/open.ts).
   * Without it the database is in memory, as in the tests. The server throws at start when a
   * row in it is damaged.
   */
  readonly dataDir?: string;
  /** Replaces the timers (ticks, the pause before a round, public arena steps, sweeps). Tests use it to skip the waiting. */
  readonly schedule?: Scheduler;
  /** The pause between roundStart and the first tick. ROUND_START_DELAY_MS when not given. */
  readonly roundStartDelayMs?: number;
  /** Joins per minute per client address. Tests lower it. */
  readonly joinsPerMinute?: number;
  /** ARENA_TTL_HOURS: a private or presenter arena with no activity this long is removed. */
  readonly arenaTtlHours?: number;
  /** PUBLIC_ARENA_MAX: the most practice arenas at once. */
  readonly publicArenaMax?: number;
  /** LEAGUE_TIME_ZONE: the monthly league's calendar. DEFAULT_LEAGUE_TIME_ZONE when not given. */
  readonly leagueTimeZone?: string;
  /** LEAGUE_SHORT_DAYS: short days instead of the time zone's, for a scripted run (monthly/calendar.ts). */
  readonly leagueShortDays?: ShortDays;
  /** PUBLIC_TIME_DIVISOR: shortens the public arenas' times and the league's turn for a scripted run (public-kinds.ts). 1 when not given. */
  readonly publicTimeDivisor?: number;
  readonly heartbeatMs?: number;
  /** Open event streams one arena accepts before it answers 429. */
  readonly maxStreamsPerArena?: number;
  /** The shortest time between two arena messages that change only the player list. Tests set 0. */
  readonly arenaMessageIntervalMs?: number;
  /** COOKIE_SECURE: the sign-in cookie gets Secure. Off when not given, as for local http. */
  readonly secureCookies?: boolean;
  /** TRUST_PROXY: the client address and host come from the X-Forwarded headers. Off when not given. */
  readonly trustProxy?: boolean;
  /** The clock of the arenas, the timers' bookkeeping, the sign-in sessions and the rate limits. Tests move it forward. */
  readonly now?: Clock;
  /** Sends the email codes (mail.ts). Not given: the server has no mail settings and sends no email. */
  readonly mail?: MailSender;
  /** ADMIN_EMAILS, normalized: the accounts that may open the host's pages (admin.ts). Nobody when not given. */
  readonly adminEmails?: readonly string[];
  /** METRICS_TOKEN: the bearer token of GET /metrics. Not given: the route does not exist. */
  readonly metricsToken?: string;
}

export interface RunningServer {
  readonly url: string;
  /** Open event-stream connections of one arena. */
  connectionCount(arenaId: string): number;
  /** Stops the timers, ends the streams and closes the port. */
  stop(): Promise<void>;
}

export function startServer(options: ServerOptions): RunningServer {
  // Creates DATA_DIR with mode 0700 when it does not exist.
  const db = openDatabase(options.dataDir === undefined ? { kind: "memory" } : { kind: "file", dataDir: options.dataDir });
  try {
    return startWithDatabase(options, db);
  } catch (error) {
    // A damaged row stops the start; the database must not stay open behind it.
    db.close();
    throw error;
  }
}

function startWithDatabase(options: ServerOptions, db: Database): RunningServer {
  const now = options.now ?? Date.now;
  const scheduler = options.schedule ?? realTimeScheduler;
  if (options.dataDir !== undefined) reportOldJsonFolders(options.dataDir);
  const leagueTimeZone = options.leagueTimeZone ?? DEFAULT_LEAGUE_TIME_ZONE;
  // The real calendar days of the zone, also when LEAGUE_SHORT_DAYS shortens the league's days.
  const metrics = new Metrics({ db, calendar: zoneCalendar(leagueTimeZone), now, scheduler });
  const store = new Store({ db, now, scheduler, metrics });
  const auth = createAuth({
    db,
    secureCookies: options.secureCookies ?? false,
    trustProxy: options.trustProxy ?? false,
    now,
    mail: options.mail === undefined ? null : countedSender(options.mail, metrics),
    metrics,
  });
  const hub = new StreamHub({
    heartbeatMs: options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
    maxStreamsPerArena: options.maxStreamsPerArena ?? DEFAULT_MAX_STREAMS_PER_ARENA,
    now,
    scheduler,
    arenaMessageIntervalMs: options.arenaMessageIntervalMs ?? DEFAULT_ARENA_MESSAGE_INTERVAL_MS,
  });
  const rules = scaledPublicRules(options.publicTimeDivisor ?? 1);
  const autoSteps = new AutoSteps(scheduler, now, rules);
  const accountStats = new AccountStatsStore(db);
  const monthCalendar = zoneCalendar(leagueTimeZone);
  const stats = new ArenaStats({ accounts: accountStats, month: () => monthCalendar.dayAt(now()).month });
  const runner = new RoundRunner(store, hub, autoSteps, {
    scheduler,
    now,
    startDelayMs: options.roundStartDelayMs ?? ROUND_START_DELAY_MS,
    metrics,
    stats,
  });
  const chat = new ChatStore(db, now);
  const chatLimits = new ChatLimits(now);
  const results = new ResultStore({ db, now });
  const parts: ArenaParts = { store, runner, hub, autoSteps, chat, chatLimits, results };
  watchScheduledStarts({ store, runner, hub, autoSteps, now });
  watchFinishedGames({ store, results, hub, autoSteps, now });
  const winners = new TournamentWinners(db);
  const publicArenas = new PublicArenas(parts, {
    now,
    scheduler,
    maxArenas: options.publicArenaMax ?? DEFAULT_PUBLIC_ARENA_MAX,
    close: (record) => closeArena(parts, record),
    rules,
    winners,
  });
  publicArenas.start();
  const champions = new Champions(db);
  const league = new LeagueStore(db, now);
  const leagueStreams = new LeagueStreams({ heartbeatMs: options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS, maxStreamsPerLeague: options.maxStreamsPerArena ?? DEFAULT_MAX_STREAMS_PER_ARENA });
  const monthly = new MonthlyLeagues({
    store: league,
    gameMasters: new GameMasters(db),
    disclosure: new Disclosure(db),
    champions,
    streams: leagueStreams,
    calendar: options.leagueShortDays === undefined ? zoneCalendar(leagueTimeZone) : shortDayCalendar(options.leagueShortDays),
    now,
    scheduler,
    tickMs: scaledTickMs(MONTHLY_TICK_MS, options.publicTimeDivisor ?? 1),
    metrics,
  });
  monthly.start();
  const stopExpiry = startExpirySweep(parts, scheduler, now, (options.arenaTtlHours ?? DEFAULT_ARENA_TTL_HOURS) * HOUR_MS);

  const limits: ArenaRateLimits = {
    seat: new SlidingWindowLimit(SEATS_PER_MINUTE, 60_000, now),
    join: new SlidingWindowLimit(options.joinsPerMinute ?? JOINS_PER_MINUTE, 60_000, now),
  };
  const monthlyChanges = new SlidingWindowLimit(MONTHLY_CHANGES_PER_MINUTE, 60_000, now);
  const monthlyRuleChanges = new SlidingWindowLimit(MONTHLY_RULE_CHANGES_PER_HOUR, 60 * 60_000, now);
  const metricEvents = new SlidingWindowLimit(METRIC_EVENTS_PER_MINUTE, 60_000, now);
  // Drops the counters of addresses that went quiet, so many one-time visitors do not fill memory.
  const stopLimitSweep = scheduler.every(() => {
    limits.seat.sweep();
    limits.join.sweep();
    monthlyChanges.sweep();
    monthlyRuleChanges.sweep();
    metricEvents.sweep();
  }, EXPIRY_SWEEP_MS);

  const mailOn = options.mail !== undefined;
  const router = createRouter({ store, runner, hub, auth, autoSteps, publicArenas, chat, chatLimits, results, limits, trustProxy: options.trustProxy ?? false, now, metrics, stats, mailOn });
  registerResultRoutes(router, { auth, results });
  registerChatRoutes(router, { store, hub, auth, autoSteps, chat, chatLimits, now, metrics });
  registerAccountStrategyRoutes(router, { auth, strategies: new AccountStrategies(db), now, metrics });
  registerAccountTankRoutes(router, { auth, tanks: new AccountTanks(db), now, onSaved: (accountId, tank) => monthly.followLook(accountId, tank.look) });
  registerAccountStatsRoutes(router, { auth, stats: accountStats });
  registerPublicRoutes(router, { publicArenas, monthly, champions, winners });
  registerMonthlyRoutes(router, { auth, monthly, streams: leagueStreams, changes: monthlyChanges, ruleChanges: monthlyRuleChanges, metrics, mailOn });
  const adminGate = { auth, adminEmails: new Set(options.adminEmails ?? []), mailOn };
  registerAdminMeRoute(router, adminGate);
  registerAdminPlayerRoutes(router, { gate: adminGate, monthly });
  registerMetricsRoutes(router, {
    ...adminGate,
    metrics,
    timeZone: leagueTimeZone,
    eventLimit: metricEvents,
    trustProxy: options.trustProxy ?? false,
  });
  const openStreams = () =>
    store.all().reduce((n, record) => n + hub.connectionCount(record.arena.id), 0) +
    Array.from({ length: monthly.leagueCount() }, (_, i) => leagueStreams.count(i + 1)).reduce((a, b) => a + b, 0);
  const gauges = (): HealthGauges => healthGauges({ store, monthly, leagueStore: league, openStreams: openStreams(), now: now() });
  metrics.start(openStreams);
  const startedAt = new Date(now()).toISOString();
  // For a reverse proxy's or a monitor's check: memory only, so a slow disk does not fail it.
  router.add("GET", "/api/health", () => {
    const health: HealthResponse = { ok: true, startedAt, arenas: store.all().length };
    return jsonResponse(health);
  });
  const staticDir = options.staticDir ?? DEFAULT_STATIC_DIR;
  // Read once: a new page comes only with a new release, which starts the server again.
  const pageBuild = pageBuildOf(staticDir);

  async function handle(req: Request, url: URL, server: Bun.Server<undefined>): Promise<Response> {
    const token = options.metricsToken;
    if (token !== undefined && url.pathname === "/metrics" && req.method === "GET") return prometheusResponse(req, token, metrics, gauges);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const match = router.match(req.method, url.pathname);
      switch (match.kind) {
        case "found": {
          const ctx: RouteContext = { req, url, params: match.params, server };
          return await match.handler(ctx);
        }
        case "wrongMethod":
          return new Response(JSON.stringify({ error: "That method is not allowed here." }), {
            status: 405,
            headers: { allow: match.allow.join(", "), "content-type": "application/json; charset=utf-8" },
          });
        case "none":
          throw new HttpError(404, "That route does not exist.");
      }
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return await serveStatic(staticDir, url.pathname, requestOrigin(req, { trustProxy: options.trustProxy ?? false, secure: options.secureCookies ?? false }));
    }
    throw new HttpError(404, "That route does not exist.");
  }

  const server = Bun.serve<undefined>({
    port: options.port,
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    async fetch(req, srv) {
      const response = await respond(req, srv);
      // Every answer names its content type, so a browser must not guess another one.
      response.headers.set("x-content-type-options", "nosniff");
      return response;
    },
  });

  async function respond(req: Request, srv: Bun.Server<undefined>): Promise<Response> {
    const url = new URL(req.url);
    const response = await answer(req, url, srv);
    // An API answer names the page's build, so a tab on an older release offers a reload (web app/pageBuild.ts).
    if (pageBuild !== null && url.pathname.startsWith("/api/")) response.headers.set("x-page-build", pageBuild);
    metrics.request(routeGroupOf(url.pathname), response.status);
    return response;
  }

  async function answer(req: Request, url: URL, srv: Bun.Server<undefined>): Promise<Response> {
    try {
      return await handle(req, url, srv);
    } catch (error) {
      // Before HttpError, which it extends: its body carries the auth code and Retry-After.
      if (error instanceof AuthError) return error.toResponse();
      if (error instanceof HttpError) return errorResponse(error);
      if (error instanceof ArenaGoneError) return errorResponse(new HttpError(404, "That arena does not exist."));
      console.error(`${req.method} ${url.pathname} failed:`, error);
      metrics.error("request");
      return errorResponse(new HttpError(500, "Something went wrong on the server."));
    }
  }

  return {
    // Without a hostname Bun listens on every interface, and localhost reaches it.
    url: options.hostname === undefined ? `http://localhost:${server.port}` : server.url.origin,
    connectionCount: (arenaId) => hub.connectionCount(arenaId.toUpperCase()),
    async stop() {
      stopExpiry();
      stopLimitSweep();
      monthly.stop();
      autoSteps.cancelAll();
      publicArenas.stop();
      runner.stopAll();
      // Writes the edits of the last second, so a shutdown loses nothing.
      store.flush();
      metrics.stop();
      hub.closeAll();
      leagueStreams.closeAll();
      auth.stop();
      await server.stop(true);
      // Last: a request that was still running may have written to it.
      db.close();
    },
  };
}
