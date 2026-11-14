// Arena chat through the routes (chat.ts, chat-routes.ts): the state table row by row, both rate
// limits, retention and the cap, the file across a restart, who gets `chat` on the stream, the
// block list, and removing a player.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHAT_LIMITS, plainTankLook, type ChatHistoryResponse, type ChatMessage, type ErrorResponse, type JoinResponse, type StreamMessage } from "@game/arena";
import { CHAT_FOLDER } from "./chat.ts";
import {
  createTestArena,
  getArena,
  joinTestPlayer,
  openStream,
  SETTINGS,
  signUp,
  startTestServer,
  type StreamReader,
  type TestArena,
  type TestServer,
  type TestServerOptions,
} from "./test-helpers.ts";

const HOUR_MS = 60 * 60 * 1000;
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
  const t = startTestServer(options);
  open.push(t);
  return t;
}

async function stopServer(t: TestServer): Promise<void> {
  open.splice(open.indexOf(t), 1);
  await t.server.stop();
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-chat-"));
  directories.push(directory);
  return directory;
}

async function stream(t: TestServer, arenaId: string, token?: string, cookie?: string, params?: Readonly<Record<string, string>>): Promise<StreamReader> {
  const reader = await openStream(t, arenaId, token, cookie, params);
  streams.push(reader);
  return reader;
}

/** Who calls: a player token, the owner's cookie, or nobody. */
type Caller = { readonly token: string } | { readonly cookie: string } | null;

function post(t: TestServer, arenaId: string, caller: Caller, text: unknown): Promise<Response> {
  return t.api(`/api/arenas/${arenaId}/chat`, { method: "POST", ...(caller ?? {}), body: { text } });
}

function history(t: TestServer, arenaId: string, caller: Caller): Promise<Response> {
  return t.api(`/api/arenas/${arenaId}/chat`, { ...(caller ?? {}) });
}

async function texts(t: TestServer, arenaId: string, caller: Caller): Promise<string[]> {
  const res = await history(t, arenaId, caller);
  expect(res.status).toBe(200);
  return ((await res.json()) as ChatHistoryResponse).messages.map((m) => m.text);
}

function setChat(t: TestServer, arena: TestArena, on: boolean): Promise<Response> {
  return t.api(`/api/arenas/${arena.arenaId}/chat`, { method: "PUT", cookie: arena.cookie, body: { on } });
}

const codeOf = async (res: Response) => ((await res.json()) as ErrorResponse).code;

/** A private arena with two players. */
async function privateLobby(t: TestServer): Promise<{ arena: TestArena; ana: JoinResponse; budi: JoinResponse }> {
  const arena = await createTestArena(t, { kind: "private" });
  const ana = await joinTestPlayer(t, arena.arenaId, "Ana", plainTankLook(3));
  const budi = await joinTestPlayer(t, arena.arenaId, "Budi");
  return { arena, ana, budi };
}

function playRound(t: TestServer): void {
  for (let i = 0; i < SETTINGS.ticksPerRound + 1; i++) t.ticks.tick();
}

describe("the state table", () => {
  test.each(["private", "presenter"] as const)("a %s lobby: a player and the owner read and post; the owner posts as the host", async (kind) => {
    const t = start();
    const arena = await createTestArena(t, { kind });
    const ana = await joinTestPlayer(t, arena.arenaId, "Ana", plainTankLook(3));
    expect((await getArena(t, arena.arenaId)).chat).toBe("on");

    const fromPlayer = await post(t, arena.arenaId, { token: ana.playerToken }, "  hai\nsemua  ");
    expect(fromPlayer.status).toBe(201);
    const message = (await fromPlayer.json()) as ChatMessage;
    expect(message).toMatchObject({ text: "hai semua", at: t.ticks.now(), sender: { kind: "player", playerId: ana.playerId, name: "Ana", look: plainTankLook(3) } });
    const fromOwner = await post(t, arena.arenaId, { cookie: arena.cookie }, "Welcome!");
    expect(fromOwner.status).toBe(201);
    expect(((await fromOwner.json()) as ChatMessage).sender).toEqual({ kind: "host" });

    expect(await texts(t, arena.arenaId, { token: ana.playerToken })).toEqual(["hai semua", "Welcome!"]);
    expect(await texts(t, arena.arenaId, { cookie: arena.cookie })).toEqual(["hai semua", "Welcome!"]);
  });

  test("a viewer, a wrong token and another account can neither read nor post", async () => {
    const t = start();
    const { arena } = await privateLobby(t);
    const stranger = await signUp(t);
    for (const call of [(c: Caller) => history(t, arena.arenaId, c), (c: Caller) => post(t, arena.arenaId, c, "hi")]) {
      expect((await call(null)).status).toBe(401);
      expect((await call({ token: "not-a-token" })).status).toBe(403);
      const other = await call({ cookie: stranger });
      expect(other.status).toBe(403);
      expect(await codeOf(other)).toBe("not_owner");
    }
  });

  test("a running round closes posting and keeps reading; the finished game opens it again", async () => {
    const t = start();
    const { arena, ana } = await privateLobby(t);
    await post(t, arena.arenaId, { token: ana.playerToken }, "before");
    expect((await t.api(`/api/arenas/${arena.arenaId}/rounds`, { method: "POST", cookie: arena.cookie })).status).toBe(204);

    for (const caller of [{ token: ana.playerToken }, { cookie: arena.cookie }]) {
      const refused = await post(t, arena.arenaId, caller, "during");
      expect(refused.status).toBe(409);
      expect(await codeOf(refused)).toBe("chat_closed");
      expect(await texts(t, arena.arenaId, caller)).toEqual(["before"]);
    }

    playRound(t);
    expect((await getArena(t, arena.arenaId)).phase.kind).toBe("finished");
    expect((await post(t, arena.arenaId, { token: ana.playerToken }, "gg")).status).toBe(201);
  });

  test("the break between two rounds is open", async () => {
    const t = start();
    const arena = await createTestArena(t, { kind: "presenter" });
    const players: JoinResponse[] = [];
    for (let i = 1; i <= 9; i++) players.push(await joinTestPlayer(t, arena.arenaId, `Player ${i}`));
    await t.api(`/api/arenas/${arena.arenaId}/rounds`, { method: "POST", cookie: arena.cookie });
    playRound(t);
    expect((await getArena(t, arena.arenaId)).phase.kind).toBe("break");
    // An eliminated player is still a player of the arena.
    for (const player of players) expect((await post(t, arena.arenaId, { token: player.playerToken }, "next round?")).status).toBe(201);
  });

  test("the owner turns the chat off in any phase: nobody reads or posts, and on brings the history back", async () => {
    const t = start();
    const { arena, ana } = await privateLobby(t);
    await post(t, arena.arenaId, { token: ana.playerToken }, "kept");
    const watcher = await stream(t, arena.arenaId);

    expect((await setChat(t, arena, false)).status).toBe(204);
    await watcher.waitFor((m) => m.type === "arena" && m.arena.chat === "off");
    for (const caller of [{ token: ana.playerToken }, { cookie: arena.cookie }]) {
      for (const res of [await history(t, arena.arenaId, caller), await post(t, arena.arenaId, caller, "hello")]) {
        expect(res.status).toBe(409);
        expect(await codeOf(res)).toBe("chat_off");
      }
    }

    await t.api(`/api/arenas/${arena.arenaId}/rounds`, { method: "POST", cookie: arena.cookie });
    // Off wins over a running round, so the page tells the reason the owner chose.
    expect(await codeOf(await post(t, arena.arenaId, { token: ana.playerToken }, "hello"))).toBe("chat_off");
    expect((await setChat(t, arena, true)).status).toBe(204);
    expect((await getArena(t, arena.arenaId)).chat).toBe("on");
    expect(await texts(t, arena.arenaId, { token: ana.playerToken })).toEqual(["kept"]);
  });

  test("only the owner switches the chat, and the body must say on or off", async () => {
    const t = start();
    const { arena, ana } = await privateLobby(t);
    const path = `/api/arenas/${arena.arenaId}/chat`;
    expect((await t.api(path, { method: "PUT", token: ana.playerToken, body: { on: false } })).status).toBe(401);
    expect(await codeOf(await t.api(path, { method: "PUT", cookie: await signUp(t), body: { on: false } }))).toBe("not_owner");
    expect((await t.api(path, { method: "PUT", cookie: arena.cookie, body: { on: "no" } })).status).toBe(400);
    expect((await getArena(t, arena.arenaId)).chat).toBe("on");
  });

  test("a public arena has no chat: every chat route answers 404 no_chat, even to a player", async () => {
    const t = start();
    const { arenaId } = (await (await t.api("/api/public/seat", { method: "POST", body: { kind: "practice" } })).json()) as { arenaId: string };
    const player = await joinTestPlayer(t, arenaId, "Ana");
    expect((await getArena(t, arenaId)).chat).toBeNull();
    for (const res of [
      await history(t, arenaId, { token: player.playerToken }),
      await post(t, arenaId, { token: player.playerToken }, "hi"),
      await t.api(`/api/arenas/${arenaId}/chat`, { method: "PUT", cookie: await signUp(t), body: { on: true } }),
      await history(t, arenaId, null),
    ]) {
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe("no_chat");
    }
  });
});

describe("text", () => {
  test("a line that is empty, too long or not text is 400 chat_text_invalid", async () => {
    const t = start();
    const { arena, ana } = await privateLobby(t);
    for (const text of ["", "   \n ", "x".repeat(CHAT_LIMITS.textMax + 1), 42, null]) {
      const res = await post(t, arena.arenaId, { token: ana.playerToken }, text);
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe("chat_text_invalid");
    }
    expect((await post(t, arena.arenaId, { token: ana.playerToken }, "x".repeat(CHAT_LIMITS.textMax))).status).toBe(201);
  });

  test("a blocked line is 422 chat_text_blocked, and it is neither stored nor sent", async () => {
    const t = start();
    const { arena, ana, budi } = await privateLobby(t);
    const reader = await stream(t, arena.arenaId, budi.playerToken);
    const res = await post(t, arena.arenaId, { token: ana.playerToken }, "dasar g0bl0k");
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe("chat_text_blocked");
    await post(t, arena.arenaId, { token: ana.playerToken }, "maaf");
    await reader.waitFor((m) => m.type === "chat");
    expect(reader.messages.filter((m) => m.type === "chat").map((m) => (m.type === "chat" ? m.message.text : ""))).toEqual(["maaf"]);
    expect(await texts(t, arena.arenaId, { token: budi.playerToken })).toEqual(["maaf"]);
  });
});

describe("rate limits", () => {
  test("a sender gets 5 at once; the 6th waits 3 seconds, and passes after the wait", async () => {
    const t = start();
    const { arena, ana, budi } = await privateLobby(t);
    for (let i = 1; i <= 5; i++) expect((await post(t, arena.arenaId, { token: ana.playerToken }, `line ${i}`)).status).toBe(201);
    const refused = await post(t, arena.arenaId, { token: ana.playerToken }, "line 6");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("3");
    expect((await refused.json()) as ErrorResponse).toMatchObject({ code: "chat_too_fast", retryAfterMs: 3000 });
    // Another sender is not slowed down by Ana.
    expect((await post(t, arena.arenaId, { token: budi.playerToken }, "hi")).status).toBe(201);

    t.ticks.advance(2999);
    expect((await post(t, arena.arenaId, { token: ana.playerToken }, "line 6")).status).toBe(429);
    t.ticks.advance(1);
    expect((await post(t, arena.arenaId, { token: ana.playerToken }, "line 6")).status).toBe(201);
    expect((await post(t, arena.arenaId, { token: ana.playerToken }, "line 7")).status).toBe(429);
  });

  test("the arena gets 20 at once from many senders; then the 21st waits 200 ms without spending its sender's token", async () => {
    const t = start();
    const arena = await createTestArena(t, { kind: "presenter" });
    const players: JoinResponse[] = [];
    for (let i = 1; i <= 5; i++) players.push(await joinTestPlayer(t, arena.arenaId, `Player ${i}`));
    for (const player of players.slice(0, 4)) {
      for (let i = 0; i < 5; i++) expect((await post(t, arena.arenaId, { token: player.playerToken }, "hi")).status).toBe(201);
    }
    const last = players[4]!;
    const busy = await post(t, arena.arenaId, { token: last.playerToken }, "me too");
    expect(busy.status).toBe(429);
    expect(busy.headers.get("retry-after")).toBe("1");
    expect((await busy.json()) as ErrorResponse).toMatchObject({ code: "chat_busy", retryAfterMs: 200 });

    // 5 per second: one line every 200 ms. The refusal spent nothing, so the sender still has 5.
    for (let i = 0; i < 5; i++) {
      t.ticks.advance(200);
      expect((await post(t, arena.arenaId, { token: last.playerToken }, `me too ${i}`)).status).toBe(201);
    }
    t.ticks.advance(200);
    expect(await codeOf(await post(t, arena.arenaId, { token: last.playerToken }, "one more"))).toBe("chat_too_fast");
  });
});

describe("retention", () => {
  test("a message older than 24 hours is gone from the history and, after the sweep, from the file", async () => {
    const dataDir = temporaryDirectory();
    // The arena itself must outlive the test's two days, so the sweep prunes the chat instead of closing the arena.
    const t = start({ dataDir, arenaTtlHours: 100 });
    const { arena, ana } = await privateLobby(t);
    await post(t, arena.arenaId, { token: ana.playerToken }, "old");
    t.ticks.advance(12 * HOUR_MS);
    await post(t, arena.arenaId, { token: ana.playerToken }, "new");
    const file = join(dataDir, CHAT_FOLDER, `${arena.arenaId}.json`);
    const inFile = () => (JSON.parse(readFileSync(file, "utf8")) as { messages: ChatMessage[] }).messages.map((m) => m.text);
    expect(inFile()).toEqual(["old", "new"]);

    t.ticks.advance(12 * HOUR_MS);
    expect(await texts(t, arena.arenaId, { token: ana.playerToken })).toEqual(["old", "new"]);
    t.ticks.advance(1000);
    t.ticks.tick(); // the 10-minute sweep
    expect(inFile()).toEqual(["new"]);
    expect(await texts(t, arena.arenaId, { token: ana.playerToken })).toEqual(["new"]);
  });

  test("a read prunes too, without waiting for the sweep", async () => {
    const t = start({ arenaTtlHours: 100 });
    const { arena, ana } = await privateLobby(t);
    await post(t, arena.arenaId, { token: ana.playerToken }, "old");
    t.ticks.advance(24 * HOUR_MS + 1000);
    expect(await texts(t, arena.arenaId, { token: ana.playerToken })).toEqual([]);
  });

  test("an arena keeps its newest 500 messages, and GET answers the newest 100, oldest first", async () => {
    const dataDir = temporaryDirectory();
    const t = start({ dataDir });
    const arena = await createTestArena(t, { kind: "presenter" });
    const player = await joinTestPlayer(t, arena.arenaId, "Ana");
    for (let i = 1; i <= CHAT_LIMITS.keepCount + 1; i++) {
      // One line every 3 seconds is the sender's steady pace.
      t.ticks.advance(3000);
      expect((await post(t, arena.arenaId, { token: player.playerToken }, `line ${i}`)).status).toBe(201);
    }
    const shown = await texts(t, arena.arenaId, { token: player.playerToken });
    expect(shown.length).toBe(CHAT_LIMITS.pageSize);
    expect(shown[0]).toBe(`line ${CHAT_LIMITS.keepCount + 1 - CHAT_LIMITS.pageSize + 1}`);
    expect(shown.at(-1)).toBe(`line ${CHAT_LIMITS.keepCount + 1}`);
    await stopServer(t);
    const saved = (JSON.parse(readFileSync(join(dataDir, CHAT_FOLDER, `${arena.arenaId}.json`), "utf8")) as { messages: ChatMessage[] }).messages;
    expect(saved.length).toBe(CHAT_LIMITS.keepCount);
    expect(saved[0]!.text).toBe("line 2");
  });

  test("closing the arena removes its chat file", async () => {
    const dataDir = temporaryDirectory();
    const t = start({ dataDir });
    const { arena, ana } = await privateLobby(t);
    await post(t, arena.arenaId, { token: ana.playerToken }, "bye");
    const file = join(dataDir, CHAT_FOLDER, `${arena.arenaId}.json`);
    expect(existsSync(file)).toBe(true);
    expect((await t.api(`/api/arenas/${arena.arenaId}`, { method: "DELETE", cookie: arena.cookie })).status).toBe(204);
    expect(existsSync(file)).toBe(false);
  });
});

describe("the file", () => {
  test("a restart keeps the chat, the last second included, and the file holds no player token", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arena, ana } = await privateLobby(first);
    await post(first, arena.arenaId, { token: ana.playerToken }, "one");
    // Within the second after the first write, so only the shutdown's flush writes it.
    await post(first, arena.arenaId, { cookie: arena.cookie }, "two");
    await stopServer(first);
    const text = readFileSync(join(dataDir, CHAT_FOLDER, `${arena.arenaId}.json`), "utf8");
    expect(text).not.toContain(ana.playerToken);

    const second = start({ dataDir });
    expect(await texts(second, arena.arenaId, { token: ana.playerToken })).toEqual(["one", "two"]);
  });

  test("a damaged chat file stops the start with its name", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arena, ana } = await privateLobby(first);
    await post(first, arena.arenaId, { token: ana.playerToken }, "hi");
    await stopServer(first);
    const file = join(dataDir, CHAT_FOLDER, `${arena.arenaId}.json`);
    writeFileSync(file, JSON.stringify({ version: 1, messages: [{ id: "m1", at: 1, sender: { kind: "host" }, text: "a\nb" }] }));
    expect(() => startTestServer({ dataDir })).toThrow(file);
  });

  test("a chat file whose arena is gone is removed at start", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const { arena, ana } = await privateLobby(first);
    await post(first, arena.arenaId, { token: ana.playerToken }, "hi");
    await stopServer(first);
    rmSync(join(dataDir, "arenas", `${arena.arenaId}.json`));
    start({ dataDir });
    expect(existsSync(join(dataDir, CHAT_FOLDER, `${arena.arenaId}.json`))).toBe(false);
  });
});

describe("the stream", () => {
  const chatTexts = (reader: StreamReader) => reader.messages.flatMap((m: StreamMessage) => (m.type === "chat" ? [m.message.text] : []));

  test("players and the owner get `chat`; a viewer and another signed-in account do not", async () => {
    const t = start();
    const { arena, ana, budi } = await privateLobby(t);
    const player = await stream(t, arena.arenaId, budi.playerToken);
    const owner = await stream(t, arena.arenaId, undefined, arena.cookie);
    const viewer = await stream(t, arena.arenaId);
    const stranger = await stream(t, arena.arenaId, undefined, await signUp(t));

    await post(t, arena.arenaId, { token: ana.playerToken }, "halo");
    await player.waitFor((m) => m.type === "chat");
    await owner.waitFor((m) => m.type === "chat");
    // A later arena message proves the viewers' streams were sent everything before it.
    await setChat(t, arena, false);
    for (const reader of [viewer, stranger]) await reader.waitFor((m) => m.type === "arena" && m.arena.chat === "off");
    expect(chatTexts(player)).toEqual(["halo"]);
    expect(chatTexts(owner)).toEqual(["halo"]);
    expect(chatTexts(viewer)).toEqual([]);
    expect(chatTexts(stranger)).toEqual([]);
  });

  test("the owner's stream with chat=0 (the big screen in the owner's browser) gets neither `chat` nor `chatRemoved`", async () => {
    const t = start();
    const { arena, ana, budi } = await privateLobby(t);
    const screen = await stream(t, arena.arenaId, undefined, arena.cookie, { chat: "0" });
    const owner = await stream(t, arena.arenaId, undefined, arena.cookie);

    await post(t, arena.arenaId, { token: budi.playerToken }, "halo");
    await owner.waitFor((m) => m.type === "chat");
    expect((await t.api(`/api/arenas/${arena.arenaId}/players/${ana.playerId}`, { method: "DELETE", cookie: arena.cookie })).status).toBe(204);
    await owner.waitFor((m) => m.type === "chatRemoved");
    // A later arena message proves the screen's stream was sent everything before it.
    await setChat(t, arena, false);
    await screen.waitFor((m) => m.type === "arena" && m.arena.chat === "off");
    expect(screen.messages.some((m) => m.type === "chat" || m.type === "chatRemoved")).toBe(false);
  });

  test("removing a player removes their messages, sends chatRemoved, and their open stream gets no more chat", async () => {
    const t = start();
    const { arena, ana, budi } = await privateLobby(t);
    const removedStream = await stream(t, arena.arenaId, ana.playerToken);
    const other = await stream(t, arena.arenaId, budi.playerToken);
    await post(t, arena.arenaId, { token: ana.playerToken }, "rude line");
    await post(t, arena.arenaId, { token: budi.playerToken }, "hey");

    expect((await t.api(`/api/arenas/${arena.arenaId}/players/${ana.playerId}`, { method: "DELETE", cookie: arena.cookie })).status).toBe(204);
    await other.waitFor((m) => m.type === "chatRemoved" && m.playerId === ana.playerId);
    expect(await texts(t, arena.arenaId, { token: budi.playerToken })).toEqual(["hey"]);

    await post(t, arena.arenaId, { token: budi.playerToken }, "after");
    await other.waitFor((m) => m.type === "chat" && m.message.text === "after");
    await setChat(t, arena, false);
    await removedStream.waitFor((m) => m.type === "arena" && m.arena.chat === "off");
    expect(chatTexts(removedStream)).toEqual(["rude line", "hey"]);
    expect(removedStream.messages.some((m) => m.type === "chatRemoved")).toBe(false);
  });

  test("a player who leaves keeps their messages, under the name they had", async () => {
    const t = start();
    const { arena, ana, budi } = await privateLobby(t);
    await post(t, arena.arenaId, { token: ana.playerToken }, "see you");
    expect((await t.api(`/api/arenas/${arena.arenaId}/players/me/leave`, { method: "POST", token: ana.playerToken })).status).toBe(204);
    const res = await history(t, arena.arenaId, { token: budi.playerToken });
    const [message] = ((await res.json()) as ChatHistoryResponse).messages;
    expect(message).toMatchObject({ text: "see you", sender: { kind: "player", playerId: ana.playerId, name: "Ana" } });
  });
});
