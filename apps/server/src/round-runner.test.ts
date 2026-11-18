import { plainTankLook } from "@game/arena";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { ULTIMATES_FROM, createArena, type ArenaEvent, type ArenaSettings } from "@game/arena";
import { PRESETS, ULTIMATE_RULES, type TickResult } from "@game/engine";
import { AutoSteps } from "./auto-steps.ts";
import { Metrics } from "./metrics/metrics.ts";
import { zoneCalendar } from "./monthly/calendar.ts";
import { PUBLIC_RULES } from "./public-kinds.ts";
import { RoundRunner } from "./round-runner.ts";
import { announcementFor, ruleSetToStart } from "./rule-set-draw.ts";
import { Store, type ArenaRecord } from "./store.ts";
import { ArenaStats } from "./stats/arena-stats.ts";
import { AccountStatsStore } from "./stats/account-stats.ts";
import { memoryDatabase } from "./db/testing.ts";
import { StreamHub } from "./stream.ts";
import { manualScheduler } from "./test-helpers.ts";

const TICKS = 20;
const strategy = PRESETS[0]!.strategy;

/** A hub whose ticks fail while `failTicks` is set, to stand in for a bug found mid-round. */
class FlakyHub extends StreamHub {
  failTicks = false;
  override sendTick(arenaId: string, round: number, result: TickResult): void {
    if (this.failTicks) throw new Error("tick failed");
    super.sendTick(arenaId, round, result);
  }
}

let errors: ReturnType<typeof spyOn>;
beforeEach(() => {
  // A failed round is logged on purpose. Keep the test output readable.
  errors = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

const SETTINGS: ArenaSettings = { name: "Test", kind: "presenter", ticksPerRound: TICKS, tickMs: 100, ruleSetMode: "standard", botFill: false, joinPolicy: "anyone", tankCount: 512 };

function setup(playerCount: number, settings: ArenaSettings = SETTINGS, startDelayMs = 0, at?: number) {
  const ticks = manualScheduler(at);
  const store = new Store({ db: memoryDatabase(), now: ticks.now, scheduler: ticks });
  const hub = new FlakyHub({ heartbeatMs: 60_000, maxStreamsPerArena: 10, now: ticks.now, scheduler: ticks, arenaMessageIntervalMs: 0 });
  const runner = new RoundRunner(store, hub, new AutoSteps(ticks, ticks.now, PUBLIC_RULES), { scheduler: ticks, now: ticks.now, startDelayMs });
  const added = store.add(createArena(store.newArenaId(), settings, announcementFor(settings.ruleSetMode, null)), "owner");
  if (!added.ok) throw new Error("the arena was not added");
  const record = added.record;
  const apply = (event: Exclude<ArenaEvent, { kind: "join" }>) => {
    const result = store.apply(record, event);
    if (!result.ok) throw new Error(`rejected: ${result.error}`);
  };
  for (let i = 1; i <= playerCount; i++) {
    const joined = store.addPlayer(record, { kind: "join", playerId: `p${i}`, name: `Player ${i}`, strategy, look: plainTankLook(1) }, `token-${i}`, null);
    if (!joined.ok) throw new Error(`rejected: ${joined.error}`);
  }
  const start = (seed: number) => {
    apply({ kind: "startRound", seed, ruleSetId: ruleSetToStart(record.arena) });
    runner.begin(record);
  };
  const play = () => {
    for (let i = 0; i < TICKS + 1; i++) ticks.tick();
  };
  return { record, hub, ticks, runner, start, play, apply };
}

const phaseOf = (record: ArenaRecord) => record.arena.phase;

test("a room fixes the release gate at round creation, even if its first tick comes later", () => {
  const settings = { ...SETTINGS, kind: "private", tankCount: 2 } as const;
  const before = setup(2, settings, 10, ULTIMATES_FROM - 1);
  before.start(42);
  const bots = (s: ReturnType<typeof setup>) => s.runner.currentRound(s.record.arena.id)?.snapshot.bots;
  expect(bots(before)?.map((bot) => bot.ultimate)).toEqual([undefined, undefined]);
  before.ticks.advance(10);
  before.ticks.tick();
  expect(bots(before)?.map((bot) => bot.ultimate)).toEqual([undefined, undefined]);

  const after = setup(2, settings, 0, ULTIMATES_FROM);
  after.start(42);
  expect(bots(after)?.map((bot) => bot.ultimate)).toEqual(Array(2).fill({
    id: strategy.ultimate, kind: "charging", turnsLeft: ULTIMATE_RULES.firstReadyTurn, turnsTotal: ULTIMATE_RULES.firstReadyTurn,
  }));
});

describe("a round that cannot start", () => {
  test("returns to the lobby and throws, and the host can start again", () => {
    const s = setup(3);
    // createRound rejects a seed that is not a safe integer.
    expect(() => s.start(1.5)).toThrow();
    expect(phaseOf(s.record)).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(s.ticks.activeCount()).toBe(0);
    expect(s.runner.currentRound(s.record.arena.id)).toBeNull();

    s.start(7);
    expect(phaseOf(s.record)).toMatchObject({ kind: "running", round: 1 });
    expect(s.ticks.activeCount()).toBe(1);
    s.runner.stopAll();
  });
});

describe("a round that fails while it runs", () => {
  test("before any completed round, returns to the lobby and stops the timer", () => {
    const s = setup(3);
    s.start(7);
    s.ticks.tick();
    s.hub.failTicks = true;
    s.ticks.tick();

    expect(phaseOf(s.record)).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(s.ticks.activeCount()).toBe(0);
    expect(s.record.arena.rounds).toEqual([]);

    s.hub.failTicks = false;
    s.start(8);
    s.play();
    expect(phaseOf(s.record).kind).toBe("finished");
  });

  test("after a completed round, returns to the break of the same round number", () => {
    const s = setup(10);
    s.start(7);
    s.play();
    expect(phaseOf(s.record)).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } });

    s.start(8);
    s.hub.failTicks = true;
    s.ticks.tick();
    expect(phaseOf(s.record)).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(s.record.arena.rounds).toHaveLength(1);
    expect(s.record.arena.players.filter((p) => p.status.kind === "playing")).toHaveLength(8);
    expect(s.ticks.activeCount()).toBe(0);

    // Round 2 then plays and completes under its own number.
    s.hub.failTicks = false;
    s.start(9);
    s.play();
    expect(phaseOf(s.record).kind).toBe("finished");
    expect(s.record.arena.rounds.map((r) => r.round)).toEqual([1, 2]);
  });
});

/** Statistics whose every turn fails, to stand in for a bug in the statistics code. */
class FailingStats extends ArenaStats {
  override turn(): void {
    throw new Error("stats failed");
  }
}

describe("a statistics failure", () => {
  test("lets the round finish and is counted under its own error label, not under round", () => {
    const ticks = manualScheduler();
    const store = new Store({ db: memoryDatabase(), now: ticks.now, scheduler: ticks });
    const hub = new StreamHub({ heartbeatMs: 60_000, maxStreamsPerArena: 10, now: ticks.now, scheduler: ticks, arenaMessageIntervalMs: 0 });
    const metrics = new Metrics({ db: memoryDatabase(), calendar: zoneCalendar("Asia/Jakarta"), now: ticks.now, scheduler: ticks });
    const stats = new FailingStats({ accounts: new AccountStatsStore(memoryDatabase()), month: () => "2026-11" });
    const runner = new RoundRunner(store, hub, new AutoSteps(ticks, ticks.now, PUBLIC_RULES), { scheduler: ticks, now: ticks.now, startDelayMs: 0, metrics, stats });
    const added = store.add(createArena(store.newArenaId(), SETTINGS, announcementFor(SETTINGS.ruleSetMode, null)), "owner");
    if (!added.ok) throw new Error("the arena was not added");
    const record = added.record;
    for (let i = 1; i <= 3; i++) {
      const joined = store.addPlayer(record, { kind: "join", playerId: `p${i}`, name: `Player ${i}`, strategy, look: plainTankLook(1) }, `token-${i}`, null);
      if (!joined.ok) throw new Error(`rejected: ${joined.error}`);
    }
    const started = store.apply(record, { kind: "startRound", seed: 7, ruleSetId: ruleSetToStart(record.arena) });
    if (!started.ok) throw new Error(`rejected: ${started.error}`);
    runner.begin(record);
    for (let i = 0; i < TICKS + 1; i++) ticks.tick();

    // A failed round would go back to the lobby; this one ended as the game's final.
    expect(phaseOf(record).kind).toBe("finished");
    expect(metrics.process().errors).toMatchObject({ round: 0, stats: TICKS });
    runner.stopAll();
    metrics.stop();
  });
});

describe("the pause before the first tick", () => {
  test("no tick runs until the pause is over, and currentRound counts it down", () => {
    const s = setup(3, SETTINGS, 3000);
    s.start(7);
    expect(s.runner.currentRound(s.record.arena.id)?.startsInMs).toBe(3000);
    s.ticks.tick();
    expect(s.runner.currentRound(s.record.arena.id)?.snapshot.tick).toBe(0);
    expect(s.ticks.activeCount()).toBe(0);

    s.ticks.advance(1200);
    expect(s.runner.currentRound(s.record.arena.id)?.startsInMs).toBe(1800);
    s.ticks.advance(1800);
    expect(s.runner.currentRound(s.record.arena.id)?.startsInMs).toBe(0);
    expect(s.ticks.activeCount()).toBe(1);
    s.ticks.tick();
    expect(s.runner.currentRound(s.record.arena.id)?.snapshot.tick).toBe(1);
    s.runner.stopAll();
  });

  test("stop during the pause cancels the round's timers and leaves the arena as it was", () => {
    const s = setup(3, SETTINGS, 3000);
    s.start(7);
    s.runner.stop(s.record.arena.id);
    s.ticks.advance(5000);
    expect(s.ticks.activeCount()).toBe(0);
    expect(s.runner.currentRound(s.record.arena.id)).toBeNull();
    expect(phaseOf(s.record).kind).toBe("running");
  });
});
