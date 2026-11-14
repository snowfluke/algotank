import { plainTankLook } from "@game/arena";
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createArena, type ArenaSettings } from "@game/arena";
import { PRESETS } from "@game/engine";
import { ArenaRows } from "./arena-rows.ts";
import { PersistenceError } from "./db/errors.ts";
import { countRows, insertRow, memoryDatabase } from "./db/testing.ts";
import { AutoSteps } from "./auto-steps.ts";
import { PUBLIC_RULES } from "./public-kinds.ts";
import { replayGzip, replayJson } from "./replay.ts";
import { RoundRunner } from "./round-runner.ts";
import { announcementFor, ruleSetToStart } from "./rule-set-draw.ts";
import { ArenaGoneError, playerIdForToken, SAVE_INTERVAL_MS, Store, type ArenaRecord } from "./store.ts";
import { StreamHub } from "./stream.ts";
import { manualScheduler } from "./test-helpers.ts";

const TICKS = 20;
const SETTINGS: ArenaSettings = {
  name: "Saved",
  kind: "presenter",
  ticksPerRound: TICKS,
  tickMs: 100,
  ruleSetMode: "announced",
  botFill: false,
  joinPolicy: "anyone",
  tankCount: 512,
};
const OWNER = "account-1";

/** A store on `db` with a clock the test moves. A second store on the same database is what a restart finds. */
function storeOn(db: Database, clock = manualScheduler()): Store {
  return new Store({ db, now: clock.now, scheduler: clock });
}

let errors: ReturnType<typeof spyOn>;

beforeEach(() => {
  errors = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
});

/** An arena with `playerCount` players, each holding a token. */
let ownerNumber = 0;

function arenaIn(store: Store, playerCount: number, settings: ArenaSettings = SETTINGS, owner = `account-${++ownerNumber}`) {
  const added = store.add(createArena(store.newArenaId(), settings, announcementFor(settings.ruleSetMode, null)), owner);
  if (!added.ok) throw new Error(`the account already owns ${added.ownedArenaId}`);
  const record = added.record;
  for (let i = 1; i <= playerCount; i++) {
    const joined = store.addPlayer(
      record,
      { kind: "join", playerId: `p${i}`, name: `Player ${i}`, strategy: PRESETS[i % PRESETS.length]!.strategy, look: plainTankLook(1) },
      `token-${i}`,
      null,
    );
    if (!joined.ok) throw new Error(joined.error);
  }
  const ticks = manualScheduler();
  const runner = new RoundRunner(store, new StreamHub({ heartbeatMs: 60_000, maxStreamsPerArena: 10, now: ticks.now, scheduler: ticks, arenaMessageIntervalMs: 0 }), new AutoSteps(ticks, ticks.now, PUBLIC_RULES), { scheduler: ticks, now: ticks.now, startDelayMs: 0 });
  const start = (seed: number) => {
    const result = store.apply(record, { kind: "startRound", seed, ruleSetId: ruleSetToStart(record.arena) });
    if (!result.ok) throw new Error(result.error);
    runner.begin(record);
  };
  const play = () => {
    for (let i = 0; i < TICKS + 1; i++) ticks.tick();
  };
  return { record, start, play, runner };
}

/** The arena's snapshot as the database holds it. */
function snapshotOf(db: Database, record: ArenaRecord): string {
  const row = db.query<{ snapshot_json: string }, [string]>("SELECT snapshot_json FROM arena WHERE id = ?").get(record.arena.id);
  if (row === null) throw new Error(`arena ${record.arena.id} has no row`);
  return row.snapshot_json;
}

describe("saving and loading", () => {
  test("a second Store on the same database holds the same arena, tokens and replay", () => {
    const db = memoryDatabase();
    const first = storeOn(db);
    const { record, start, play } = arenaIn(first, 10);
    start(7);
    play();
    expect(record.arena.phase.kind).toBe("break");
    const replayBefore = replayJson(record, 1, "p1");
    const viewerBefore = replayJson(record, 1, null);
    expect(replayBefore).toBeDefined();

    const second = storeOn(db);
    const loaded = second.get(record.arena.id.toLowerCase());
    if (loaded === undefined) throw new Error("the arena was not loaded");

    expect(loaded.arena).toEqual(record.arena);
    expect(loaded.arena.phase).toMatchObject({ kind: "break", nextRound: 2 });
    expect(loaded.ownerAccountId).toBe(record.ownerAccountId);
    expect(loaded.lastActivityAt).toBe(record.lastActivityAt);
    expect(playerIdForToken(loaded, "token-3")).toBe("p3");
    expect(playerIdForToken(loaded, "nope")).toBeUndefined();
    expect(loaded.roundConfigs).toEqual(record.roundConfigs);

    // The replay cache is not saved: the loaded record recomputes it from the round config.
    expect(loaded.replays.size).toBe(0);
    expect(replayJson(loaded, 1, "p1")).toBe(replayBefore!);
    expect(replayJson(loaded, 1, null)).toBe(viewerBefore!);
    expect(new TextDecoder().decode(Bun.gunzipSync(replayGzip(loaded, 1, "p1")!))).toBe(replayBefore!);
  });

  test("a change made after the first restart is saved too (join, strategy, round config, completion)", () => {
    const db = memoryDatabase();
    const first = storeOn(db);
    const { record } = arenaIn(first, 3);

    const second = storeOn(db);
    const again = second.get(record.arena.id)!;
    const joined = second.addPlayer(again, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-9", null);
    expect(joined.ok).toBe(true);
    second.apply(again, { kind: "submitStrategy", playerId: "p1", strategy: PRESETS[1]!.strategy });
    // An edit waits for the coalesced save; a shutdown writes it.
    second.flush();

    const third = storeOn(db).get(record.arena.id)!;
    expect(third.arena.players.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p9"]);
    expect(playerIdForToken(third, "token-9")).toBe("p9");
    expect(third.arena.players[0]!.strategy).toEqual(PRESETS[1]!.strategy);
  });

  test("a rejected event writes nothing and changes nothing", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record } = arenaIn(store, 3);
    const before = snapshotOf(db, record);
    const rejected = store.addPlayer(record, { kind: "join", playerId: "x", name: "player 1", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-x", null);
    expect(rejected).toEqual({ ok: false, error: "name_taken" });
    expect(playerIdForToken(record, "token-x")).toBeUndefined();
    expect(snapshotOf(db, record)).toBe(before);
  });

  test("a finished arena loads, and its results and replay stay visible", () => {
    const db = memoryDatabase();
    const first = storeOn(db);
    const { record, start, play } = arenaIn(first, 4);
    start(3);
    play();
    expect(record.arena.phase.kind).toBe("finished");

    const loaded = storeOn(db).get(record.arena.id)!;
    expect(loaded.arena).toEqual(record.arena);
    expect(replayJson(loaded, 1, null)).toBe(replayJson(record, 1, null)!);
  });

  test("an arena that was running comes back aborted, with the announcement it had, and the round can start again", () => {
    const db = memoryDatabase();
    const first = storeOn(db);
    const { record, start } = arenaIn(first, 3);
    const announced = record.arena.phase.kind === "lobby" ? record.arena.phase.nextRuleSetId : null;
    start(5);
    expect(record.arena.phase).toMatchObject({ kind: "running", ruleSetId: announced });

    const second = storeOn(db);
    const loaded = second.get(record.arena.id)!;
    expect(loaded.arena.phase).toEqual({ kind: "lobby", nextRuleSetId: announced, start: { kind: "waiting" } });
    expect(loaded.arena.rounds).toEqual([]);
    // The abort is saved, so a third start sees it as well.
    expect(storeOn(db).get(record.arena.id)!.arena.phase).toEqual({ kind: "lobby", nextRuleSetId: announced, start: { kind: "waiting" } });

    const restarted = second.apply(loaded, { kind: "startRound", seed: 6, ruleSetId: ruleSetToStart(loaded.arena) });
    expect(restarted.ok).toBe(true);
  });

  test("a running round after a completed one comes back as the break of the same round", () => {
    const db = memoryDatabase();
    const first = storeOn(db);
    const { record, start, play } = arenaIn(first, 10);
    start(1);
    play();
    start(2);
    expect(record.arena.phase).toMatchObject({ kind: "running", round: 2 });

    const loaded = storeOn(db).get(record.arena.id)!;
    expect(loaded.arena.phase).toMatchObject({ kind: "break", nextRound: 2 });
    expect(loaded.arena.rounds).toHaveLength(1);
  });

  test("two arenas are two rows and both load", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    arenaIn(store, 2);
    arenaIn(store, 3);
    expect(countRows(db, "arena")).toBe(2);
    const loaded = storeOn(db);
    expect(loaded.size).toBe(2);
  });
});

describe("a save that fails", () => {
  /** The database refuses every write while `act` runs. */
  function withReadOnly(db: Database, act: () => void): void {
    db.run("PRAGMA query_only = ON");
    try {
      act();
    } finally {
      db.run("PRAGMA query_only = OFF");
    }
  }

  test("a join changes nothing, and the same name can join after the database takes writes again", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record } = arenaIn(store, 2);
    const join = () => store.addPlayer(record, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-9", null);

    withReadOnly(db, () => expect(join).toThrow(PersistenceError));
    expect(record.arena.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(playerIdForToken(record, "token-9")).toBeUndefined();

    expect(join().ok).toBe(true);
    expect(playerIdForToken(storeOn(db).get(record.arena.id)!, "token-9")).toBe("p9");
  });

  test("a start leaves the arena in the lobby, so the host can start the round again", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record, start } = arenaIn(store, 10);

    withReadOnly(db, () => expect(() => start(3)).toThrow(PersistenceError));
    expect(record.arena.phase.kind).toBe("lobby");

    start(3);
    expect(record.arena.phase.kind).toBe("running");
  });

  test("a round that completes still reaches the break in memory", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record, start, play } = arenaIn(store, 10);
    start(5);

    withReadOnly(db, play);
    expect(record.arena.phase.kind).toBe("break");
  });
});

describe("a damaged row stops the start", () => {
  function savedArena(): { db: Database; id: string; stored: string } {
    const db = memoryDatabase();
    const { record } = arenaIn(storeOn(db), 3);
    return { db, id: record.arena.id, stored: snapshotOf(db, record) };
  }

  function failureOf(db: Database): PersistenceError {
    try {
      storeOn(db);
    } catch (error) {
      if (error instanceof PersistenceError) return error;
      throw error;
    }
    throw new Error("expected the start to fail");
  }

  const replaceSnapshot = (db: Database, id: string, snapshot: string) => db.run("UPDATE arena SET snapshot_json = ? WHERE id = ?", [snapshot, id]);

  test("a snapshot that is not JSON fails with its table and key", () => {
    const { db, id } = savedArena();
    replaceSnapshot(db, id, "{ not json");
    expect(failureOf(db).message).toContain(`The row ${id} of the table arena is not valid: snapshot_json is not JSON`);
  });

  test("a snapshot with a wrong shape fails with its key and the part that is wrong", () => {
    const { db, id, stored } = savedArena();
    const plain = JSON.parse(stored);
    plain.arena.players[0].strategy = { modes: [], build: {} };
    replaceSnapshot(db, id, JSON.stringify(plain));
    const message = failureOf(db).message;
    expect(message).toContain(`The row ${id} of the table arena`);
    expect(message).toContain("arena.players[0].strategy");
  });

  test("an unknown version fails, and so does a row whose id is another arena's code", () => {
    const { db, id, stored } = savedArena();
    replaceSnapshot(db, id, JSON.stringify({ ...JSON.parse(stored), version: 9 }));
    expect(failureOf(db).message).toContain("version");

    replaceSnapshot(db, id, stored);
    insertRow(db, "arena", { id: "ZZZZZZ", kind: "presenter", owner_account_id: null, status: "lobby", updated_at: 0, snapshot_json: stored });
    expect(failureOf(db).message).toContain("The row ZZZZZZ of the table arena");
  });
});

describe("owners, removal and the activity time", () => {
  test("an account owns at most one arena, and removing it frees the account and the row", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record } = arenaIn(store, 1, SETTINGS, OWNER);
    const second = store.add(createArena(store.newArenaId(), SETTINGS, announcementFor(SETTINGS.ruleSetMode, null)), OWNER);
    expect(second).toEqual({ ok: false, ownedArenaId: record.arena.id });
    expect(store.ownedBy(OWNER)).toBe(record);

    store.remove(record);
    expect(store.get(record.arena.id)).toBeUndefined();
    expect(store.ownedBy(OWNER)).toBeUndefined();
    expect(countRows(db, "arena")).toBe(0);
    expect(arenaIn(store, 1, SETTINGS, OWNER).record.ownerAccountId).toBe(OWNER);
  });

  test("the UNIQUE owner index answers the same refusal when the memory check cannot see the other arena", () => {
    const db = memoryDatabase();
    // Both stores load the empty database, so neither holds the other's arena in memory.
    const first = storeOn(db);
    const second = storeOn(db);
    const owned = first.add(createArena(first.newArenaId(), SETTINGS, announcementFor(SETTINGS.ruleSetMode, null)), OWNER);
    if (!owned.ok) throw new Error("the first arena was refused");
    const refused = second.add(createArena(second.newArenaId(), SETTINGS, announcementFor(SETTINGS.ruleSetMode, null)), OWNER);
    expect(refused).toEqual({ ok: false, ownedArenaId: owned.record.arena.id });
    expect(second.size).toBe(0);
    expect(countRows(db, "arena")).toBe(1);
  });

  test("a record the store no longer holds is refused, so a late request cannot write a closed arena back", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record } = arenaIn(store, 1);
    store.remove(record);
    expect(() => store.addPlayer(record, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "t", null)).toThrow(ArenaGoneError);
    expect(countRows(db, "arena")).toBe(0);
  });

  test("every accepted event moves lastActivityAt; a rejected one does not", () => {
    const clock = manualScheduler();
    const store = storeOn(memoryDatabase(), clock);
    const { record } = arenaIn(store, 2);
    const created = record.lastActivityAt;
    clock.advance(5000);
    store.apply(record, { kind: "submitStrategy", playerId: "p1", strategy: PRESETS[1]!.strategy });
    expect(record.lastActivityAt).toBe(created + 5000);
    clock.advance(5000);
    store.apply(record, { kind: "submitStrategy", playerId: "nobody", strategy: PRESETS[1]!.strategy });
    expect(record.lastActivityAt).toBe(created + 5000);
  });

  test("a reset forgets the round configs and replays of the game that ended", () => {
    const store = storeOn(memoryDatabase());
    const { record, start, play } = arenaIn(store, 3);
    start(1);
    play();
    expect(replayJson(record, 1, null)).toBeDefined();
    store.apply(record, { kind: "reset", nextRuleSetId: announcementFor(SETTINGS.ruleSetMode, null) });
    expect(record.roundConfigs.size).toBe(0);
    expect(record.replays.size).toBe(0);
    expect(replayJson(record, 1, null)).toBeUndefined();
  });
});

describe("edits are coalesced: an arena is written at most once per second", () => {
  const strategyOnDisk = (db: Database, record: ArenaRecord, playerId: string) =>
    (JSON.parse(snapshotOf(db, record)) as { arena: { players: { id: string; strategy: unknown }[] } }).arena.players.find((p) => p.id === playerId)?.strategy;
  const edit = (store: Store, record: ArenaRecord, preset: number) =>
    store.apply(record, { kind: "submitStrategy", playerId: "p1", strategy: PRESETS[preset % PRESETS.length]!.strategy });

  test("50 edits within one second reach the row in one write, SAVE_INTERVAL_MS after the first", () => {
    const db = memoryDatabase();
    const clock = manualScheduler();
    const store = storeOn(db, clock);
    const { record } = arenaIn(store, 3);
    const before = strategyOnDisk(db, record, "p1");
    const writes = spyOn(ArenaRows.prototype, "write");
    try {
      for (let i = 0; i < 50; i++) {
        edit(store, record, i);
        clock.advance(10);
      }
      // 50 x 10 ms = 500 ms after the first edit: nothing written yet.
      expect(writes).toHaveBeenCalledTimes(0);
      expect(strategyOnDisk(db, record, "p1")).toEqual(before);
      clock.advance(SAVE_INTERVAL_MS - 500 - 1);
      expect(writes).toHaveBeenCalledTimes(0);
      clock.advance(1);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(strategyOnDisk(db, record, "p1")).toEqual(PRESETS[49 % PRESETS.length]!.strategy);
    } finally {
      writes.mockRestore();
    }
  });

  test("a crash loses at most the edits of the last second, and never a join", () => {
    const db = memoryDatabase();
    const clock = manualScheduler();
    const store = storeOn(db, clock);
    const { record } = arenaIn(store, 3);
    edit(store, record, 3);
    const joined = store.addPlayer(record, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-9", null);
    expect(joined.ok).toBe(true);
    edit(store, record, 2);
    clock.advance(SAVE_INTERVAL_MS - 1);

    // A second store on the database sees what a restart after a crash would find.
    const afterCrash = storeOn(db).get(record.arena.id)!;
    expect(playerIdForToken(afterCrash, "token-9")).toBe("p9");
    // The join wrote the edit before it; only the edit after the join is still waiting.
    expect(afterCrash.arena.players[0]!.strategy).toEqual(PRESETS[3]!.strategy);

    clock.advance(1);
    expect(storeOn(db).get(record.arena.id)!.arena.players[0]!.strategy).toEqual(PRESETS[2]!.strategy);
  });

  test("a phase change writes at once, with the edits that wait", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record, start } = arenaIn(store, 10);
    edit(store, record, 3);
    start(4);
    const loaded = JSON.parse(snapshotOf(db, record)) as { arena: { phase: { kind: string } } };
    expect(loaded.arena.phase.kind).toBe("running");
    expect(strategyOnDisk(db, record, "p1")).toEqual(PRESETS[3]!.strategy);
  });

  test("flush writes the waiting edits, as the server does at shutdown", () => {
    const db = memoryDatabase();
    const store = storeOn(db);
    const { record } = arenaIn(store, 3);
    edit(store, record, 4);
    store.flush();
    expect(strategyOnDisk(db, record, "p1")).toEqual(PRESETS[4]!.strategy);
  });

  test("a waiting edit does not write a closed arena back", () => {
    const db = memoryDatabase();
    const clock = manualScheduler();
    const store = storeOn(db, clock);
    const { record } = arenaIn(store, 3);
    edit(store, record, 1);
    store.remove(record);
    clock.advance(SAVE_INTERVAL_MS);
    expect(countRows(db, "arena")).toBe(0);
  });

  test("a coalesced save that fails is logged and tried again a second later", () => {
    const db = memoryDatabase();
    const clock = manualScheduler();
    const store = storeOn(db, clock);
    const { record } = arenaIn(store, 3);
    edit(store, record, 5);
    db.run("PRAGMA query_only = ON");
    try {
      clock.advance(SAVE_INTERVAL_MS);
    } finally {
      db.run("PRAGMA query_only = OFF");
    }
    expect(errors).toHaveBeenCalled();
    expect(strategyOnDisk(db, record, "p1")).not.toEqual(PRESETS[5]!.strategy);
    clock.advance(SAVE_INTERVAL_MS);
    expect(strategyOnDisk(db, record, "p1")).toEqual(PRESETS[5]!.strategy);
  });
});
