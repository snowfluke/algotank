import { describe, expect, test } from "bun:test";
import { hitChancePercent } from "../combat/combat.ts";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID, ruleSet } from "../combat/rule-sets.ts";
import type { RuleSetId } from "../combat/rule-sets.ts";
import { PRESETS } from "../strategy/presets.ts";
import { DIRECTIONS } from "../types.ts";
import type { RoundConfig } from "../types.ts";
import { arenaSize } from "./grid.ts";
import { createRound, runRound, standings, stepRound } from "./round.ts";

const STANDARD = ruleSet(STANDARD_RULE_SET_ID);
const WATER_CAPACITY = STANDARD.waterCapacity;

/** `count` players that cycle through the presets. */
function config(count: number, seed: number, ticksTotal = 40, ruleSetId: RuleSetId = STANDARD_RULE_SET_ID): RoundConfig {
  return {
    seed,
    ticksTotal,
    survivorsAfterRound: null,
    ruleSetId,
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      strategy: (PRESETS[i % PRESETS.length] as (typeof PRESETS)[number]).strategy,
    })),
  };
}

describe("createRound", () => {
  test("needs at least 2 players", () => {
    expect(() => createRound(config(1, 1))).toThrow();
    expect(() => createRound(config(0, 1))).toThrow();
  });

  test("rejects an id that is not a rule set, and does not fall back to the standard numbers", () => {
    expect(() => createRound({ ...config(4, 1), ruleSetId: "nope" as RuleSetId })).toThrow(/unknown rule set/);
    expect(() => createRound({ ...config(4, 1), ruleSetId: "toString" as RuleSetId })).toThrow(/unknown rule set/);
  });

  test("needs unique player ids", () => {
    const base = config(3, 1);
    const [first, second, third] = base.players;
    if (!first || !second || !third) throw new Error("test setup");
    expect(() => createRound({ ...base, players: [first, second, { ...third, id: first.id }] })).toThrow();
  });

  test("needs a positive whole number of ticks", () => {
    expect(() => createRound(config(2, 1, 0))).toThrow();
    expect(() => createRound(config(2, 1, 2.5))).toThrow();
  });

  test("spawns every bot on its own cell inside the grid, in its first mode, with score 0", () => {
    for (const count of [2, 8, 20, 64]) {
      const { snapshot } = createRound(config(count, 5));
      expect(snapshot.tick).toBe(0);
      expect(snapshot.bots.map((b) => b.id)).toEqual(Array.from({ length: count }, (_, i) => `p${i}`));
      const cells = new Set(snapshot.bots.map((b) => `${b.x},${b.y}`));
      expect(cells.size).toBe(count);
      for (const b of snapshot.bots) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThan(snapshot.width);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThan(snapshot.height);
        expect(b.score).toBe(0);
        expect(b.wasHit).toBe(false);
        expect(b.lastHitBy).toBeNull();
        expect(b.ticksSinceHit).toBeNull();
        expect(b.lastMove).toBeNull();
        expect(b.ticksInMode).toBe(0);
        expect(b.hitsLanded).toBe(0);
        expect(b.hitsTaken).toBe(0);
        expect(b.ticksSinceLandedHit).toBeNull();
        expect(b.water).toBe(WATER_CAPACITY);
      }
    }
  });

  test("starts each bot in modes[0] of its strategy", () => {
    const cfg = config(PRESETS.length, 2);
    const { snapshot } = createRound(cfg);
    cfg.players.forEach((p, i) => expect(snapshot.bots[i]?.modeId).toBe(p.strategy.modes[0]?.id));
  });

  test("a bot spawns facing any of the 8 directions, drawn from the seed", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (const b of createRound(config(8, seed)).snapshot.bots) seen.add(b.direction);
    expect([...seen].sort()).toEqual([...DIRECTIONS].sort());
  });

  test("the same seed spawns the same way, another seed does not", () => {
    const a = JSON.stringify(createRound(config(8, 77)).snapshot);
    expect(JSON.stringify(createRound(config(8, 77)).snapshot)).toBe(a);
    expect(JSON.stringify(createRound(config(8, 78)).snapshot)).not.toBe(a);
  });
});

describe("stepRound and runRound", () => {
  test("play every tick once, in order, and refuse a tick after the end", () => {
    const state = createRound(config(6, 3, 10));
    const results = [];
    while (!state.isOver) results.push(stepRound(state));
    expect(results.map((r) => r.tick)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(state.snapshot.tick).toBe(10);
    expect(() => stepRound(state)).toThrow();
  });

  test("each tick keeps bots apart and inside the grid, and lists every bot once", () => {
    const state = createRound(config(12, 9, 60));
    const ids = state.snapshot.bots.map((b) => b.id).sort();
    while (!state.isOver) {
      const result = stepRound(state);
      expect([...result.order].sort()).toEqual(ids);
      expect(result.decisions.map((d) => d.botId)).toEqual(state.snapshot.bots.map((b) => b.id));
      const cells = new Set(result.snapshot.bots.map((b) => `${b.x},${b.y}`));
      expect(cells.size).toBe(result.snapshot.bots.length);
      for (const b of result.snapshot.bots) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThan(result.snapshot.width);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThan(result.snapshot.height);
      }
    }
  });

  test("the next snapshot records hits, last move and mode from the tick", () => {
    const state = createRound(config(10, 21, 80));
    let before = state.snapshot;
    while (!state.isOver) {
      const result = stepRound(state);
      const hitIds = new Set(result.throws.flatMap((t) => (t.outcome === "hit" ? [t.targetId] : [])));
      result.snapshot.bots.forEach((bot, i) => {
        const was = before.bots[i];
        const decision = result.decisions[i];
        if (!was || !decision) throw new Error("test setup");
        expect(bot.wasHit).toBe(hitIds.has(bot.id));
        expect(bot.lastMove).toBe(decision.move);
        expect(bot.modeId).toBe(decision.nextModeId);
        if (bot.wasHit) expect(bot.ticksSinceHit).toBe(0);
        else expect(bot.ticksSinceHit).toBe(was.ticksSinceHit === null ? null : was.ticksSinceHit + 1);
      });
      before = result.snapshot;
    }
  });

  test("the scores of a round sum to 0 after every tick, and each score is hits landed minus hits taken", () => {
    for (const [count, seed] of [[8, 5], [20, 6], [3, 7]] as const) {
      const state = createRound(config(count, seed, 100));
      expect(state.snapshot.bots.reduce((sum, b) => sum + b.score, 0)).toBe(0);
      while (!state.isOver) {
        const result = stepRound(state);
        expect(result.snapshot.bots.reduce((sum, b) => sum + b.score, 0)).toBe(0);
        for (const b of result.snapshot.bots) expect(b.score).toBe(b.hitsLanded - b.hitsTaken);
      }
    }
  });

  test("hits landed and taken count every hit, also when one bot is hit twice in a tick", () => {
    let sawDoubleHit = false;
    for (let seed = 1; seed <= 40 && !sawDoubleHit; seed++) {
      const state = createRound(config(12, seed, 80));
      let before = state.snapshot;
      while (!state.isOver) {
        const result = stepRound(state);
        const hits = result.throws.flatMap((t) => (t.outcome === "hit" ? [t] : []));
        const hitCount = new Map<string, number>();
        for (const t of hits) hitCount.set(t.targetId, (hitCount.get(t.targetId) ?? 0) + 1);
        if ([...hitCount.values()].some((n) => n > 1)) sawDoubleHit = true;
        result.snapshot.bots.forEach((bot, i) => {
          const was = before.bots[i] as (typeof before.bots)[number];
          expect(bot.hitsTaken).toBe(was.hitsTaken + (hitCount.get(bot.id) ?? 0));
          expect(bot.hitsLanded).toBe(was.hitsLanded + hits.filter((t) => t.throwerId === bot.id).length);
        });
        before = result.snapshot;
      }
    }
    expect(sawDoubleHit).toBe(true);
  });

  test("ticks since a landed hit is 0 right after it and counts up, and ticks in mode resets on a switch", () => {
    const state = createRound(config(10, 21, 120));
    let before = state.snapshot;
    let sawSwitch = false;
    let sawLanded = false;
    while (!state.isOver) {
      const result = stepRound(state);
      result.snapshot.bots.forEach((bot, i) => {
        const was = before.bots[i] as (typeof before.bots)[number];
        const decision = result.decisions[i] as (typeof result.decisions)[number];
        const landed = result.throws.some((t) => t.outcome === "hit" && t.throwerId === bot.id);
        if (landed) {
          sawLanded = true;
          expect(bot.ticksSinceLandedHit).toBe(0);
        } else {
          expect(bot.ticksSinceLandedHit).toBe(was.ticksSinceLandedHit === null ? null : was.ticksSinceLandedHit + 1);
        }
        if (decision.nextModeId !== decision.modeId) {
          sawSwitch = true;
          expect(bot.ticksInMode).toBe(0);
        } else {
          expect(bot.ticksInMode).toBe(was.ticksInMode + 1);
        }
      });
      before = result.snapshot;
    }
    expect(sawSwitch).toBe(true);
    expect(sawLanded).toBe(true);
  });

  test("stepping does not change the snapshots it already returned", () => {
    const state = createRound(config(8, 4, 20));
    const spawn = state.snapshot;
    const spawnJson = JSON.stringify(spawn);
    const first = stepRound(state);
    const firstJson = JSON.stringify(first.snapshot);
    stepRound(state);
    expect(JSON.stringify(spawn)).toBe(spawnJson);
    expect(JSON.stringify(first.snapshot)).toBe(firstJson);
  });

  test("runRound gives the same ticks as stepping by hand", () => {
    const cfg = config(8, 15, 25);
    const state = createRound(cfg);
    const stepped = [];
    while (!state.isOver) stepped.push(stepRound(state));
    const run = runRound(cfg);
    expect(JSON.stringify(run.ticks)).toBe(JSON.stringify(stepped));
    expect(run.standings).toEqual(standings(state));
    expect(JSON.stringify(run.spawn)).toBe(JSON.stringify(createRound(cfg).snapshot));
  });

  test("determinism: the same config built from PRESETS gives identical tick lists", () => {
    for (const count of [2, 8, 20]) {
      const a = runRound(config(count, 2024, 60));
      const b = runRound(config(count, 2024, 60));
      expect(JSON.stringify(a.ticks)).toBe(JSON.stringify(b.ticks));
      expect(JSON.stringify(a.spawn)).toBe(JSON.stringify(b.spawn));
      expect(a.standings).toEqual(b.standings);
    }
  });

  test("another seed gives another round", () => {
    const a = JSON.stringify(runRound(config(8, 1, 60)).ticks);
    const b = JSON.stringify(runRound(config(8, 2, 60)).ticks);
    expect(a).not.toBe(b);
  });
});

describe("water over a round", () => {
  /** Plays 12 rounds under one set and checks the tank against that set's numbers. Returns how often each case happened. */
  function playWater(id: RuleSetId) {
    const rules = ruleSet(id);
    const seen = { spent: 0, dry: 0, empty: 0, refilledToCapacity: 0 };
    for (let seed = 1; seed <= 12; seed++) {
      const state = createRound(config(8, seed, 100, id));
      expect(state.snapshot.bots.every((bot) => bot.water === rules.waterCapacity)).toBe(true);
      let before = state.snapshot;
      while (!state.isOver) {
        const result = stepRound(state);
        result.snapshot.bots.forEach((bot, i) => {
          const was = (before.bots[i] as (typeof before.bots)[number]).water;
          const thrown = result.throws.find((t) => t.throwerId === bot.id);
          expect(bot.water).toBeGreaterThanOrEqual(0);
          expect(bot.water).toBeLessThanOrEqual(rules.waterCapacity);
          if (thrown?.outcome === "hit" || thrown?.outcome === "miss") {
            // The check uses the water from before the tick.
            expect(was).toBeGreaterThanOrEqual(rules.waterPerThrow);
            expect(bot.water).toBe(was - rules.waterPerThrow);
            seen.spent += 1;
          } else {
            if (thrown?.outcome === "dry") {
              expect(was).toBeLessThan(rules.waterPerThrow);
              seen.dry += 1;
            }
            if (thrown?.outcome === "empty") seen.empty += 1;
            expect(bot.water).toBe(Math.min(rules.waterCapacity, was + rules.waterRefillPerTick));
            if (was < rules.waterCapacity && bot.water === rules.waterCapacity) seen.refilledToCapacity += 1;
          }
        });
        before = result.snapshot;
      }
    }
    return seen;
  }

  test("a throw at a bot spends water and a tick without one refills, from the water before the tick", () => {
    const seen = playWater(STANDARD_RULE_SET_ID);
    // The sample must hold each case, or the checks above pass without testing anything.
    expect(seen.spent).toBeGreaterThan(0);
    expect(seen.dry).toBeGreaterThan(0);
    expect(seen.empty).toBeGreaterThan(0);
    expect(seen.refilledToCapacity).toBeGreaterThan(0);
  });

  test.each(RULE_SET_IDS)("the tank follows the numbers of the %s set", (id) => {
    const seen = playWater(id);
    expect(seen.spent).toBeGreaterThan(0);
    expect(seen.refilledToCapacity).toBeGreaterThan(0);
  });

  test("a dry throw lands no hit", () => {
    let dryThrows = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const state = createRound(config(8, seed, 100));
      let before = state.snapshot;
      while (!state.isOver) {
        const result = stepRound(state);
        for (const dry of result.throws.filter((t) => t.outcome === "dry")) {
          dryThrows += 1;
          const index = before.bots.findIndex((bot) => bot.id === dry.throwerId);
          expect(result.snapshot.bots[index]?.hitsLanded).toBe(before.bots[index]?.hitsLanded);
        }
        before = result.snapshot;
      }
    }
    expect(dryThrows).toBeGreaterThan(0);
  });
});

describe("standings", () => {
  test("highest score first, ranks 1 to n, scores match the final snapshot", () => {
    const cfg = config(12, 31, 80);
    const run = runRound(cfg);
    const last = run.ticks[run.ticks.length - 1]?.snapshot;
    if (!last) throw new Error("test setup");
    expect(run.standings.map((s) => s.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    const scores = run.standings.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(Object.fromEntries(run.standings.map((s) => [s.botId, s.score]))).toEqual(
      Object.fromEntries(last.bots.map((b) => [b.id, b.score])),
    );
    expect(Object.fromEntries(run.standings.map((s) => [s.botId, [s.hitsLanded, s.hitsTaken]]))).toEqual(
      Object.fromEntries(last.bots.map((b) => [b.id, [b.hitsLanded, b.hitsTaken]])),
    );
  });

  test("standings run from more points to fewer, then from more hits landed to fewer, and ranks are unique", () => {
    let tiesOnPoints = 0;
    let tiesOnPointsAndHits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const run = runRound(config(8, seed, 60));
      const last = run.ticks[run.ticks.length - 1]?.snapshot;
      if (!last) throw new Error("test setup");
      const hitsOf = new Map(last.bots.map((b) => [b.id, b.hitsLanded]));
      expect(run.standings.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (let i = 1; i < run.standings.length; i++) {
        const higher = run.standings[i - 1];
        const lower = run.standings[i];
        if (!higher || !lower) throw new Error("test setup");
        expect(higher.score).toBeGreaterThanOrEqual(lower.score);
        if (higher.score === lower.score) {
          tiesOnPoints += 1;
          const [hitsHigher, hitsLower] = [hitsOf.get(higher.botId) as number, hitsOf.get(lower.botId) as number];
          expect(hitsHigher).toBeGreaterThanOrEqual(hitsLower);
          if (hitsHigher === hitsLower) tiesOnPointsAndHits += 1;
          else expect(hitsHigher).toBeGreaterThan(hitsLower);
        }
      }
    }
    // The sample must hold ties, or the checks above pass without testing anything.
    expect(tiesOnPoints).toBeGreaterThan(10);
    expect(tiesOnPoints).toBeGreaterThan(tiesOnPointsAndHits);
  });

  test("a tie in points and hits goes to the seed draw, which does not change when the state is read again", () => {
    let seedDecided = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state = createRound(config(8, seed, 40));
      while (!state.isOver) stepRound(state);
      const first = standings(state);
      expect(standings(state)).toEqual(first);
      const hitsOf = new Map(state.snapshot.bots.map((b) => [b.id, b.hitsLanded]));
      for (let i = 1; i < first.length; i++) {
        const [a, b] = [first[i - 1], first[i]];
        if (a && b && a.score === b.score && hitsOf.get(a.botId) === hitsOf.get(b.botId)) seedDecided += 1;
      }
    }
    expect(seedDecided).toBeGreaterThan(0);
  });

  test("a tie is broken by the draw from the round seed, and the result is stable", () => {
    // Before the first tick every score is 0, so the tie-break decides alone.
    const state = createRound(config(10, 8));
    const first = standings(state);
    expect(first.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(first.map((s) => s.botId).sort()).toEqual(state.snapshot.bots.map((b) => b.id).sort());
    expect(standings(state)).toEqual(first);
    expect(standings(createRound(config(10, 8)))).toEqual(first);
  });

  test("the tie-break order depends on the seed and is not the player order", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      orders.add(
        standings(createRound(config(10, seed)))
          .map((s) => s.botId)
          .join(","),
      );
    }
    expect(orders.size).toBeGreaterThan(5);
  });

  test("standings do not change the state", () => {
    const state = createRound(config(6, 12, 10));
    standings(state);
    const first = stepRound(state);
    const other = runRound(config(6, 12, 10));
    expect(JSON.stringify(first)).toBe(JSON.stringify(other.ticks[0]));
  });
});

describe("rule sets in a round", () => {
  test.each(RULE_SET_IDS)("under %s, every snapshot names the set and the arena follows its fill ratio", (id) => {
    for (const count of [2, 8, 20, 64]) {
      const state = createRound(config(count, 3, 5, id));
      expect(state.snapshot.ruleSetId).toBe(id);
      expect({ width: state.snapshot.width, height: state.snapshot.height }).toEqual(arenaSize(count, ruleSet(id)));
    }
    const run = runRound(config(8, 3, 5, id));
    expect(run.spawn.ruleSetId).toBe(id);
    for (const tick of run.ticks) expect(tick.snapshot.ruleSetId).toBe(id);
  });

  test.each(RULE_SET_IDS)("under %s, a round is deterministic and its scores sum to 0 after every tick", (id) => {
    const a = runRound(config(8, 11, 90, id));
    const b = runRound(config(8, 11, 90, id));
    expect(JSON.stringify(a.ticks)).toBe(JSON.stringify(b.ticks));
    for (const tick of a.ticks) expect(tick.snapshot.bots.reduce((sum, bot) => sum + bot.score, 0)).toBe(0);
  });

  test("a set with a lower fill ratio gives a larger arena for the same players", () => {
    const standard = createRound(config(20, 3, 5, "standard")).snapshot;
    const open = createRound(config(20, 3, 5, "open-field")).snapshot;
    expect(open.width * open.height).toBeGreaterThan(standard.width * standard.height);
  });

  test.each(RULE_SET_IDS)("under %s, each throw uses the range and the hit chance of the set", (id) => {
    const rules = ruleSet(id);
    let rolled = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const state = createRound(config(8, seed, 100, id));
      let before = state.snapshot;
      while (!state.isOver) {
        const result = stepRound(state);
        for (const event of result.throws) {
          if (event.outcome === "empty") continue;
          // The preset builds reach at most 1 cell farther than the base range (the random walker has Reach 1).
          expect(event.distance).toBeLessThanOrEqual(rules.baseRange + 1);
          if (event.outcome === "dry") continue;
          const thrower = before.bots.find((bot) => bot.id === event.throwerId);
          const target = before.bots.find((bot) => bot.id === event.targetId);
          if (!thrower || !target) throw new Error("test setup");
          expect(event.hitChance).toBe(hitChancePercent(thrower.build, target.build, event.distance, rules));
          rolled += 1;
        }
        before = result.snapshot;
      }
    }
    expect(rolled).toBeGreaterThan(0);
  });

  test.each(RULE_SET_IDS)("under %s, the same config gives identical ticks and the scores sum to 0", (id) => {
    const a = runRound(config(8, 2024, 60, id));
    const b = runRound(config(8, 2024, 60, id));
    expect(JSON.stringify(a.ticks)).toBe(JSON.stringify(b.ticks));
    expect(JSON.stringify(a.spawn)).toBe(JSON.stringify(b.spawn));
    expect(a.standings).toEqual(b.standings);
    for (const tick of a.ticks) expect(tick.snapshot.bots.reduce((sum, bot) => sum + bot.score, 0)).toBe(0);
  });

  test("the same seed under another set gives another round", () => {
    const standard = JSON.stringify(runRound(config(8, 9, 60, "standard")).ticks);
    const armsLength = JSON.stringify(runRound(config(8, 9, 60, "arms-length")).ticks);
    expect(armsLength).not.toBe(standard);
  });
});
