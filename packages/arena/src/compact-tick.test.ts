import { describe, expect, test } from "bun:test";
import { PRESETS, RULE_SET_IDS, runRound, type Snapshot, type TickResult } from "@game/engine";
import { COMPACT_OUTCOMES, compactTick, expandTick, type CompactTick } from "./compact-tick.ts";
import type { PublicSnapshot, PublicTick } from "./types.ts";

// The server's allow-list lives in apps/server/src/public-tick.ts; this copy only
// builds the input of the round trip, so the test does not depend on the server.
function publicSnapshot(s: Snapshot): PublicSnapshot {
  return {
    width: s.width,
    height: s.height,
    tick: s.tick,
    ticksTotal: s.ticksTotal,
    survivorsAfterRound: s.survivorsAfterRound,
    ruleSetId: s.ruleSetId,
    bots: s.bots.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      direction: b.direction,
      score: b.score,
      wasHit: b.wasHit,
      build: b.build,
      hitsLanded: b.hitsLanded,
      hitsTaken: b.hitsTaken,
      water: b.water,
    })),
  };
}

function publicTick(r: TickResult): PublicTick {
  return {
    tick: r.tick,
    order: r.order,
    moves: r.decisions.map((d) => ({ botId: d.botId, move: d.move })),
    throws: r.throws,
    snapshot: publicSnapshot(r.snapshot),
  };
}

function playRound(ruleSetId: (typeof RULE_SET_IDS)[number], seed: number) {
  const players = Array.from({ length: 24 }, (_, i) => ({
    id: `p${i}`,
    strategy: (PRESETS[i % PRESETS.length] as (typeof PRESETS)[number]).strategy,
  }));
  const { spawn, ticks } = runRound({ seed, ticksTotal: 60, survivorsAfterRound: 12, ruleSetId, players });
  return { spawn: publicSnapshot(spawn), ticks: ticks.map(publicTick) };
}

describe("compactTick and expandTick", () => {
  for (const ruleSetId of RULE_SET_IDS) {
    test(`a real round under "${ruleSetId}" survives the round trip, every outcome included`, () => {
      const { spawn, ticks } = playRound(ruleSetId, 7);
      const order = spawn.bots.map((b) => b.id);
      const seen = new Set<string>();
      for (const tick of ticks) {
        const compact = compactTick(tick, order);
        // The wire carries JSON, so the round trip goes through it too.
        const wire = JSON.parse(JSON.stringify(compact)) as CompactTick;
        expect(expandTick(wire, spawn)).toEqual(tick);
        for (const t of tick.throws) seen.add(t.outcome);
      }
      expect(seen.has("hit")).toBe(true);
      expect(seen.has("miss")).toBe(true);
    });
  }

  test("every outcome of the table is reached in some rule set, so each branch of the format is covered", () => {
    const seen = new Set<string>();
    for (const ruleSetId of RULE_SET_IDS) {
      for (const tick of playRound(ruleSetId, 11).ticks) for (const t of tick.throws) seen.add(t.outcome);
    }
    expect([...seen].sort()).toEqual([...COMPACT_OUTCOMES].sort());
  });

  test("a compact turn of 24 tanks is far smaller than the public turn", () => {
    const { spawn, ticks } = playRound("standard", 3);
    const tick = ticks[30] as PublicTick;
    const compactBytes = JSON.stringify(compactTick(tick, spawn.bots.map((b) => b.id))).length;
    expect(compactBytes * 3).toBeLessThan(JSON.stringify(tick).length);
  });

  describe("rejects a compact turn that does not fit the round", () => {
    const { spawn, ticks } = playRound("standard", 5);
    const good = compactTick(ticks[10] as PublicTick, spawn.bots.map((b) => b.id));
    const cases: [string, CompactTick][] = [
      ["a tank is missing", { ...good, bots: good.bots.slice(1) }],
      ["a direction index is out of range", { ...good, bots: [[0, 0, 8, 0, 0, 0, 0, 0], ...good.bots.slice(1)] }],
      ["a value is not an integer", { ...good, bots: [[0.5, 0, 0, 0, 0, 0, 0, 0], ...good.bots.slice(1)] }],
      ["a move names a tank twice", { ...good, moves: [good.moves[0] as [number, number], ...good.moves.slice(0, -1)] }],
      ["a move index is out of range", { ...good, moves: [[0, 6], ...good.moves.slice(1)] }],
      ["a throw names a tank out of range", { ...good, throws: [[999, 3, 0, 1, 90]] }],
      ["a throw has too few values", { ...good, throws: [[0, 3, 1]] }],
    ];
    for (const [name, bad] of cases) {
      test(name, () => {
        expect(() => expandTick(bad, spawn)).toThrow();
      });
    }
  });

  test("compactTick rejects a tick whose tanks are not in the round's order", () => {
    const { spawn, ticks } = playRound("standard", 5);
    const order = spawn.bots.map((b) => b.id).reverse();
    expect(() => compactTick(ticks[0] as PublicTick, order)).toThrow();
  });
});
