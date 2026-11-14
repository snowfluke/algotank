import { plainTankLook } from "@game/arena";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArena, type ArenaSettings } from "@game/arena";
import { PRESETS } from "@game/engine";
import { ArenaFiles, PersistenceError } from "./arena-files.ts";
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

/** A store on `directory` (or in memory) with a clock the test moves. */
function storeOn(directory?: string, clock = manualScheduler()): Store {
  return new Store({ ...(directory === undefined ? {} : { dataDir: directory }), now: clock.now, scheduler: clock });
}

const directories: string[] = [];
let errors: ReturnType<typeof spyOn>;

beforeEach(() => {
  errors = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** Every test uses its own directory under the system temp folder, never ./data. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "drench-store-"));
  directories.push(directory);
  return directory;
}

/** An arena in a data directory with `playerCount` players, each holding a token. */
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

const fileOf = (directory: string, record: ArenaRecord) => join(directory, "arenas", `${record.arena.id}.json`);

describe("saving and loading", () => {
  test("a second Store on the same directory holds the same arena, tokens and replay", () => {
    const directory = temporaryDirectory();
    const first = storeOn(directory);
    const { record, start, play } = arenaIn(first, 10);
    start(7);
    play();
    expect(record.arena.phase.kind).toBe("break");
    const replayBefore = replayJson(record, 1, "p1");
    const viewerBefore = replayJson(record, 1, null);
    expect(replayBefore).toBeDefined();

    const second = storeOn(directory);
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
    const directory = temporaryDirectory();
    const first = storeOn(directory);
    const { record } = arenaIn(first, 3);

    const second = storeOn(directory);
    const again = second.get(record.arena.id)!;
    const joined = second.addPlayer(again, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-9", null);
    expect(joined.ok).toBe(true);
    second.apply(again, { kind: "submitStrategy", playerId: "p1", strategy: PRESETS[1]!.strategy });
    // An edit waits for the coalesced save; a shutdown writes it.
    second.flush();

    const third = storeOn(directory).get(record.arena.id)!;
    expect(third.arena.players.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p9"]);
    expect(playerIdForToken(third, "token-9")).toBe("p9");
    expect(third.arena.players[0]!.strategy).toEqual(PRESETS[1]!.strategy);
  });

  test("a version 3 file with colours loads with plain looks and its kind's seats, and the next save writes version 8", () => {
    const directory = temporaryDirectory();
    const { record } = arenaIn(storeOn(directory), 3);
    const path = fileOf(directory, record);
    const file = JSON.parse(readFileSync(path, "utf8"));
    file.version = 3;
    for (const player of file.arena.players) {
      player.colour = player.look.colour;
      delete player.look;
    }
    writeFileSync(path, JSON.stringify(file));

    const store = storeOn(directory);
    const loaded = store.get(record.arena.id)!;
    expect(loaded.arena).toEqual({ ...record.arena, settings: { ...record.arena.settings, tankCount: null } });
    store.apply(loaded, { kind: "submitStrategy", playerId: "p1", strategy: PRESETS[1]!.strategy });
    store.flush();
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.version).toBe(8);
    expect(saved.arena.players[0].look).toEqual(plainTankLook(1));
    expect("colour" in saved.arena.players[0]).toBe(false);
  });

  test("a rejected event writes nothing and changes nothing", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record } = arenaIn(store, 3);
    const before = readFileSync(fileOf(directory, record), "utf8");
    const rejected = store.addPlayer(record, { kind: "join", playerId: "x", name: "player 1", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-x", null);
    expect(rejected).toEqual({ ok: false, error: "name_taken" });
    expect(playerIdForToken(record, "token-x")).toBeUndefined();
    expect(readFileSync(fileOf(directory, record), "utf8")).toBe(before);
  });

  test("a finished arena loads, and its results and replay stay visible", () => {
    const directory = temporaryDirectory();
    const first = storeOn(directory);
    const { record, start, play } = arenaIn(first, 4);
    start(3);
    play();
    expect(record.arena.phase.kind).toBe("finished");

    const loaded = storeOn(directory).get(record.arena.id)!;
    expect(loaded.arena).toEqual(record.arena);
    expect(replayJson(loaded, 1, null)).toBe(replayJson(record, 1, null)!);
  });

  test("an arena that was running comes back aborted, with the announcement it had, and the round can start again", () => {
    const directory = temporaryDirectory();
    const first = storeOn(directory);
    const { record, start } = arenaIn(first, 3);
    const announced = record.arena.phase.kind === "lobby" ? record.arena.phase.nextRuleSetId : null;
    start(5);
    expect(record.arena.phase).toMatchObject({ kind: "running", ruleSetId: announced });

    const second = storeOn(directory);
    const loaded = second.get(record.arena.id)!;
    expect(loaded.arena.phase).toEqual({ kind: "lobby", nextRuleSetId: announced, start: { kind: "waiting" } });
    expect(loaded.arena.rounds).toEqual([]);
    // The abort is saved, so a third start sees it as well.
    expect(storeOn(directory).get(record.arena.id)!.arena.phase).toEqual({ kind: "lobby", nextRuleSetId: announced, start: { kind: "waiting" } });

    const restarted = second.apply(loaded, { kind: "startRound", seed: 6, ruleSetId: ruleSetToStart(loaded.arena) });
    expect(restarted.ok).toBe(true);
  });

  test("a running round after a completed one comes back as the break of the same round", () => {
    const directory = temporaryDirectory();
    const first = storeOn(directory);
    const { record, start, play } = arenaIn(first, 10);
    start(1);
    play();
    start(2);
    expect(record.arena.phase).toMatchObject({ kind: "running", round: 2 });

    const loaded = storeOn(directory).get(record.arena.id)!;
    expect(loaded.arena.phase).toMatchObject({ kind: "break", nextRound: 2 });
    expect(loaded.arena.rounds).toHaveLength(1);
  });

  test("the file and the directory are readable by the owner only, and no temporary file stays", () => {
    const parent = temporaryDirectory();
    const directory = join(parent, "nested", "data");
    const store = storeOn(directory);
    const { record } = arenaIn(store, 2);

    expect(statSync(fileOf(directory, record)).mode & 0o777).toBe(0o600);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(directory, "arenas")).mode & 0o777).toBe(0o700);
    expect(readdirSync(directory)).toEqual(["arenas"]);
    expect(readdirSync(join(directory, "arenas"))).toEqual([`${record.arena.id}.json`]);

    // A rewrite keeps the mode, even when the old file had been opened up.
    chmodSync(fileOf(directory, record), 0o644);
    store.apply(record, { kind: "submitStrategy", playerId: "p1", strategy: PRESETS[2]!.strategy });
    store.flush();
    expect(statSync(fileOf(directory, record)).mode & 0o777).toBe(0o600);
  });

  test("a store without a directory writes nothing and still works", () => {
    const store = storeOn();
    const { record, start, play } = arenaIn(store, 2);
    start(1);
    play();
    expect(record.arena.phase.kind).toBe("finished");
  });

  test("two arenas are two files and both load", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const a = arenaIn(store, 2).record.arena.id;
    const b = arenaIn(store, 3).record.arena.id;
    expect(readdirSync(join(directory, "arenas")).sort()).toEqual([`${a}.json`, `${b}.json`].sort());
    const loaded = storeOn(directory);
    expect(loaded.size).toBe(2);
  });
});

describe("a save that fails", () => {
  /** The arenas folder refuses new files while `act` runs. */
  function withReadOnly(directory: string, act: () => void): void {
    const arenas = join(directory, "arenas");
    chmodSync(arenas, 0o500);
    try {
      act();
    } finally {
      chmodSync(arenas, 0o700);
    }
  }

  test("a join changes nothing, and the same name can join after the disk works again", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record } = arenaIn(store, 2);
    const join = () => store.addPlayer(record, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-9", null);

    withReadOnly(directory, () => expect(join).toThrow(PersistenceError));
    expect(record.arena.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(playerIdForToken(record, "token-9")).toBeUndefined();

    expect(join().ok).toBe(true);
    expect(playerIdForToken(storeOn(directory).get(record.arena.id)!, "token-9")).toBe("p9");
  });

  test("a start leaves the arena in the lobby, so the host can start the round again", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record, start } = arenaIn(store, 10);

    withReadOnly(directory, () => expect(() => start(3)).toThrow(PersistenceError));
    expect(record.arena.phase.kind).toBe("lobby");

    start(3);
    expect(record.arena.phase.kind).toBe("running");
  });

  test("a round that completes still reaches the break in memory", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record, start, play } = arenaIn(store, 10);
    start(5);

    withReadOnly(directory, play);
    expect(record.arena.phase.kind).toBe("break");
  });
});

describe("a damaged directory stops the start", () => {
  function savedArena(): { directory: string; path: string; stored: string } {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record } = arenaIn(store, 3);
    const path = fileOf(directory, record);
    return { directory, path, stored: readFileSync(path, "utf8") };
  }

  function failureOf(directory: string): PersistenceError {
    try {
      storeOn(directory);
    } catch (error) {
      if (error instanceof PersistenceError) return error;
      throw error;
    }
    throw new Error("expected the start to fail");
  }

  test("a file that is not JSON fails with its path", () => {
    const { directory, path } = savedArena();
    writeFileSync(path, "{ not json");
    expect(failureOf(directory).message).toContain(path);
  });

  test("a file with a wrong shape fails with its path and the part that is wrong", () => {
    const { directory, path, stored } = savedArena();
    const plain = JSON.parse(stored);
    plain.arena.players[0].strategy = { modes: [], build: {} };
    writeFileSync(path, JSON.stringify(plain));
    const message = failureOf(directory).message;
    expect(message).toContain(path);
    expect(message).toContain("arena.players[0].strategy");
  });

  test("an empty file fails, and so does a file named for another arena", () => {
    const { directory, path, stored } = savedArena();
    writeFileSync(path, "");
    expect(failureOf(directory).message).toContain(path);

    writeFileSync(path, stored);
    const other = join(directory, "arenas", "ZZZZZZ.json");
    writeFileSync(other, stored);
    expect(failureOf(directory).message).toContain(other);
  });

  test("a .json file that is not named by an arena code fails too", () => {
    const { directory } = savedArena();
    const notes = join(directory, "arenas", "notes.json");
    writeFileSync(notes, "{}");
    expect(failureOf(directory).message).toContain(notes);
  });

  test("files that are not .json are ignored, such as a temporary file left by a crash", () => {
    const { directory } = savedArena();
    writeFileSync(join(directory, "arenas", ".ABC234.json.tmp"), "half a fi");
    writeFileSync(join(directory, "arenas", "README.txt"), "notes");
    expect(storeOn(directory).size).toBe(1);
  });
});

describe("owners, removal and the activity time", () => {
  test("an account owns at most one arena, and removing it frees the account and the file", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record } = arenaIn(store, 1, SETTINGS, OWNER);
    const second = store.add(createArena(store.newArenaId(), SETTINGS, announcementFor(SETTINGS.ruleSetMode, null)), OWNER);
    expect(second).toEqual({ ok: false, ownedArenaId: record.arena.id });
    expect(store.ownedBy(OWNER)).toBe(record);

    store.remove(record);
    expect(store.get(record.arena.id)).toBeUndefined();
    expect(store.ownedBy(OWNER)).toBeUndefined();
    expect(readdirSync(join(directory, "arenas"))).toEqual([]);
    expect(arenaIn(store, 1, SETTINGS, OWNER).record.ownerAccountId).toBe(OWNER);
  });

  test("a record the store no longer holds is refused, so a late request cannot write a closed arena back", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record } = arenaIn(store, 1);
    store.remove(record);
    expect(() => store.addPlayer(record, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "t", null)).toThrow(ArenaGoneError);
    expect(readdirSync(join(directory, "arenas"))).toEqual([]);
  });

  test("every accepted event moves lastActivityAt; a rejected one does not", () => {
    const clock = manualScheduler();
    const store = storeOn(undefined, clock);
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
    const store = storeOn();
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
  const strategyOnDisk = (directory: string, record: ArenaRecord, playerId: string) =>
    (JSON.parse(readFileSync(fileOf(directory, record), "utf8")) as { arena: { players: { id: string; strategy: unknown }[] } }).arena.players.find(
      (p) => p.id === playerId,
    )?.strategy;
  const edit = (store: Store, record: ArenaRecord, preset: number) =>
    store.apply(record, { kind: "submitStrategy", playerId: "p1", strategy: PRESETS[preset % PRESETS.length]!.strategy });

  test("50 edits within one second reach the file in one write, SAVE_INTERVAL_MS after the first", () => {
    const directory = temporaryDirectory();
    const clock = manualScheduler();
    const store = storeOn(directory, clock);
    const { record } = arenaIn(store, 3);
    const before = strategyOnDisk(directory, record, "p1");
    const writes = spyOn(ArenaFiles.prototype, "write");
    try {
      for (let i = 0; i < 50; i++) {
        edit(store, record, i);
        clock.advance(10);
      }
      // 50 x 10 ms = 500 ms after the first edit: nothing written yet.
      expect(writes).toHaveBeenCalledTimes(0);
      expect(strategyOnDisk(directory, record, "p1")).toEqual(before);
      clock.advance(SAVE_INTERVAL_MS - 500 - 1);
      expect(writes).toHaveBeenCalledTimes(0);
      clock.advance(1);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(strategyOnDisk(directory, record, "p1")).toEqual(PRESETS[49 % PRESETS.length]!.strategy);
    } finally {
      writes.mockRestore();
    }
  });

  test("a crash loses at most the edits of the last second, and never a join", () => {
    const directory = temporaryDirectory();
    const clock = manualScheduler();
    const store = storeOn(directory, clock);
    const { record } = arenaIn(store, 3);
    edit(store, record, 3);
    const joined = store.addPlayer(record, { kind: "join", playerId: "p9", name: "Late", strategy: PRESETS[0]!.strategy, look: plainTankLook(1) }, "token-9", null);
    expect(joined.ok).toBe(true);
    edit(store, record, 2);
    clock.advance(SAVE_INTERVAL_MS - 1);

    // A second store on the directory sees what a restart after a crash would find.
    const afterCrash = storeOn(directory).get(record.arena.id)!;
    expect(playerIdForToken(afterCrash, "token-9")).toBe("p9");
    // The join wrote the edit before it; only the edit after the join is still waiting.
    expect(afterCrash.arena.players[0]!.strategy).toEqual(PRESETS[3]!.strategy);

    clock.advance(1);
    expect(storeOn(directory).get(record.arena.id)!.arena.players[0]!.strategy).toEqual(PRESETS[2]!.strategy);
  });

  test("a phase change writes at once, with the edits that wait", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record, start } = arenaIn(store, 10);
    edit(store, record, 3);
    start(4);
    const loaded = JSON.parse(readFileSync(fileOf(directory, record), "utf8")) as { arena: { phase: { kind: string } } };
    expect(loaded.arena.phase.kind).toBe("running");
    expect(strategyOnDisk(directory, record, "p1")).toEqual(PRESETS[3]!.strategy);
  });

  test("flush writes the waiting edits, as the server does at shutdown", () => {
    const directory = temporaryDirectory();
    const store = storeOn(directory);
    const { record } = arenaIn(store, 3);
    edit(store, record, 4);
    store.flush();
    expect(strategyOnDisk(directory, record, "p1")).toEqual(PRESETS[4]!.strategy);
  });

  test("a waiting edit does not write a closed arena back", () => {
    const directory = temporaryDirectory();
    const clock = manualScheduler();
    const store = storeOn(directory, clock);
    const { record } = arenaIn(store, 3);
    edit(store, record, 1);
    store.remove(record);
    clock.advance(SAVE_INTERVAL_MS);
    expect(readdirSync(join(directory, "arenas"))).toEqual([]);
  });

  test("a coalesced save that fails is logged and tried again a second later", () => {
    const directory = temporaryDirectory();
    const clock = manualScheduler();
    const store = storeOn(directory, clock);
    const { record } = arenaIn(store, 3);
    edit(store, record, 5);
    const arenas = join(directory, "arenas");
    chmodSync(arenas, 0o500);
    try {
      clock.advance(SAVE_INTERVAL_MS);
    } finally {
      chmodSync(arenas, 0o700);
    }
    expect(errors).toHaveBeenCalled();
    expect(strategyOnDisk(directory, record, "p1")).not.toEqual(PRESETS[5]!.strategy);
    clock.advance(SAVE_INTERVAL_MS);
    expect(strategyOnDisk(directory, record, "p1")).toEqual(PRESETS[5]!.strategy);
  });
});
