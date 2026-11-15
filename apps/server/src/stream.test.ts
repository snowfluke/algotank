import { plainTankLook } from "@game/arena";
import { describe, expect, spyOn, test } from "bun:test";
import type { CompactTick, PublicArena, StreamMessage } from "@game/arena";
import { DEFAULT_ARENA_MESSAGE_INTERVAL_MS, encodeMessage, encodeTickMessage, MAX_QUEUED_BYTES, StreamHub } from "./stream.ts";
import { manualScheduler, type ManualScheduler } from "./test-helpers.ts";
import type { Clock } from "./timers.ts";

function hubWith(maxStreamsPerArena: number, now: Clock = Date.now, scheduler: ManualScheduler = manualScheduler(), arenaMessageIntervalMs = 0): StreamHub {
  return new StreamHub({ heartbeatMs: 60_000, maxStreamsPerArena, now, scheduler, arenaMessageIntervalMs });
}

test("encodeTickMessage gives the same bytes as encoding the typed message", () => {
  const tick: CompactTick = {
    tick: 3,
    bots: [[1, 2, 0, 0, 9, 0, 0, 0], [3, 2, 6, 0, 6, 0, 1, 0]],
    moves: [[1, 5], [0, 0]],
    throws: [[1, 3, 0, 2, 60]],
    items: [[0, 4, 4, 12]],
    pickups: [[0, 1]],
  };
  const own = { botId: "a", modeId: "m", ruleId: null, actionId: "x", move: "F" as const, nextModeId: "m" };
  for (const decision of [own, null]) {
    const typed: StreamMessage = { type: "tick", round: 2, tick, own: decision };
    expect(encodeTickMessage(2, JSON.stringify(tick), decision)).toEqual(encodeMessage(typed));
  }
});

/** About 20 KB when serialized, like the tick of a large arena. */
function bigArena(id: string): PublicArena {
  return {
    id,
    settings: { name: "Big", kind: "presenter", ticksPerRound: 20, tickMs: 100, ruleSetMode: "standard", botFill: false, joinPolicy: "anyone", tankCount: 512 },
    players: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, status: { kind: "playing" as const }, isBot: false, look: plainTankLook(1), ready: false })),
    phase: { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } },
    rounds: [],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: "on",
  };
}

test("drops a client that does not read once its queue passes the byte limit, frees the queue and logs it", async () => {
  const hub = hubWith(10);
  const errors = spyOn(console, "error").mockImplementation(() => {});
  try {
    const stalled = hub.open("A", null, []);
    const reader = hub.open("A", null, []).body?.getReader();
    expect(hub.connectionCount("A")).toBe(2);

    const chunkBytes = encodeMessage({ type: "arena", arena: bigArena("A") }).byteLength;
    const sends = Math.ceil(MAX_QUEUED_BYTES / chunkBytes) + 2;
    for (let i = 0; i < sends; i++) {
      hub.sendArena(bigArena("A"));
      // The second client reads everything, so only the first one stalls.
      await reader?.read();
    }
    expect(hub.connectionCount("A")).toBe(1);
    // The stalled client sees an error, not the queued chunks.
    await expect(stalled.body?.getReader().read()).rejects.toThrow();
    expect(errors).toHaveBeenCalledTimes(1);
  } finally {
    errors.mockRestore();
    hub.closeAll();
  }
});

test("a client that reads is never dropped", async () => {
  const hub = hubWith(10);
  try {
    const reader = hub.open("A", null, []).body?.getReader();
    for (let i = 0; i < 100; i++) {
      hub.sendArena(bigArena("A"));
      await reader?.read();
    }
    expect(hub.connectionCount("A")).toBe(1);
  } finally {
    hub.closeAll();
  }
});

test("open refuses a connection above the limit of one arena and counts arenas apart", () => {
  const hub = hubWith(2);
  try {
    hub.open("A", null, []);
    hub.open("A", null, []);
    expect(() => hub.open("A", null, [])).toThrow(expect.objectContaining({ status: 429 }));
    expect(() => hub.open("B", null, [])).not.toThrow();
    expect(hub.connectionCount("A")).toBe(2);
  } finally {
    hub.closeAll();
  }
});

test("closeArena sends `closed` to every stream of the arena, ends them, and leaves other arenas open", async () => {
  const hub = hubWith(10);
  try {
    const first = hub.open("A", null, []).body!.getReader();
    const second = hub.open("A", "p1", []).body!.getReader();
    hub.open("B", null, []);
    hub.closeArena("A");
    const closed = new TextDecoder().decode(encodeMessage({ type: "closed" }));
    for (const reader of [first, second]) {
      const chunk = await reader.read();
      expect(new TextDecoder().decode(chunk.value)).toBe(closed);
      expect((await reader.read()).done).toBe(true);
    }
    expect(hub.connectionCount("A")).toBe(0);
    expect(hub.connectionCount("B")).toBe(1);
    expect(hub.presenceOf("A", "p1")).toEqual({ open: false, lastSeenAt: null });
  } finally {
    hub.closeAll();
  }
});

test("presence: open while a stream is open, and the time the last one closed", async () => {
  let time = 1000;
  const hub = hubWith(10, () => time);
  try {
    expect(hub.presenceOf("A", "p1")).toEqual({ open: false, lastSeenAt: null });
    hub.markSeen("A", "p1");
    expect(hub.presenceOf("A", "p1")).toEqual({ open: false, lastSeenAt: 1000 });

    const one = hub.open("A", "p1", []).body!;
    const two = hub.open("A", "p1", []).body!;
    expect(hub.presenceOf("A", "p1").open).toBe(true);
    time = 2000;
    await one.cancel();
    expect(hub.presenceOf("A", "p1").open).toBe(true);
    time = 3000;
    await two.cancel();
    expect(hub.presenceOf("A", "p1")).toEqual({ open: false, lastSeenAt: 3000 });
    // A viewer without a token has no presence.
    hub.open("A", null, []);
    expect(hub.presenceOf("A", "p1").open).toBe(false);
  } finally {
    hub.closeAll();
  }
});

describe("arena messages that change only the player list", () => {
  const decoder = new TextDecoder();
  /** The arena messages one stream received, as arenas. */
  async function received(reader: ReadableStreamDefaultReader<Uint8Array>, count: number): Promise<PublicArena[]> {
    const arenas: PublicArena[] = [];
    while (arenas.length < count) {
      const chunk = await reader.read();
      if (chunk.done) break;
      for (const block of decoder.decode(chunk.value).split("\n\n")) {
        const data = block.split("\n").find((line) => line.startsWith("data: "));
        if (block.startsWith("event: arena") && data !== undefined) arenas.push((JSON.parse(data.slice(6)) as { arena: PublicArena }).arena);
      }
    }
    return arenas;
  }
  const lobby = bigArena("A");
  const withPlayers = (count: number): PublicArena => ({ ...lobby, players: lobby.players.slice(0, count) });

  test("go out at most once per interval, as the newest list, and a phase change goes out at once", async () => {
    const clock = manualScheduler();
    const hub = hubWith(10, clock.now, clock, DEFAULT_ARENA_MESSAGE_INTERVAL_MS);
    try {
      const reader = hub.open("A", null, []).body!.getReader();
      hub.sendArena(withPlayers(1)); // the first message goes out at once
      for (let count = 2; count <= 50; count++) {
        hub.sendArena(withPlayers(count));
        clock.advance(10);
      }
      // 49 joins in 490 ms: only the first message has gone out.
      expect((await received(reader, 1)).map((a) => a.players.length)).toEqual([1]);
      clock.advance(DEFAULT_ARENA_MESSAGE_INTERVAL_MS - 490);
      expect((await received(reader, 1)).map((a) => a.players.length)).toEqual([50]);

      // A join waits; the start of a round right after it goes out at once and carries the newer list.
      hub.sendArena(withPlayers(49));
      const running: PublicArena = { ...withPlayers(50), phase: { kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } } };
      hub.sendArena(running);
      expect((await received(reader, 1))[0]?.phase.kind).toBe("break");
      // Nothing older follows it.
      clock.advance(DEFAULT_ARENA_MESSAGE_INTERVAL_MS * 2);
      hub.sendArena({ ...running, game: 2 });
      expect((await received(reader, 1))[0]?.game).toBe(2);
    } finally {
      hub.closeAll();
    }
  });

  test("a join after a quiet interval goes out at once", async () => {
    const clock = manualScheduler();
    const hub = hubWith(10, clock.now, clock, DEFAULT_ARENA_MESSAGE_INTERVAL_MS);
    try {
      const reader = hub.open("A", null, []).body!.getReader();
      hub.sendArena(withPlayers(1));
      clock.advance(DEFAULT_ARENA_MESSAGE_INTERVAL_MS);
      hub.sendArena(withPlayers(2));
      expect((await received(reader, 2)).map((a) => a.players.length)).toEqual([1, 2]);
    } finally {
      hub.closeAll();
    }
  });

  test("the owner turning the chat off goes out at once, also right after a join", async () => {
    const clock = manualScheduler();
    const hub = hubWith(10, clock.now, clock, DEFAULT_ARENA_MESSAGE_INTERVAL_MS);
    try {
      const reader = hub.open("A", null, []).body!.getReader();
      hub.sendArena(withPlayers(1));
      clock.advance(10);
      hub.sendArena({ ...withPlayers(1), chat: "off" });
      expect((await received(reader, 2)).map((a) => a.chat)).toEqual(["on", "off"]);
    } finally {
      hub.closeAll();
    }
  });
});

test("sendChat reaches the owner's stream and the members' streams, never a viewer or a player who is gone", async () => {
  const hub = hubWith(10);
  const decoder = new TextDecoder();
  try {
    const readers = {
      owner: hub.open("A", null, [], true).body!.getReader(),
      member: hub.open("A", "p1", []).body!.getReader(),
      gone: hub.open("A", "p2", []).body!.getReader(),
      viewer: hub.open("A", null, []).body!.getReader(),
    };
    hub.sendChat("A", { type: "chatRemoved", playerId: "p2" }, new Set(["p1"]));
    // A closing message after it shows what each stream holds up to there.
    hub.closeArena("A");
    const types: Record<string, string[]> = {};
    for (const [name, reader] of Object.entries(readers)) {
      types[name] = [];
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        for (const line of decoder.decode(chunk.value).split("\n")) if (line.startsWith("event: ")) types[name]!.push(line.slice(7));
      }
    }
    expect(types).toEqual({ owner: ["chatRemoved", "closed"], member: ["chatRemoved", "closed"], gone: ["closed"], viewer: ["closed"] });
  } finally {
    hub.closeAll();
  }
});

test("600 open streams: the hub holds them all and each gets its heartbeat", async () => {
  const hub = new StreamHub({ heartbeatMs: 25, maxStreamsPerArena: 600, now: Date.now, scheduler: manualScheduler(), arenaMessageIntervalMs: 0 });
  try {
    const readers = Array.from({ length: 600 }, (_, i) => hub.open("A", `p${i}`, []).body!.getReader());
    expect(hub.connectionCount("A")).toBe(600);
    expect(() => hub.open("A", null, [])).toThrow(expect.objectContaining({ status: 429 }));
    // Every stream receives its heartbeat.
    const beats = await Promise.all(readers.map((r) => r.read()));
    expect(beats.every((b) => new TextDecoder().decode(b.value) === ": keep-alive\n\n")).toBe(true);
  } finally {
    hub.closeAll();
  }
});
