import { describe, expect, test } from "bun:test";
import type { BoardItem, BotState, ItemKind, RoundState, Snapshot, Strategy } from "../types.ts";
import { STANDARD_RULE_SET_ID } from "../combat/rule-sets.ts";
import { decide } from "../strategy/decide.ts";
import { act, bot, mode, rule, snapshotOf, strategyOf, stubRng, when } from "../strategy/test-helpers.ts";
import { resolveTick } from "../round/resolve.ts";
import { createOpenRound, createRound, joinRound, stepRound } from "../round/round.ts";
import { createRng } from "../round/rng.ts";
import { PRESETS } from "../strategy/presets.ts";
import { ITEM_RULES, ageItems, itemCap, pickUp, spawnItem } from "./items.ts";

const waiter: Strategy = strategyOf([mode("main", [], act("wait"))]);
const driver: Strategy = strategyOf([mode("main", [], act("stepForward"))]);
const thrower: Strategy = strategyOf([mode("main", [], act("throw"))]);

const bucketAt = (x: number, y: number, turnsLeft = 5): BoardItem => ({ kind: "bucket", x, y, turnsLeft });

/**
 * A round of two tanks placed where the test needs them. createRound spawns at random squares,
 * so the test replaces the spawn snapshot before the first turn; the round plays on from it.
 */
function roundWith(players: readonly { id: string; strategy: Strategy }[], bots: readonly BotState[], items: readonly BoardItem[] = [], seed = 1): RoundState {
  const state = createRound({ seed, ticksTotal: 60, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players, items: true });
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

  test("an umbrella turns a hit into a block: no point moves, and the umbrella is used up", () => {
    const result = resolveTick(snapshotOf([a, { ...b, item: "umbrella" }]), moves, ["a", "b"], stubRng({ chance: [true] }));
    expect(result.throws[0]?.outcome).toBe("blocked");
    expect(result.placements.map((p) => [p.id, p.score, p.item])).toEqual([
      ["a", 0, null],
      ["b", 0, null],
    ]);
  });

  test("a miss leaves the umbrella", () => {
    const result = resolveTick(snapshotOf([a, { ...b, item: "umbrella" }]), moves, ["a", "b"], stubRng({ chance: [false] }));
    expect(result.throws[0]?.outcome).toBe("miss");
    expect(result.placements[1]?.item).toBe("umbrella");
  });

  test("a mud ball or a pinwheel acts on the holder's hit and is used up", () => {
    for (const [item, effect] of [["mudBall", "stuck"], ["pinwheel", "dizzy"]] as const) {
      const result = resolveTick(snapshotOf([{ ...a, item }, b]), moves, ["a", "b"], stubRng({ chance: [true] }));
      expect(result.throws[0]?.outcome).toBe("hit");
      expect(result.inflicted.get("b")).toBe(effect);
      expect(result.placements[0]?.item).toBeNull();
    }
  });

  test("a bucket makes the holder's hit move 2 points, and is used up", () => {
    const result = resolveTick(snapshotOf([{ ...a, item: "bucket" }, b]), moves, ["a", "b"], stubRng({ chance: [true] }));
    expect(result.throws[0]).toMatchObject({ outcome: "hit", bucket: true });
    expect(result.placements.map((p) => [p.score, p.item])).toEqual([
      [ITEM_RULES.bucketHitPoints, null],
      [-ITEM_RULES.bucketHitPoints, null],
    ]);
  });

  test("an umbrella blocks a bucket's hit too, and the bucket stays for the next one", () => {
    const result = resolveTick(snapshotOf([{ ...a, item: "bucket" }, { ...b, item: "umbrella" }]), moves, ["a", "b"], stubRng({ chance: [true] }));
    expect(result.throws[0]?.outcome).toBe("blocked");
    expect(result.placements.map((p) => [p.score, p.item])).toEqual([
      [0, "bucket"],
      [0, null],
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
  test("a tank hit on turn t cannot drive on t+1 and t+2, and drives again on t+3", () => {
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
      for (let turn = 0; turn < 3; turn++) {
        stepRound(state);
        rows.push(tank(state, "b").y);
      }
      expect(rows).toEqual([0, 0, 1]);
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

describe("picking up", () => {
  test("an empty hand takes the item on its square, and a full hand leaves it on the board", () => {
    const carriers: { id: string; x: number; y: number; item: ItemKind | null }[] = [
      { id: "a", x: 1, y: 1, item: null },
      { id: "b", x: 3, y: 3, item: "pinwheel" },
    ];
    // stubRng fails on any draw: taking a bucket draws nothing, and a full hand takes nothing.
    const { items, pickups } = pickUp([bucketAt(1, 1), { kind: "umbrella", x: 3, y: 3, turnsLeft: 9 }], carriers, stubRng());
    expect(pickups).toEqual([{ botId: "a", item: "bucket" }]);
    expect(carriers.map((c) => c.item)).toEqual(["bucket", "pinwheel"]);
    expect(items).toEqual([{ kind: "umbrella", x: 3, y: 3, turnsLeft: 9 }]);
  });

  test("a pinwheel or a mud ball backfires on its taker when the roll says so, and is used up", () => {
    for (const [kind, effect] of [["pinwheel", "dizzy"], ["mudBall", "stuck"]] as const) {
      const carriers: { id: string; x: number; y: number; item: ItemKind | null }[] = [{ id: "a", x: 1, y: 1, item: null }];
      const rng = stubRng({ chance: [true] });
      const backfired = pickUp([{ kind, x: 1, y: 1, turnsLeft: 9 }], carriers, rng);
      expect(rng.calls).toEqual([`chance:${ITEM_RULES.backfirePercent}`]);
      expect([carriers[0]?.item, backfired.backfires.get("a"), backfired.pickups, backfired.items]).toEqual([null, effect, [{ botId: "a", item: kind }], []]);
      const kept = [{ id: "a", x: 1, y: 1, item: null as ItemKind | null }];
      expect(pickUp([{ kind, x: 1, y: 1, turnsLeft: 9 }], kept, stubRng({ chance: [false] })).backfires.size).toBe(0);
      expect(kept[0]?.item).toBe(kind);
    }
  });

  test("a backfire at the end of turn t makes the taker dizzy on turns t+1 to t+3, like a hit", () => {
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
      const dizzyTurns = Array.from({ length: 4 }, () => stepRound(state).decisions.find((d) => d.botId === "a")?.dizzy === true);
      expect(dizzyTurns).toEqual([true, true, true, false]);
      return;
    }
    throw new Error("no seed in 1 to 199 backfired");
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
      const state = createRound({ seed, ticksTotal: 90, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players: PRESETS.slice(0, 8).map((p, i) => ({ id: `s${i}`, strategy: p.strategy })), items: true });
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
    expect(spawnItem(size, 8, tanks, [], createRng(1))).toBeNull();
    const item = spawnItem(size, 9, tanks, [], createRng(1));
    expect(item?.turnsLeft).toBe(ITEM_RULES.turnsOnBoard);
    expect(tanks.some((t) => t.x === item?.x && t.y === item?.y)).toBe(false);
    expect(spawnItem(size, 9, tanks, item === null ? [] : [item], createRng(1))).toBeNull();
  });

  test("an item nobody takes leaves the board after its turns", () => {
    let items = [bucketAt(2, 2, 2)];
    items = ageItems(items);
    expect(items.map((i) => i.turnsLeft)).toEqual([1]);
    expect(ageItems(items)).toEqual([]);
  });

  test("a round with items off never shows an item", () => {
    const state = createRound({ seed: 5, ticksTotal: 60, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players: [{ id: "a", strategy: driver }, { id: "b", strategy: driver }], items: false });
    while (!state.isOver) expect(stepRound(state).snapshot.items).toEqual([]);
  });

  test("a round with items on shows them, and a joining tank never lands on one", () => {
    const state = createOpenRound({ seed: 5, ticksTotal: 200, ruleSetId: STANDARD_RULE_SET_ID, boardFor: 2, items: true });
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
