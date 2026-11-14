// The public arenas through HTTP with the manual scheduler: one arena of each kind at
// start, Ready and the short countdown, Ready on the result, the health route, the tournament run by the server through its rounds
// to the winners list and its reset, the status and champions routes, and the retired single
// public arena of version 4. The monthly league has its own tests in monthly/.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  plainTankLook,
  type ChampionsResponse,
  type ErrorResponse,
  type HealthResponse,
  type JoinResponse,
  type PublicArena,
  type PublicKind,
  type PublicSeatResponse,
  type PublicStatusResponse,
} from "@game/arena";
import { PUBLIC_RULES } from "./public-kinds.ts";
import { createTestArena, getArena, leaveStream, openStream, startTestServer, type StreamReader, type TestServer, type TestServerOptions } from "./test-helpers.ts";

const open: TestServer[] = [];
const streams: StreamReader[] = [];
const directories: string[] = [];
let errors: ReturnType<typeof spyOn>;

beforeEach(() => {
  errors = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  for (const reader of streams.splice(0)) await reader.close();
  for (const t of open.splice(0)) await t.server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  errors.mockRestore();
});

function start(options: TestServerOptions = {}): TestServer {
  const t = startTestServer(options);
  open.push(t);
  return t;
}

async function stop(t: TestServer): Promise<void> {
  open.splice(open.indexOf(t), 1);
  await t.server.stop();
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-public-games-"));
  directories.push(directory);
  return directory;
}

async function seat(t: TestServer, kind: PublicKind, cookie?: string): Promise<string> {
  const res = await t.api("/api/public/seat", { method: "POST", body: { kind }, ...(cookie === undefined ? {} : { cookie }) });
  if (res.status !== 200) throw new Error(`seat failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as PublicSeatResponse).arenaId;
}

async function joinPublic(t: TestServer, arenaId: string, cookie?: string): Promise<JoinResponse> {
  const res = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { look: plainTankLook(3) }, ...(cookie === undefined ? {} : { cookie }) });
  if (res.status !== 200) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as JoinResponse;
}

async function ready(t: TestServer, arenaId: string, player: JoinResponse): Promise<Response> {
  return t.api(`/api/arenas/${arenaId}/players/me/ready`, { method: "POST", token: player.playerToken });
}

/** Keeps a player's stream open, so the reset does not count them as gone. */
async function stay(t: TestServer, arenaId: string, player: JoinResponse): Promise<void> {
  streams.push(await openStream(t, arenaId, player.playerToken));
}

/** Plays the running round to its end: one tick per turn and one that completes it. */
function playRound(t: TestServer, kind: PublicKind): void {
  for (let i = 0; i <= PUBLIC_RULES[kind].settings.ticksPerRound; i++) t.ticks.tick();
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const status = async (t: TestServer) => json<PublicStatusResponse>(await t.api("/api/public"));
const champions = async (t: TestServer) => json<ChampionsResponse>(await t.api("/api/champions"));

describe("at start", () => {
  test("the server opens one arena of each public kind, with the settings of its kind", async () => {
    const t = start();
    for (const kind of ["practice", "tournament"] as const) {
      const arena = await getArena(t, await seat(t, kind));
      expect(arena.settings).toEqual(PUBLIC_RULES[kind].settings);
      expect(arena).toMatchObject({ phase: { kind: "lobby" }, auto: null, nextGameInMs: null, players: [] });
    }
  });

  test("a seat request without a known kind is refused", async () => {
    const t = start();
    for (const body of [{}, { kind: "public" }, { kind: "private" }]) {
      expect((await t.api("/api/public/seat", { method: "POST", body })).status).toBe(400);
    }
  });
});

describe("ready", () => {
  const { countdownMs, readyCountdownMs } = PUBLIC_RULES.practice;

  test("when every human is ready the countdown drops to the short time, and a new human restores the normal one", async () => {
    const t = start();
    const arenaId = await seat(t, "practice");
    const ada = await joinPublic(t, arenaId);
    const bo = await joinPublic(t, arenaId);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: countdownMs });

    t.ticks.advance(4000);
    expect((await ready(t, arenaId, ada)).status).toBe(204);
    const one = await getArena(t, arenaId);
    expect(one.players.map((p) => p.ready)).toEqual([true, false]);
    expect(one.auto).toEqual({ action: "start", inMs: countdownMs - 4000 });

    await ready(t, arenaId, bo);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: readyCountdownMs });
    expect((await getArena(t, arenaId)).nextGameInMs).toBe(readyCountdownMs);

    // Cy is not ready, so the normal countdown continues from where it was.
    t.ticks.advance(1000);
    const cy = await joinPublic(t, arenaId);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: countdownMs - 5000 });

    await ready(t, arenaId, cy);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: readyCountdownMs });
    t.ticks.advance(readyCountdownMs);
    const running = await getArena(t, arenaId);
    expect(running.phase.kind).toBe("running");
    expect(running.players.every((p) => !p.ready)).toBe(true);
  });

  test("ready never makes the countdown longer", async () => {
    const t = start();
    const arenaId = await seat(t, "practice");
    const ada = await joinPublic(t, arenaId);
    t.ticks.advance(countdownMs - 2000);
    await ready(t, arenaId, ada);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: 2000 });
  });

  test("a public arena has no take-back, and ready needs the player's token", async () => {
    const t = start();

    const arenaId = await seat(t, "practice");
    const bo = await joinPublic(t, arenaId);
    await stay(t, arenaId, bo);
    expect((await t.api(`/api/arenas/${arenaId}/players/me/ready`, { method: "POST" })).status).toBe(401);
    const back = await t.api(`/api/arenas/${arenaId}/players/me/ready`, { method: "DELETE", token: bo.playerToken });
    expect((await json<ErrorResponse>(back)).code).toBe("wrong_phase");
    t.ticks.advance(countdownMs);
    expect((await json<ErrorResponse>(await ready(t, arenaId, bo))).code).toBe("wrong_phase");
  });

  test("a player who taps ready on the result is ready in the next lobby, so the game starts after the short time", async () => {
    const { resultMs } = PUBLIC_RULES.practice;
    const t = start();
    const arenaId = await seat(t, "practice");
    const ada = await joinPublic(t, arenaId);
    const bo = await joinPublic(t, arenaId);
    for (const player of [ada, bo]) await stay(t, arenaId, player);
    t.ticks.advance(countdownMs);
    playRound(t, "practice");
    expect((await getArena(t, arenaId)).phase.kind).toBe("finished");

    // Both tap ready on the result: the result keeps its full time, and the next lobby is short.
    expect((await ready(t, arenaId, ada)).status).toBe(204);
    await ready(t, arenaId, bo);
    const result = await getArena(t, arenaId);
    expect(result.players.filter((p) => !p.isBot).map((p) => p.ready)).toEqual([true, true]);
    expect(result.auto).toEqual({ action: "reset", inMs: resultMs });
    expect(result.nextGameInMs).toBe(resultMs + readyCountdownMs);
    t.ticks.advance(resultMs);
    const lobby = await getArena(t, arenaId);
    expect(lobby.phase.kind).toBe("lobby");
    expect(lobby.players.map((p) => p.ready)).toEqual([true, true]);
    expect(lobby.auto).toEqual({ action: "start", inMs: readyCountdownMs });
    t.ticks.advance(readyCountdownMs);
    expect((await getArena(t, arenaId)).phase).toMatchObject({ kind: "running", round: 1 });
  });

  test("when only some tapped ready on the result, the next lobby counts down in full and keeps who is ready", async () => {
    const { resultMs } = PUBLIC_RULES.practice;
    const t = start();
    const arenaId = await seat(t, "practice");
    const ada = await joinPublic(t, arenaId);
    const bo = await joinPublic(t, arenaId);
    for (const player of [ada, bo]) await stay(t, arenaId, player);
    t.ticks.advance(countdownMs);
    playRound(t, "practice");
    await ready(t, arenaId, ada);
    expect((await getArena(t, arenaId)).nextGameInMs).toBe(resultMs + countdownMs);
    t.ticks.advance(resultMs);
    const lobby = await getArena(t, arenaId);
    expect(lobby.players.map((p) => [p.id, p.ready])).toEqual([
      [ada.playerId, true],
      [bo.playerId, false],
    ]);
    expect(lobby.auto).toEqual({ action: "start", inMs: countdownMs });
    await ready(t, arenaId, bo);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: readyCountdownMs });
  });
});

describe("the tournament", () => {
  const rules = PUBLIC_RULES.tournament;

  test("the break between rounds stays 20 s and the result 30 s", () => {
    expect([rules.breakMs, rules.resultMs]).toEqual([20_000, 30_000]);
  });

  test("3 people and 13 bots play a cut round and, 20 s later, the final; the result stays 30 s, then a new lobby", async () => {
    const t = start();
    const arenaId = await seat(t, "tournament");
    const people = [await joinPublic(t, arenaId), await joinPublic(t, arenaId), await joinPublic(t, arenaId)];
    for (const person of people) await stay(t, arenaId, person);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: rules.countdownMs });
    expect(await status(t)).toMatchObject({ tournament: { phase: "lobby", humans: 3, startsInMs: rules.countdownMs, round: null } });

    t.ticks.advance(rules.countdownMs);
    const first = await getArena(t, arenaId);
    expect(first.players).toHaveLength(16);
    expect(first.phase).toMatchObject({ kind: "running", round: 1, isFinal: false, survivorsAfterRound: 8 });

    // A visitor who arrives now watches and plays the next tournament.
    const late = await joinPublic(t, arenaId);
    await stay(t, arenaId, late);

    playRound(t, "tournament");
    const pause = await getArena(t, arenaId);
    expect(pause.phase).toMatchObject({ kind: "break", nextRound: 2 });
    expect(pause.auto).toEqual({ action: "start", inMs: rules.breakMs });
    expect((await status(t)).tournament).toMatchObject({ phase: "break", round: 2, startsInMs: rules.breakMs });

    t.ticks.advance(rules.breakMs);
    expect((await getArena(t, arenaId)).phase).toMatchObject({ kind: "running", round: 2, isFinal: true });
    playRound(t, "tournament");
    const finished = await getArena(t, arenaId);
    if (finished.phase.kind !== "finished") throw new Error("expected the tournament to be finished");
    const winnerId = finished.phase.winnerId;
    expect(finished.auto).toEqual({ action: "reset", inMs: rules.resultMs });
    expect(finished.nextGameInMs).toBe(rules.resultMs + rules.countdownMs);
    expect((await status(t)).tournament).toMatchObject({ phase: "finished", round: 2, startsInMs: null });

    const winner = finished.players.find((p) => p.id === winnerId)!;
    const listed = (await champions(t)).tournamentWinners;
    expect(listed).toEqual(winner.isBot ? [] : [{ name: winner.name, look: winner.look, wonAt: new Date(t.ticks.now()).toISOString(), tanks: 16 }]);

    t.ticks.advance(rules.resultMs);
    const next = await getArena(t, arenaId);
    expect(next).toMatchObject({ game: 2, phase: { kind: "lobby" }, auto: { action: "start", inMs: rules.countdownMs } });
    expect(next.players.map((p) => p.status.kind)).toEqual(["playing", "playing", "playing", "playing"]);
  });

  test("a person who wins goes on the winners list; a bot's win records nothing", async () => {
    // 16 people and no bots: someone always wins. Then tournaments of one person against 15 bots
    // until a bot wins, which the list must not show.
    const t = start();
    const arenaId = await seat(t, "tournament");
    const people: JoinResponse[] = [];
    for (let i = 0; i < 16; i++) people.push(await joinPublic(t, arenaId));
    for (const person of people) await stay(t, arenaId, person);
    const playTournament = async (): Promise<PublicArena> => {
      t.ticks.advance(rules.countdownMs);
      playRound(t, "tournament");
      t.ticks.advance(rules.breakMs);
      playRound(t, "tournament");
      const done = await getArena(t, arenaId);
      t.ticks.advance(rules.resultMs);
      return done;
    };
    const allPeople = await playTournament();
    expect(allPeople.players.some((p) => p.isBot)).toBe(false);
    expect((await champions(t)).tournamentWinners).toHaveLength(1);
    expect((await status(t)).tournament.recentWinners).toHaveLength(1);

    for (const person of people.slice(1)) await t.api(`/api/arenas/${arenaId}/players/me/leave`, { method: "POST", token: person.playerToken });
    let personWins = 1;
    let botWon = false;
    for (let i = 0; i < 20 && !botWon; i++) {
      const done = await playTournament();
      if (done.phase.kind !== "finished") throw new Error("expected a finished tournament");
      const winnerId = done.phase.winnerId;
      if (done.players.find((p) => p.id === winnerId)!.isBot) botWon = true;
      else personWins++;
    }
    expect(botWon).toBe(true);
    expect((await champions(t)).tournamentWinners).toHaveLength(personWins);
  });

  test("holds 64 people, waiting ones included; the 65th gets arena_full; the seat is always the one tournament", async () => {
    const t = start();
    const arenaId = await seat(t, "tournament");
    for (let i = 0; i < 64; i++) await joinPublic(t, arenaId);
    expect(await seat(t, "tournament")).toBe(arenaId);
    const refused = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { look: plainTankLook(1) } });
    expect(refused.status).toBe(409);
    expect((await json<ErrorResponse>(refused)).code).toBe("arena_full");
  });

  test("an empty tournament is never removed at its reset", async () => {
    const t = start();
    const arenaId = await seat(t, "tournament");
    const ada = await joinPublic(t, arenaId);
    const adaStream = await openStream(t, arenaId, ada.playerToken);
    t.ticks.advance(rules.countdownMs);
    // Ada closes her browser during the tournament and is gone by its reset.
    await leaveStream(t, arenaId, adaStream);
    playRound(t, "tournament");
    t.ticks.advance(rules.breakMs);
    t.ticks.advance(4 * 60 * 1000);
    playRound(t, "tournament");
    t.ticks.advance(rules.resultMs);
    expect(await getArena(t, arenaId)).toMatchObject({ game: 2, players: [], phase: { kind: "lobby" }, auto: null });
  });
});

describe("stored arenas of version 4", () => {
  test("the old single public arena is dropped at load with one log line, and other arenas load", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arenaId: privateId } = await createTestArena(first, { kind: "private" });
    await stop(first);

    const arenas = join(dataDir, "arenas");
    mkdirSync(arenas, { recursive: true });
    const old = join(arenas, "PQRST2.json");
    writeFileSync(
      old,
      JSON.stringify({
        version: 4,
        arena: {
          id: "PQRST2",
          settings: { name: "", kind: "public", ticksPerRound: 90, tickMs: 900, ruleSetMode: "standard", botFill: true },
          players: [],
          phase: { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } },
          rounds: [],
          game: 3,
        },
        ownerAccountId: null,
        lastActivityAt: 0,
        playerTokens: [],
        roundConfigs: [],
      }),
    );
    const logs = spyOn(console, "log").mockImplementation(() => {});
    try {
      const second = start({ dataDir });
      expect(logs.mock.calls.filter((call) => String(call[0]).includes(old))).toHaveLength(1);
      expect(existsSync(old)).toBe(false);
      expect((await second.api("/api/arenas/PQRST2")).status).toBe(404);
      expect((await getArena(second, privateId)).settings.kind).toBe("private");
      expect(await seat(second, "practice")).not.toBe("PQRST2");
    } finally {
      logs.mockRestore();
    }
  });
});

describe("the health route", () => {
  test("answers ok, the start time and the number of open arenas, without a session", async () => {
    const t = start();
    const startedAt = new Date(t.ticks.now()).toISOString();
    const health = async () => {
      const res = await t.api("/api/health");
      expect(res.status).toBe(200);
      return json<HealthResponse>(res);
    };
    // One arena of each public kind exists from the start.
    expect(await health()).toEqual({ ok: true, startedAt, arenas: 2 });
    await createTestArena(t, { kind: "private" });
    t.ticks.advance(60_000);
    expect(await health()).toEqual({ ok: true, startedAt, arenas: 3 });
  });
});
