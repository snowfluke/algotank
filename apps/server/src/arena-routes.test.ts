// The owner routes, the arena limit, closing and expiry, bots through the start route,
// the pause before the first tick, player look, names, leave and removal, and the stored form.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db/open.ts";
import { plainTankLook, type ErrorResponse, type OwnArenaResponse, type StreamMessage, type TankLook } from "@game/arena";
import {
  createTestArena,
  getArena,
  joinTestPlayer,
  openStream,
  SETTINGS,
  signUp,
  startTestServer,
  type StreamReader,
  type TestServer,
  type TestServerOptions,
} from "./test-helpers.ts";

const HOUR_MS = 60 * 60 * 1000;
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

async function stopServer(t: TestServer): Promise<void> {
  open.splice(open.indexOf(t), 1);
  await t.server.stop();
}

async function stream(t: TestServer, arenaId: string, token?: string): Promise<StreamReader> {
  const reader = await openStream(t, arenaId, token);
  streams.push(reader);
  return reader;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-arenas-"));
  directories.push(directory);
  return directory;
}

/** The arena's snapshot in the database file, or null when it has no row. */
function arenaRow(dataDir: string, arenaId: string): string | null {
  const db = openDatabase({ kind: "file", dataDir });
  try {
    return db.query<{ snapshot_json: string }, [string]>("SELECT snapshot_json FROM arena WHERE id = ?").get(arenaId)?.snapshot_json ?? null;
  } finally {
    db.close();
  }
}

const errorOf = async (res: Response) => (await res.json()) as ErrorResponse;
const isArena = (m: StreamMessage): m is Extract<StreamMessage, { type: "arena" }> => m.type === "arena";

/** Plays the running round to its end with the manual scheduler. */
function playRound(t: TestServer): void {
  for (let i = 0; i < SETTINGS.ticksPerRound + 1; i++) t.ticks.tick();
}

describe("ownership", () => {
  test("every owner route answers 401 without a session and 403 not_owner to another account", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    const stranger = await signUp(t);
    const routes: [string, string, unknown][] = [
      ["POST", `/api/arenas/${arenaId}/rounds`, undefined],
      ["POST", `/api/arenas/${arenaId}/reset`, undefined],
      ["PATCH", `/api/arenas/${arenaId}/settings`, { botFill: true }],
      ["DELETE", `/api/arenas/${arenaId}`, undefined],
    ];
    for (const [method, path, body] of routes) {
      const anonymous = await t.api(path, { method, body });
      expect(anonymous.status).toBe(401);
      const other = await t.api(path, { method, body, cookie: stranger });
      expect(other.status).toBe(403);
      expect((await errorOf(other)).code).toBe("not_owner");
    }
    expect((await getArena(t, arenaId)).phase.kind).toBe("lobby");
  });

  test("a state change with the session cookie needs this site's Origin", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const foreign = await t.api(`/api/arenas/${arenaId}`, { method: "DELETE", cookie, headers: { origin: "https://evil.example" } });
    expect(foreign.status).toBe(403);
    expect((await foreign.json()) as { code: string }).toMatchObject({ code: "bad_origin" });
    const missing = await fetch(`${t.server.url}/api/arenas/${arenaId}`, { method: "DELETE", headers: { cookie } });
    expect(missing.status).toBe(403);
    expect((await getArena(t, arenaId)).id).toBe(arenaId);
  });

  test("a public arena has no owner, so no account can start, reset or close it", async () => {
    const t = start();
    const { arenaId } = (await (await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } })).json()) as { arenaId: string };
    const cookie = await signUp(t);
    for (const [method, path] of [
      ["POST", `/api/arenas/${arenaId}/rounds`],
      ["DELETE", `/api/arenas/${arenaId}`],
    ] as const) {
      expect((await errorOf(await t.api(path, { method, cookie }))).code).toBe("not_owner");
    }
  });
});

describe("one open arena per account", () => {
  test("a second create answers 409 arena_limit with the open arena's id, and GET /api/account/arena names it", async () => {
    const t = start();
    const cookie = await signUp(t);
    expect((await (await t.api("/api/account/arena", { cookie })).json()) as OwnArenaResponse).toEqual({ arena: null });
    expect((await t.api("/api/account/arena")).status).toBe(401);

    const { arenaId } = await createTestArena(t, { cookie, kind: "private", settings: { ...SETTINGS, name: "Friday" } });
    const second = await t.api("/api/arenas", { method: "POST", cookie, body: { kind: "presenter", settings: SETTINGS } });
    expect(second.status).toBe(409);
    expect(await errorOf(second)).toMatchObject({ code: "arena_limit", arenaId });
    expect((await (await t.api("/api/account/arena", { cookie })).json()) as OwnArenaResponse).toEqual({
      arena: { id: arenaId, kind: "private", name: "Friday" },
    });
  });

  test("closing frees the account: the arena is gone, its row too, and open streams get `closed`", async () => {
    const dataDir = temporaryDirectory();
    const t = start({ dataDir });
    const { arenaId, cookie } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    const viewer = await stream(t, arenaId);
    const player = await stream(t, arenaId, ada.playerToken);
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    t.ticks.tick();

    expect((await t.api(`/api/arenas/${arenaId}`, { method: "DELETE", cookie })).status).toBe(204);
    for (const reader of [viewer, player]) {
      await reader.waitFor((m) => m.type === "closed");
      await reader.ended;
      expect(reader.messages.at(-1)).toEqual({ type: "closed" });
    }
    expect(t.server.connectionCount(arenaId)).toBe(0);
    expect((await t.api(`/api/arenas/${arenaId}`)).status).toBe(404);
    expect(arenaRow(dataDir, arenaId)).toBeNull();
    // The round stopped with the arena; the expiry sweep, the rate-limit sweep, the league's turn and its checkpoint remain.
    expect(t.ticks.activeCount()).toBe(4);
    expect((await (await t.api("/api/account/arena", { cookie })).json()) as OwnArenaResponse).toEqual({ arena: null });
    await createTestArena(t, { cookie });
  });

  test("expiry frees the account after 24 hours without activity, and activity keeps the arena", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const viewer = await stream(t, arenaId);

    t.ticks.advance(23 * HOUR_MS);
    await joinTestPlayer(t, arenaId, "Ada");
    t.ticks.advance(23 * HOUR_MS);
    t.ticks.tick(); // the sweep runs on its timer
    expect((await getArena(t, arenaId)).id).toBe(arenaId);

    t.ticks.advance(1 * HOUR_MS + 1);
    t.ticks.tick();
    await viewer.waitFor((m) => m.type === "closed");
    expect((await t.api(`/api/arenas/${arenaId}`)).status).toBe(404);
    await createTestArena(t, { cookie });
  });

  test("ARENA_TTL_HOURS changes the expiry, and an expired arena found at start is removed", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir, arenaTtlHours: 2 });
    const { arenaId } = await createTestArena(first);
    await stopServer(first);
    // The new server's clock starts at the same time, so move the stored activity back instead.
    const stored = JSON.parse(arenaRow(dataDir, arenaId) ?? "null");
    stored.lastActivityAt -= 2 * HOUR_MS + 1;
    const db = openDatabase({ kind: "file", dataDir });
    db.run("UPDATE arena SET snapshot_json = ? WHERE id = ?", [JSON.stringify(stored), arenaId]);
    db.close();

    const second = start({ dataDir, arenaTtlHours: 2 });
    expect((await second.api(`/api/arenas/${arenaId}`)).status).toBe(404);
    expect(arenaRow(dataDir, arenaId)).toBeNull();
  });
});

describe("bots through the start route", () => {
  test("with botFill on, one human starts a game against 7 bots", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private", settings: { ...SETTINGS, botFill: true, tankCount: 8 } });
    await joinTestPlayer(t, arenaId, "Ada", plainTankLook(3));
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    const arena = await getArena(t, arenaId);
    expect(arena.phase).toMatchObject({ kind: "running", isFinal: true });
    expect(arena.players).toHaveLength(8);
    const bots = arena.players.filter((p) => p.isBot);
    expect(bots).toHaveLength(7);
    expect(bots.map((b) => b.look.colour)).not.toContain(3);
    expect(bots.every((b) => b.look.skin === "plain" && b.look.icon === null && b.look.plate === null)).toBe(true);
    expect(bots.every((b) => b.id.startsWith("b") && b.status.kind === "playing")).toBe(true);
  });

  test("with botFill off, one human gets not_enough_players; PATCH settings turns bots on in the lobby only", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    await joinTestPlayer(t, arenaId, "Ada");
    const refused = await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    expect((await errorOf(refused)).code).toBe("not_enough_players");

    expect((await t.api(`/api/arenas/${arenaId}/settings`, { method: "PATCH", cookie, body: { botFill: "yes" } })).status).toBe(400);
    expect((await t.api(`/api/arenas/${arenaId}/settings`, { method: "PATCH", cookie, body: { botFill: true } })).status).toBe(204);
    expect((await getArena(t, arenaId)).settings.botFill).toBe(true);
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    const running = await t.api(`/api/arenas/${arenaId}/settings`, { method: "PATCH", cookie, body: { botFill: false } });
    expect((await errorOf(running)).code).toBe("wrong_phase");
  });

  test("with a tank count of 48 and botFill on, one human starts a game against 47 bots; with it off, nobody is added", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private", settings: { ...SETTINGS, botFill: true, tankCount: 48 } });
    await joinTestPlayer(t, arenaId, "Ada");
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    const arena = await getArena(t, arenaId);
    expect(arena.players).toHaveLength(48);
    expect(arena.players.filter((p) => p.isBot)).toHaveLength(47);
    expect(arena.phase).toMatchObject({ kind: "running", isFinal: false, survivorsAfterRound: 24 });

    const t2 = start();
    const off = await createTestArena(t2, { kind: "private", settings: { ...SETTINGS, botFill: false, tankCount: 48 } });
    await joinTestPlayer(t2, off.arenaId, "Ada");
    await joinTestPlayer(t2, off.arenaId, "Bob");
    expect((await t2.api(`/api/arenas/${off.arenaId}/rounds`, { method: "POST", cookie: off.cookie })).status).toBe(204);
    expect((await getArena(t2, off.arenaId)).players.filter((p) => p.isBot)).toHaveLength(0);
  });

  test("a join at the tank count gets arena_full", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t, { kind: "private", settings: { ...SETTINGS, tankCount: 2 } });
    await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    const refused = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "Cid", look: plainTankLook(1) } });
    expect(refused.status).toBe(409);
    expect((await errorOf(refused)).code).toBe("arena_full");
  });

  test("PATCH settings changes the tank count in the lobby, not below the people in, and not during a game", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private", settings: { ...SETTINGS, tankCount: 16 } });
    for (const name of ["Ada", "Bob", "Cid"]) await joinTestPlayer(t, arenaId, name);
    const patch = (body: unknown) => t.api(`/api/arenas/${arenaId}/settings`, { method: "PATCH", cookie, body });
    expect((await patch({ tankCount: 48 })).status).toBe(204);
    expect((await getArena(t, arenaId)).settings.tankCount).toBe(48);
    expect((await errorOf(await patch({ tankCount: 2 }))).code).toBe("tank_count_below_players");
    expect((await errorOf(await patch({ tankCount: 65 }))).code).toBe("tank_count_invalid");
    expect((await patch({ tankCount: "48" })).status).toBe(400);
    expect((await patch({ tankCount: 48, botFill: true })).status).toBe(400);
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    expect((await errorOf(await patch({ tankCount: 3 }))).code).toBe("wrong_phase");
  });

  test("create refuses a tank count outside the kind's range", async () => {
    const t = start();
    const cookie = await signUp(t, "seats@example.com");
    const create = (kind: string, tankCount: unknown) =>
      t.api("/api/arenas", { method: "POST", cookie, body: { kind, settings: { ...SETTINGS, tankCount } } });
    expect((await create("private", 65)).status).toBe(400);
    expect((await create("private", null)).status).toBe(400);
    expect((await create("presenter", 513)).status).toBe(400);
  });

  test("reset after the final removes the bots, keeps the humans, and raises the game; the replay is of the new game", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private", settings: { ...SETTINGS, botFill: true, tankCount: 8 } });
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const viewer = await stream(t, arenaId);
    expect((await errorOf(await t.api(`/api/arenas/${arenaId}/reset`, { method: "POST", cookie }))).code).toBe("wrong_phase");

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    await viewer.waitFor((m) => isArena(m) && m.arena.phase.kind === "finished");
    const firstReplay = await (await t.api(`/api/arenas/${arenaId}/rounds/1/replay`)).text();

    expect((await t.api(`/api/arenas/${arenaId}/reset`, { method: "POST", cookie })).status).toBe(204);
    const lobby = (await viewer.waitFor((m) => isArena(m) && m.arena.game === 2)) as Extract<StreamMessage, { type: "arena" }>;
    expect(lobby.arena.phase.kind).toBe("lobby");
    expect(lobby.arena.players.map((p) => p.id)).toEqual([ada.playerId]);
    expect(lobby.arena.players[0]?.status).toEqual({ kind: "playing" });
    expect(lobby.arena.rounds).toEqual([]);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/1/replay`)).status).toBe(404);

    // "Play again": the same people, new bots, a new round 1 with its own replay.
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    await viewer.waitFor((m) => isArena(m) && m.arena.game === 2 && m.arena.phase.kind === "finished");
    const secondReplay = await (await t.api(`/api/arenas/${arenaId}/rounds/1/replay`)).text();
    expect(secondReplay).not.toBe(firstReplay);
  });
});

describe("players", () => {
  test("join needs a valid look and answers the stored name", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t);
    const full: TankLook = { colour: 5, skin: "hearts", second: 11, plate: 2, icon: "rocket" };
    for (const look of [undefined, { colour: 5 }, { ...full, colour: 13 }, { ...full, second: 5 }, { ...full, icon: "dragon" }]) {
      const res = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "Ada", look } });
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("look_invalid");
    }
    const ada = await joinTestPlayer(t, arenaId, "  Ada   Lovelace ", full);
    expect(ada.name).toBe("Ada Lovelace");
    expect((await getArena(t, arenaId)).players[0]).toMatchObject({ name: "Ada Lovelace", look: full, isBot: false });
  });

  test("a join without a name gets a two-word name from the game; a bad typed name is name_invalid", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t, { kind: "private" });
    const res = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { look: plainTankLook(2) } });
    expect(res.status).toBe(200);
    const { name } = (await res.json()) as { name: string };
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    for (const bad of ["", "Bo", "Ayu!", "x".repeat(17), 42, null]) {
      const refused = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: bad, look: plainTankLook(2) } });
      expect(refused.status).toBe(400);
      expect((await errorOf(refused)).code).toBe("name_invalid");
    }
  });

  test("a name with a blocked word is 400 name_blocked with a free name from the game", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t, { kind: "private" });
    await joinTestPlayer(t, arenaId, "Ada");
    const res = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "Big Sh1t", look: plainTankLook(2) } });
    expect(res.status).toBe(400);
    const body = await errorOf(res);
    expect(body.code).toBe("name_blocked");
    expect(body.suggestion).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect((await getArena(t, arenaId)).players.map((p) => p.name)).toEqual(["Ada"]);
    // The suggestion joins as it is.
    await joinTestPlayer(t, arenaId, body.suggestion!);
  });

  test("a player changes the look outside a round, and leaves in the lobby only", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t);
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const bo = await joinTestPlayer(t, arenaId, "Bob");
    const cy = await joinTestPlayer(t, arenaId, "Cyd");
    const me = `/api/arenas/${arenaId}/players/me`;
    const look: TankLook = { colour: 12, skin: "waves", second: 1, plate: null, icon: "cat" };

    expect((await t.api(me, { method: "PATCH", body: { look } })).status).toBe(401);
    expect((await errorOf(await t.api(me, { method: "PATCH", token: ada.playerToken, body: { colour: 4 } }))).code).toBe("look_invalid");
    expect((await t.api(me, { method: "PATCH", token: ada.playerToken, body: { look } })).status).toBe(204);
    expect((await getArena(t, arenaId)).players[0]?.look).toEqual(look);

    expect((await t.api(`${me}/leave`, { method: "POST", token: cy.playerToken })).status).toBe(204);
    expect((await getArena(t, arenaId)).players.map((p) => p.name)).toEqual(["Ada", "Bob"]);
    // The token left with the player.
    expect((await t.api(`${me}/strategy`, { token: cy.playerToken })).status).toBe(403);

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    expect((await errorOf(await t.api(me, { method: "PATCH", token: ada.playerToken, body: { look: plainTankLook(2) } }))).code).toBe("wrong_phase");
    expect((await errorOf(await t.api(`${me}/leave`, { method: "POST", token: bo.playerToken }))).code).toBe("wrong_phase");
  });

  test("the owner removes a player in the lobby: the token stops working and the player may join again", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const bob = await joinTestPlayer(t, arenaId, "Bob");
    const remove = (playerId: string, init: { cookie?: string } = { cookie }) =>
      t.api(`/api/arenas/${arenaId}/players/${playerId}`, { method: "DELETE", ...init });

    expect((await remove(bob.playerId, {})).status).toBe(401);
    const stranger = await signUp(t);
    expect((await errorOf(await remove(bob.playerId, { cookie: stranger }))).code).toBe("not_owner");
    expect((await errorOf(await remove("nobody"))).code).toBe("unknown_player");

    expect((await remove(bob.playerId)).status).toBe(204);
    expect((await getArena(t, arenaId)).players.map((p) => p.name)).toEqual(["Ada"]);
    const me = `/api/arenas/${arenaId}/players/me`;
    expect((await t.api(`${me}/strategy`, { token: bob.playerToken })).status).toBe(403);
    expect((await t.api(me, { method: "PATCH", token: bob.playerToken, body: { look: plainTankLook(3) } })).status).toBe(403);

    const again = await joinTestPlayer(t, arenaId, "Bob");
    expect(again.playerId).not.toBe(bob.playerId);
    expect((await t.api(`${me}/strategy`, { token: again.playerToken })).status).toBe(200);

    // Outside the lobby nobody is removed.
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    expect((await errorOf(await remove(ada.playerId))).code).toBe("wrong_phase");
  });

  test("nobody removes a player from a public arena, because it has no owner", async () => {
    const t = start();
    const { arenaId } = (await (await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } })).json()) as { arenaId: string };
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const cookie = await signUp(t);
    const res = await t.api(`/api/arenas/${arenaId}/players/${ada.playerId}`, { method: "DELETE", cookie });
    expect((await errorOf(res)).code).toBe("not_owner");
  });

  test("a restart after a leave loads the arena without the player's token", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arenaId } = await createTestArena(first);
    const ada = await joinTestPlayer(first, arenaId, "Ada");
    await first.api(`/api/arenas/${arenaId}/players/me/leave`, { method: "POST", token: ada.playerToken });
    await stopServer(first);
    const second = start({ dataDir });
    expect((await getArena(second, arenaId)).players).toEqual([]);
  });

  test("joins are limited per minute per address, with Retry-After", async () => {
    const t = start({ joinsPerMinute: 5 });
    const { arenaId } = await createTestArena(t);
    for (let i = 0; i < 5; i++) await joinTestPlayer(t, arenaId, `Player ${i}`);
    const limited = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name: "One more", look: plainTankLook(1) } });
    expect(limited.status).toBe(429);
    expect(await errorOf(limited)).toMatchObject({ code: "rate_limited", retryAfterSeconds: 60 });
    expect(limited.headers.get("retry-after")).toBe("60");
    t.ticks.advance(60_000);
    await joinTestPlayer(t, arenaId, "One more");
  });
});

describe("the pause before the first tick", () => {
  test("roundStart says how long the pause is, and a viewer who connects during it gets the time left", async () => {
    const t = start({ roundStartDelayMs: 3000 });
    const { arenaId, cookie } = await createTestArena(t);
    await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    const early = await stream(t, arenaId);
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    expect(await early.waitFor((m) => m.type === "roundStart")).toMatchObject({ startsInMs: 3000, snapshot: { tick: 0 } });

    t.ticks.tick();
    expect(early.messages.some((m) => m.type === "tick")).toBe(false);
    t.ticks.advance(1000);
    const late = await stream(t, arenaId);
    expect(await late.waitFor((m) => m.type === "roundStart")).toMatchObject({ startsInMs: 2000 });

    t.ticks.advance(2000);
    t.ticks.tick();
    await early.waitFor((m) => m.type === "tick");
    const afterPause = await stream(t, arenaId);
    expect(await afterPause.waitFor((m) => m.type === "roundStart")).toMatchObject({ startsInMs: 0, snapshot: { tick: 1 } });
  });
});

describe("stored form", () => {
  async function restart(t: TestServer, dataDir: string): Promise<TestServer> {
    await stopServer(t);
    return start({ dataDir });
  }

  test("an arena comes back in the lobby, the break and finished, with its owner, bots and looks", async () => {
    const dataDir = temporaryDirectory();
    let t = start({ dataDir });
    const { arenaId, cookie } = await createTestArena(t, { kind: "private", settings: { ...SETTINGS, botFill: true, tankCount: 8 } });
    await joinTestPlayer(t, arenaId, "Ada", plainTankLook(6));
    const lobby = await getArena(t, arenaId);
    t = await restart(t, dataDir);
    expect(await getArena(t, arenaId)).toEqual(lobby);

    // 9 humans with bots off play a cut round, so a break follows.
    const many = await createTestArena(t);
    for (let i = 0; i < 9; i++) await joinTestPlayer(t, many.arenaId, `Player ${i}`);
    await t.api(`/api/arenas/${many.arenaId}/rounds`, { method: "POST", cookie: many.cookie });
    playRound(t);
    const inBreak = await getArena(t, many.arenaId);
    expect(inBreak.phase.kind).toBe("break");

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    const finished = await getArena(t, arenaId);
    expect(finished.phase.kind).toBe("finished");

    t = await restart(t, dataDir);
    expect(await getArena(t, many.arenaId)).toEqual(inBreak);
    expect(await getArena(t, arenaId)).toEqual(finished);
    // The owner still owns it after the restart.
    expect((await t.api(`/api/arenas/${arenaId}/reset`, { method: "POST", cookie })).status).toBe(204);
    expect((await getArena(t, arenaId)).game).toBe(2);
  });
});

describe("static pages", () => {
  test("serves index.html for the client routes /join, /play, /new/private and /new/presenter", async () => {
    const staticDir = temporaryDirectory();
    writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>AlgoTank</title>");
    const t = start({ staticDir });
    for (const path of ["/join", "/play", "/new/private", "/new/presenter", "/play/ABC234"]) {
      const res = await t.api(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("AlgoTank");
    }
    expect((await t.api("/assets/missing.js")).status).toBe(404);
  });
});
