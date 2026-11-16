/// <reference types="bun" />
import { afterEach, describe, expect, test } from "bun:test";
import { createArena, getChampions, getLeagueRanking, getPublicStatus, publicSeat, saveMyStrategy, setReady, startRound } from "./client.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(respond: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  globalThis.fetch = ((url: string, init?: RequestInit) => Promise.resolve(respond(url, init))) as typeof fetch;
}

const settings = { name: "n", ticksPerRound: 100, tickMs: 500, ruleSetMode: "surprise", botFill: false, joinPolicy: "anyone", tankCount: 16 } as const;

describe("api client", () => {
  test("returns the data of a valid answer", async () => {
    stubFetch(() => Response.json({ arenaId: "a1" }, { status: 201 }));
    expect(await createArena({ kind: "private", settings })).toEqual({ ok: true, data: { arenaId: "a1" } });
  });

  test("keeps the server's ErrorResponse and the status", async () => {
    stubFetch(() => Response.json({ error: "unauthorized", details: ["bad key"] }, { status: 401 }));
    expect(await createArena({ kind: "private", settings })).toEqual({
      ok: false,
      status: 401,
      error: { error: "unauthorized", details: ["bad key"] },
      code: null,
    });
    stubFetch(() => Response.json({ error: "Name taken.", code: "name_taken" }, { status: 409 }));
    const withCode = await createArena({ kind: "private", settings });
    expect(!withCode.ok && withCode.code).toBe("name_taken");
  });

  test("reports a network failure with status 0", async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch;
    expect(await startRound("a1")).toEqual({ ok: false, status: 0, error: { error: "network_error" }, code: "network_error" });
  });

  test("reports an answer it cannot read", async () => {
    stubFetch(() => new Response("<html>", { status: 502 }));
    expect(await startRound("a1")).toEqual({ ok: false, status: 502, error: { error: "bad_response" }, code: "bad_response" });
    stubFetch(() => Response.json({ unexpected: true }, { status: 200 }));
    const result = await createArena({ kind: "private", settings });
    expect(!result.ok && result.error.error).toBe("bad_response");
  });

  test("a 204 is success without reading a body, and the token goes in the header", async () => {
    let seen = undefined as { url: string; auth: string | null; body: unknown } | undefined;
    stubFetch((url, init) => {
      seen = {
        url,
        auth: new Headers(init?.headers).get("Authorization"),
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      };
      return new Response(null, { status: 204 });
    });
    const strategy = { modes: [], build: {} };
    expect(await saveMyStrategy("a 1", "tok", strategy)).toEqual({ ok: true, data: undefined });
    expect(seen).toEqual({ url: "/api/arenas/a%201/players/me/strategy", auth: "Bearer tok", body: strategy });
  });

  test("a public seat names its kind, and Ready sends the player token", async () => {
    const seen: { url: string; auth: string | null; body: unknown }[] = [];
    stubFetch((url, init) => {
      seen.push({ url, auth: new Headers(init?.headers).get("Authorization"), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      return url.endsWith("/seat") ? Response.json({ arenaId: "T1" }) : new Response(null, { status: 204 });
    });
    expect(await publicSeat("tournament")).toEqual({ ok: true, data: { arenaId: "T1" } });
    expect(await setReady("T1", "tok")).toEqual({ ok: true, data: undefined });
    expect(seen).toEqual([
      { url: "/api/public/seat", auth: null, body: { kind: "tournament" } },
      { url: "/api/arenas/T1/players/me/ready", auth: "Bearer tok", body: undefined },
    ]);
  });
});

describe("api client: public arenas, league and champions", () => {
  const look = { colour: 3, skin: "dots", second: 5, plate: null, icon: null };
  const row = { rank: 1, name: "Bima", look, score: 340, games: 20, wins: 6 };
  const winner = { name: "Citra", look, wonAt: "2026-11-12T10:00:00.000Z", tanks: 16 };
  const status = {
    practice: { humans: 3 },
    tournament: { phase: "running", humans: 20, startsInMs: null, round: 2, recentWinners: [winner] },
    monthly: { month: "2026-11", tanks: 40, leagues: 3, lastChampion: { month: "2026-10", champion: row, top: [row] } },
  };

  test("reads a valid status, and refuses one whose rows the page could not draw", async () => {
    stubFetch(() => Response.json(status));
    expect(await getPublicStatus()).toEqual({ ok: true, data: status as never });
    for (const broken of [
      { ...status, tournament: { ...status.tournament, phase: "paused" } },
      { ...status, monthly: { ...status.monthly, month: "2026-13" } },
      { ...status, monthly: { ...status.monthly, lastChampion: { month: "2026-10", champion: { ...row, look: { ...look, icon: "dragon" } }, top: [row] } } },
      { ...status, tournament: { ...status.tournament, recentWinners: [{ ...winner, wonAt: "yesterday" }] } },
      { ...status, practice: {} },
    ]) {
      stubFetch(() => Response.json(broken));
      const result = await getPublicStatus();
      expect(!result.ok && result.code).toBe("bad_response");
    }
  });

  test("a league's ranking and the champions are checked the same way", async () => {
    const today = { rank: 1, seatId: "p1", name: "Bima", look, points: 4, counts: true, seated: true, gm: false };
    const month = { rank: null, seatId: "p1", name: "Bima", look, score: 2.5, countedDays: 2, gm: false };
    const ranking = { league: 1, month: "2026-11", day: "2026-11-14", today: [today], thisMonth: [month] };
    let asked = "";
    stubFetch((url) => {
      asked = url;
      return Response.json(ranking);
    });
    expect((await getLeagueRanking(2)).ok).toBe(true);
    expect(asked).toBe("/api/monthly/leagues/2/ranking");
    stubFetch(() => Response.json({ ...ranking, thisMonth: [{ ...month, rank: "first" }] }));
    expect((await getLeagueRanking(1)).ok).toBe(false);
    stubFetch(() => Response.json({ months: [], tournamentWinners: [winner] }));
    expect((await getChampions()).ok).toBe(true);
    stubFetch(() => Response.json({ months: [{ month: "2026-10", champion: { ...row, name: "" }, top: [] }], tournamentWinners: [] }));
    expect((await getChampions()).ok).toBe(false);
  });
});
