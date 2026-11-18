// The league's routes through HTTP, and the old monthly room's data set aside at the first start.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  plainTankLook,
  type ChampionsResponse,
  type ErrorResponse,
  type LeagueRankingResponse,
  type LeagueStreamMessage,
  type MonthlyMeResponse,
  type MonthlyOverviewResponse,
  type PublicStatusResponse,
} from "@game/arena";
import { PRESETS } from "@game/engine";
import { AuthStore } from "../auth/store.ts";
import { openDatabase } from "../db/open.ts";
import { signUp, startTestServer, type TestServer, type TestServerOptions } from "../test-helpers.ts";
import { Champions } from "./champions.ts";

const open: TestServer[] = [];
const directories: string[] = [];
let errors: ReturnType<typeof spyOn>;
let logs: ReturnType<typeof spyOn>;
beforeEach(() => {
  errors = spyOn(console, "error").mockImplementation(() => {});
  logs = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => {
  for (const t of open.splice(0)) await t.server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  errors.mockRestore();
  logs.mockRestore();
});

function start(options: TestServerOptions = {}): TestServer {
  const t = startTestServer(options);
  open.push(t);
  return t;
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
const tank = { look: plainTankLook(4), strategy: (PRESETS[0] as (typeof PRESETS)[number]).strategy };

/** The first `count` messages of a league's stream. */
async function firstMessages(t: TestServer, league: number, count: number, cookie?: string): Promise<LeagueStreamMessage[]> {
  const abort = new AbortController();
  const res = await fetch(`${t.server.url}/api/monthly/leagues/${league}/events`, { signal: abort.signal, ...(cookie === undefined ? {} : { headers: { cookie } }) });
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const messages: LeagueStreamMessage[] = [];
  let buffer = "";
  while (messages.length < count) {
    if (messages.length > 0) t.ticks.tick();
    const { value } = await reader.read();
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const data = buffer.slice(0, end).split("\n").find((line) => line.startsWith("data: "));
      buffer = buffer.slice(end + 2);
      if (data !== undefined) messages.push(JSON.parse(data.slice(6)) as LeagueStreamMessage);
    }
  }
  abort.abort();
  return messages;
}

describe("the monthly routes", () => {
  test("anyone watches; a seat needs a session; the seat, the ranking and the public line agree; a quit leaves", async () => {
    const t = start();
    expect(await json<MonthlyOverviewResponse>(await t.api("/api/monthly"))).toMatchObject({ month: "2026-11", leagues: [{ league: 1, tanks: 0, phase: "idle" }], lastChampion: null });
    const refused = await t.api("/api/monthly/seat", { method: "POST", body: tank });
    expect(refused.status).toBe(401);

    const cookie = await signUp(t);
    const taken = await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } });
    expect(taken.status).toBe(201);
    const me = await json<MonthlyMeResponse>(taken);
    expect(me.seat).toMatchObject({ league: 1, name: "Ada", countsToday: false });
    const again = await t.api("/api/monthly/seat", { method: "POST", cookie, body: tank });
    expect((await json<ErrorResponse>(again)).code).toBe("monthly_seat_taken");

    const [state, tick] = await firstMessages(t, 1, 2, cookie);
    if (state?.type !== "state" || tick?.type !== "tick") throw new Error("expected the state, then a turn");
    // One player, and the 1 to 3 bots that a lone tank always gets (league-day.ts).
    const bots = state.state.tanks.filter((x) => x.isBot).length;
    expect(state.state.tanks.filter((x) => !x.isBot)).toHaveLength(1);
    expect(bots).toBeGreaterThanOrEqual(1);
    expect(bots).toBeLessThanOrEqual(3);
    expect(tick.own?.botId).toBe(me.seat?.seatId);

    const ranking = await json<LeagueRankingResponse>(await t.api("/api/monthly/leagues/1/ranking"));
    expect(ranking.today.map((row) => row.name)).toEqual(["Ada"]);
    expect((await json<PublicStatusResponse>(await t.api("/api/public"))).monthly).toEqual({ month: "2026-11", tanks: 1, leagues: 1, lastChampion: null });
    expect((await t.api("/api/monthly/leagues/2/ranking")).status).toBe(404);

    expect((await t.api("/api/monthly/seat", { method: "DELETE", cookie })).status).toBe(204);
    expect((await json<MonthlyMeResponse>(await t.api("/api/monthly/me", { cookie }))).seat).toBeNull();
    expect((await t.api("/api/monthly/me")).status).toBe(401);
  });
});

describe("the monthly routes' limit", () => {
  test("with email on, a seat needs a verified email; the same account takes one once its email is verified", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-verified-"));
    directories.push(dataDir);
    // Mail settings make the server ask for a verified email; the codes it would send are not read here.
    const t = start({ dataDir, mail: { sendMail: async () => {} } });
    const cookie = await signUp(t);
    const refused = await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } });
    expect(refused.status).toBe(403);
    expect((await json<{ code: string }>(refused)).code).toBe("email_not_verified");
    const accountId = (await json<{ account: { id: string } }>(await t.api("/api/auth/me", { cookie }))).account.id;
    // The server reads the account on each request, so a second connection may mark it.
    const db = openDatabase({ kind: "file", dataDir });
    new AuthStore(db, Date.now).markEmailVerified(accountId);
    db.close();
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } })).status).toBe(201);
  });

  test("without email nobody could verify, so an unverified account still takes a seat", async () => {
    const t = start();
    const cookie = await signUp(t);
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } })).status).toBe(201);
  });

  test("seat, quit and rename share a limit per account; past it they answer 429 with the wait, and another account is not held back", async () => {
    const t = start();
    const cookie = await signUp(t);
    for (let i = 0; i < 6; i++) {
      expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } })).status).toBe(201);
      expect((await t.api("/api/monthly/seat", { method: "DELETE", cookie })).status).toBe(204);
    }
    const refused = await t.api("/api/monthly/name", { method: "PUT", cookie, body: { name: "Bo" } });
    expect(refused.status).toBe(429);
    expect(await json<ErrorResponse>(refused)).toMatchObject({ code: "rate_limited", retryAfterSeconds: 60 });
    const other = await signUp(t);
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie: other, body: tank })).status).toBe(201);
    t.ticks.advance(60_000);
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } })).status).toBe(201);
  });
});

describe("the champions of past months", () => {
  test("come from the database, also after a restart", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-champions-"));
    directories.push(dataDir);
    const row = { rank: 1, name: "Ada", look: plainTankLook(2), score: 120, games: 25, wins: 4 };
    const db = openDatabase({ kind: "file", dataDir });
    new Champions(db).close("2026-10", { month: "2026-10", champion: row, top: [row] });
    db.close();

    const t = start({ dataDir });
    expect((await json<ChampionsResponse>(await t.api("/api/champions"))).months).toEqual([{ month: "2026-10", champion: row, top: [row] }]);
  });
});

describe("Change rules", () => {
  test("PUT /api/monthly/strategy gives the seated tank new rules in its own seat; a bad strategy or no seat is refused", async () => {
    const t = start();
    const cookie = await signUp(t);
    const strategy = (PRESETS[1] as (typeof PRESETS)[number]).strategy;
    expect((await t.api("/api/monthly/strategy", { method: "PUT", cookie, body: { strategy } })).status).toBe(404);
    const chosen = { ...tank.strategy, ultimate: "magnet" } as const;
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada", strategy: chosen } })).status).toBe(201);
    const before = (await json<MonthlyMeResponse>(await t.api("/api/monthly/me", { cookie }))).seat;
    expect((await t.api("/api/monthly/strategy", { method: "PUT", cookie, body: { strategy: { rules: "no" } } })).status).toBe(400);
    expect((await t.api("/api/monthly/strategy", { method: "PUT", cookie, body: { strategy } })).status).toBe(204);
    const after = (await json<MonthlyMeResponse>(await t.api("/api/monthly/me", { cookie }))).seat;
    expect(before?.strategy.ultimate).toBe(chosen.ultimate);
    expect([after?.seatId, after?.name, after?.strategy]).toEqual([before?.seatId, "Ada", { ...strategy, ultimate: chosen.ultimate }]);
  });
});

test("a stale bundle gets an ultimate when taking a seat and keeps it when changing rules", async () => {
  const t = start();
  const cookie = await signUp(t);
  const { modes, build, ultimate } = PRESETS.find((preset) => preset.id === "dry-hunter")!.strategy;
  const takeSeat = await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, strategy: { modes, build } } });
  expect(takeSeat.status).toBe(201);
  const before = (await json<MonthlyMeResponse>(takeSeat)).seat;
  expect(before?.strategy).toEqual({ modes, build, ultimate });

  const newRules = { modes: tank.strategy.modes, build: { reach: 1, aim: 1, dodge: 1 } };
  const change = await t.api("/api/monthly/strategy", { method: "PUT", cookie, body: { strategy: newRules } });
  expect(change.status).toBe(204);
  const after = (await json<MonthlyMeResponse>(await t.api("/api/monthly/me", { cookie }))).seat;
  expect(after).toMatchObject({ seatId: before?.seatId!, strategy: { ...newRules, ultimate } });
});

describe("Change look", () => {
  test("PUT /api/monthly/look gives the seated tank a new look; the name stays, and a bad look or no seat is refused", async () => {
    const t = start();
    const cookie = await signUp(t);
    const look = { ...plainTankLook(3), country: "jp" } as const;
    expect((await t.api("/api/monthly/look", { method: "PUT", cookie, body: { look } })).status).toBe(404);
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } })).status).toBe(201);
    expect((await t.api("/api/monthly/look", { method: "PUT", cookie, body: { look: { ...look, colour: 99 } } })).status).toBe(400);
    expect((await t.api("/api/monthly/look", { method: "PUT", cookie, body: { look } })).status).toBe(204);
    const seat = (await json<MonthlyMeResponse>(await t.api("/api/monthly/me", { cookie }))).seat;
    expect([seat?.name, seat?.look]).toEqual(["Ada", look]);
  });
});

describe("the flag of a seated tank", () => {
  test("the seated tank's look follows My tank, flag included; the name and the seat stay", async () => {
    const t = start();
    const cookie = await signUp(t);
    expect((await t.api("/api/monthly/seat", { method: "POST", cookie, body: { ...tank, name: "Ada" } })).status).toBe(201);
    const seatOf = async () => (await json<MonthlyMeResponse>(await t.api("/api/monthly/me", { cookie }))).seat;
    const before = await seatOf();
    expect(before?.look.country).toBeNull();
    const country = "id" as const;
    const myTank = { name: "Other Name", look: { ...plainTankLook(7), country }, updatedAt: 1000 };
    expect((await t.api("/api/account/tank", { method: "PUT", cookie, body: myTank })).status).toBe(204);
    const after = await seatOf();
    expect(after?.look).toEqual(myTank.look);
    expect(after?.name).toBe("Ada");
    expect(after?.seatId).toBe(before?.seatId);
    const ranking = await json<LeagueRankingResponse>(await t.api("/api/monthly/leagues/1/ranking"));
    expect(ranking.today.find((row) => row.seatId === before?.seatId)?.look.country).toBe(country);
    expect((await t.api("/api/account/tank", { method: "PUT", cookie, body: { ...myTank, look: plainTankLook(7), updatedAt: 1001 } })).status).toBe(204);
    expect((await seatOf())?.look.country).toBeNull();
  });
});

