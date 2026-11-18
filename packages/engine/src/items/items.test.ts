import { describe, expect, test } from "bun:test";
import type { BoardItem, BotState, ItemKind, RoundState, Snapshot, Strategy } from "../types.ts";
import { STANDARD_RULE_SET_ID } from "../combat/rule-sets.ts";
import { decide } from "../strategy/decide.ts";
import { act, bot, holding, mode, rule, snapshotOf, strategyOf, stubRng, when } from "../strategy/test-helpers.ts";
import { resolveTick } from "../round/resolve.ts";
import { createOpenRound, createRound, joinRound, stepRound } from "../round/round.ts";
import { createRng } from "../round/rng.ts";
import { PRESETS } from "../strategy/presets.ts";
import { ITEM_RULES, ageItems, itemCap, pickUp, spawnItems, spawnTiming, useOnce } from "./items.ts";

const waiter: Strategy = strategyOf([mode("main", [], act("wait"))]);
const driver: Strategy = strategyOf([mode("main", [], act("stepForward"))]);
const thrower: Strategy = strategyOf([mode("main", [], act("throw"))]);

const bucketAt = (x: number, y: number, turnsLeft = 5): BoardItem => ({ kind: "bucket", x, y, turnsLeft });

/**
 * A round of two tanks placed where the test needs them. createRound spawns at random squares,
 * so the test replaces the spawn snapshot before the first turn; the round plays on from it.
 */
function roundWith(players: readonly { id: string; strategy: Strategy }[], bots: readonly BotState[], items: readonly BoardItem[] = [], seed = 1): RoundState {
  const state = createRound({ seed, ticksTotal: 60, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players, items: true, ultimates: false });
  (state as { snapshot: Snapshot }).snapshot = { ...state.snapshot, width: 8, height: 6, bots, items };
  return state;
}

const tank = (state: RoundState, id: string): BotState => {
  const found = state.snapshot.bots.find((b) => b.id === id);
  if (found === undefined) throw new Error(`no tank ${id}`);
  return found;
};

describe("a hit with an item", () => {
  const a = bot("a", 0, 1, "E");
  const b = bot("b", 1, 1, "E");
  const moves = [
    { botId: "a", move: "T" as const },
    { botId: "b", move: "W" as const },
  ];

  test("an umbrella turns a hit into a block: no point moves, and one of its two blocks is used", () => {
    const result = resolveTick(snapshotOf([a, holding(b, "umbrella")]), moves, ["a", "b"], stubRng({ chance: [true] }));
    expect(result.throws[0]?.outcome).toBe("blocked");
    expect(result.placements.map((p) => [p.id, p.score, p.item, p.itemUses])).toEqual([
      ["a", 0, null, 0],
      ["b", 0, "umbrella", 1],
    ]);
  });

  test("an umbrella blocks two hits on one turn, and the third hit lands", () => {
    const c = bot("c", 2, 1, "W");
    const d = bot("d", 1, 0, "S");
    const three = [...moves, { botId: "c", move: "T" as const }, { botId: "d", move: "T" as const }];
    const result = resolveTick(snapshotOf([a, holding(b, "umbrella"), c, d]), three, ["a", "c", "d", "b"], stubRng({ chance: [true, true, true] }));
    expect(result.throws.map((t) => [t.throwerId, t.outcome])).toEqual([
      ["a", "blocked"],
      ["c", "blocked"],
      ["d", "hit"],
    ]);
    expect(result.placements.find((p) => p.id === "b")).toMatchObject({ item: null, itemUses: 0, score: -1 });
  });

  test("a miss leaves the umbrella", () => {
    const result = resolveTick(snapshotOf([a, holding(b, "umbrella")]), moves, ["a", "b"], stubRng({ chance: [false] }));
    expect(result.throws[0]?.outcome).toBe("miss");
    expect(result.placements[1]?.item).toBe("umbrella");
  });

  test("a mud ball or a pinwheel acts on the holder's hit and is used up", () => {
    for (const [item, effect] of [["mudBall", "stuck"], ["pinwheel", "dizzy"]] as const) {
      const result = resolveTick(snapshotOf([holding(a, item), b]), moves, ["a", "b"], stubRng({ chance: [true] }));
      expect(result.throws[0]?.outcome).toBe("hit");
      expect(result.inflicted.get("b")).toEqual({ kind: effect, turnsLeft: ITEM_RULES.effectTurns[effect] });
      expect(result.placements[0]?.item).toBeNull();
    }
  });

  test("a bucket makes each of the holder's next two hits move 2 points, then a hit moves 1", () => {
    let shooter: BotState = holding(a, "bucket");
    let target: BotState = b;
    const gains: number[] = [];
    for (let turn = 0; turn < 3; turn++) {
      const result = resolveTick(snapshotOf([shooter, target]), moves, ["a", "b"], stubRng({ chance: [true] }));
      const [after, hit] = result.placements;
      if (after === undefined || hit === undefined) throw new Error("test setup");
      gains.push(after.score - shooter.score);
      shooter = { ...shooter, score: after.score, item: after.item, itemUses: after.itemUses, water: shooter.water };
      target = { ...target, score: hit.score };
    }
    expect(gains).toEqual([ITEM_RULES.bucketHitPoints, ITEM_RULES.bucketHitPoints, 1]);
    expect([shooter.item, shooter.itemUses]).toEqual([null, 0]);
  });

  test("an umbrella blocks a bucket's hit too, and the bucket stays for the next one", () => {
    const result = resolveTick(snapshotOf([holding(a, "bucket"), holding(b, "umbrella")]), moves, ["a", "b"], stubRng({ chance: [true] }));
    expect(result.throws[0]?.outcome).toBe("blocked");
    expect(result.placements.map((p) => [p.score, p.item, p.itemUses])).toEqual([
      [0, "bucket", 2],
      [0, "umbrella", 1],
    ]);
  });

  test("a stuck tank does not drive or turn, and still throws", () => {
    const stuck = { kind: "stuck" as const, turnsLeft: 2 };
    for (const move of ["F", "L", "R45"] as const) {
      const result = resolveTick(snapshotOf([bot("a", 3, 3, "N", { effect: stuck }), bot("b", 0, 0, "S")]), [{ botId: "a", move }, { botId: "b", move: "W" }], ["a", "b"], stubRng());
      expect([move, result.placements[0]?.x, result.placements[0]?.y, result.placements[0]?.direction]).toEqual([move, 3, 3, "N"]);
    }
    const thrown = resolveTick(snapshotOf([bot("a", 0, 1, "E", { effect: stuck }), bot("b", 1, 1, "N")]), [{ botId: "a", move: "T" }, { botId: "b", move: "W" }], ["a", "b"], stubRng({ chance: [true] }));
    expect(thrown.throws[0]?.outcome).toBe("hit");
  });

  test("a miss keeps the mud ball", () => {
    const result = resolveTick(snapshotOf([{ ...a, item: "mudBall" }, b]), moves, ["a", "b"], stubRng({ chance: [false] }));
    expect(result.inflicted.size).toBe(0);
    expect(result.placements[0]?.item).toBe("mudBall");
  });
});

describe("how long an effect lasts", () => {
  test("a tank hit on turn t cannot drive for ITEM_RULES.effectTurns.stuck turns, and drives again after them", () => {
    // Find a seed whose first throw hits, so the effect comes from a real hit in the round.
    for (let seed = 1; seed < 100; seed++) {
      const state = roundWith(
        [
          { id: "a", strategy: thrower },
          { id: "b", strategy: driver },
        ],
        // b faces a wall, so its drive on the hit turn changes nothing; it turns no way and stays in a's line.
        [bot("a", 0, 0, "E", { item: "mudBall" }), bot("b", 1, 0, "N")],
        [],
        seed,
      );
      const hitTurn = stepRound(state);
      if (hitTurn.throws[0]?.outcome !== "hit") continue;
      expect(tank(state, "b").effect).toEqual({ kind: "stuck", turnsLeft: ITEM_RULES.effectTurns.stuck });
      // From here b faces south with free squares ahead, and a stops throwing.
      (state as { snapshot: Snapshot }).snapshot = {
        ...state.snapshot,
        bots: state.snapshot.bots.map((t) => (t.id === "b" ? { ...t, direction: "S" as const } : { ...t, item: null })),
      };
      const rows: number[] = [];
      const stuck = ITEM_RULES.effectTurns.stuck;
      for (let turn = 0; turn <= stuck; turn++) {
        stepRound(state);
        rows.push(tank(state, "b").y);
      }
      expect(rows).toEqual([...Array.from({ length: stuck }, () => 0), 1]);
      expect(tank(state, "b").effect).toBeNull();
      return;
    }
    throw new Error("no seed in 1 to 99 gave a hit on the first throw");
  });

  test("a dizzy tank checks its rules from the bottom up, and a running fallback stays last", () => {
    const always = when("myEffect", { effect: "stuck" }, true);
    const strategy = strategyOf([mode("main", [rule("first", [always], act("turn", { way: "left" })), rule("second", [always], act("turn", { way: "right" }))], act("wait"))]);
    const me = bot("me", 3, 3, "N");
    const plain = decide({ self: me, snapshot: snapshotOf([me]) }, strategy, stubRng());
    const dizzyMe = { ...me, effect: { kind: "dizzy" as const, turnsLeft: 2 } };
    const dizzy = decide({ self: dizzyMe, snapshot: snapshotOf([dizzyMe]) }, strategy, stubRng());
    expect([plain.ruleId, dizzy.ruleId]).toEqual(["first", "second"]);
    expect([plain.dizzy, dizzy.dizzy]).toEqual([undefined, true]);
  });
});

describe("a pinwheel's spin", () => {
  test("a dizzy tank spins right for its first 2 turns, ending turned round, then checks its rules from the bottom up", () => {
    const always = when("myEffect", { effect: "stuck" }, true);
    const strategy = strategyOf([mode("main", [rule("first", [always], act("turn", { way: "left" })), rule("second", [always], act("wait"))], act("wait"))]);
    const me = bot("me", 3, 3, "N");
    const state = roundWith([{ id: "me", strategy }, { id: "far", strategy: waiter }], [{ ...me, effect: { kind: "dizzy", turnsLeft: ITEM_RULES.effectTurns.dizzy } }, bot("far", 7, 5, "W")]);
    const turns = Array.from({ length: ITEM_RULES.effectTurns.dizzy }, () => stepRound(state).decisions[0]);
    // Two right turns of 90 degrees: the tank faces the other way, and no rule ran.
    expect(turns.slice(0, 2).map((d) => [d?.move, d?.ruleId, d?.spin])).toEqual([["R", null, true], ["R", null, true]]);
    // The other 4 turns read the rules from the bottom up, so "second" runs before "first".
    expect(turns.slice(2).map((d) => [d?.ruleId, d?.spin, d?.dizzy])).toEqual(Array.from({ length: 4 }, () => ["second", undefined, true]));
  });

  test("the spin turns the tank 180 degrees in two turns", () => {
    const state = roundWith([{ id: "me", strategy: waiter }, { id: "far", strategy: waiter }], [{ ...bot("me", 3, 3, "N"), effect: { kind: "dizzy", turnsLeft: ITEM_RULES.effectTurns.dizzy } }, bot("far", 7, 5, "W")]);
    stepRound(state);
    expect(tank(state, "me").direction).toBe("E");
    stepRound(state);
    expect(tank(state, "me").direction).toBe("S");
  });
});

describe("picking up", () => {
  test("an empty hand takes the item on its square, and a full hand leaves it on the board", () => {
    const carriers: { id: string; x: number; y: number; item: ItemKind | null; itemUses: number }[] = [
      { id: "a", x: 1, y: 1, item: null, itemUses: 0 },
      { id: "b", x: 3, y: 3, item: "pinwheel", itemUses: 1 },
    ];
    // stubRng fails on any draw: taking a bucket draws nothing, and a full hand takes nothing.
    const { items, pickups } = pickUp([bucketAt(1, 1), { kind: "umbrella", x: 3, y: 3, turnsLeft: 9 }], carriers, stubRng());
    expect(pickups).toEqual([{ botId: "a", item: "bucket" }]);
    expect(carriers.map((c) => c.item)).toEqual(["bucket", "pinwheel"]);
    expect(items).toEqual([{ kind: "umbrella", x: 3, y: 3, turnsLeft: 9 }]);
  });

  test("a pinwheel or a mud ball backfires on its taker when the roll says so, and is used up", () => {
    for (const [kind, effect] of [["pinwheel", "dizzy"], ["mudBall", "stuck"]] as const) {
      const carriers: { id: string; x: number; y: number; item: ItemKind | null; itemUses: number }[] = [{ id: "a", x: 1, y: 1, item: null, itemUses: 0 }];
      const rng = stubRng({ chance: [true] });
      const backfired = pickUp([{ kind, x: 1, y: 1, turnsLeft: 9 }], carriers, rng);
      expect(rng.calls).toEqual([`chance:${ITEM_RULES.backfirePercent}`]);
      expect([carriers[0]?.item, backfired.backfires.get("a"), backfired.pickups, backfired.items]).toEqual([null, effect, [{ botId: "a", item: kind }], []]);
      const kept = [{ id: "a", x: 1, y: 1, item: null as ItemKind | null, itemUses: 0 }];
      expect(pickUp([{ kind, x: 1, y: 1, turnsLeft: 9 }], kept, stubRng({ chance: [false] })).backfires.size).toBe(0);
      expect(kept[0]?.item).toBe(kind);
    }
  });

  test("a backfire at the end of turn t makes the taker dizzy for ITEM_RULES.effectTurns.dizzy turns, like a hit", () => {
    for (let seed = 1; seed < 200; seed++) {
      const state = roundWith(
        [
          { id: "a", strategy: driver },
          { id: "b", strategy: waiter },
        ],
        [bot("a", 0, 0, "E"), bot("b", 7, 5, "N")],
        [{ kind: "pinwheel", x: 1, y: 0, turnsLeft: 9 }],
        seed,
      );
      stepRound(state);
      if (tank(state, "a").item !== null) continue;
      expect(tank(state, "a").effect).toEqual({ kind: "dizzy", turnsLeft: ITEM_RULES.effectTurns.dizzy });
      const dizzy = ITEM_RULES.effectTurns.dizzy;
      const dizzyTurns = Array.from({ length: dizzy + 1 }, () => stepRound(state).decisions.find((d) => d.botId === "a")?.dizzy === true);
      expect(dizzyTurns).toEqual([...Array.from({ length: dizzy }, () => true), false]);
      return;
    }
    throw new Error("no seed in 1 to 199 backfired");
  });

  test("items are twice as strong (owner, 2026-11-16): two buckets' hits, two umbrella blocks, double effects", () => {
    expect(ITEM_RULES.uses).toEqual({ bucket: 2, umbrella: 2, pinwheel: 1, mudBall: 1 });
    expect(ITEM_RULES.effectTurns).toEqual({ dizzy: 6, stuck: 4 });
    const holder = { item: "bucket" as ItemKind | null, itemUses: ITEM_RULES.uses.bucket };
    useOnce(holder);
    expect(holder).toEqual({ item: "bucket", itemUses: 1 });
    useOnce(holder);
    expect(holder).toEqual({ item: null, itemUses: 0 });
    const carriers: { id: string; x: number; y: number; item: ItemKind | null; itemUses: number }[] = [{ id: "a", x: 1, y: 1, item: null, itemUses: 0 }];
    pickUp([{ kind: "umbrella", x: 1, y: 1, turnsLeft: 9 }], carriers, stubRng());
    expect(carriers[0]).toMatchObject({ item: "umbrella", itemUses: 2 });
  });

  test("a tank that drives onto an item takes it at the end of the turn", () => {
    const state = roundWith(
      [
        { id: "a", strategy: driver },
        { id: "b", strategy: waiter },
      ],
      [bot("a", 0, 0, "E", { water: 0 }), bot("b", 7, 5, "N")],
      [{ kind: "umbrella", x: 1, y: 0, turnsLeft: 9 }],
    );
    const turn = stepRound(state);
    expect(turn.pickups).toEqual([{ botId: "a", item: "umbrella" }]);
    expect(tank(state, "a").item).toBe("umbrella");
    expect(state.snapshot.items).toEqual([]);
  });
});

describe("with items, the game stays zero-sum", () => {
  test("in rounds of every play style with items on, the points of all tanks add up to 0 on every turn", () => {
    let bucketHits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = createRound({ seed, ticksTotal: 90, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players: PRESETS.slice(0, 8).map((p, i) => ({ id: `s${i}`, strategy: p.strategy })), items: true, ultimates: false });
      while (!state.isOver) {
        const turn = stepRound(state);
        bucketHits += turn.throws.filter((t) => t.outcome === "hit" && t.bucket === true).length;
        expect(turn.snapshot.bots.reduce((sum, t) => sum + t.score, 0)).toBe(0);
      }
    }
    expect(bucketHits).toBeGreaterThan(0);
  });
});

describe("appearing and vanishing", () => {
  test("one item appears at the end of every 10th turn while the board holds fewer than the cap", () => {
    expect([itemCap(2), itemCap(8), itemCap(9), itemCap(512)]).toEqual([1, 2, 2, 128]);
    const tanks = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const size = { width: 8, height: 6 };
    expect(spawnItems(size, 8, tanks, [], createRng(1))).toEqual([]);
    const [item, ...more] = spawnItems(size, 9, tanks, [], createRng(1));
    expect(more).toEqual([]);
    expect(item?.turnsLeft).toBe(ITEM_RULES.turnsOnBoard);
    expect(tanks.some((t) => t.x === item?.x && t.y === item?.y)).toBe(false);
    expect(spawnItems(size, 9, tanks, item === undefined ? [] : [item], createRng(1))).toEqual([]);
  });

  test("past 20 tanks items come more often in small steps; 20 tanks or fewer keep one per 10 turns", () => {
    expect([1, 20, 21, 25, 30, 40, 100, 200, 512].map((n) => spawnTiming(n))).toEqual([
      { every: 10, count: 1 },
      { every: 10, count: 1 },
      { every: 10, count: 1 },
      { every: 8, count: 1 },
      { every: 7, count: 1 },
      { every: 5, count: 1 },
      { every: 2, count: 1 },
      { every: 1, count: 1 },
      { every: 1, count: 3 },
    ]);
  });

  test("a spawn turn with room for several items puts them on distinct free squares, within the cap", () => {
    const size = { width: 40, height: 30 };
    const tanks = Array.from({ length: 512 }, (_, i) => ({ x: i % 40, y: Math.floor(i / 40) }));
    const added = spawnItems(size, 0, tanks, [], createRng(4));
    expect(added).toHaveLength(spawnTiming(512).count);
    expect(new Set(added.map((i) => `${i.x},${i.y}`)).size).toBe(added.length);
    expect(added.some((i) => tanks.some((t) => t.x === i.x && t.y === i.y))).toBe(false);
    // One below the cap leaves room for one of the three.
    const nearlyFull = Array.from({ length: itemCap(512) - 1 }, (_, i) => ({ kind: "bucket" as const, x: i % 40, y: 13 + Math.floor(i / 40), turnsLeft: 5 }));
    expect(spawnItems(size, 0, tanks, nearlyFull, createRng(4))).toHaveLength(1);
  });

  test("an item nobody takes leaves the board after its turns", () => {
    let items = [bucketAt(2, 2, 2)];
    items = ageItems(items);
    expect(items.map((i) => i.turnsLeft)).toEqual([1]);
    expect(ageItems(items)).toEqual([]);
  });

  test("a round with items off never shows an item", () => {
    const state = createRound({ seed: 5, ticksTotal: 60, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players: [{ id: "a", strategy: driver }, { id: "b", strategy: driver }], items: false, ultimates: false });
    while (!state.isOver) expect(stepRound(state).snapshot.items).toEqual([]);
  });

  test("a round with items on shows them, and a joining tank never lands on one", () => {
    const state = createOpenRound({ seed: 5, ticksTotal: 200, ruleSetId: STANDARD_RULE_SET_ID, boardFor: 2, items: true, ultimates: false });
    joinRound(state, { id: "a", strategy: waiter });
    joinRound(state, { id: "b", strategy: waiter });
    for (let turn = 0; turn < 10; turn++) stepRound(state);
    expect(state.snapshot.items.length).toBe(1);
    // Fill every free square but one with tanks, so the next one would land on the item if it could.
    const itemSquare = state.snapshot.items[0];
    const size = state.snapshot.width * state.snapshot.height;
    for (let i = state.snapshot.bots.length; i < size - 2; i++) joinRound(state, { id: `t${i}`, strategy: waiter });
    const last = joinRound(state, { id: "last", strategy: waiter });
    expect([last.x, last.y]).not.toEqual([itemSquare?.x, itemSquare?.y]);
  });
});
