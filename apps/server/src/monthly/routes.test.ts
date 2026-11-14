// The league's routes through HTTP, and the old monthly room's data set aside at the first start.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
import { signUp, startTestServer, type TestServer, type TestServerOptions } from "../test-helpers.ts";

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
    expect(state.state.tanks.map((x) => x.isBot).sort()).toEqual([false, true]);
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

describe("old data of the monthly room", () => {
  test("is set aside in a dated folder at the first start, and the champions of past months stay", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-set-aside-"));
    directories.push(dataDir);
    mkdirSync(join(dataDir, "arenas"), { recursive: true });
    mkdirSync(join(dataDir, "league"), { recursive: true });
    // Only the kind is read, so the rest of an old monthly arena may be anything.
    writeFileSync(join(dataDir, "arenas", "MNTHLY.json"), JSON.stringify({ version: 7, arena: { id: "MNTHLY", settings: { kind: "monthly" } } }));
    writeFileSync(join(dataDir, "league", "2026-10.json"), JSON.stringify({ version: 1, month: "2026-10", settledGames: [], entries: [] }));
    const row = { rank: 1, name: "Ada", look: plainTankLook(2), score: 120, games: 25, wins: 4 };
    writeFileSync(join(dataDir, "league", "champions.json"), JSON.stringify({ version: 1, closedMonths: ["2026-10"], records: [{ month: "2026-10", champion: row, top: [row] }] }));

    const t = start({ dataDir });
    const aside = join(dataDir, "set-aside", "2026-11-11");
    expect(readdirSync(join(aside, "arenas"))).toEqual(["MNTHLY.json"]);
    expect(readdirSync(join(aside, "league"))).toEqual(["2026-10.json"]);
    expect(existsSync(join(dataDir, "arenas", "MNTHLY.json"))).toBe(false);
    expect(readdirSync(join(dataDir, "league"))).toEqual(["champions.json"]);
    expect((await json<ChampionsResponse>(await t.api("/api/champions"))).months).toEqual([{ month: "2026-10", champion: row, top: [row] }]);
  });
});
