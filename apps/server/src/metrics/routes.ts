// The routes of the usage numbers (packages/arena/src/metrics-protocol.ts) and of /metrics.
//
// Who may call:
// - POST /api/metrics/event: anyone, rate limited per client address. Only names and labels from
//   the lists pass; the body carries nothing else.
// - GET /api/admin/metrics: a signed-in account whose email is in ADMIN_EMAILS, and with email on
//   (SMTP_HOST) only once that email is verified. Anyone else gets the same 404 as a route that
//   does not exist, so the page tells a visitor nothing.
// - GET /metrics: only with "Authorization: Bearer <METRICS_TOKEN>"; server.ts adds it only when
//   the setting is there.

import { createHash, timingSafeEqual } from "node:crypto";
import { METRICS_DEFAULT_DAYS, METRICS_KEEP_DAYS, parseMetricEvent, type AdminMetricsResponse } from "@game/arena";
import type { Auth } from "../auth/index.ts";
import { clientAddress } from "../auth/request.ts";
import { bearerToken, HttpError, jsonResponse, noContent, readJson } from "../http.ts";
import type { SlidingWindowLimit } from "../rate-limit.ts";
import type { Router } from "../router.ts";
import { shiftDay } from "./day-counters.ts";
import type { Metrics } from "./metrics.ts";
import { prometheusText, type HealthGauges } from "./prometheus.ts";

const EVENT_BODY_MAX_BYTES = 1024;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface MetricsRouteDeps {
  readonly metrics: Metrics;
  readonly auth: Auth;
  /** ADMIN_EMAILS, normalized (auth/credentials.ts normalizeEmail). */
  readonly adminEmails: ReadonlySet<string>;
  /** The server sends email, so an admin's email must be verified. */
  readonly mailOn: boolean;
  /** LEAGUE_TIME_ZONE, named in the answer. */
  readonly timeZone: string;
  /** POST /api/metrics/event per client address. */
  readonly eventLimit: SlidingWindowLimit;
  readonly trustProxy: boolean;
}

function notFound(): HttpError {
  return new HttpError(404, "That route does not exist.");
}

function readDay(raw: string | null, name: string): string | null {
  if (raw === null) return null;
  if (!DAY.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) || new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw) {
    throw new HttpError(400, `Send ${name} as a date such as 2026-11-14.`);
  }
  return raw;
}

export function registerMetricsRoutes(router: Router, deps: MetricsRouteDeps): void {
  const { metrics } = deps;

  router.add("POST", "/api/metrics/event", async (ctx) => {
    const address = clientAddress(ctx.req, ctx.server, deps.trustProxy);
    const check = deps.eventLimit.check(address);
    if (!check.ok) throw new HttpError(429, "Too many tries from this address. Wait a moment and try again.", { code: "rate_limited", retryAfterSeconds: check.retryAfterSeconds });
    deps.eventLimit.record(address);
    const event = parseMetricEvent(await readJson(ctx.req, EVENT_BODY_MAX_BYTES));
    if (event === null) throw new HttpError(400, "Send a name and a label from the lists in metrics-protocol.ts.");
    metrics.count(event.name, event.label);
    metrics.seeVisitor(address, ctx.req.headers.get("user-agent") ?? "");
    return noContent();
  });

  router.add("GET", "/api/admin/metrics", (ctx) => {
    const account = deps.auth.accountOf(ctx.req);
    if (account === null || !deps.adminEmails.has(account.email) || (deps.mailOn && !account.emailVerified)) throw notFound();
    const today = metrics.today().day;
    const to = readDay(ctx.url.searchParams.get("to"), "to") ?? today;
    const from = readDay(ctx.url.searchParams.get("from"), "from") ?? shiftDay(to, 1 - METRICS_DEFAULT_DAYS);
    if (from > to) throw new HttpError(400, "from must not be after to.");
    if (shiftDay(from, METRICS_KEEP_DAYS) < to) throw new HttpError(400, `Ask for at most ${METRICS_KEEP_DAYS} days.`);
    const response: AdminMetricsResponse = { timeZone: deps.timeZone, today, days: metrics.days(from, to) };
    return jsonResponse(response);
  });
}

/** Compares digests, so the time does not tell how much of a guessed token was right. */
function sameToken(sent: string, expected: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(sent), digest(expected));
}

/** GET /metrics. `gauges` is read only after the token passed. */
export function prometheusResponse(req: Request, token: string, metrics: Metrics, gauges: () => HealthGauges): Response {
  const sent = bearerToken(req);
  if (sent === null || !sameToken(sent, token)) {
    return new Response("Send Authorization: Bearer <METRICS_TOKEN>.\n", { status: 401, headers: { "content-type": "text/plain; charset=utf-8", "www-authenticate": "Bearer" } });
  }
  return new Response(prometheusText(metrics.process(), gauges()), { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" } });
}
