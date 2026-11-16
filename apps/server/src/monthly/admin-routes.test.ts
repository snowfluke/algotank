// GET /api/admin/players through HTTP: who may read it, and what it lists.

import { afterEach, describe, expect, test } from "bun:test";
import { plainTankLook, type AdminPlayersResponse } from "@game/arena";
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
});
