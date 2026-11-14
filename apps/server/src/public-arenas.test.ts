// A full practice arena cycle with the manual scheduler: countdown, bots, round, result,
// reset, pruning at the reset and at the start, idling with no humans, the room choice of
// "Play now" (a lobby first, then a new room, then a running room at the limit), the
// closing of an empty extra arena, and timers after a restart. The tournament, the monthly
// arena and Ready are in public-games.test.ts.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARENA_LIMITS, plainTankLook, type TankColour } from "@game/arena";
import type { ErrorResponse, JoinResponse, PublicArena, PublicSeatResponse, StreamMessage } from "@game/arena";
import { gameMsOf, PUBLIC_ABSENT_MS, PUBLIC_RULES, PUBLIC_START_ABSENT_MS } from "./public-kinds.ts";
import { getArena, leaveStream, openStream, startTestServer, type StreamReader, type TestServer, type TestServerOptions } from "./test-helpers.ts";

const PUBLIC_SETTINGS = PUBLIC_RULES.practice.settings;
const PUBLIC_COUNTDOWN_MS = PUBLIC_RULES.practice.countdownMs;
const PUBLIC_RESULT_MS = PUBLIC_RULES.practice.resultMs;

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

async function stream(t: TestServer, arenaId: string, token?: string): Promise<StreamReader> {
  const reader = await openStream(t, arenaId, token);
  streams.push(reader);
  return reader;
}

async function seat(t: TestServer): Promise<string> {
  const res = await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } });
  if (res.status !== 200) throw new Error(`seat failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as PublicSeatResponse).arenaId;
}

/** Joins without a name, as a child who does not type one, so the game names the player. */
async function joinPublic(t: TestServer, arenaId: string, colour: TankColour = 1): Promise<JoinResponse> {
  const res = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { look: plainTankLook(colour) } });
  if (res.status !== 200) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as JoinResponse;
}

/** Joins and keeps a stream open, as a browser that stays on the page. */
async function joinAndStay(t: TestServer, arenaId: string, colour: TankColour = 1): Promise<{ player: JoinResponse; reader: StreamReader }> {
  const player = await joinPublic(t, arenaId, colour);
  return { player, reader: await stream(t, arenaId, player.playerToken) };
}

/** Plays the running public round (PUBLIC_SETTINGS.ticksPerRound turns) to its end. */
function playRound(t: TestServer): void {
  for (let i = 0; i < PUBLIC_SETTINGS.ticksPerRound + 1; i++) t.ticks.tick();
}

const humans = (arena: PublicArena) => arena.players.filter((p) => !p.isBot);
const isArena = (m: StreamMessage): m is Extract<StreamMessage, { type: "arena" }> => m.type === "arena";

describe("a practice arena", () => {
  test("plays 60 turns at 900 ms, counts down 30 s before a game and shows the result for 20 s", () => {
    // Quick games (docs/specs/revamp/67-public-arenas.md); the result is long enough to read (73-after-first-timer-test.md).
    expect([PUBLIC_SETTINGS.ticksPerRound, PUBLIC_SETTINGS.tickMs]).toEqual([60, 900]);
    expect([PUBLIC_COUNTDOWN_MS, PUBLIC_RESULT_MS]).toEqual([30_000, 20_000]);
    expect([PUBLIC_START_ABSENT_MS, PUBLIC_ABSENT_MS, gameMsOf(PUBLIC_RULES.practice)]).toEqual([20_000, 180_000, 104_000]);
    expect(PUBLIC_SETTINGS.tickMs).toBeLessThanOrEqual(ARENA_LIMITS.tickMsMax);
    expect(PUBLIC_SETTINGS.ticksPerRound).toBeGreaterThanOrEqual(ARENA_LIMITS.ticksPerRoundMin);
  });

  test("idles in the lobby without timers while no human is in it", async () => {
    const t = start();
    const arenaId = await seat(t);
    const arena = await getArena(t, arenaId);
    expect(arena.settings).toEqual(PUBLIC_SETTINGS);
    expect(arena).toMatchObject({ phase: { kind: "lobby" }, auto: null, players: [] });
    t.ticks.advance(60 * 60 * 1000);
    expect(await getArena(t, arenaId)).toMatchObject({ phase: { kind: "lobby" }, auto: null });
  });

  test("gives a player who sends no name a name from the word lists", async () => {
    const t = start();
    const arenaId = await seat(t);
    const names = new Set<string>();
    for (let i = 0; i < 8; i++) names.add((await joinPublic(t, arenaId)).name);
    expect(names.size).toBe(8);
    for (const name of names) expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect((await getArena(t, arenaId)).players.map((p) => p.name).sort()).toEqual([...names].sort());
  });

  test("takes a typed name that passes the name rule and the block list, and refuses a blocked one with a suggestion", async () => {
    const t = start();
    const arenaId = await seat(t);
    const typed = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "Rara 2015", look: plainTankLook(4) } });
    expect(((await typed.json()) as JoinResponse).name).toBe("Rara 2015");
    const blocked = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "kontol", look: plainTankLook(4) } });
    expect(blocked.status).toBe(400);
    expect((await blocked.json()) as ErrorResponse).toMatchObject({ code: "name_blocked", suggestion: expect.stringMatching(/^[A-Z][a-z]+ [A-Z][a-z]+$/) });
  });

  test("runs a full cycle: countdown, bots, round, result, reset with pruning, and the next countdown", async () => {
    const t = start();
    const arenaId = await seat(t);
    const ada = await joinPublic(t, arenaId, 2);
    const adaStream = await stream(t, arenaId, ada.playerToken);
    // Bo plays, then closes his browser during the game, so he counts as gone once 3 minutes pass.
    const { player: bo, reader: boStream } = await joinAndStay(t, arenaId, 3);

    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: PUBLIC_COUNTDOWN_MS });
    t.ticks.advance(5000);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: PUBLIC_COUNTDOWN_MS - 5000 });

    t.ticks.advance(PUBLIC_COUNTDOWN_MS - 5000);
    const running = await getArena(t, arenaId);
    expect(running.phase).toMatchObject({ kind: "running", round: 1, isFinal: true });
    expect(running.auto).toBeNull();
    expect(running.players.filter((p) => p.isBot)).toHaveLength(6);
    expect(running.players).toHaveLength(8);

    // Bo leaves and time passes during the round; then Cy joins and waits for the next game.
    await leaveStream(t, arenaId, boStream);
    t.ticks.advance(PUBLIC_ABSENT_MS + 1);
    const { player: cy } = await joinAndStay(t, arenaId, 4);
    expect((await getArena(t, arenaId)).players.find((p) => p.id === cy.playerId)?.status).toEqual({ kind: "waiting" });
    // A waiting player may prepare a strategy during the round.
    const strategy = await (await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: cy.playerToken })).json();
    expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { method: "PUT", token: cy.playerToken, body: strategy })).status).toBe(204);

    playRound(t);
    const finished = (await adaStream.waitFor((m) => isArena(m) && m.arena.phase.kind === "finished")) as Extract<StreamMessage, { type: "arena" }>;
    // The result message already carries the reset step.
    expect(finished.arena.auto).toEqual({ action: "reset", inMs: PUBLIC_RESULT_MS });

    t.ticks.advance(PUBLIC_RESULT_MS);
    const next = await getArena(t, arenaId);
    expect(next.game).toBe(2);
    expect(next.phase.kind).toBe("lobby");
    expect(next.players.some((p) => p.isBot)).toBe(false);
    // Bo was gone for more than 3 minutes; Ada and Cy have their streams open.
    expect(next.players.map((p) => p.id).sort()).toEqual([ada.playerId, cy.playerId].sort());
    expect(next.players.every((p) => p.status.kind === "playing")).toBe(true);
    expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: bo.playerToken })).status).toBe(403);
    expect(next.auto).toEqual({ action: "start", inMs: PUBLIC_COUNTDOWN_MS });

    // The next game starts on its own countdown.
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    expect((await getArena(t, arenaId)).phase).toMatchObject({ kind: "running", round: 1 });
  });

  test("the countdown stops when the last human leaves the lobby", async () => {
    const t = start();
    const arenaId = await seat(t);
    const ada = await joinPublic(t, arenaId);
    expect((await getArena(t, arenaId)).auto?.action).toBe("start");
    await t.api(`/api/arenas/${arenaId}/players/me/leave`, { method: "POST", token: ada.playerToken });
    expect((await getArena(t, arenaId)).auto).toBeNull();
    t.ticks.advance(PUBLIC_COUNTDOWN_MS * 2);
    expect((await getArena(t, arenaId)).phase.kind).toBe("lobby");
  });
});

describe("a closed browser", () => {
  test("a human whose stream has been closed for over 20 s when the game starts does not play and leaves the room", async () => {
    const t = start();
    const arenaId = await seat(t);
    const { player: ada } = await joinAndStay(t, arenaId, 1);
    // Bo closes his browser 5 s into the countdown; Cy never opens a stream; Dee closes hers 10 s before the start.
    const { player: bo, reader: boStream } = await joinAndStay(t, arenaId, 2);
    const cy = await joinPublic(t, arenaId, 3);
    const { player: dee, reader: deeStream } = await joinAndStay(t, arenaId, 4);
    t.ticks.advance(5000);
    await leaveStream(t, arenaId, boStream);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS - 5000 - 10_000);
    await leaveStream(t, arenaId, deeStream);
    t.ticks.advance(10_000);

    const running = await getArena(t, arenaId);
    expect(running.phase.kind).toBe("running");
    expect(humans(running).map((p) => p.id).sort()).toEqual([ada.playerId, dee.playerId].sort());
    expect(running.phase.kind === "running" && running.phase.playerIds.length).toBe(8);
    for (const gone of [bo, cy]) expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: gone.playerToken })).status).toBe(403);
  });

  test("a room whose only human closed the browser plays no game of bots alone, and idles", async () => {
    const t = start();
    const arenaId = await seat(t);
    const { reader } = await joinAndStay(t, arenaId);
    await leaveStream(t, arenaId, reader);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    expect(await getArena(t, arenaId)).toMatchObject({ phase: { kind: "lobby" }, auto: null, players: [] });
    t.ticks.advance(gameMsOf(PUBLIC_RULES.practice));
    // The last practice room stays.
    expect(await getArena(t, arenaId)).toMatchObject({ game: 1, phase: { kind: "lobby" }, players: [] });
  });
});

describe("seats", () => {
  test("while room A's game runs, a second visitor gets a new room B in its lobby, and the next visitor B too", async () => {
    const t = start();
    const a = await seat(t);
    await joinAndStay(t, a);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    expect((await getArena(t, a)).phase.kind).toBe("running");

    const b = await seat(t);
    expect(b).not.toBe(a);
    const room = await getArena(t, b);
    expect(room).toMatchObject({ phase: { kind: "lobby" }, players: [] });
    const { player } = await joinAndStay(t, b);
    expect((await getArena(t, b)).players.find((p) => p.id === player.playerId)?.status).toEqual({ kind: "playing" });
    // The newcomer's game starts on B's own countdown, not after A's game.
    expect((await getArena(t, b)).auto).toEqual({ action: "start", inMs: PUBLIC_COUNTDOWN_MS });
    expect(await seat(t)).toBe(b);
  });

  test("a room that shows its result is not a lobby, so a visitor gets a new room", async () => {
    const t = start();
    const a = await seat(t);
    await joinAndStay(t, a);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    playRound(t);
    expect((await getArena(t, a)).phase.kind).toBe("finished");
    expect(await seat(t)).not.toBe(a);
  });

  test("of two lobbies with a free seat, the one with more humans is chosen", async () => {
    const t = start();
    const a = await seat(t);
    await joinAndStay(t, a);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    const b = await seat(t);
    await joinAndStay(t, b);
    playRound(t);
    t.ticks.advance(PUBLIC_RESULT_MS);
    // A is in its lobby again with one human; B gets a second.
    await joinAndStay(t, b);
    expect((await getArena(t, a)).phase.kind).toBe("lobby");
    expect(await seat(t)).toBe(b);
  });

  test("when PUBLIC_ARENA_MAX rooms run, the visitor waits in a running room; when all are full, 503", async () => {
    const t = start({ publicArenaMax: 2 });
    const a = await seat(t);
    await joinAndStay(t, a);
    await joinAndStay(t, a);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    const b = await seat(t);
    await joinAndStay(t, b);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    expect((await getArena(t, b)).phase.kind).toBe("running");

    // The busiest running room with a free seat: A has two humans.
    expect(await seat(t)).toBe(a);
    const { player: late } = await joinAndStay(t, a);
    expect((await getArena(t, a)).players.find((p) => p.id === late.playerId)?.status).toEqual({ kind: "waiting" });

    for (let i = 0; i < 5; i++) await joinPublic(t, a);
    for (let i = 0; i < 7; i++) await joinPublic(t, b);
    const refused = await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } });
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as ErrorResponse).code).toBe("no_public_seat");
  });

  test("an extra room nobody joined closes after one whole game; one that got a human stays", async () => {
    const t = start();
    const a = await seat(t);
    await joinAndStay(t, a);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    const empty = await seat(t);
    const watcher = await stream(t, empty);
    t.ticks.advance(gameMsOf(PUBLIC_RULES.practice) - 1);
    expect((await getArena(t, empty)).phase.kind).toBe("lobby");
    t.ticks.advance(1);
    await watcher.waitFor((m) => m.type === "closed");
    expect((await t.api(`/api/arenas/${empty}`)).status).toBe(404);

    const joined = await seat(t);
    t.ticks.advance(gameMsOf(PUBLIC_RULES.practice) - 1);
    await joinAndStay(t, joined);
    t.ticks.advance(gameMsOf(PUBLIC_RULES.practice));
    expect((await t.api(`/api/arenas/${joined}`)).status).toBe(200);
  });

  test("an extra room whose humans are all gone at its reset closes there; the other keeps its player", async () => {
    const t = start();
    const first = await seat(t);
    const { player: stayer } = await joinAndStay(t, first);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    const second = await seat(t);
    const { reader } = await joinAndStay(t, second);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    expect((await getArena(t, second)).phase.kind).toBe("running");
    // The second room's player leaves during its game and stays away past the 3-minute rule.
    await leaveStream(t, second, reader);
    const watcher = await stream(t, second);
    t.ticks.advance(PUBLIC_ABSENT_MS + 1);
    playRound(t);
    t.ticks.advance(PUBLIC_RESULT_MS);
    await watcher.waitFor((m) => m.type === "closed");
    expect((await t.api(`/api/arenas/${second}`)).status).toBe(404);
    const kept = await getArena(t, first);
    expect(kept).toMatchObject({ game: 2, phase: { kind: "lobby" }, auto: { action: "start" } });
    expect(humans(kept).map((p) => p.id)).toEqual([stayer.playerId]);
  });

  test("the last public arena stays when its reset leaves it empty, and idles", async () => {
    const t = start();
    const arenaId = await seat(t);
    const { reader } = await joinAndStay(t, arenaId);
    t.ticks.advance(PUBLIC_COUNTDOWN_MS);
    await leaveStream(t, arenaId, reader);
    t.ticks.advance(PUBLIC_ABSENT_MS + 1);
    playRound(t);
    t.ticks.advance(PUBLIC_RESULT_MS);
    expect(await getArena(t, arenaId)).toMatchObject({ game: 2, phase: { kind: "lobby" }, auto: null, players: [] });
  });

  test("seat requests are limited to 30 per minute per address", async () => {
    const t = start();
    for (let i = 0; i < 30; i++) await seat(t);
    const limited = await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });
});

describe("after a restart", () => {
  test("the timers are armed again: a countdown in the lobby, a reset after a result", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-public-"));
    directories.push(dataDir);
    const first = start({ dataDir });
    const arenaId = await seat(first);
    const ada = await joinPublic(first, arenaId);
    open.splice(open.indexOf(first), 1);
    await first.server.stop();

    const second = start({ dataDir });
    expect(await seat(second)).toBe(arenaId);
    expect((await getArena(second, arenaId)).auto).toEqual({ action: "start", inMs: PUBLIC_COUNTDOWN_MS });
    // The browser reconnects after the restart.
    const adaStream = await stream(second, arenaId, ada.playerToken);
    second.ticks.advance(PUBLIC_COUNTDOWN_MS);
    playRound(second);
    expect((await getArena(second, arenaId)).phase.kind).toBe("finished");
    // Closed first: a server that stops ends an open stream with a reset, which the reader would report.
    await adaStream.close();
    open.splice(open.indexOf(second), 1);
    await second.server.stop();

    const third = start({ dataDir });
    expect((await getArena(third, arenaId))).toMatchObject({ phase: { kind: "finished" }, auto: { action: "reset", inMs: PUBLIC_RESULT_MS } });
    third.ticks.advance(PUBLIC_RESULT_MS);
    // The restart counted the human as seen, so they stay.
    expect(await getArena(third, arenaId)).toMatchObject({ game: 2, phase: { kind: "lobby" } });
    expect(humans(await getArena(third, arenaId))).toHaveLength(1);
  });

  test("a public arena that was running comes back in the lobby without bots and starts again on its countdown", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-public-"));
    directories.push(dataDir);
    const first = start({ dataDir });
    const arenaId = await seat(first);
    const { player: ada, reader } = await joinAndStay(first, arenaId);
    first.ticks.advance(PUBLIC_COUNTDOWN_MS);
    expect((await getArena(first, arenaId)).phase.kind).toBe("running");
    await reader.close();
    open.splice(open.indexOf(first), 1);
    await first.server.stop();

    const second = start({ dataDir });
    const arena = await getArena(second, arenaId);
    expect(arena).toMatchObject({ phase: { kind: "lobby" }, auto: { action: "start" } });
    expect(arena.players.filter((p) => p.isBot)).toEqual([]);
    // Ada reconnects and a second human joins before the next start; the bots fill to 8 again, not 9.
    await stream(second, arenaId, ada.playerToken);
    await joinAndStay(second, arenaId);
    second.ticks.advance(PUBLIC_COUNTDOWN_MS);
    const running = await getArena(second, arenaId);
    expect(running.phase.kind).toBe("running");
    expect(running.players).toHaveLength(8);
    expect(running.players.filter((p) => p.isBot)).toHaveLength(6);
  });
});
