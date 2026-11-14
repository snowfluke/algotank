import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db/open.ts";
import type { ArenaSettings, PublicArena, ReplayResponse, StreamMessage } from "@game/arena";
import { DEFAULT_PRESET_ID, PRESETS, RULE_SET_IDS, type Decision } from "@game/engine";
import { ARENA_CODE_LENGTH, expandTick, plainTankLook } from "@game/arena";
import {
  createTestArena,
  getArena,
  joinTestPlayer,
  signUp,
  openStream,
  SETTINGS,
  startTestServer,
  type StreamReader,
  type TestServer,
  clientOf,
} from "./test-helpers.ts";

const open: TestServer[] = [];
const streams: StreamReader[] = [];

/** The expiry sweep, the rate-limit sweep, the monthly league's turn and its checkpoint repeat in every server; the rest are round timers. */
const BACKGROUND_TIMERS = 4;
const roundTimers = (t: TestServer) => t.ticks.activeCount() - BACKGROUND_TIMERS;

function start(options: Parameters<typeof startTestServer>[0] = {}): TestServer {
  const t = startTestServer(options);
  open.push(t);
  return t;
}

async function stream(t: TestServer, arenaId: string, token?: string): Promise<StreamReader> {
  const reader = await openStream(t, arenaId, token);
  streams.push(reader);
  return reader;
}

const directories: string[] = [];

afterEach(async () => {
  for (const reader of streams.splice(0)) await reader.close();
  for (const t of open.splice(0)) await t.server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "drench-server-"));
  directories.push(directory);
  return directory;
}

type TickMessage = Extract<StreamMessage, { type: "tick" }>;
const isTick = (m: StreamMessage): m is TickMessage => m.type === "tick";
const isArena = (m: StreamMessage): m is Extract<StreamMessage, { type: "arena" }> => m.type === "arena";

/**
 * Plays the running round, then waits until the stream shows the new phase. The
 * round has one more firing than ticks: the last one completes the round.
 */
async function playRound(t: TestServer, viewer: StreamReader, ticksPerRound: number): Promise<void> {
  const before = viewer.messages.filter(isArena).length;
  for (let i = 0; i < ticksPerRound + 1; i++) t.ticks.tick();
  await viewer.waitFor((m) => isArena(m) && viewer.messages.filter(isArena).length > before && m.arena.phase.kind !== "running");
}

describe("headers", () => {
  test("every answer, an API one, an error and a page, tells the browser not to guess its type", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    for (const path of [`/api/arenas/${arenaId}`, "/api/arenas/ZZZZZZ", "/"]) {
      const res = await fetch(`${t.server.url}${path}`);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});

describe("create and join", () => {
  test("creates an arena with a typeable code for a signed-in account", async () => {
    const t = start();
    const created = await createTestArena(t);
    expect(created.arenaId).toMatch(new RegExp(`^[A-HJKMNP-Z2-9]{${ARENA_CODE_LENGTH}}$`));
    expect(Object.keys(created).sort()).toEqual(["arenaId", "cookie"]);

    const arena = await getArena(t, created.arenaId.toLowerCase());
    expect(arena.phase.kind).toBe("lobby");
    expect(arena.settings).toMatchObject({ name: "Test event", kind: "presenter", botFill: false });
    expect(arena).toMatchObject({ game: 1, auto: null });
  });

  test("rejects a request without a session, a public kind, bad settings and an oversize body", async () => {
    const t = start();
    const cookie = await signUp(t);
    const create = (body: unknown, withCookie = true) => t.api("/api/arenas", { method: "POST", body, ...(withCookie ? { cookie } : {}) });

    const anonymous = await create({ kind: "private", settings: SETTINGS }, false);
    expect(anonymous.status).toBe(401);
    expect(((await anonymous.json()) as { code: string }).code).toBe("not_signed_in");

    for (const kind of ["public", "other", undefined]) expect((await create({ kind, settings: SETTINGS })).status).toBe(400);
    expect((await create({ kind: "private", settings: { ...SETTINGS, tickMs: "fast" } })).status).toBe(400);

    const badRange = await create({ kind: "private", settings: { ...SETTINGS, ticksPerRound: 1 } });
    expect(badRange.status).toBe(400);
    expect(((await badRange.json()) as { error: string }).error).toContain("ticksPerRound");

    expect((await create({ kind: "private", settings: { ...SETTINGS, name: "x".repeat(70 * 1024) } })).status).toBe(413);
    const notJson = await fetch(`${t.server.url}/api/arenas`, { method: "POST", body: "{oops", headers: { cookie, origin: t.server.url } });
    expect(notJson.status).toBe(400);
  });

  test("a joining player gets a token, and a duplicate name is rejected", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    expect(ada.playerToken.length).toBeGreaterThan(20);

    const duplicate = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: " ada ", look: plainTankLook(2) } });
    expect(duplicate.status).toBe(409);

    const empty = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "  ", look: plainTankLook(2) } });
    expect(empty.status).toBe(400);

    const arena = await getArena(t, arenaId);
    expect(arena.players.map((p) => p.name)).toEqual(["Ada"]);
    // Public state never carries strategies or tokens.
    expect(JSON.stringify(arena)).not.toContain("modes");
    expect(JSON.stringify(arena)).not.toContain(ada.playerToken);
  });

  test("an unknown arena is 404 and a wrong method is 405", async () => {
    const t = start();
    expect((await t.api("/api/arenas/ZZZZZZ")).status).toBe(404);
    expect((await t.api("/api/arenas/ZZZZZZ/players", { method: "POST", body: { name: "Ada", look: plainTankLook(1) } })).status).toBe(404);
    const { arenaId } = await createTestArena(t);
    const wrong = await t.api(`/api/arenas/${arenaId}`, { method: "PUT" });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("DELETE, GET");
  });
});

describe("settings", () => {
  test("a request without ruleSetMode, or with an unknown value, is 400 and names the field", async () => {
    const t = start();
    const cookie = await signUp(t);
    const { ruleSetMode: _r, ...withoutMode } = SETTINGS;
    const cases: [unknown, string][] = [
      [withoutMode, "ruleSetMode"],
      [{ ...SETTINGS, ruleSetMode: "random" }, "ruleSetMode"],
      [{ ...SETTINGS, ruleSetMode: 3 }, "ruleSetMode"],
    ];
    for (const [settings, field] of cases) {
      const res = await t.api("/api/arenas", { method: "POST", cookie, body: { kind: "private", settings } });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; details: string[] };
      expect(body.details.some((d) => d.startsWith(field))).toBe(true);
    }
    expect(((await (await t.api("/api/arenas", { method: "POST", cookie, body: { kind: "private", settings: null } })).json()) as { error: string }).error).toContain("settings");
  });

  test("the rule set mode is kept in the public settings, and an inputMode from an older client is dropped", async () => {
    const t = start();
    const olderClient = { ...SETTINGS, inputMode: "api", ruleSetMode: "surprise" } as const;
    const { arenaId } = await createTestArena(t, { settings: olderClient });
    const arena = await getArena(t, arenaId);
    expect(arena.settings).toMatchObject({ ruleSetMode: "surprise" });
    expect("inputMode" in arena.settings).toBe(false);
  });
});

describe("rule sets", () => {
  const settingsFor = (ruleSetMode: ArenaSettings["ruleSetMode"]) => ({ ...SETTINGS, ruleSetMode });

  async function eventOf(ruleSetMode: ArenaSettings["ruleSetMode"], players = 10) {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { settings: settingsFor(ruleSetMode) });
    const viewer = await stream(t, arenaId);
    for (let i = 1; i <= players; i++) await joinTestPlayer(t, arenaId, `Player ${i}`);
    const startRound = async () => expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    return { t, arenaId, viewer, startRound };
  }

  test("standard: every round plays the standard set", async () => {
    const { t, arenaId, viewer, startRound } = await eventOf("standard");
    expect((await getArena(t, arenaId)).phase).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    await startRound();
    expect((await getArena(t, arenaId)).phase).toMatchObject({ kind: "running", ruleSetId: "standard" });
    await playRound(t, viewer, SETTINGS.ticksPerRound);
    const arena = await getArena(t, arenaId);
    expect(arena.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(arena.rounds[0]?.ruleSetId).toBe("standard");
  });

  test("announced: the lobby names the set, the round plays it, and the break names another one", async () => {
    const { t, arenaId, viewer, startRound } = await eventOf("announced");
    const lobby = (await getArena(t, arenaId)).phase;
    if (lobby.kind !== "lobby" || lobby.nextRuleSetId === null) throw new Error("the lobby should name a rule set");
    expect(RULE_SET_IDS).toContain(lobby.nextRuleSetId);

    await startRound();
    expect((await getArena(t, arenaId)).phase).toMatchObject({ kind: "running", ruleSetId: lobby.nextRuleSetId });
    await playRound(t, viewer, SETTINGS.ticksPerRound);

    const arena = await getArena(t, arenaId);
    if (arena.phase.kind !== "break" || arena.phase.nextRuleSetId === null) throw new Error("the break should name a rule set");
    expect(arena.rounds[0]?.ruleSetId).toBe(lobby.nextRuleSetId);
    expect(arena.phase.nextRuleSetId).not.toBe(lobby.nextRuleSetId);

    await startRound();
    expect((await getArena(t, arenaId)).phase).toMatchObject({ kind: "running", round: 2, ruleSetId: arena.phase.nextRuleSetId });
  });

  test("surprise: nothing names a set before the host starts, then the round carries it from its first message", async () => {
    const { t, arenaId, viewer, startRound } = await eventOf("surprise");
    expect((await getArena(t, arenaId)).phase).toEqual({ kind: "lobby", nextRuleSetId: null, start: { kind: "waiting" } });
    // No id of any rule set is in what a viewer can read before the start.
    const beforeStart = JSON.stringify(viewer.messages) + (await (await t.api(`/api/arenas/${arenaId}`)).text());
    for (const id of RULE_SET_IDS) expect(beforeStart).not.toContain(id);

    await startRound();
    const running = (await getArena(t, arenaId)).phase;
    if (running.kind !== "running") throw new Error("expected a running round");
    const roundStart = await viewer.waitFor((m) => m.type === "roundStart");
    expect(roundStart).toMatchObject({ snapshot: { ruleSetId: running.ruleSetId } });
    await playRound(t, viewer, SETTINGS.ticksPerRound);

    const arena = await getArena(t, arenaId);
    expect(arena.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: null, start: { kind: "waiting" } });
    expect(arena.rounds[0]?.ruleSetId).toBe(running.ruleSetId);

    await startRound();
    const second = (await getArena(t, arenaId)).phase;
    if (second.kind !== "running") throw new Error("expected a running round");
    // The draw is from every rule set, the last one included, so a repeat is allowed (see rule-set-draw.ts).
    expect(RULE_SET_IDS).toContain(second.ruleSetId);
  });

  test("the live ticks and the replay carry the rule set of the round", async () => {
    const { t, arenaId, viewer, startRound } = await eventOf("announced");
    await startRound();
    const running = (await getArena(t, arenaId)).phase;
    if (running.kind !== "running") throw new Error("expected a running round");
    await playRound(t, viewer, SETTINGS.ticksPerRound);

    const ticks = viewer.messages.filter(isTick);
    expect(ticks.length).toBe(SETTINGS.ticksPerRound);
    // A compact tick names no rule set; it takes it from the spawn of roundStart when expanded.
    const roundStart = viewer.messages.find((m) => m.type === "roundStart");
    if (roundStart?.type !== "roundStart") throw new Error("expected a roundStart message");
    expect(ticks.every((m) => expandTick(m.tick, roundStart.snapshot).snapshot.ruleSetId === running.ruleSetId)).toBe(true);
    const replay = (await (await t.api(`/api/arenas/${arenaId}/rounds/1/replay`)).json()) as ReplayResponse;
    expect(replay.spawn.ruleSetId).toBe(running.ruleSetId);
    expect(replay.ticks).toEqual(ticks.map((m) => m.tick));
  });
});

describe("strategy", () => {
  test("a new player holds the default preset and can read and replace it", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const path = `/api/arenas/${arenaId}/players/me/strategy`;

    const current = await (await t.api(path, { token: ada.playerToken })).json();
    expect(current).toEqual(JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.strategy)));

    const other = PRESETS.find((p) => p.id !== DEFAULT_PRESET_ID)!.strategy;
    const put = await t.api(path, { method: "PUT", token: ada.playerToken, body: other });
    expect(put.status).toBe(204);
    expect(await (await t.api(path, { token: ada.playerToken })).json()).toEqual(JSON.parse(JSON.stringify(other)));
  });

  test("a bad strategy is rejected with details", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const res = await t.api(`/api/arenas/${arenaId}/players/me/strategy`, {
      method: "PUT",
      token: ada.playerToken,
      body: { modes: [], build: {} },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.details.length).toBeGreaterThan(0);
  });

  test("a missing token is 401 and a wrong token is 403", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    await joinTestPlayer(t, arenaId, "Ada");
    const path = `/api/arenas/${arenaId}/players/me/strategy`;
    expect((await t.api(path)).status).toBe(401);
    expect((await t.api(path, { token: "wrong" })).status).toBe(403);
    // The owner's session is not a player token.
    expect((await t.api(path, { cookie })).status).toBe(401);
  });

  test("a strategy over the size limit is 413, and text that is not JSON is 400", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const path = `/api/arenas/${arenaId}/players/me/strategy`;
    const huge = await t.api(path, { method: "PUT", token: ada.playerToken, body: { ...PRESETS[0]!.strategy, padding: "x".repeat(70 * 1024) } });
    expect(huge.status).toBe(413);
    const notJson = await fetch(`${t.server.url}${path}`, { method: "PUT", headers: { authorization: `Bearer ${ada.playerToken}` }, body: "{oops" });
    expect(notJson.status).toBe(400);
  });
});

describe("rounds", () => {
  test("starting a round needs the owner's session and, without bots, two players", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const path = `/api/arenas/${arenaId}/rounds`;

    expect((await t.api(path, { method: "POST" })).status).toBe(401);
    expect((await t.api(path, { method: "POST", token: ada.playerToken })).status).toBe(401);
    const stranger = await signUp(t);
    const notOwner = await t.api(path, { method: "POST", cookie: stranger });
    expect(notOwner.status).toBe(403);
    expect(((await notOwner.json()) as { code: string }).code).toBe("not_owner");
    // One player is not enough.
    expect((await t.api(path, { method: "POST", cookie })).status).toBe(409);
    expect((await getArena(t, arenaId)).phase.kind).toBe("lobby");
    expect(roundTimers(t)).toBe(0);
  });

  test("strategy edits are locked during a round and a second start is rejected", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    expect(roundTimers(t)).toBe(1);

    const edit = await t.api(`/api/arenas/${arenaId}/players/me/strategy`, {
      method: "PUT",
      token: ada.playerToken,
      body: PRESETS[0]!.strategy,
    });
    expect(edit.status).toBe(409);
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(409);
    const join = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "Late", look: plainTankLook(1) } });
    expect(join.status).toBe(409);
  });

  test("a full event of 9 players runs to finished with one winner", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const viewer = await stream(t, arenaId);
    for (let i = 1; i <= 9; i++) await joinTestPlayer(t, arenaId, `Player ${i}`);

    const roundsPath = `/api/arenas/${arenaId}/rounds`;
    let arena: PublicArena = await getArena(t, arenaId);
    let guard = 0;
    while (arena.phase.kind !== "finished") {
      if (guard++ > 5) throw new Error("the event did not finish");
      expect((await t.api(roundsPath, { method: "POST", cookie })).status).toBe(204);
      await playRound(t, viewer, SETTINGS.ticksPerRound);
      arena = await getArena(t, arenaId);
    }

    // 9 players keep max(8, ceil(9 / 2)) = 8, and 8 or fewer play the final.
    expect(arena.rounds.map((r) => ({ n: r.round, final: r.isFinal, players: r.standings.length }))).toEqual([
      { n: 1, final: false, players: 9 },
      { n: 2, final: true, players: 8 },
    ]);
    expect(arena.players.filter((p) => p.status.kind === "winner")).toHaveLength(1);
    expect(arena.players.filter((p) => p.status.kind === "eliminated")).toHaveLength(8);
    if (arena.phase.kind !== "finished") throw new Error("unreachable");
    expect(arena.players.find((p) => p.status.kind === "winner")?.id).toBe(arena.phase.winnerId);
    expect(roundTimers(t)).toBe(0);

    // The viewer saw every arena change in order.
    const phases = viewer.messages.filter(isArena).map((m) => m.arena.phase.kind);
    expect(phases.at(-1)).toBe("finished");
    expect(phases).toContain("break");
    // Nothing starts after the end.
    expect((await t.api(roundsPath, { method: "POST", cookie })).status).toBe(409);
  });
});

describe("last tick", () => {
  test("viewers get the last tick one interval before the arena leaves running", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const viewer = await stream(t, arenaId);
    await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });

    for (let i = 0; i < SETTINGS.ticksPerRound; i++) t.ticks.tick();
    await viewer.waitFor((m) => isTick(m) && m.tick.tick === SETTINGS.ticksPerRound - 1);
    expect((await getArena(t, arenaId)).phase.kind).toBe("running");
    expect(roundTimers(t)).toBe(1);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/1/replay`)).status).toBe(404);
    const lastIndex = viewer.messages.findIndex((m) => isTick(m) && m.tick.tick === SETTINGS.ticksPerRound - 1);

    t.ticks.tick();
    await viewer.waitFor((m) => isArena(m) && m.arena.phase.kind === "finished");
    const finishedIndex = viewer.messages.findIndex((m) => isArena(m) && m.arena.phase.kind === "finished");
    expect(finishedIndex).toBeGreaterThan(lastIndex);
    expect(viewer.messages.filter(isTick)).toHaveLength(SETTINGS.ticksPerRound);
    expect(roundTimers(t)).toBe(0);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/1/replay`)).status).toBe(200);
  });
});

describe("event stream", () => {
  test("sends the arena on connect, and a mid-round roundStart with the current snapshot", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");

    const lobby = await stream(t, arenaId);
    await lobby.waitFor(isArena);
    expect(lobby.messages.map((m) => m.type)).toEqual(["arena"]);

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    t.ticks.tick();
    t.ticks.tick();
    t.ticks.tick();
    await lobby.waitFor((m) => isTick(m) && m.tick.tick === 2);

    const late = await stream(t, arenaId);
    await late.waitFor((m) => m.type === "roundStart");
    const roundStart = late.messages.find((m) => m.type === "roundStart");
    expect(roundStart).toMatchObject({ type: "roundStart", round: 1, snapshot: { tick: 3 } });
    expect(late.messages[0]?.type).toBe("arena");
  });

  test("delivers own decisions only to the token's player", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const bo = await joinTestPlayer(t, arenaId, "Bob");
    await joinTestPlayer(t, arenaId, "Cyd");

    const viewer = await stream(t, arenaId);
    const adaStream = await stream(t, arenaId, ada.playerToken);
    const boStream = await stream(t, arenaId, bo.playerToken);

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    for (let i = 0; i < SETTINGS.ticksPerRound; i++) t.ticks.tick();
    for (const s of [viewer, adaStream, boStream]) {
      await s.waitFor((m) => isTick(m) && m.tick.tick === SETTINGS.ticksPerRound - 1);
    }

    const ticksOf = (s: StreamReader) => s.messages.filter(isTick);
    expect(ticksOf(viewer)).toHaveLength(SETTINGS.ticksPerRound);
    expect(ticksOf(viewer).every((m) => m.own === null)).toBe(true);
    expect(ticksOf(adaStream).every((m) => m.own?.botId === ada.playerId)).toBe(true);
    expect(ticksOf(boStream).every((m) => m.own?.botId === bo.playerId)).toBe(true);
    // Everyone sees the same public tick, and it has no rule ids.
    expect(ticksOf(adaStream).map((m) => m.tick)).toEqual(ticksOf(viewer).map((m) => m.tick));
    expect(JSON.stringify(ticksOf(viewer)[0]?.tick)).not.toContain("ruleId");
  });

  test("answers 429 above the stream limit of an arena, and accepts again when one closes", async () => {
    const t = start({ maxStreamsPerArena: 2 });
    const { arenaId } = await createTestArena(t);
    const other = await createTestArena(t);
    const first = await stream(t, arenaId);
    await stream(t, arenaId);

    const refused = await fetch(`${t.server.url}/api/arenas/${arenaId}/events`);
    expect(refused.status).toBe(429);
    // The limit is per arena.
    await stream(t, other.arenaId);

    await first.close();
    const deadline = Date.now() + 2000;
    while (t.server.connectionCount(arenaId) > 1 && Date.now() < deadline) await Bun.sleep(20);
    await stream(t, arenaId);
  });

  test("shows viewers no modeId in ticks and roundStart, while a player's own decision keeps it", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    const viewer = await stream(t, arenaId);
    const adaStream = await stream(t, arenaId, ada.playerToken);

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    t.ticks.tick();
    t.ticks.tick();
    await viewer.waitFor((m) => isTick(m) && m.tick.tick === 1);
    await adaStream.waitFor((m) => isTick(m) && m.tick.tick === 1);
    // A viewer who connects mid-round gets the current snapshot as roundStart.
    const late = await stream(t, arenaId);
    await late.waitFor((m) => m.type === "roundStart");

    const roundStarts = [viewer, late].map((s) => s.messages.find((m) => m.type === "roundStart"));
    expect(roundStarts.every((m) => m !== undefined)).toBe(true);
    for (const reader of [viewer, late]) expect(JSON.stringify(reader.messages)).not.toContain("modeId");
    // The same ticks reach the player, who sees the field in their own decision only.
    for (const m of adaStream.messages.filter(isTick)) {
      expect(JSON.stringify(m.tick)).not.toContain("modeId");
      expect(m.own).toHaveProperty("modeId");
    }
  });

  test("rejects a token that matches no player", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    const res = await fetch(`${t.server.url}/api/arenas/${arenaId}/events?token=wrong`);
    expect(res.status).toBe(403);
  });

  test("sends a heartbeat comment and removes the connection when the client leaves", async () => {
    const t = start({ heartbeatMs: 40 });
    const { arenaId } = await createTestArena(t);
    const reader = await stream(t, arenaId);
    await reader.waitFor(isArena);
    expect(t.server.connectionCount(arenaId)).toBe(1);

    const deadline = Date.now() + 2000;
    while (reader.comments.length === 0 && Date.now() < deadline) await Bun.sleep(20);
    expect(reader.comments[0]).toBe("keep-alive");

    await reader.close();
    const gone = Date.now() + 2000;
    while (t.server.connectionCount(arenaId) > 0 && Date.now() < gone) await Bun.sleep(20);
    expect(t.server.connectionCount(arenaId)).toBe(0);
  });
});

describe("replay", () => {
  /** Starts round 1 with 10 players, so the round is not the final and a break follows. */
  async function playedEvent() {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const viewer = await stream(t, arenaId);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const adaStream = await stream(t, arenaId, ada.playerToken);
    const others = [];
    for (let i = 1; i <= 9; i++) others.push(await joinTestPlayer(t, arenaId, `Player ${i}`));
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    return { t, arenaId, cookie, viewer, ada, adaStream, everyone: [ada, ...others] };
  }

  test("equals what the stream sent, and is 404 until the round completes", async () => {
    const { t, arenaId, viewer, ada, adaStream } = await playedEvent();
    const replayPath = `/api/arenas/${arenaId}/rounds/1/replay`;
    expect((await t.api(replayPath)).status).toBe(404);

    await playRound(t, viewer, SETTINGS.ticksPerRound);
    await adaStream.waitFor((m) => isTick(m) && m.tick.tick === SETTINGS.ticksPerRound - 1);

    const replay = (await (await t.api(replayPath)).json()) as ReplayResponse;
    const sent = viewer.messages.filter(isTick).map((m) => m.tick);
    expect(replay.ticks).toEqual(sent);
    expect(replay.own).toBeNull();
    const roundStart = viewer.messages.find((m) => m.type === "roundStart");
    expect(roundStart).toMatchObject({ snapshot: replay.spawn });

    const mine = (await (await t.api(replayPath, { token: ada.playerToken })).json()) as ReplayResponse;
    expect(mine.own).toEqual(adaStream.messages.filter(isTick).map((m) => m.own as Decision));
    expect(mine.own).toHaveLength(SETTINGS.ticksPerRound);

    // The replay shows viewers no modeId, in the spawn or in any tick.
    expect(JSON.stringify(replay)).not.toContain("modeId");
    // A player's own decisions keep it. The shared part does not.
    expect(JSON.stringify([mine.spawn, mine.ticks])).not.toContain("modeId");
    expect(JSON.stringify(mine.own)).toContain("modeId");
    // Serving it again gives the same bytes: the replay is computed once.
    expect(await (await t.api(replayPath)).text()).toBe(JSON.stringify(replay));

    expect((await t.api(replayPath, { token: "wrong" })).status).toBe(403);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/2/replay`)).status).toBe(404);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/abc/replay`)).status).toBe(404);
    // Other spellings of round 1 are not round numbers.
    for (const spelling of ["1.0", "0x1", "1e0", "01", "+1", "1%20", "0", "-1", "9".repeat(400)]) {
      expect((await t.api(`/api/arenas/${arenaId}/rounds/${spelling}/replay`)).status).toBe(404);
    }
  });

  test("uses the strategies played, not the ones edited in the break", async () => {
    const { t, arenaId, viewer, everyone } = await playedEvent();
    await playRound(t, viewer, SETTINGS.ticksPerRound);
    const arena = await getArena(t, arenaId);
    expect(arena.phase.kind).toBe("break");

    // 10 players keep 8, so some are still playing and may edit.
    const stillPlaying = everyone.filter((p) =>
      arena.players.some((a) => a.id === p.playerId && a.status.kind === "playing"),
    );
    expect(stillPlaying).toHaveLength(8);
    const replayPath = `/api/arenas/${arenaId}/rounds/1/replay`;
    const before = await (await t.api(replayPath)).json();

    // Every remaining player takes every preset in turn, ending on the last one.
    for (const player of stillPlaying) {
      for (const preset of PRESETS) {
        const put = await t.api(`/api/arenas/${arenaId}/players/me/strategy`, {
          method: "PUT",
          token: player.playerToken,
          body: preset.strategy,
        });
        expect(put.status).toBe(204);
      }
    }
    expect(await (await t.api(replayPath)).json()).toEqual(before);
  });

  test("an eliminated player cannot edit, and gets an empty list of own decisions for a later round", async () => {
    const { t, arenaId, cookie, viewer, everyone } = await playedEvent();
    await playRound(t, viewer, SETTINGS.ticksPerRound);
    const arena = await getArena(t, arenaId);
    const out = everyone.find((p) => arena.players.some((a) => a.id === p.playerId && a.status.kind === "eliminated"));
    if (out === undefined) throw new Error("one player should be out");

    const edit = await t.api(`/api/arenas/${arenaId}/players/me/strategy`, {
      method: "PUT",
      token: out.playerToken,
      body: PRESETS[0]!.strategy,
    });
    expect(edit.status).toBe(409);

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    await playRound(t, viewer, SETTINGS.ticksPerRound);
    const replay = (await (await t.api(`/api/arenas/${arenaId}/rounds/2/replay`, { token: out.playerToken })).json()) as ReplayResponse;
    expect(replay.own).toEqual([]);
  });
});

describe("removed routes", () => {
  test("the routes of the removed developer mode are gone", async () => {
    const t = start();
    expect((await t.api("/api/vocabulary")).status).toBe(404);
    expect((await t.api("/api/strategies/validate", { method: "POST", body: PRESETS[0]!.strategy })).status).toBe(404);
  });
});

describe("compressed answers", () => {
  test("the replay is gzip for a client that accepts it, and the same bytes of text once inflated", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const viewer = await stream(t, arenaId);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    await playRound(t, viewer, SETTINGS.ticksPerRound);

    const path = `${t.server.url}/api/arenas/${arenaId}/rounds/1/replay`;
    for (const token of [undefined, ada.playerToken]) {
      const authorization = token === undefined ? {} : { authorization: `Bearer ${token}` };
      const plain = await (await fetch(path, { headers: { ...authorization, "accept-encoding": "identity" } })).text();
      const first = await fetch(path, { headers: { ...authorization, "accept-encoding": "gzip" }, decompress: false });
      expect(first.headers.get("content-encoding")).toBe("gzip");
      const bytes = new Uint8Array(await first.arrayBuffer());
      expect(new TextDecoder().decode(Bun.gunzipSync(bytes))).toBe(plain);
      expect(bytes.byteLength).toBeLessThan(plain.length);

      // The second request is served from the cache: the same bytes.
      const second = new Uint8Array(await (await fetch(path, { headers: { ...authorization, "accept-encoding": "gzip" }, decompress: false })).arrayBuffer());
      expect(second).toEqual(bytes);
    }
    // The two audiences differ only in `own`.
    expect(((await (await t.api(`/api/arenas/${arenaId}/rounds/1/replay`, { token: ada.playerToken })).json()) as ReplayResponse).own).toHaveLength(SETTINGS.ticksPerRound);
    expect((await fetch(path, { headers: { "accept-encoding": "gzip" } })).status).toBe(200);
    expect((await fetch(`${path.replace("/1/", "/2/")}`, { headers: { "accept-encoding": "gzip" } })).status).toBe(404);
  });
});

describe("saving to a data directory", () => {
  test("an arena, its owner and its player tokens survive a restart, and the replay stays the same", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arenaId, cookie } = await createTestArena(first, { settings: { ...SETTINGS, ruleSetMode: "announced" } });
    const viewer = await stream(first, arenaId);
    const ada = await joinTestPlayer(first, arenaId, "Ada");
    await joinTestPlayer(first, arenaId, "Bob");
    await first.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    await playRound(first, viewer, SETTINGS.ticksPerRound);
    const replayBefore = await (await first.api(`/api/arenas/${arenaId}/rounds/1/replay`, { token: ada.playerToken })).text();
    const arenaBefore = await getArena(first, arenaId);
    expect(arenaBefore.phase.kind).toBe("finished");

    await viewer.close();
    await first.server.stop();
    open.splice(open.indexOf(first), 1);

    const second = start({ dataDir });
    expect(await getArena(second, arenaId)).toEqual(arenaBefore);
    expect(await (await second.api(`/api/arenas/${arenaId}/rounds/1/replay`, { token: ada.playerToken })).text()).toBe(replayBefore);
    // The saved tokens still authorize.
    expect((await second.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: ada.playerToken })).status).toBe(200);
    // The session and the ownership survive too: the owner reaches the arena, which is finished.
    expect((await second.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(409);
    expect((await second.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie: await signUp(second) })).status).toBe(403);
  });

  test("a restart in the middle of a round aborts it and the host starts it again", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arenaId, cookie } = await createTestArena(first);
    await joinTestPlayer(first, arenaId, "Ada");
    await joinTestPlayer(first, arenaId, "Bob");
    await first.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    first.ticks.tick();
    await first.server.stop();
    open.splice(open.indexOf(first), 1);

    const second = start({ dataDir });
    expect((await getArena(second, arenaId)).phase).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect((await second.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    expect(roundTimers(second)).toBe(1);
  });

  test("a damaged arena row stops the start with an error that names the table and the arena", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arenaId } = await createTestArena(first);
    await first.server.stop();
    open.splice(open.indexOf(first), 1);

    const db = openDatabase({ kind: "file", dataDir });
    db.run("UPDATE arena SET snapshot_json = '{ damaged' WHERE id = ?", [arenaId]);
    db.close();
    expect(() => startTestServer({ dataDir })).toThrow(`The row ${arenaId} of the table arena is not valid`);
  });
});

describe("real timer", () => {
  test("plays a round at tickMs after the pause, without a test scheduler", async () => {
    const { startServer } = await import("./server.ts");
    const server = startServer({ port: 0, roundStartDelayMs: 500 });
    try {
      const t = { api: clientOf(server.url) };
      const cookie = await signUp(t);
      const own = (await (await t.api("/api/arenas", { method: "POST", cookie, body: { kind: "private", settings: { ...SETTINGS, name: "Mine" } } })).json()) as { arenaId: string };
      for (const name of ["Ada", "Bob"]) await t.api(`/api/arenas/${own.arenaId}/players`, { method: "POST", body: { name, look: plainTankLook(1) } });

      const startedAt = Date.now();
      expect((await t.api(`/api/arenas/${own.arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
      let arena: PublicArena;
      do {
        await Bun.sleep(100);
        arena = (await (await t.api(`/api/arenas/${own.arenaId}`)).json()) as PublicArena;
      } while (arena.phase.kind === "running" && Date.now() - startedAt < 6000);

      // 2 players start a final, so the game ends. A 0.5 s pause and 20 ticks at 100 ms take about 2.5 seconds.
      expect(arena.phase.kind).toBe("finished");
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2300);
    } finally {
      await server.stop();
    }
  });
});

describe("HOST", () => {
  test("a server told to listen on 127.0.0.1 answers there and not on the IPv6 loopback", async () => {
    const t = start({ hostname: "127.0.0.1" });
    const port = new URL(t.server.url).port;
    expect(t.server.url).toBe(`http://127.0.0.1:${port}`);
    expect((await t.api("/api/health")).status).toBe(200);
    // Without HOST, Bun listens on every interface, so [::1] would answer too.
    await expect(fetch(`http://[::1]:${port}/api/health`)).rejects.toThrow();
  });
});
