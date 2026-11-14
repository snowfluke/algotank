import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { plainTankLook, type AdminMetricsResponse, type MetricsDay } from "@game/arena";
import { PRESETS } from "@game/engine";
import type { OutgoingMail } from "../mail.ts";
import { zoneCalendar } from "../monthly/calendar.ts";
import { insertRow, memoryDatabase } from "../db/testing.ts";
import { createTestArena, getArena, joinTestPlayer, manualScheduler, type ManualScheduler, signUp, startTestServer, PASSWORD, SETTINGS, type TestServer, type TestServerOptions } from "../test-helpers.ts";
import { Metrics } from "./metrics.ts";

const ADMIN = "host@example.org";
const TOKEN = "metrics-token-for-tests-0001";
const servers: TestServer[] = [];

afterEach(async () => {
  for (const t of servers.splice(0)) await t.server.stop();
});

function start(options: TestServerOptions = {}): TestServer {
  const t = startTestServer({ adminEmails: [ADMIN], metricsToken: TOKEN, ...options });
  servers.push(t);
  return t;
}

async function adminView(t: TestServer, cookie: string, query = ""): Promise<AdminMetricsResponse> {
  const res = await t.api(`/api/admin/metrics${query}`, { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as AdminMetricsResponse;
}

const todayOf = (view: AdminMetricsResponse): MetricsDay["counts"] => view.days.find((d) => d.day === view.today)?.counts ?? {};

describe("usage counters from real route calls", () => {
  test("arenas, joins, a played game, accounts, sign-ins, chat, monthly seats and page events", async () => {
    const t = start();
    const admin = await signUp(t, ADMIN);
    const { arenaId, cookie: owner } = await createTestArena(t, { kind: "private", settings: { ...SETTINGS, botFill: false } });
    const ana = await joinTestPlayer(t, arenaId, "Ana");
    await joinTestPlayer(t, arenaId, "Budi");
    expect((await t.api(`/api/arenas/${arenaId}/chat`, { method: "POST", token: ana.playerToken, body: { text: "halo" } })).status).toBe(201);
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie: owner })).status).toBe(204);
    for (let i = 0; i < SETTINGS.ticksPerRound + 1; i++) t.ticks.tick();
    expect((await getArena(t, arenaId)).phase.kind).toBe("finished");

    const login = await t.api("/api/auth/login", { method: "POST", body: { email: ADMIN, password: PASSWORD } });
    expect(login.status).toBe(200);
    const tank = { look: plainTankLook(4), strategy: (PRESETS[0] as (typeof PRESETS)[number]).strategy, name: "Ada" };
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie: admin, body: tank })).status).toBe(201);
    expect((await t.api("/api/monthly/seat", { method: "DELETE", cookie: admin })).status).toBe(204);
    for (const event of [{ name: "pageOpened", label: "home" }, { name: "languageUsed", label: "id" }, { name: "firstTimer", label: "openedHome" }]) {
      expect((await t.api("/api/metrics/event", { method: "POST", body: event })).status).toBe(204);
    }

    const counts = todayOf(await adminView(t, admin));
    expect(counts).toMatchObject({
      // The server opens one practice and one tournament arena by itself.
      "arenaCreated.practice": 1,
      "arenaCreated.tournament": 1,
      "arenaCreated.private": 1,
      "joined.private": 2,
      "gameStarted.private": 1,
      "roundPlayed.private": 1,
      "tanksInRounds.private": 2,
      "gameFinished.private": 1,
      accountRegistered: 2,
      signedIn: 1,
      chatLine: 1,
      monthlySeatTaken: 1,
      monthlySeatQuit: 1,
      "pageOpened.home": 1,
      "languageUsed.id": 1,
      "firstTimer.openedHome": 1,
      visitors: 1,
    });
    expect(counts["accountVerified"]).toBeUndefined();
  });

  test("the event route takes only names and labels from the lists", async () => {
    const t = start();
    for (const body of [{ name: "pageOpened", label: "secret-page" }, { name: "arenaCreated", label: "private" }, { name: "pageOpened" }, "pageOpened"]) {
      expect((await t.api("/api/metrics/event", { method: "POST", body })).status).toBe(400);
    }
    const admin = await signUp(t, ADMIN);
    expect(todayOf(await adminView(t, admin))["pageOpened.home"]).toBeUndefined();
  });

  test("a rule set counts once when it gains a step sequence", async () => {
    const t = start();
    const admin = await signUp(t, ADMIN);
    const { arenaId } = await createTestArena(t, { kind: "presenter" });
    const ana = await joinTestPlayer(t, arenaId, "Ana");
    const plain = (PRESETS[0] as (typeof PRESETS)[number]).strategy;
    const firstMode = plain.modes[0];
    if (firstMode === undefined) throw new Error("The preset has no mode.");
    const withSteps = { ...plain, modes: [{ ...firstMode, rules: [{ ...firstMode.rules[0], id: "r-steps", action: { steps: [{ action: "stepForward", params: {} }, { action: "wait", params: {} }] } }] }, ...plain.modes.slice(1)] };
    const put = (strategy: unknown) => t.api(`/api/arenas/${arenaId}/players/me/strategy`, { method: "PUT", token: ana.playerToken, body: strategy });
    expect((await put(withSteps)).status).toBe(204);
    expect((await put(withSteps)).status).toBe(204);
    expect(todayOf(await adminView(t, admin))["stepRuleSaved"]).toBe(1);
  });
});

describe("the admin guard", () => {
  test("a visitor and another account get the 404 of a missing route; the admin gets the numbers", async () => {
    const t = start();
    const missing = await t.api("/api/no-such-route");
    expect((await t.api("/api/admin/metrics")).status).toBe(404);
    const other = await signUp(t, "kid@example.org");
    const refused = await t.api("/api/admin/metrics", { cookie: other });
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual(await missing.json());
    const view = await adminView(t, await signUp(t, ADMIN));
    expect(view.timeZone).toBe("Asia/Jakarta");
    expect(view.today).toBe("2026-11-11");
    expect(view.days.length).toBe(30);
    expect((await t.api("/api/admin/metrics?from=2026-11-12&to=2026-11-01", { cookie: other })).status).toBe(404);
  });

  test("with email on, the admin's email must be verified", async () => {
    const sent: OutgoingMail[] = [];
    const t = start({ mail: { sendMail: async (mail) => void sent.push(mail) } });
    const admin = await signUp(t, ADMIN);
    expect((await t.api("/api/admin/metrics", { cookie: admin })).status).toBe(404);
    const code = sent[0]?.text.match(/\b\d{6}\b/)?.[0];
    expect((await t.api("/api/auth/verify", { method: "POST", cookie: admin, body: { code } })).status).toBe(200);
    const counts = todayOf(await adminView(t, admin));
    expect(counts).toMatchObject({ accountRegistered: 1, accountVerified: 1 });
  });

  test("a range is checked", async () => {
    const t = start();
    const admin = await signUp(t, ADMIN);
    expect((await t.api("/api/admin/metrics?from=2026-11-12&to=2026-11-01", { cookie: admin })).status).toBe(400);
    expect((await t.api("/api/admin/metrics?from=2026-02-30", { cookie: admin })).status).toBe(400);
    expect((await t.api("/api/admin/metrics?from=2024-01-01&to=2026-11-11", { cookie: admin })).status).toBe(400);
    expect((await adminView(t, admin, "?from=2026-11-10&to=2026-11-11")).days.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-11"]);
  });
});

describe("the day's rows", () => {
  // 23:59 in Jakarta (UTC+7), one minute before the day changes.
  const LATE = Date.parse("2026-11-11T16:59:00Z");
  const metricsOn = (db: Database, ticks: ManualScheduler) => new Metrics({ db, calendar: zoneCalendar("Asia/Jakarta"), now: ticks.now, scheduler: ticks });
  /** The stored counters of each day, as the table holds them. */
  const stored = (db: Database) => {
    const days: Record<string, Record<string, number>> = {};
    for (const row of db.query<{ day: string; name: string; value: number }, []>("SELECT day, name, value FROM metrics_counter ORDER BY day, name").all()) {
      days[row.day] = { ...days[row.day], [row.name]: row.value };
    }
    return days;
  };

  test("the day changes at midnight in LEAGUE_TIME_ZONE; each day keeps its own rows", () => {
    const db = memoryDatabase();
    const ticks = manualScheduler(LATE);
    const metrics = metricsOn(db, ticks);
    metrics.start(() => 3);
    metrics.count("chatLine");
    ticks.advance(2 * 60_000);
    metrics.count("chatLine", 2);
    metrics.count("joined", "practice");
    ticks.advance(60_000);
    expect(stored(db)["2026-11-11"]).toEqual({ chatLine: 1, openStreamsPeak: 3 });
    expect(stored(db)["2026-11-12"]).toMatchObject({ chatLine: 2, "joined.practice": 1 });
    metrics.stop();

    // A restart on the same day continues its numbers.
    const again = metricsOn(db, ticks);
    again.count("chatLine");
    expect(again.today()).toEqual({ day: "2026-11-12", counts: { chatLine: 3, "joined.practice": 1, openStreamsPeak: 3 } });
    expect(again.days("2026-11-10", "2026-11-12").map((d) => d.counts["chatLine"] ?? 0)).toEqual([0, 1, 3]);
  });

  test("the visitor count keeps no identifier: same browser once a day, and only the number is written", () => {
    const db = memoryDatabase();
    const ticks = manualScheduler(LATE);
    const metrics = metricsOn(db, ticks);
    metrics.seeVisitor("203.0.113.7", "Mozilla/5.0 Kid-Tablet");
    metrics.seeVisitor("203.0.113.7", "Mozilla/5.0 Kid-Tablet");
    metrics.seeVisitor("203.0.113.7", "Mozilla/5.0 Other-Phone");
    metrics.seeVisitor("198.51.100.4", "Mozilla/5.0 Kid-Tablet");
    expect(metrics.today().counts["visitors"]).toBe(3);
    ticks.advance(2 * 60_000);
    metrics.seeVisitor("203.0.113.7", "Mozilla/5.0 Kid-Tablet");
    expect(metrics.today().counts["visitors"]).toBe(1);
    metrics.stop();
    const days = stored(db);
    expect(JSON.stringify(days)).not.toContain("203.0.113");
    expect(JSON.stringify(days)).not.toContain("Kid-Tablet");
    expect(Object.values(days).map((counts) => Object.keys(counts))).toEqual([["visitors"], ["visitors"]]);
  });

  test("a failed write is logged and tried again; a count never throws", () => {
    const db = memoryDatabase();
    const ticks = manualScheduler(LATE);
    const metrics = metricsOn(db, ticks);
    metrics.start(() => 0);
    db.run("PRAGMA query_only = ON");
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      metrics.count("signedIn");
      expect(() => metrics.count("joined", "private", -1)).not.toThrow();
      ticks.advance(60_000);
      // The refused count, the day's write and the removal of old rows.
      expect(errors.length).toBe(3);
      expect(stored(db)).toEqual({});
    } finally {
      console.error = original;
      db.run("PRAGMA query_only = OFF");
    }
    ticks.advance(60_000);
    expect(Object.keys(stored(db))).toEqual(["2026-11-11"]);
    metrics.stop();
  });

  test("a counter that a later version retired is dropped when the day is read", () => {
    const db = memoryDatabase();
    const ticks = manualScheduler(LATE);
    insertRow(db, "metrics_counter", { day: "2026-11-11", name: "chatLine", value: 4 });
    insertRow(db, "metrics_counter", { day: "2026-11-11", name: "retiredCounter", value: 9 });
    expect(metricsOn(db, ticks).today().counts).toEqual({ chatLine: 4 });
  });

  test("rows older than 400 days are removed at the first write", () => {
    const db = memoryDatabase();
    const ticks = manualScheduler(LATE);
    insertRow(db, "metrics_counter", { day: "2025-01-01", name: "chatLine", value: 1 });
    insertRow(db, "metrics_counter", { day: "2026-01-01", name: "chatLine", value: 2 });
    metricsOn(db, ticks).flush();
    expect(Object.keys(stored(db))).toEqual(["2026-01-01"]);
  });
});

/** The samples of a Prometheus text: "name{labels}" -> value. Comment lines are checked for HELP and TYPE. */
function parsePrometheus(text: string): Map<string, number> {
  const samples = new Map<string, number>();
  const typed = new Set<string>();
  for (const line of text.trim().split("\n")) {
    if (line.startsWith("# TYPE ")) typed.add(line.split(" ")[2] ?? "");
    if (line.startsWith("#")) continue;
    const match = /^([a-z_]+)(\{[^}]*\})? (-?[0-9.e+]+)$/.exec(line);
    if (match === null) throw new Error(`Not a sample line: ${line}`);
    const base = (match[1] ?? "").replace(/_(bucket|sum|count)$/, "");
    expect(typed.has(base) || typed.has(match[1] ?? "")).toBe(true);
    samples.set(`${match[1]}${match[2] ?? ""}`, Number(match[3]));
  }
  return samples;
}

describe("GET /metrics", () => {
  test("answers only with the token, in the Prometheus text format", async () => {
    const t = start();
    expect((await t.api("/metrics")).status).toBe(401);
    expect((await t.api("/metrics", { token: "wrong-token-of-some-length" })).status).toBe(401);
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter" });
    await joinTestPlayer(t, arenaId, "Ana");
    await joinTestPlayer(t, arenaId, "Budi");
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    for (let i = 0; i < 5; i++) t.ticks.tick();

    const res = await t.api("/metrics", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain; version=0.0.4");
    const samples = parsePrometheus(await res.text());
    expect(samples.get('algotank_arenas{kind="presenter"}')).toBe(1);
    expect(samples.get("algotank_rounds_running")).toBe(1);
    expect(samples.get('algotank_turn_compute_milliseconds_count{loop="arena"}')).toBe(5);
    expect(samples.get('algotank_turn_compute_milliseconds_bucket{loop="arena",le="+Inf"}')).toBe(5);
    expect(samples.get('algotank_requests_total{group="prometheus",status="4xx"}')).toBe(2);
    expect(samples.get('algotank_requests_total{group="arenas",status="2xx"}')).toBeGreaterThanOrEqual(4);
    expect(samples.get("algotank_league_seats")).toBe(0);
    expect(samples.get("algotank_memory_rss_bytes")).toBeGreaterThan(0);
    for (const key of samples.keys()) expect(key).not.toContain(arenaId);
  });

  test("does not exist without METRICS_TOKEN", async () => {
    const t = startTestServer({});
    servers.push(t);
    // The path falls through to the web app's pages, which show "not found".
    const res = await t.api("/metrics", { token: TOKEN });
    expect(res.headers.get("content-type")).not.toContain("version=0.0.4");
    expect(await res.text()).not.toContain("algotank_");
  });
});
