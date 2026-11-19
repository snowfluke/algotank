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
      item: b.item,
      effect: b.effect,
    })),
    items: s.items,
  };
}

function publicTick(r: TickResult): PublicTick {
  return {
    tick: r.tick,
    order: r.order,
    moves: r.decisions.map((d) => ({ botId: d.botId, move: d.move })),
    throws: r.throws,
    pickups: r.pickups,
    snapshot: publicSnapshot(r.snapshot),
  };
}

function playRound(ruleSetId: (typeof RULE_SET_IDS)[number], seed: number) {
  const players = Array.from({ length: 24 }, (_, i) => ({
    id: `p${i}`,
    strategy: (PRESETS[i % PRESETS.length] as (typeof PRESETS)[number]).strategy,
  }));
  const { spawn, ticks } = runRound({ seed, ticksTotal: 60, survivorsAfterRound: 12, ruleSetId, players, items: true, ultimates: false });
  return { spawn: publicSnapshot(spawn), ticks: ticks.map(publicTick) };
}

describe("compactTick and expandTick", () => {
  test("fresh starts append only destinations, and a room or an empty list gives the original bytes", () => {
    const { spawn } = playRound("standard", 7);
    const { itemsWaiting: _waiting, ...bot } = spawn.bots[0]!;
    const board = { ...spawn, bots: [{ ...bot, x: 0, y: 0, direction: "N" as const, water: 2, item: null, effect: null }] };
    const tick: PublicTick = { tick: 0, order: [bot.id], moves: [{ botId: bot.id, move: "W" }], throws: [], pickups: [], snapshot: { ...board, tick: 1 } };
    const bytes = '{"tick":0,"bots":[[0,0,0,0,2,0,0,0]],"moves":[[0,6]],"throws":[],"items":[],"pickups":[]}';
    expect(JSON.stringify(compactTick(tick, [bot.id]))).toBe(bytes);
    expect(JSON.stringify(compactTick({ ...tick, freshStarts: [] }, [bot.id]))).toBe(bytes);
    expect(expandTick(JSON.parse(bytes) as CompactTick, board)).toEqual(tick);

    const fresh = { ...tick, freshStarts: [{ id: bot.id, x: 1, y: 0 }] };
    const wire = JSON.stringify(compactTick(fresh, [bot.id]));
    expect(wire).toBe(bytes.slice(0, -1) + ',"freshStarts":[[0,1,0]]}');
    expect(expandTick(JSON.parse(wire) as CompactTick, board)).toEqual(fresh);
  });

  test("ultimate state, fires and fresh starts round-trip together in the appended field order", () => {
    const { spawn, ticks } = playRound("standard", 7);
    const turn = ticks[0]!;
    const [magnet, fullTank, ...others] = turn.snapshot.bots;
    if (magnet === undefined || fullTank === undefined) throw new Error("expected two tanks");
    const charged = {
      ...magnet,
      item: "bucket",
      itemsWaiting: ["umbrella"],
      ultimate: { id: "magnet", kind: "charging", turnsLeft: 40, turnsTotal: 40 },
      ultimateEffect: null,
    } as const;
    const magnetFire = { kind: "magnet", botId: magnet.id, at: { x: magnet.x, y: magnet.y }, items: [{ kind: "bucket" }] } as const;
    const refill = { kind: "fullTank", botId: fullTank.id, at: { x: fullTank.x, y: fullTank.y } } as const;
    const freshStart = { id: fullTank.id, x: (fullTank.x + 1) % spawn.width, y: fullTank.y };
    const combined: PublicTick = {
      ...turn,
      snapshot: { ...turn.snapshot, bots: [charged, fullTank, ...others] },
      magnetFires: [magnetFire],
      fires: turn.order.indexOf(magnet.id) < turn.order.indexOf(fullTank.id) ? [magnetFire, refill] : [refill, magnetFire],
      freshStarts: [freshStart],
    };
    const wire = JSON.parse(JSON.stringify(compactTick(combined, spawn.bots.map(({ id }) => id)))) as CompactTick;
    expect(Object.keys(wire)).toEqual(["tick", "bots", "moves", "throws", "items", "pickups", "itemsWaiting", "magnetFires", "ultimates", "fires", "freshStarts"]);
    expect(expandTick(wire, spawn)).toEqual(combined);
  });

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
      for (const tick of playRound(ruleSetId, 11).ticks) for (const t of tick.throws) seen.add(t.outcome === "hit" && t.bucket === true ? "bucketHit" : t.outcome);
    }
    expect([...seen].sort()).toEqual(COMPACT_OUTCOMES.filter((outcome) => outcome !== "dodged").sort());
  });

  test("a dodge uses the appended outcome and carries no hit chance", () => {
    const { spawn, ticks } = playRound("standard", 7);
    const tick: PublicTick = { ...ticks[0]!, throws: [{ throwerId: "p0", targetId: "p1", distance: 2, outcome: "dodged" }] };
    const compact = compactTick(tick, spawn.bots.map((bot) => bot.id));
    expect(compact.throws).toEqual([[0, 6, 1, 2, -1]]);
    expect(expandTick(compact, spawn)).toEqual(tick);
  });

  test("Magnet queues and bucket-first pulls round-trip while legacy ticks still expand", () => {
    const { spawn, ticks } = playRound("standard", 7);
    const turn = ticks[0]!;
    const tick: PublicTick = {
      ...turn,
      snapshot: { ...turn.snapshot, bots: turn.snapshot.bots.map((bot, i) => i === 0
        ? { ...bot, item: "bucket", itemsWaiting: ["mudBall", "umbrella"] }
        : bot) },
      magnetFires: [{ kind: "magnet", botId: "p0", at: { x: 3, y: 2 }, items: [
        { kind: "bucket" }, { kind: "mudBall", from: { x: 3, y: 1 } }, { kind: "umbrella", from: { x: 2, y: 2 } },
      ] }],
    };
    const order = spawn.bots.map((bot) => bot.id);
    const wire = JSON.parse(JSON.stringify(compactTick(tick, order))) as CompactTick;
    expect(wire.itemsWaiting).toEqual([[0, 3, 1]]);
    expect(wire.magnetFires).toEqual([[0, 3, 2, [[3, 3, 1], [1, 2, 2]], 2]]);
    expect(wire.bots.every((bot) => bot.length === 8)).toBe(true);
    expect(expandTick(wire, spawn)).toEqual({ ...tick, fires: tick.magnetFires! });

    const oldFire = expandTick({ ...wire, magnetFires: [[0, 3, 2, [[3, 3, 1], [1, 2, 2]], 1]] }, spawn).magnetFires?.[0];
    expect(oldFire?.items).toEqual([
      { kind: "mudBall", from: { x: 3, y: 1 } }, { kind: "umbrella", from: { x: 2, y: 2 } }, { kind: "bucket" },
    ]);

    const { itemsWaiting: _queue, magnetFires: _fires, ...legacy } = wire;
    const next = expandTick(legacy, tick.snapshot);
    expect(next.snapshot.bots[0]?.item).toBe("bucket");
    expect(next.snapshot.bots[0]).not.toHaveProperty("itemsWaiting");
    expect(next).not.toHaveProperty("magnetFires");
    expect(expandTick(compactTick(turn, order), spawn)).toEqual(turn);
  });

  test("all ultimate fires and active counts round-trip in move order", () => {
    const { spawn, ticks } = playRound("standard", 7);
    const turn = ticks[0]!;
    const at = { x: 2, y: 2 };
    const front = { x: 2, y: 1 };
    const side = { x: 3, y: 2 };
    const shot = { throwerId: "p0", outcome: "hit", targetId: "p1", distance: 1, hitChance: 100 } as const;
    const fires: NonNullable<PublicTick["fires"]> = [
      { botId: "p7", kind: "magnet", at, items: [{ kind: "bucket" }] },
      { botId: "p5", kind: "splash", at, squares: [{ ...front, targetId: "p1", outcome: "hit" }, { ...side, targetId: "p2", outcome: "miss" }] },
      { botId: "p0", kind: "dash", at, path: [front], shot, points: 2 },
      { botId: "p3", kind: "mudBomb", at, center: front, area: [at, front], affected: ["p1"], points: 1 },
      { botId: "p2", kind: "whirlwind", at, area: [at, front], affected: ["p3", "p4"], points: 1 },
      { botId: "p4", kind: "smoke", at },
      { botId: "p6", kind: "bigUmbrella", at },
      { botId: "p1", kind: "fullTank", at },
    ];
    const bots = turn.snapshot.bots.map((bot): PublicSnapshot["bots"][number] => {
      switch (bot.id) {
        case "p0": return { ...bot, ultimate: { id: "dash", kind: "ready" }, ultimateEffect: null };
        case "p1": return { ...bot, ultimate: { id: "fullTank", kind: "charging", turnsLeft: 7, turnsTotal: 8 }, ultimateEffect: { kind: "fullTank", freeShots: 2 } };
        case "p4": return { ...bot, ultimate: { id: "smoke", kind: "charging", turnsLeft: 40, turnsTotal: 40 }, ultimateEffect: { kind: "smoke", turnsLeft: 9 } };
        case "p6": return { ...bot, ultimate: { id: "bigUmbrella", kind: "ready" }, ultimateEffect: { kind: "bigUmbrella", blocksLeft: 4 } };
        default: return bot;
      }
    });
    const order = spawn.bots.map((bot) => bot.id);
    const fireOrder = fires.map((fire) => fire.botId);
    const moveOrder = [...fireOrder, ...order.filter((id) => !fireOrder.includes(id))];
    const wire = compactTick({ ...turn, order: moveOrder, fires, throws: [shot], snapshot: { ...turn.snapshot, bots } }, order);
    expect(wire.ultimates).toEqual([[0, 0, 0, 0, 0], [1, 3, 7, 2, 8], [4, 1, 40, 9, 40], [6, 6, 0, 4, 0]]);
    expect(wire.magnetFires).toEqual([[7, 2, 2, [], 1]]);
    expect(wire.fires?.[1]).toEqual([0, "dash", 2, 2, [[2, 1]]]);
    const expanded = expandTick(wire, spawn);
    expect(expanded.fires).toEqual(fires);
    expect(expanded.snapshot.bots).toEqual(bots);
    expect(() => expandTick({ ...wire, throws: [] }, spawn)).toThrow("has no shot");
    expect(() => expandTick({ ...wire, fires: [[0, "dash", spawn.width, 0, []]] }, spawn)).toThrow("outside the board");
    expect(expandTick(compactTick(turn, order), expanded.snapshot).snapshot.bots.every((bot) => bot.ultimate === undefined)).toBe(true);
  });

  test("items, pickups, held items and both effects take part in the round trips above", () => {
    const seen = new Set<string>();
    for (const ruleSetId of RULE_SET_IDS) {
      for (const tick of playRound(ruleSetId, 7).ticks) {
        if (tick.snapshot.items.length > 0) seen.add("items");
        if (tick.pickups.length > 0) seen.add("pickups");
        for (const bot of tick.snapshot.bots) {
          if (bot.item !== null) seen.add(`holds ${bot.item}`);
          if (bot.effect !== null) seen.add(bot.effect.kind);
        }
      }
    }
    expect([...seen].sort()).toEqual(["dizzy", "holds bucket", "holds mudBall", "holds pinwheel", "holds umbrella", "items", "pickups", "stuck"]);
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
      ["a queue lacks an acting item", { ...good, bots: [[0, 0, 0, 0, 0, 0, 0, 0], ...good.bots.slice(1)], itemsWaiting: [[0, 1]] }],
      ["a queue exceeds the hand capacity", { ...good, itemsWaiting: [[0, 1, 2, 3]] }],
      ["a queue names an unknown item", { ...good, itemsWaiting: [[0, 999]] }],
      ["a fresh start names a tank out of range", { ...good, freshStarts: [[999, 0, 0]] }],
      ["a fresh start lands off the board", { ...good, freshStarts: [[0, spawn.width, 0]] }],
      ["a tank takes two fresh starts", { ...good, freshStarts: [[0, 0, 0], [0, 1, 0]] }],
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
