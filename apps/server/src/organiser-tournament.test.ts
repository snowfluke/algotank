// The organiser's tournament through the routes (docs/specs/revamp/75-organiser-tournament.md):
// every row of the start table, ready and its take-back, the seat per account, the join
// policies, removal in a lobby and a break with and without a ban, the stored result (content,
// owner-only email, the 180-day prune, the ended-arena link) and where an email must never go.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  plainTankLook,
  RESULT_KEEP_MS,
  type AccountResultsResponse,
  type ArenaAccountsResponse,
  type CreateArenaRequest,
  type ErrorResponse,
  type JoinResponse,
  type MeResponse,
  type PublicArena,
  type ResultResponse,
} from "@game/arena";
import { AuthStore } from "./auth/store.ts";
import { openDatabase } from "./db/open.ts";
import type { MailSender } from "./mail.ts";
import { createTestArena, getArena, joinTestPlayer, openStream, PASSWORD, SETTINGS, startTestServer, type StreamReader, type TestServer, type TestServerOptions } from "./test-helpers.ts";

const open: TestServer[] = [];
const streams: StreamReader[] = [];
const directories: string[] = [];
let errors: ReturnType<typeof spyOn>;
let logs: ReturnType<typeof spyOn>;

beforeEach(() => {
  errors = spyOn(console, "error").mockImplementation(() => {});
  logs = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => {
  for (const reader of streams.splice(0)) await reader.close();
  for (const t of open.splice(0)) await t.server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  errors.mockRestore();
  logs.mockRestore();
});

function start(options: TestServerOptions = {}): TestServer {
  const t = startTestServer({ trustProxy: true, ...options });
  open.push(t);
  return t;
}

async function stopServer(t: TestServer): Promise<void> {
  open.splice(open.indexOf(t), 1);
  await t.server.stop();
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-organiser-"));
  directories.push(directory);
  return directory;
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
let address = 0;

/** Registers an account from its own address (registration allows 5 per hour per address). */
async function account(t: TestServer, email: string): Promise<string> {
  const res = await t.api("/api/auth/register", { method: "POST", body: { email, password: PASSWORD }, headers: { "x-forwarded-for": `10.0.${Math.floor(++address / 250)}.${address % 250}` } });
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

async function accountId(t: TestServer, cookie: string): Promise<string> {
  return (await json<MeResponse>(await t.api("/api/auth/me", { cookie }))).account!.id;
}

const settings = (joinPolicy: CreateArenaRequest["settings"]["joinPolicy"], extra: Partial<CreateArenaRequest["settings"]> = {}): CreateArenaRequest["settings"] => ({ ...SETTINGS, joinPolicy, ...extra });

async function joinAs(t: TestServer, arenaId: string, name: string, cookie?: string): Promise<Response> {
  return t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name, look: plainTankLook(1) }, ...(cookie === undefined ? {} : { cookie }) });
}

/** Plays the running round to its end with the manual clock. */
function playRound(t: TestServer): void {
  for (let i = 0; i <= SETTINGS.ticksPerRound + 1; i++) t.ticks.tick();
}

const phaseOf = async (t: TestServer, arenaId: string) => (await getArena(t, arenaId)).phase;

describe("start table (lobby or break)", () => {
  test("waiting -> start now -> running", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    for (const name of ["Ada", "Bob"]) await joinTestPlayer(t, arenaId, name);
    expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie })).status).toBe(204);
    expect((await phaseOf(t, arenaId)).kind).toBe("running");
  });

  test("waiting -> schedule (1, 2, 3 or 5 minutes) -> scheduled, and every viewer gets the time left", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    for (const name of ["Ada", "Bob"]) await joinTestPlayer(t, arenaId, name);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 4 } })).status).toBe(400);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", body: { minutes: 1 } })).status).toBe(401);
    expect((await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 2 } })).status).toBe(204);
    const arena = await getArena(t, arenaId);
    expect(arena.phase).toMatchObject({ kind: "lobby", start: { kind: "scheduled", startsAt: t.ticks.now() + 120_000 } });
    expect(arena.auto).toEqual({ action: "start", inMs: 120_000 });
    t.ticks.advance(30_000);
    expect((await getArena(t, arenaId)).auto).toEqual({ action: "start", inMs: 90_000 });
  });

  test("scheduled -> cancel -> waiting, and the timer is gone", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    for (const name of ["Ada", "Bob"]) await joinTestPlayer(t, arenaId, name);
    await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 1 } });
    expect((await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "DELETE", cookie })).status).toBe(204);
    expect(await getArena(t, arenaId)).toMatchObject({ phase: { start: { kind: "waiting" } }, auto: null });
    t.ticks.advance(120_000);
    expect((await phaseOf(t, arenaId)).kind).toBe("lobby");
    expect((await json<ErrorResponse>(await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "DELETE", cookie }))).code).toBe("wrong_phase");
  });

  test("scheduled -> start now -> running, and the old timer does nothing", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    for (const name of ["Ada", "Bob"]) await joinTestPlayer(t, arenaId, name);
    await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 1 } });
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    expect(await getArena(t, arenaId)).toMatchObject({ phase: { kind: "running", round: 1 }, auto: null });
  });

  test("scheduled -> time reached with enough players -> running, in a break too", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter" });
    for (let i = 1; i <= 9; i++) await joinTestPlayer(t, arenaId, `Player ${i}`);
    await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 1 } });
    t.ticks.advance(60_000);
    expect((await phaseOf(t, arenaId)).kind).toBe("running");
    playRound(t);
    expect((await phaseOf(t, arenaId)).kind).toBe("break");
    await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 5 } });
    t.ticks.advance(5 * 60_000);
    expect(await phaseOf(t, arenaId)).toMatchObject({ kind: "running", round: 2 });
  });

  test("scheduled -> time reached with too few players -> missed, which the owner's page reads", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter" });
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    await joinTestPlayer(t, arenaId, "Bob");
    await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 1 } });
    await t.api(`/api/arenas/${arenaId}/players/me/leave`, { method: "POST", token: ada.playerToken });
    t.ticks.advance(60_000);
    expect(await getArena(t, arenaId)).toMatchObject({ phase: { kind: "lobby", start: { kind: "missed" } }, auto: null });
    // A new plan replaces the notice.
    await t.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 1 } });
    expect((await phaseOf(t, arenaId))).toMatchObject({ start: { kind: "scheduled" } });
  });

  test("a restart drops a scheduled start back to waiting (named limit)", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arenaId, cookie } = await createTestArena(first, { kind: "private" });
    for (const name of ["Ada", "Bob"]) await joinTestPlayer(first, arenaId, name);
    await first.api(`/api/arenas/${arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 3 } });
    await stopServer(first);
    const second = start({ dataDir });
    expect(await getArena(second, arenaId)).toMatchObject({ phase: { kind: "lobby", start: { kind: "waiting" } }, auto: null });
  });

  test("a public arena refuses a schedule from anyone", async () => {
    const t = start();
    const cookie = await account(t, "someone@example.org");
    const seat = await json<{ arenaId: string }>(await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } }));
    expect((await t.api(`/api/arenas/${seat.arenaId}/rounds/schedule`, { method: "POST", cookie, body: { minutes: 1 } })).status).toBe(403);
  });
});

describe("ready informs the owner", () => {
  test("a player taps ready in the lobby and takes it back; the start clears it; an eliminated player cannot", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter" });
    const players: JoinResponse[] = [];
    for (let i = 1; i <= 9; i++) players.push(await joinTestPlayer(t, arenaId, `Player ${i}`));
    const first = players[0]!;
    const readyCount = async () => (await getArena(t, arenaId)).players.filter((p) => p.ready).length;
    expect((await t.api(`/api/arenas/${arenaId}/players/me/ready`, { method: "POST", token: first.playerToken })).status).toBe(204);
    expect(await readyCount()).toBe(1);
    expect((await t.api(`/api/arenas/${arenaId}/players/me/ready`, { method: "DELETE", token: first.playerToken })).status).toBe(204);
    expect(await readyCount()).toBe(0);
    await t.api(`/api/arenas/${arenaId}/players/me/ready`, { method: "POST", token: first.playerToken });
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    expect(await readyCount()).toBe(0);
    playRound(t);
    const arena = await getArena(t, arenaId);
    const out = players.find((p) => arena.players.find((q) => q.id === p.playerId)?.status.kind === "eliminated")!;
    expect((await json<ErrorResponse>(await t.api(`/api/arenas/${arenaId}/players/me/ready`, { method: "POST", token: out.playerToken }))).code).toBe("player_eliminated");
  });
});

describe("signed-in-only arenas (joinPolicy account and verified)", () => {
  test("a join needs a session, and a second join of the account gets the same seat back on the new device", async () => {
    const t = start();
    const { arenaId } = await createTestArena(t, { kind: "private", settings: settings("account") });
    expect((await json<{ code: string }>(await joinAs(t, arenaId, "Ada"))).code).toBe("not_signed_in");
    const ada = await account(t, "ada@example.org");
    const first = await json<JoinResponse>(await joinAs(t, arenaId, "Ada", ada));
    // The second device sends the seat's own name, which the arena already lists.
    const second = await joinAs(t, arenaId, "Ada", ada);
    expect(second.status).toBe(200);
    const seat = await json<JoinResponse>(second);
    expect(seat).toMatchObject({ playerId: first.playerId, name: "Ada" });
    expect(seat.playerToken).not.toBe(first.playerToken);
    expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: first.playerToken })).status).toBe(403);
    expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: seat.playerToken })).status).toBe(200);
    expect((await getArena(t, arenaId)).players.filter((p) => !p.isBot)).toHaveLength(1);
  });

  test("the seat moves to a second device during a break and a running round, and survives a restart", async () => {
    const dataDir = temporaryDirectory();
    const t = start({ dataDir });
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter", settings: settings("account") });
    const people: { cookie: string; seat: JoinResponse }[] = [];
    for (let i = 1; i <= 9; i++) {
      const c = await account(t, `p${i}@example.org`);
      people.push({ cookie: c, seat: await json<JoinResponse>(await joinAs(t, arenaId, `Player ${i}`, c)) });
    }
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    const running = await json<JoinResponse>(await joinAs(t, arenaId, "Player 1", people[0]!.cookie));
    expect(running.playerId).toBe(people[0]!.seat.playerId);
    playRound(t);
    expect((await phaseOf(t, arenaId)).kind).toBe("break");
    const inBreak = await json<JoinResponse>(await joinAs(t, arenaId, "Player 1", people[0]!.cookie));
    expect(inBreak.playerId).toBe(people[0]!.seat.playerId);
    expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: running.playerToken })).status).toBe(403);
    await stopServer(t);
    const again = start({ dataDir });
    expect((await again.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: inBreak.playerToken })).status).toBe(200);
  });

  test("a banned account gets no seat back, and a seat removed in a break is out until the next game", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter", settings: settings("account") });
    const people: { cookie: string; seat: JoinResponse }[] = [];
    for (let i = 1; i <= 9; i++) {
      const c = await account(t, `q${i}@example.org`);
      people.push({ cookie: c, seat: await json<JoinResponse>(await joinAs(t, arenaId, `Player ${i}`, c)) });
    }
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    const [banned, removed] = [people[0]!, people[1]!];
    expect((await t.api(`/api/arenas/${arenaId}/players/${banned.seat.playerId}?ban=1`, { method: "DELETE", cookie })).status).toBe(204);
    expect((await json<ErrorResponse>(await joinAs(t, arenaId, "Player 1", banned.cookie))).code).toBe("banned");
    expect((await t.api(`/api/arenas/${arenaId}/players/${removed.seat.playerId}`, { method: "DELETE", cookie })).status).toBe(204);
    const back = await joinAs(t, arenaId, "Player 2", removed.cookie);
    expect(back.status).toBe(409);
    expect((await json<ErrorResponse>(back)).code).toBe("wrong_phase");
  });

  test("an arena anyone may join takes a visitor and records no account", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    expect((await joinAs(t, arenaId, "Ada")).status).toBe(200);
    expect((await t.api(`/api/arenas/${arenaId}/accounts`, { cookie })).status).toBe(404);
  });

  test('a server without mail settings refuses a new "verified" arena, because nobody could join it', async () => {
    const t = start();
    const cookie = await account(t, "owner@example.org");
    const res = await t.api("/api/arenas", { method: "POST", cookie, body: { kind: "private", settings: settings("verified") } });
    expect(res.status).toBe(400);
    expect((await json<ErrorResponse>(res)).code).toBe("mail_off");
    expect((await json<{ arena: unknown }>(await t.api("/api/account/arena", { cookie }))).arena).toBeNull();
    expect((await createTestArena(t, { kind: "private", settings: settings("account"), cookie })).arenaId).toBeString();
  });

  test('"verified" refuses an account whose email is not verified, and takes it once markEmailVerified ran', async () => {
    const dataDir = temporaryDirectory();
    // Mail settings, so the server takes a "verified" arena; the codes it sends are not read here.
    const mail: MailSender = { sendMail: async () => {} };
    const first = start({ dataDir, mail });
    const { arenaId, cookie: ownerCookie } = await createTestArena(first, { kind: "private", settings: settings("verified") });
    const ada = await account(first, "ada@example.org");
    const adaId = await accountId(first, ada);
    expect((await json<ErrorResponse>(await joinAs(first, arenaId, "Ada", ada))).code).toBe("email_not_verified");
    await stopServer(first);
    const db = openDatabase({ kind: "file", dataDir });
    new AuthStore(db, Date.now).markEmailVerified(adaId);
    db.close();
    const second = start({ dataDir, mail });
    expect((await joinAs(second, arenaId, "Ada", ada)).status).toBe(200);
    expect((await json<MeResponse>(await second.api("/api/auth/me", { cookie: ownerCookie }))).account).not.toBeNull();
  });

  test("the owner reads each player's email; nobody else does, and no email reaches the arena, the stream or the result's public answer", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private", settings: settings("account", { botFill: true, tankCount: 8 }) });
    const viewer = await openStream(t, arenaId);
    streams.push(viewer);
    const ada = await account(t, "ada.secret@example.org");
    const bo = await account(t, "bo.secret@example.org");
    const adaSeat = await json<JoinResponse>(await joinAs(t, arenaId, "Ada", ada));
    await joinAs(t, arenaId, "Bob", bo);
    const accounts = await json<ArenaAccountsResponse>(await t.api(`/api/arenas/${arenaId}/accounts`, { cookie }));
    expect(accounts.players).toContainEqual({ playerId: adaSeat.playerId, email: "ada.secret@example.org" });
    expect((await t.api(`/api/arenas/${arenaId}/accounts`, { cookie: bo })).status).toBe(403);
    expect((await t.api(`/api/arenas/${arenaId}/accounts`)).status).toBe(401);

    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    const finished = await getArena(t, arenaId);
    if (finished.phase.kind !== "finished" || finished.phase.resultId === null) throw new Error("expected a stored result");
    const resultId = finished.phase.resultId;
    const publicAnswer = await (await t.api(`/api/results/${resultId}`)).text();
    const asBo = await (await t.api(`/api/results/${resultId}`, { cookie: bo })).text();
    const asOwner = await json<ResultResponse>(await t.api(`/api/results/${resultId}`, { cookie }));
    expect(asOwner.emails).toContainEqual({ playerId: adaSeat.playerId, email: "ada.secret@example.org" });
    const adaAccount = await accountId(t, ada);
    for (const text of [JSON.stringify(finished), JSON.stringify(viewer.messages), publicAnswer, asBo]) {
      expect(text).not.toContain("secret@example.org");
      expect(text).not.toContain(adaAccount);
    }
    expect(JSON.parse(publicAnswer).emails).toBeNull();
  });
});

describe("removal", () => {
  test("in a signed-in-only arena: no ban lets the player join again; a ban is 403 banned until allow again", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private", settings: settings("account") });
    const ada = await account(t, "ada@example.org");
    const adaId = await accountId(t, ada);
    let seat = await json<JoinResponse>(await joinAs(t, arenaId, "Ada", ada));
    expect((await t.api(`/api/arenas/${arenaId}/players/${seat.playerId}`, { method: "DELETE", cookie })).status).toBe(204);
    seat = await json<JoinResponse>(await joinAs(t, arenaId, "Ada", ada));
    expect((await t.api(`/api/arenas/${arenaId}/players/${seat.playerId}?ban=1`, { method: "DELETE", cookie })).status).toBe(204);
    const refused = await joinAs(t, arenaId, "Ada", ada);
    expect(refused.status).toBe(403);
    expect((await json<ErrorResponse>(refused)).code).toBe("banned");
    const accounts = await json<ArenaAccountsResponse>(await t.api(`/api/arenas/${arenaId}/accounts`, { cookie }));
    expect(accounts.banned).toEqual([{ accountId: adaId, name: "Ada", email: "ada@example.org" }]);
    expect((await getArena(t, arenaId) as unknown as Record<string, unknown>)["banned"]).toBeUndefined();
    expect((await t.api(`/api/arenas/${arenaId}/bans/${adaId}`, { method: "DELETE", cookie })).status).toBe(204);
    expect((await joinAs(t, arenaId, "Ada", ada)).status).toBe(200);
    expect((await json<ErrorResponse>(await t.api(`/api/arenas/${arenaId}/bans/${adaId}`, { method: "DELETE", cookie }))).code).toBe("not_banned");
  });

  test("an arena anyone may join has no ban", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "private" });
    const ada = await joinTestPlayer(t, arenaId, "Ada");
    const res = await t.api(`/api/arenas/${arenaId}/players/${ada.playerId}?ban=1`, { method: "DELETE", cookie });
    expect(res.status).toBe(400);
    expect((await json<ErrorResponse>(res)).code).toBe("ban_unavailable");
  });

  test("in a break the player is out of the game, keeps their name in the history, and loses the token", async () => {
    const t = start();
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter" });
    const players: JoinResponse[] = [];
    for (let i = 1; i <= 9; i++) players.push(await joinTestPlayer(t, arenaId, `Player ${i}`));
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    const inBreak = await getArena(t, arenaId);
    const through = players.find((p) => inBreak.rounds[0]!.survivors.includes(p.playerId))!;
    expect((await t.api(`/api/arenas/${arenaId}/players/${through.playerId}`, { method: "DELETE", cookie })).status).toBe(204);
    const after = await getArena(t, arenaId);
    expect(after.players.find((p) => p.id === through.playerId)?.status).toEqual({ kind: "removed" });
    expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { token: through.playerToken })).status).toBe(403);
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    const running = await getArena(t, arenaId);
    if (running.phase.kind !== "running") throw new Error("expected round 2");
    expect(running.phase.playerIds).not.toContain(through.playerId);
    expect(running.phase.playerIds).toHaveLength(7);
  });
});

describe("final ranking after a removal in a break", () => {
  /** 10 tanks, 8 go through round 1, the final decides; `remove` picks whom the owner removes in the break. */
  async function gameWithRemoval(t: TestServer, remove: (arena: PublicArena) => string) {
    const { arenaId, cookie } = await createTestArena(t, { kind: "presenter" });
    for (let i = 1; i <= 10; i++) await joinTestPlayer(t, arenaId, `Player ${i}`);
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    const removed = remove(await getArena(t, arenaId));
    expect((await t.api(`/api/arenas/${arenaId}/players/${removed}`, { method: "DELETE", cookie })).status).toBe(204);
    await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie });
    playRound(t);
    const finished = await getArena(t, arenaId);
    if (finished.phase.kind !== "finished" || finished.phase.resultId === null) throw new Error("expected a stored result");
    const result = await json<ResultResponse>(await t.api(`/api/results/${finished.phase.resultId}`));
    const finishedPlaces = finished.players
      .map((p) => (p.status.kind === "winner" ? 1 : p.status.kind === "eliminated" ? p.status.finalRank : null))
      .filter((place): place is number => place !== null)
      .sort((a, b) => a - b);
    return { finishedPlaces, storedPlaces: result.result.ranking.map((r) => r.place), removed, result: result.result };
  }

  test("a removed tank that went through leaves no gap, and the arena loads again after a restart", async () => {
    const dataDir = temporaryDirectory();
    const t = start({ dataDir });
    const { finishedPlaces, storedPlaces, removed, result } = await gameWithRemoval(t, (arena) => arena.rounds[0]!.survivors[2]!);
    expect(finishedPlaces).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await stopServer(t);
    const again = start({ dataDir });
    expect((await getArena(again, result.arenaId)).phase.kind).toBe("finished");
    expect(storedPlaces).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.ranking.map((r) => r.playerId)).not.toContain(removed);
  });

  test("a removed tank that was already out leaves no gap", async () => {
    const t = start();
    const { finishedPlaces, storedPlaces } = await gameWithRemoval(t, (arena) => {
      const out = arena.rounds[0]!.standings.find((s) => s.rank === 9);
      if (out === undefined) throw new Error("expected a 9th place");
      return out.botId;
    });
    expect(finishedPlaces).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(storedPlaces).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("stored result", () => {
  async function finishedGame(t: TestServer) {
    const arena = await createTestArena(t, { kind: "presenter", settings: settings("account") });
    const people: { cookie: string; seat: JoinResponse }[] = [];
    for (let i = 1; i <= 9; i++) {
      const cookie = await account(t, `player${i}.${arena.arenaId}@example.org`);
      people.push({ cookie, seat: await json<JoinResponse>(await joinAs(t, arena.arenaId, `Player ${i}`, cookie)) });
    }
    await t.api(`/api/arenas/${arena.arenaId}/rounds`, { method: "POST", cookie: arena.cookie });
    playRound(t);
    await t.api(`/api/arenas/${arena.arenaId}/rounds`, { method: "POST", cookie: arena.cookie });
    playRound(t);
    const finished = await getArena(t, arena.arenaId);
    if (finished.phase.kind !== "finished" || finished.phase.resultId === null) throw new Error("expected a stored result");
    return { ...arena, people, finished, resultId: finished.phase.resultId };
  }

  test("the row holds the arena, every round, the ranking and each human's account, and no email", async () => {
    const dataDir = temporaryDirectory();
    const t = start({ dataDir });
    const { arenaId, finished, resultId, people } = await finishedGame(t);
    const db = openDatabase({ kind: "file", dataDir });
    const row = db.query<{ document_json: string }, [string]>("SELECT document_json FROM result WHERE id = ?").get(resultId);
    db.close();
    if (row === null) throw new Error("no result row");
    const file = JSON.parse(row.document_json);
    expect(file.result).toMatchObject({ id: resultId, arenaId, arenaName: SETTINGS.name, kind: "presenter", game: 1, ruleSetMode: "standard", joinPolicy: "account", ticksPerRound: SETTINGS.ticksPerRound, tickMs: SETTINGS.tickMs });
    expect(file.result.rounds).toHaveLength(2);
    expect(file.result.rounds[0].survivors).toHaveLength(8);
    expect(file.result.ranking[0].playerId).toBe(finished.phase.kind === "finished" ? finished.phase.winnerId : "");
    expect(file.result.ranking.map((r: { place: number }) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(file.accounts).toHaveLength(9);
    expect(row.document_json).not.toContain("@example.org");
    expect(people).toHaveLength(9);
  });

  test("the owner's list, newest first; the 180-day prune; and the ended arena's link to its result", async () => {
    const dataDir = temporaryDirectory();
    const t = start({ dataDir });
    const { arenaId, cookie, resultId } = await finishedGame(t);
    const list = await json<AccountResultsResponse>(await t.api("/api/account/results", { cookie }));
    expect(list.results.map((r) => r.id)).toEqual([resultId]);
    expect(list.results[0]).toMatchObject({ players: 9, rounds: 2, kind: "presenter" });
    expect((await t.api("/api/account/results")).status).toBe(401);

    await t.api(`/api/arenas/${arenaId}`, { method: "DELETE", cookie });
    const gone = await t.api(`/api/arenas/${arenaId}`);
    expect(gone.status).toBe(404);
    expect((await json<ErrorResponse>(gone)).resultId).toBe(resultId);

    t.ticks.advance(RESULT_KEEP_MS + 11 * 60_000);
    t.ticks.tick();
    expect((await t.api(`/api/results/${resultId}`)).status).toBe(404);
    const db = openDatabase({ kind: "file", dataDir });
    expect(db.query<{ id: string }, [string]>("SELECT id FROM result WHERE id = ?").get(resultId)).toBeNull();
    db.close();
  });

  test("a result survives a restart, and an unknown or malformed id is 404", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { resultId } = await finishedGame(first);
    await stopServer(first);
    const second = start({ dataDir });
    expect((await json<ResultResponse>(await second.api(`/api/results/${resultId}`))).result.id).toBe(resultId);
    expect((await second.api("/api/results/..%2F..%2Fetc")).status).toBe(404);
    expect((await second.api("/api/results/AAAAAAAAAAAAAAAAAAAAAA")).status).toBe(404);
  });

  test("a public arena is open to anyone and has no start plan of an owner", async () => {
    const t = start();
    const arena: PublicArena = await getArena(t, (await json<{ arenaId: string }>(await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } }))).arenaId);
    expect(arena.settings.joinPolicy).toBe("anyone");
    expect(arena.phase).toMatchObject({ kind: "lobby", start: { kind: "waiting" } });
  });
});
