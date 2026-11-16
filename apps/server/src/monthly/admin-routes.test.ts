// GET /api/admin/players through HTTP: who may read it, and what it lists.

import { afterEach, describe, expect, test } from "bun:test";
import { plainTankLook, type AdminPlayersResponse, type LeagueRankingResponse } from "@game/arena";
import { PRESETS } from "@game/engine";
import { signUp, startTestServer, type TestServer, type TestServerOptions } from "../test-helpers.ts";

const ADMIN = "host@example.org";
const tank = { look: plainTankLook(4), strategy: (PRESETS[0] as (typeof PRESETS)[number]).strategy };
const open: TestServer[] = [];

afterEach(async () => {
  for (const t of open.splice(0)) await t.server.stop();
});

function start(options: TestServerOptions = {}): TestServer {
  const t = startTestServer({ adminEmails: [ADMIN], ...options });
  open.push(t);
  return t;
}

async function seat(t: TestServer, email: string, name: string): Promise<string> {
  const cookie = await signUp(t, email);
  expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name } })).status).toBe(201);
  return cookie;
}

describe("GET /api/admin/players", () => {
  test("a visitor, a player and an unverified admin with email on get the 404 of a missing route", async () => {
    const t = start();
    const missing = await (await t.api("/api/no-such-route")).json();
    const player = await seat(t, "kid@example.org", "Ada");
    for (const res of [await t.api("/api/admin/players"), await t.api("/api/admin/players", { cookie: player })]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(missing);
    }
    const withMail = start({ mail: { sendMail: async () => {} } });
    expect((await withMail.api("/api/admin/players", { cookie: await signUp(withMail, ADMIN) })).status).toBe(404);
  });

  test("the admin gets every seated tank with its owner's email, and a tank that quit is gone", async () => {
    const t = start();
    await seat(t, "ada@example.org", "Ada");
    const bo = await seat(t, "bo@example.org", "Bobo");
    await seat(t, "cy@example.org", "Cyan");
    expect((await t.api("/api/monthly/seat", { method: "DELETE", cookie: bo })).status).toBe(204);
    const res = await t.api("/api/admin/players", { cookie: await signUp(t, ADMIN) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const view = (await res.json()) as AdminPlayersResponse;
    expect(view.month).toBe(view.day.slice(0, 7));
    expect(view.players.map((p) => [p.name, p.league, p.account?.email, p.account?.emailVerified])).toEqual([
      ["Ada", 1, "ada@example.org", false],
      ["Cyan", 1, "cy@example.org", false],
    ]);
    expect(Number.isNaN(Date.parse(view.players[0]?.account?.createdAt ?? ""))).toBe(false);
  });

  test("the admin removes a tank as its owner's quit would; anyone else, a cross-site request and an unknown seat are refused", async () => {
    const t = start();
    const owner = await seat(t, "ada@example.org", "Ada");
    const seatId = ((await (await t.api("/api/monthly/me", { cookie: owner })).json()) as { seat: { seatId: string } }).seat.seatId;
    const other = await signUp(t, "kid@example.org");
    expect((await t.api(`/api/admin/players/${seatId}`, { method: "DELETE" })).status).toBe(404);
    expect((await t.api(`/api/admin/players/${seatId}`, { method: "DELETE", cookie: other })).status).toBe(404);
    const admin = await signUp(t, ADMIN);
    expect((await t.api(`/api/admin/players/${seatId}`, { method: "DELETE", cookie: admin, headers: { origin: "https://elsewhere.example" } })).status).toBe(403);
    const list = (await (await t.api("/api/admin/players", { cookie: admin })).json()) as AdminPlayersResponse;
    expect(list.players.map((p) => [p.name, p.seatId])).toEqual([["Ada", seatId]]);
    expect((await t.api(`/api/admin/players/${seatId}`, { method: "DELETE", cookie: admin })).status).toBe(204);
    expect(((await (await t.api("/api/monthly/me", { cookie: owner })).json()) as { seat: unknown; name: { name: string } }).seat).toBeNull();
    expect(((await (await t.api("/api/monthly/me", { cookie: owner })).json()) as { name: { name: string } }).name.name).toBe("Ada");
    expect((await t.api(`/api/admin/players/${seatId}`, { method: "DELETE", cookie: admin })).status).toBe(404);
    // The owner can take a seat again.
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie: owner, body: { ...tank, name: "Ada" } })).status).toBe(201);
  });
});

describe("PUT /api/admin/players/:seatId/gm", () => {
  test("the admin makes a tank the game master: it keeps playing under the flag and takes no place; others are refused", async () => {
    const t = start();
    const ada = await seat(t, "ada@example.org", "Ada");
    await seat(t, "bob@example.org", "Bobo");
    const seatId = ((await (await t.api("/api/monthly/me", { cookie: ada })).json()) as { seat: { seatId: string } }).seat.seatId;
    const gm = (cookie: string | undefined, body: unknown, headers?: Record<string, string>) => t.api(`/api/admin/players/${seatId}/gm`, { method: "PUT", ...(cookie === undefined ? {} : { cookie }), body, ...(headers === undefined ? {} : { headers }) });
    expect((await gm(ada, { gm: true })).status).toBe(404);
    const admin = await signUp(t, ADMIN);
    expect((await gm(admin, { gm: "yes" })).status).toBe(400);
    expect((await gm(admin, { gm: true }, { origin: "https://elsewhere.example" })).status).toBe(403);
    expect((await t.api("/api/admin/players/nobody/gm", { method: "PUT", cookie: admin, body: { gm: true } })).status).toBe(404);
    expect((await gm(admin, { gm: true })).status).toBe(204);

    const ranking = (await (await t.api("/api/monthly/leagues/1/ranking")).json()) as LeagueRankingResponse;
    const today = ranking.today.filter((r) => r.name === "Ada" || r.name === "Bobo").map((r) => [r.name, r.gm, r.gm ? r.rank : "placed"]);
    expect(today).toContainEqual(["Ada", true, 0]);
    expect(today).toContainEqual(["Bobo", false, "placed"]);
    // The places run 1, 2, … over the other tanks only.
    expect(ranking.today.filter((r) => !r.gm).map((r) => r.rank)).toEqual(ranking.today.filter((r) => !r.gm).map((_, i) => i + 1));
    expect(ranking.thisMonth.find((r) => r.name === "Ada")).toMatchObject({ gm: true, rank: null });
    const list = (await (await t.api("/api/admin/players", { cookie: admin })).json()) as AdminPlayersResponse;
    expect(list.players.find((p) => p.name === "Ada")?.gm).toBe(true);

    expect((await gm(admin, { gm: false })).status).toBe(204);
    const after = (await (await t.api("/api/monthly/leagues/1/ranking")).json()) as LeagueRankingResponse;
    expect(after.today.every((r) => !r.gm && r.rank >= 1)).toBe(true);
  });
});
