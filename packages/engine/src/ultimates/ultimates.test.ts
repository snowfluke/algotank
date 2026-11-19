import { describe, expect, test } from "bun:test";
import {
  ACTIONS, CONDITIONS, DIRECTIONS, ITEM_RULES, PRESETS, STANDARD_RULE_SET_ID, ULTIMATE_IDS, ULTIMATE_RULES, createOpenRound, createRound,
  joinRound, parseStrategy, replaceStrategy, runRound, statsOfRound, statsView, stepRound, ultimateReach, waterAfterTick,
} from "../index.ts";
import type { BoardItem, BotState, Direction, ItemKind, Move, RoundState, Snapshot, Strategy, UltimateId } from "../index.ts";
import { rotate } from "../directions.ts";
import { cellAhead } from "../round/grid.ts";
import { resolveTick, type TickMove } from "../round/resolve.ts";
import { STANDARD, act, bot, contextFor, mode, rule, snapshotOf, stubRng, when, withPlacement } from "../strategy/test-helpers.ts";

const { waterCapacity, waterPerThrow } = STANDARD;

function waiting(ultimate: UltimateId, rules = mode("main", [], act("wait"))): Strategy {
  const parsed = parseStrategy({ ultimate, modes: [rules], build: { reach: 0, aim: 0, dodge: 0 } });
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return parsed.strategy;
}

function tankWith(ultimate: UltimateId, overrides: Partial<BotState> = {}): BotState {
  return bot("self", 3, 3, "E", { ultimate: { kind: "ready", id: ultimate }, ultimateEffect: null, ...overrides });
}

function placedRound(
  bots: readonly BotState[],
  strategies: Readonly<Record<string, Strategy>> = {},
  options: Partial<Snapshot> = {},
  ultimates = true,
  seed = 42,
): RoundState {
  const players = bots.map((tank) => ({ id: tank.id, strategy: strategies[tank.id] ?? waiting(tank.ultimate?.id ?? "magnet") }));
  const state = createRound({
    seed, ticksTotal: options.ticksTotal ?? 100, survivorsAfterRound: null,
    ruleSetId: STANDARD_RULE_SET_ID, players, items: false, ultimates,
  });
  const placed = state.snapshot.bots.map(({ itemsWaiting: _queue, ...spawn }, i) => ({ ...spawn, ...bots[i]! }));
  (state as { snapshot: Snapshot }).snapshot = snapshotOf(placed, { survivorsAfterRound: null, ...options });
  return state;
}

function fire(botId: string, ultimate: UltimateId): TickMove {
  return { botId, move: "W", ultimate };
}

function move(botId: string, move: Move = "W"): TickMove {
  return { botId, move };
}

function placement(result: ReturnType<typeof resolveTick>, id: string) {
  const found = result.placements.find((tank) => tank.id === id);
  if (found === undefined) throw new Error(`no tank ${id}`);
  return found;
}

function roundTank(round: RoundState, id: string): BotState {
  const found = round.snapshot.bots.find((tank) => tank.id === id);
  if (found === undefined) throw new Error(`no tank ${id}`);
  return found;
}

describe("ultimate triggers from the pre-turn snapshot", () => {
  const ahead = bot("ahead", 5, 3, "W");
  const far = bot("far", 8, 6, "N");
  const near = bot("near", 4, 3, "W");
  const side = bot("side", 4, 2, "S");
  const stuck = { kind: "stuck", turnsLeft: 1 } as const;

  const cases: readonly {
    id: UltimateId;
    yes: readonly (readonly [enemies: readonly BotState[], own?: Partial<BotState>])[];
    no: readonly (readonly [enemies: readonly BotState[], own?: Partial<BotState>])[];
  }[] = [
    { id: "dash", yes: [[[ahead]], [[bot("four", 7, 3, "N")]], [[bot("aimed", 3, 1, "S")]]], no: [
      [[near, ahead]], [[bot("five", 8, 3, "W")]], [[far]], [[ahead], { effect: stuck }],
      [[bot("away", 3, 1, "N")]], [[bot("aimed", 3, 1, "S")], { effect: stuck }],
      [[bot("aimed", 7, 1, "S"), bot("block", 8, 3, "N")], { x: 7 }],
    ] },
    { id: "smoke", yes: [[[ahead], { effect: stuck }]], no: [
      [[far]], [[ahead, { ...near, direction: "N" }], { x: 2 }], [[ahead], { ultimateEffect: { kind: "smoke", turnsLeft: 1 } }],
    ] },
    { id: "splash", yes: [[[near, side], { water: waterPerThrow }]], no: [
      [[near, far]], [[near, side], { water: waterPerThrow - 1 }],
    ] },
    { id: "fullTank", yes: [[[bot("off-line", 5, 2, "S")], { water: waterPerThrow - 1 }]], no: [
      [[ahead], { water: waterPerThrow }], [[far], { water: 0 }],
    ] },
    { id: "mudBomb", yes: [[[ahead], { water: 0, effect: stuck }]], no: [
      [[side]], [[bot("out-of-range", 7, 3, "W")]],
    ] },
    { id: "whirlwind", yes: [[[ahead, side]]], no: [[[ahead, far]]] },
    { id: "bigUmbrella", yes: [[[ahead]]], no: [
      [[far]], [[ahead], { ultimateEffect: { kind: "bigUmbrella", blocksLeft: 1 } }],
    ] },
  ];

  for (const { id, yes, no } of cases) {
    test(`${id} fires exactly when its trigger holds`, () => {
      for (const [enemies, overrides] of yes) {
        const turn = stepRound(placedRound([tankWith(id, overrides), ...enemies]));
        expect(turn.decisions[0]).toMatchObject({ actionId: "ultimate", move: "W", ultimate: id, nextModeId: "main" });
        expect(turn.fires?.some((event) => event.kind === id)).toBe(true);
      }
      for (const [enemies, overrides] of no) {
        const turn = stepRound(placedRound([tankWith(id, overrides), ...enemies]));
        expect(turn.decisions[0]?.ultimate).toBeUndefined();
        expect(turn.snapshot.bots[0]?.ultimate).toEqual({ kind: "ready", id });
      }
    });
  }

  test("an enemy that drives into the line during resolution cannot trigger Mud Bomb", () => {
    const enemy = bot("enemy", 5, 2, "S");
    const drive = waiting("magnet", mode("main", [], act("stepForward")));
    const state = placedRound([tankWith("mudBomb"), enemy], { enemy: drive });
    expect(stepRound(state).fires).toEqual([]);
    expect(stepRound(state).fires?.[0]?.kind).toBe("mudBomb");
  });

  test("Magnet first fires the turn after charging, with an item four diagonal squares away", () => {
    const state = placedRound(
      [tankWith("magnet", { ultimate: { id: "magnet", kind: "charging", turnsLeft: ULTIMATE_RULES.firstReadyTurn, turnsTotal: ULTIMATE_RULES.firstReadyTurn } }), bot("far", 0, 0, "N")],
      { far: waiting("fullTank") },
      { height: 9, items: [{ kind: "bucket", x: 7, y: 7, turnsLeft: ITEM_RULES.turnsOnBoard }] },
    );
    for (let turn = 1; turn <= ULTIMATE_RULES.firstReadyTurn; turn++) expect(stepRound(state).fires).toEqual([]);
    expect(roundTank(state, "self").ultimate).toEqual({ kind: "ready", id: "magnet" });
    const tick = stepRound(state);
    expect(tick.decisions[0]).toMatchObject({ actionId: "ultimate", move: "W", ultimate: "magnet" });
    expect(tick.fires).toEqual([{ botId: "self", at: { x: 3, y: 3 }, kind: "magnet", items: [
      { kind: "bucket" }, { kind: "bucket", from: { x: 7, y: 7 } },
    ] }]);
    expect(tick.snapshot.items).toEqual([]);
    expect(roundTank(state, "self")).toMatchObject({ item: "bucket", itemsWaiting: ["bucket"], itemUses: ITEM_RULES.uses.bucket,
      ultimate: { kind: "charging", id: "magnet", turnsLeft: ULTIMATE_RULES.rechargeTurns, turnsTotal: ULTIMATE_RULES.rechargeTurns } });
  });

  test("Magnet fires with room even if there are no floor items in reach", () => {
    for (const items of [[], [itemAt("umbrella", 8, 3)]]) {
      const state = placedRound([tankWith("magnet"), far], {}, { items });
      const turn = stepRound(state);
      expect(turn.decisions[0]?.ultimate).toBe("magnet");
      expect(turn.fires).toEqual([{ botId: "self", at: { x: 3, y: 3 }, kind: "magnet", items: [{ kind: "bucket" }] }]);
      expect(turn.snapshot.items).toEqual(items.map((item) => ({ ...item, turnsLeft: item.turnsLeft - 1 })));
      expect(roundTank(state, "self")).toMatchObject({ item: "bucket", itemUses: ITEM_RULES.uses.bucket, effect: null });
      expect(roundTank(state, "self")).not.toHaveProperty("itemsWaiting");
    }
  });

  test("Magnet waits with a full hand even with an item in reach", () => {
    const hand = { item: "bucket", itemsWaiting: ["mudBall", "umbrella"] } as const;
    const item = itemAt("bucket", 4, 3);
    const state = placedRound([tankWith("magnet", hand), far], {}, { items: [item] });
    const turn = stepRound(state);
    expect(turn.fires).toEqual([]);
    expect(turn.decisions[0]?.ultimate).toBeUndefined();
    expect(roundTank(state, "self")).toMatchObject({ ...hand, ultimate: { kind: "ready", id: "magnet" } });
    expect(turn.snapshot.items).toEqual([{ ...item, turnsLeft: item.turnsLeft - 1 }]);
  });
});

function itemAt(kind: ItemKind, x: number, y: number): BoardItem {
  return { kind, x, y, turnsLeft: ITEM_RULES.turnsOnBoard };
}

describe("Magnet hand", () => {
  const enemy = bot("enemy", 4, 3, "W");
  const throwing = waiting("magnet", mode("main", [], act("throw")));

  test("takes the bucket first and fills the last two slots by distance, row, then column", () => {
    const outside = itemAt("bucket", 8, 3);
    const farther = itemAt("pinwheel", 5, 1);
    const laterRow = itemAt("umbrella", 4, 4);
    const state = placedRound([tankWith("magnet"), enemy], {}, {
      items: [laterRow, farther, itemAt("mudBall", 4, 2), outside, itemAt("bucket", 2, 2)],
    });
    const turn = stepRound(state);
    expect(turn.fires).toEqual([{ botId: "self", at: { x: 3, y: 3 }, kind: "magnet", items: [
      { kind: "bucket" }, { kind: "bucket", from: { x: 2, y: 2 } }, { kind: "mudBall", from: { x: 4, y: 2 } },
    ] }]);
    expect(roundTank(state, "self")).toMatchObject({ item: "bucket", itemsWaiting: ["bucket", "mudBall"], itemUses: ITEM_RULES.uses.bucket });
    expect(turn.snapshot.items).toEqual([laterRow, farther, outside].map((item) => ({ ...item, turnsLeft: item.turnsLeft - 1 })));
    expect(turn.pickups).toEqual([]);
  });

  test("keeps the held item's remaining uses and queues the bucket before the nearest floor item", () => {
    const left = itemAt("mudBall", 4, 3);
    const pinwheel = itemAt("pinwheel", 3, 2);
    const observer = tankWith("fullTank", { id: "enemy", x: 6, direction: "W" });
    const state = placedRound([tankWith("magnet", { item: "bucket", itemUses: 1 }), observer], {}, {
      items: [left, pinwheel, itemAt("umbrella", 2, 2)],
    });
    expect(stepRound(state).fires?.[0]).toMatchObject({ items: [
      { kind: "bucket" }, { kind: "umbrella", from: { x: 2, y: 2 } },
    ] });
    expect(roundTank(state, "self")).toMatchObject({ item: "bucket", itemUses: 1, itemsWaiting: ["bucket", "umbrella"] });
    const self = contextFor(state.snapshot, "self");
    const other = contextFor(state.snapshot, "enemy");
    expect(CONDITIONS.myItem!.test(self, { item: "bucket" })).toBe(true);
    expect(CONDITIONS.myItem!.test(self, { item: "umbrella" })).toBe(false);
    expect(CONDITIONS.targetItem!.test(other, { target: "nearest", item: "bucket" })).toBe(true);
    expect(CONDITIONS.targetItem!.test(other, { target: "nearest", item: "umbrella" })).toBe(false);

    replaceStrategy(state, "self", waiting("magnet", mode("main", [], act("stepForward"))));
    const drive = stepRound(state);
    expect(roundTank(state, "self")).toMatchObject({ x: 4, y: 3, item: "bucket", itemUses: 1, itemsWaiting: ["bucket", "umbrella"] });
    expect(drive.pickups).toEqual([]);
    expect(drive.snapshot.items).toEqual([left, pinwheel].map((item) => ({ ...item, turnsLeft: item.turnsLeft - 2 })));
  });

  test("goToItem needs an empty hand even when Magnet has free slots", () => {
    const items = [itemAt("bucket", 4, 3)];
    const self = bot("self", 3, 3, "E", { item: "umbrella" });
    const snapshot = snapshotOf([self], { items });
    expect(ACTIONS.goToItem!.toMove({ self, snapshot }, { item: "any" }, stubRng())).toBeNull();
    const empty = bot("self", 3, 3, "E");
    expect(ACTIONS.goToItem!.toMove({ self: empty, snapshot: { ...snapshot, bots: [empty] } }, { item: "any" }, stubRng())).toBe("F");
  });

  test("adding the bucket then pulling a pinwheel and mud ball draws nothing and cannot backfire", () => {
    const rng = stubRng();
    const result = resolveTick(snapshotOf([tankWith("magnet"), enemy]), [fire("self", "magnet"), move("enemy")],
      ["self", "enemy"], rng, { items: [itemAt("pinwheel", 3, 2), itemAt("mudBall", 3, 4)], tick: 0, spawn: false });
    expect(result.fires[0]).toMatchObject({ items: [
      { kind: "bucket" }, { kind: "pinwheel", from: { x: 3, y: 2 } }, { kind: "mudBall", from: { x: 3, y: 4 } },
    ] });
    expect(result.pickups).toEqual([]);
    expect(result.backfires.size).toBe(0);
    expect(rng.calls).toEqual([]);
    expect(placement(result, "self")).toMatchObject({ item: "bucket", itemsWaiting: ["pinwheel", "mudBall"] });
  });

  test("uses the bucket, pulled pinwheel and pulled mud ball in order, with full uses on promotion", () => {
    const state = placedRound([tankWith("magnet"), enemy], { self: throwing }, {
      ticksTotal: 40, items: [itemAt("pinwheel", 3, 2), itemAt("mudBall", 3, 4)],
    });
    stepRound(state);
    const hits = [];
    while (hits.length < 4 && !state.isOver) {
      const turn = stepRound(state);
      const shot = turn.throws[0];
      if (shot?.outcome !== "hit") continue;
      const { item, itemUses, itemsWaiting } = roundTank(state, "self");
      hits.push({ item, itemUses, itemsWaiting, bucket: shot.bucket, effect: roundTank(state, "enemy").effect?.kind });
    }
    expect(hits).toEqual([
      { item: "bucket", itemUses: ITEM_RULES.uses.bucket - 1, itemsWaiting: ["pinwheel", "mudBall"], bucket: true, effect: undefined },
      { item: "pinwheel", itemUses: ITEM_RULES.uses.pinwheel, itemsWaiting: ["mudBall"], bucket: true, effect: undefined },
      { item: "mudBall", itemUses: ITEM_RULES.uses.mudBall, itemsWaiting: undefined, bucket: undefined, effect: "dizzy" },
      { item: null, itemUses: 0, itemsWaiting: undefined, bucket: undefined, effect: "stuck" },
    ]);
    expect(roundTank(state, "self")).not.toHaveProperty("itemsWaiting");
  });

  test("a pulled umbrella waits behind the bucket, then blocks for its full uses", () => {
    const state = placedRound([tankWith("magnet"), enemy], {}, {
      items: [itemAt("umbrella", 3, 2)],
    });
    stepRound(state);
    expect(roundTank(state, "self")).toMatchObject({ item: "bucket", itemsWaiting: ["umbrella"] });
    replaceStrategy(state, "self", throwing);
    while (roundTank(state, "self").item === "bucket" && !state.isOver) stepRound(state);
    expect(roundTank(state, "self")).toMatchObject({ item: "umbrella", itemUses: ITEM_RULES.uses.umbrella });
    replaceStrategy(state, "self", waiting("magnet"));
    replaceStrategy(state, "enemy", throwing);
    let blocks = 0;
    while (blocks < ITEM_RULES.uses.umbrella && !state.isOver) {
      const shot = stepRound(state).throws[0];
      if (shot?.outcome === "miss" || shot?.outcome === "dry") continue;
      expect(shot?.outcome).toBe("blocked");
      blocks += 1;
      const remaining = ITEM_RULES.uses.umbrella - blocks;
      expect(roundTank(state, "self")).toMatchObject(remaining > 0
        ? { item: "umbrella", itemUses: remaining }
        : { item: null, itemUses: 0 });
    }
    expect(blocks).toBe(ITEM_RULES.uses.umbrella);
    expect(roundTank(state, "self")).not.toHaveProperty("itemsWaiting");
  });

  test("a pulled umbrella waits behind the bucket and cannot block a later throw that turn", () => {
    const magnet = tankWith("magnet");
    const outcomes: Record<string, string | undefined> = {};
    for (const tanks of [[magnet, enemy], [enemy, magnet]]) {
      const state = placedRound(tanks, { enemy: throwing }, { items: [itemAt("umbrella", 3, 2)] });
      const turn = stepRound(state);
      outcomes[turn.order[0]!] = turn.throws[0]?.outcome;
      expect(roundTank(state, "self")).toMatchObject({ item: "bucket", itemUses: ITEM_RULES.uses.bucket, itemsWaiting: ["umbrella"] });
    }
    expect(outcomes).toEqual({ self: "hit", enemy: "hit" });
  });

  test("an empty-handed Magnet pulls an umbrella, holds the bucket and scores two on its next hit", () => {
    const state = placedRound([tankWith("magnet"), enemy], { self: throwing }, { items: [itemAt("umbrella", 3, 2)] });
    const turn = stepRound(state);
    expect(turn.fires?.[0]).toMatchObject({ items: [{ kind: "bucket" }, { kind: "umbrella", from: { x: 3, y: 2 } }] });
    expect(roundTank(state, "self")).toMatchObject({ item: "bucket", itemsWaiting: ["umbrella"], score: 0 });

    const shot = stepRound(state).throws[0];
    expect(shot).toMatchObject({ throwerId: "self", outcome: "hit", bucket: true });
    expect(roundTank(state, "self")).toMatchObject({ score: 2, item: "bucket", itemUses: ITEM_RULES.uses.bucket - 1, itemsWaiting: ["umbrella"] });
  });

  test("two ready Magnets claim a shared item once, in move order", () => {
    const state = placedRound([tankWith("magnet"), tankWith("magnet", { id: "other", x: 5 })], {}, {
      items: [itemAt("umbrella", 4, 3)],
    });
    const turn = stepRound(state);
    const [first, second] = turn.order;
    expect(turn.fires).toEqual([
      expect.objectContaining({ botId: first, kind: "magnet", items: [{ kind: "bucket" }, { kind: "umbrella", from: { x: 4, y: 3 } }] }),
      expect.objectContaining({ botId: second, kind: "magnet", items: [{ kind: "bucket" }] }),
    ]);
    expect(roundTank(state, first!)).toMatchObject({ item: "bucket", itemsWaiting: ["umbrella"] });
    expect(roundTank(state, second!).item).toBe("bucket");
    expect(roundTank(state, second!).ultimate?.kind).toBe("charging");
  });

  test("the nearer Magnet wins the floor item after reserving its bucket even when it moves second", () => {
    const near = tankWith("magnet", { id: "near", x: 5 });
    const far = tankWith("magnet", { id: "far", x: 2 });
    const holder = bot("holder", 6, 3, "W", { item: "pinwheel" });
    const result = resolveTick(snapshotOf([near, far, holder]), [fire("near", "magnet"), fire("far", "magnet"), move("holder")],
      ["far", "near", "holder"], stubRng(), { items: [itemAt("umbrella", 4, 3)], tick: 0, spawn: false });
    expect(result.fires).toMatchObject([{ botId: "far", items: [{ kind: "bucket" }] }, { botId: "near", items: [{ kind: "bucket" }, { kind: "umbrella", from: { x: 4, y: 3 } }] }]);
    expect(placement(result, "holder")).toMatchObject({ item: "pinwheel", itemUses: ITEM_RULES.uses.pinwheel });
  });

  test("a nearer Magnet claims floor items only up to its remaining room after the bucket", () => {
    const far = tankWith("magnet", { id: "far", x: 2 });
    const items = [itemAt("umbrella", 5, 4), itemAt("pinwheel", 5, 5)];
    const cases = [
      { hand: { item: "mudBall" }, nearWaiting: ["bucket", "umbrella"], farWaiting: ["pinwheel"] },
      { hand: { item: "mudBall", itemsWaiting: ["umbrella"] }, nearWaiting: ["umbrella", "bucket"], farWaiting: ["umbrella", "pinwheel"] },
    ] as const;
    for (const { hand, nearWaiting, farWaiting } of cases) {
      const near = tankWith("magnet", { id: "near", x: 5, ...hand });
      const result = resolveTick(snapshotOf([near, far]), [fire("near", "magnet"), fire("far", "magnet")],
        ["far", "near"], stubRng(), { items, tick: 0, spawn: false });
      expect(placement(result, "near")).toMatchObject({ item: "mudBall", itemsWaiting: nearWaiting });
      expect(placement(result, "far")).toMatchObject({ item: "bucket", itemsWaiting: farWaiting });
    }
  });
});

describe("Dash", () => {
  const dashing = tankWith("dash", { x: 2 });
  const shooter = bot("shooter", 0, 3, "E", { build: { reach: 2, aim: 0, dodge: 0 } });
  const moves = [fire("self", "dash"), move("shooter", "T")];

  test("a shot before and after the dash spends water and draws nothing", () => {
    for (const [order, distance] of [[["shooter", "self"], 2], [["self", "shooter"], 5]] as const) {
      const result = resolveTick(snapshotOf([dashing, shooter]), moves, order, stubRng());
      expect(result.fires).toEqual([{ botId: "self", kind: "dash", at: { x: 2, y: 3 }, path: [
        { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
      ], shot: { throwerId: "self", outcome: "empty" }, points: 0 }]);
      expect(result.throws.find((shot) => shot.throwerId === "shooter")).toEqual({ throwerId: "shooter", targetId: "self", distance, outcome: "dodged" });
      expect(placement(result, "shooter").water).toBe(waterCapacity - waterPerThrow);
      expect(placement(result, "self").score).toBe(0);
    }
  });

  test("a blocker arriving during the turn can stop the dash at zero without removing immunity", () => {
    const block = bot("block", 3, 2, "S");
    const result = resolveTick(snapshotOf([dashing, shooter, block]), [...moves, move("block", "F")],
      ["block", "self", "shooter"], stubRng());
    expect(result.fires[0]).toMatchObject({ path: [] });
    expect(result.throws.find((shot) => shot.throwerId === "shooter")?.outcome).toBe("dodged");
  });

  test("a dash stops before the edge or an occupied square", () => {
    for (const width of [4, 9]) {
      const block = bot("block", 4, 3, "W");
      const bots = width === 4 ? [dashing, shooter] : [dashing, shooter, block];
      const result = resolveTick(snapshotOf(bots, { width }), bots.map(({ id }) => id === "self" ? fire(id, "dash") : move(id)),
        bots.map(({ id }) => id), stubRng());
      expect(result.fires[0]).toMatchObject({ path: [{ x: 3, y: 3 }] });
    }
  });

  test("rams the first tank in range from the last square without using water, smoke chance or held items", () => {
    const target = bot("target", 7, 3, "W", { ultimateEffect: { kind: "smoke", turnsLeft: 4 } });
    const farther = bot("farther", 8, 3, "W");
    for (const item of ["bucket", "pinwheel", "mudBall"] as const) {
      const source = tankWith("dash", { x: 2, water: 0, item });
      const rng = stubRng();
      const result = resolveTick(snapshotOf([source, target, farther]), [fire("self", "dash"), move("target"), move("farther")],
        ["self", "target", "farther"], rng);
      const shot = { throwerId: "self", targetId: "target", distance: 2, outcome: "hit", hitChance: 100 } as const;
      expect(result.throws).toEqual([shot]);
      expect(result.fires[0]).toMatchObject({ shot, points: ULTIMATE_RULES.dash.points });
      expect(rng.calls).toEqual([]);
      expect(placement(result, "self")).toMatchObject({
        x: 5, water: waterAfterTick(0, false, STANDARD), score: ULTIMATE_RULES.dash.points, item, itemUses: ITEM_RULES.uses[item],
      });
      expect(placement(result, "target").score).toBe(-ULTIMATE_RULES.dash.points);
      expect(placement(result, "farther").score).toBe(0);
      expect(result.inflicted.size).toBe(0);
    }
  });

  test("a ram resolves between ordinary throws without rolling", () => {
    const tanks = [dashing, bot("target", 6, 3, "S"), bot("before", 6, 2, "S"), bot("after", 6, 4, "N")];
    const rng = stubRng({ chance: [false, false] });
    const result = resolveTick(snapshotOf(tanks), [fire("self", "dash"), move("target"), move("before", "T"), move("after", "T")],
      ["before", "self", "after", "target"], rng);
    expect(result.throws.map(({ throwerId, outcome }) => [throwerId, outcome])).toEqual([
      ["before", "miss"], ["self", "hit"], ["after", "miss"],
    ]);
    expect(rng.calls).toEqual(["chance:90", "chance:90"]);
  });

  test("the Big Umbrella checks the ram direction before the item umbrella", () => {
    for (const [direction, kind] of [["W", "bigUmbrella"], ["E", "umbrella"]] as const) {
      const target = bot("target", 6, 3, direction, { ultimateEffect: { kind: "bigUmbrella", blocksLeft: 1 }, item: "umbrella" });
      const result = resolveTick(snapshotOf([dashing, target]), [fire("self", "dash"), move("target")], ["self", "target"], stubRng());
      expect(result.fires[0]).toMatchObject({ points: 0, shot: { outcome: "blocked", targetId: "target", protection: { kind, pointsSaved: 2 } } });
      expect(placement(result, "target")).toMatchObject({ score: 0, itemUses: kind === "umbrella" ? 1 : 2,
        ultimateEffect: kind === "bigUmbrella" ? null : { kind: "bigUmbrella", blocksLeft: 1 } });
    }
  });

  test("a ram and normal shots from effect items leave a dashing tank untouched", () => {
    for (const item of ["pinwheel", "mudBall"] as const) {
      const target = bot("target", 6, 3, "E");
      const armed = bot("armed", 6, 2, "S", { item });
      const result = resolveTick(snapshotOf([dashing, target, armed]), [fire("self", "dash"), fire("target", "dash"), move("armed", "T")],
        ["armed", "self", "target"], stubRng());
      expect(result.throws.slice(0, 2)).toMatchObject([{ outcome: "dodged", targetId: "target" }, { outcome: "dodged", targetId: "target" }]);
      expect(placement(result, "armed").itemUses).toBe(ITEM_RULES.uses[item]);
      expect(placement(result, "target").score).toBe(0);
      expect(result.inflicted.size).toBe(0);
    }
  });

  test("a pickup on the final Dash square still rolls, and its backfire cannot stick the tank", () => {
    const state = placedRound([tankWith("dash"), bot("target", 6, 3, "W")], {}, { items: [itemAt("mudBall", 5, 3)] }, true, 1);
    const tick = stepRound(state);
    expect(tick.pickups).toEqual([{ botId: "self", item: "mudBall" }]);
    expect(roundTank(state, "self")).toMatchObject({ x: 5, item: null, effect: null });
  });
});

describe("Smoke", () => {
  test("quarters and rounds down the existing throw roll even when Smoke moves second", () => {
    const smoked = tankWith("smoke", { x: 4, effect: { kind: "stuck", turnsLeft: 2 } });
    const shooter = bot("shooter", 0, 3, "E", { build: { reach: 1, aim: 0, dodge: 0 }, item: "bucket" });
    const rng = stubRng();
    const result = resolveTick(snapshotOf([smoked, shooter]), [fire("self", "smoke"), move("shooter", "T")], ["shooter", "self"],
      { ...rng, next: () => { rng.calls.push("next"); return 0.08; } });
    expect(rng.calls).toEqual(["next"]);
    expect(result.throws[0]).toMatchObject({ outcome: "miss", hitChance: 8, protection: { kind: "smoke", pointsSaved: 2 } });
    expect(placement(result, "self").ultimateEffect).toEqual({ kind: "smoke", turnsLeft: 15 });
    expect(placement(result, "shooter").itemUses).toBe(ITEM_RULES.uses.bucket);
  });

  test("smoke counts its activation turn and expires after fifteen turns", () => {
    const state = placedRound([tankWith("smoke"), bot("threat", 4, 3, "W")]);
    for (let turn = 1; turn <= ULTIMATE_RULES.smoke.turns; turn++) {
      stepRound(state);
      expect(roundTank(state, "self").ultimateEffect).toEqual(turn === ULTIMATE_RULES.smoke.turns ? null : { kind: "smoke", turnsLeft: ULTIMATE_RULES.smoke.turns - turn });
    }
  });
});

describe("Big Umbrella", () => {
  test("checks each relative eighth before the item umbrella", () => {
    const covered = [true, true, true, false, false, false, true, true];
    for (let eighth = 0; eighth < DIRECTIONS.length; eighth++) {
      const facing: Direction = "SW";
      const incoming = rotate(facing, eighth);
      const target = tankWith("bigUmbrella", { direction: facing });
      const { itemsWaiting: _queue, ...withoutQueue } = target;
      const from = cellAhead(target, incoming);
      const shooter = bot("shooter", from.x, from.y, rotate(incoming, 4));
      for (const item of [null, "umbrella"] as const) {
        const withItem = { ...withoutQueue, item, itemUses: item === null ? 0 : ITEM_RULES.uses.umbrella };
        const result = resolveTick(snapshotOf([withItem, shooter]), [fire("self", "bigUmbrella"), move("shooter", "T")],
          ["shooter", "self"], stubRng({ chance: [true] }));
        expect(result.throws[0]?.outcome).toBe(covered[eighth] || item !== null ? "blocked" : "hit");
        expect(placement(result, "self").ultimateEffect).toEqual({ kind: "bigUmbrella", blocksLeft: covered[eighth] ? 2 : 3 });
        expect(placement(result, "self").itemUses).toBe(item === null ? 0 : covered[eighth] ? 2 : 1);
      }
    }
  });

  test("a miss leaves the umbrella up, and the fourth block exhausts it", () => {
    let target = tankWith("bigUmbrella", { ultimateEffect: { kind: "bigUmbrella", blocksLeft: 4 } });
    const shooter = bot("shooter", 4, 3, "W");
    for (const [roll, outcome, blocks] of [[false, "miss", 4], [true, "blocked", 3], [true, "blocked", 2],
      [true, "blocked", 1], [true, "blocked", 0], [true, "hit", 0]] as const) {
      const result = resolveTick(snapshotOf([target, shooter]), [move("self"), move("shooter", "T")],
        ["self", "shooter"], stubRng({ chance: [roll] }));
      expect(result.throws[0]?.outcome).toBe(outcome);
      target = withPlacement(target, placement(result, "self"));
      expect(target.ultimateEffect).toEqual(blocks === 0 ? null : { kind: "bigUmbrella", blocksLeft: blocks });
    }
  });
});

test("Full Tank fills up and grants three free aimed shots, including misses and blocks", () => {
  const empty = tankWith("fullTank", { water: 0, item: "bucket" });
  const away = bot("target", 7, 5, "W");
  const result = resolveTick(snapshotOf([empty, away]), [fire("self", "fullTank"), move("target")], ["target", "self"], stubRng());
  let source = withPlacement(empty, placement(result, "self"));
  expect(source.water).toBe(waterCapacity);
  expect(source.itemUses).toBe(ITEM_RULES.uses.bucket);
  expect(source.ultimateEffect).toEqual({ kind: "fullTank", freeShots: 3 });

  const moves = [move("self", "T"), move("target")];
  const emptyThrow = resolveTick(snapshotOf([source, away]), moves, ["self", "target"], stubRng());
  expect(emptyThrow.throws[0]?.outcome).toBe("empty");
  expect(placement(emptyThrow, "self").ultimateEffect).toEqual({ kind: "fullTank", freeShots: 3 });
  const target = bot("target", 4, 3, "W");
  for (const [roll, outcome, shots] of [[true, "hit", 2], [false, "miss", 1], [true, "blocked", 0], [true, "hit", 0]] as const) {
    const defender = outcome === "blocked" ? { ...target, item: "umbrella" as const, itemUses: 2 } : target;
    const rng = stubRng({ chance: [roll] });
    const turn = resolveTick(snapshotOf([source, defender]), moves, ["self", "target"], rng);
    expect(turn.throws[0]?.outcome).toBe(outcome);
    expect(rng.calls).toEqual(["chance:90"]);
    if (shots === 2) {
      expect(turn.throws[0]).toMatchObject({ bucket: true });
      expect(placement(turn, "target").score).toBe(-ITEM_RULES.bucketHitPoints);
      expect(placement(turn, "self").itemUses).toBe(ITEM_RULES.uses.bucket - 1);
    }
    source = withPlacement(source, placement(turn, "self"));
    expect(source.ultimateEffect).toEqual(shots === 0 ? null : { kind: "fullTank", freeShots: shots });
    expect(source.water).toBe(outcome === "hit" && shots === 0 ? waterCapacity - waterPerThrow : waterCapacity);
  }
});

describe("Splash Ring", () => {
  test("hits every occupied square clockwise for two points without rolling and empties the tank", () => {
    const source = tankWith("splash", { direction: "N", item: "bucket" });
    const bots = [source, bot("back", 3, 4, "S"), bot("left", 2, 3, "N"), bot("front", 3, 2, "E"), bot("right", 4, 3, "N")];
    const rng = stubRng();
    const result = resolveTick(snapshotOf(bots), [fire("self", "splash"), ...bots.slice(1).map(({ id }) => move(id))],
      bots.map(({ id }) => id), rng);
    const event = result.fires[0];
    if (event?.kind !== "splash") throw new Error("expected Splash");
    expect(event.squares.map((square) => [square.x, square.y, square.outcome])).toEqual([
      [3, 2, "hit"], [4, 2, "empty"], [4, 3, "hit"], [4, 4, "empty"],
      [3, 4, "hit"], [2, 4, "empty"], [2, 3, "hit"], [2, 2, "empty"],
    ]);
    expect(rng.calls).toEqual([]);
    expect(result.throws).toEqual([]);
    expect(placement(result, "self")).toMatchObject({ score: 8, water: 0, item: "bucket", itemUses: 2 });
    expect(result.placements.slice(1).map(({ score }) => score)).toEqual([-2, -2, -2, -2]);
  });

  test("only smoked tanks roll, front and side both at one in four, clockwise", () => {
    const bots = [tankWith("splash"), bot("front", 4, 3, "W"),
      bot("plain", 4, 4, "N"), bot("side", 3, 4, "N", { ultimateEffect: { kind: "smoke", turnsLeft: 4 } })];
    const expected = [["front", "miss"], ["plain", "hit"], ["side", "hit"]];
    const values = [0.25, 0.24];
    const rng = stubRng();
    const result = resolveTick(snapshotOf(bots), [fire("self", "splash"), fire("front", "smoke"), move("side"), move("plain")],
      ["self", "side", "front", "plain"], { ...rng, next: () => { const roll = values.shift(); if (roll === undefined) throw new Error("unexpected roll"); return roll; } });
    const event = result.fires[0];
    if (event?.kind !== "splash") throw new Error("expected Splash");
    expect(event.squares.filter((square) => square.outcome !== "empty").map(({ targetId, outcome }) => [targetId, outcome])).toEqual(expected);
    expect(event.squares.find((square) => square.targetId === "front")?.protection).toEqual({ kind: "smoke", pointsSaved: 2 });
    expect(result.placements.map(({ score }) => score)).toEqual([4, 0, -2, -2]);
    expect(values).toEqual([]);
    expect(rng.calls).toEqual([]);
  });

  test("held attack items stay and defenses block a ring hit as they do a throw", () => {
    for (const item of ["bucket", "pinwheel", "mudBall"] as const) {
      const source = tankWith("splash", { item });
      const front = bot("front", 4, 3, "W", { item: "umbrella" });
      const side = bot("side", 3, 4, "S", { item: "umbrella" });
      const dash = bot("dash", 4, 4, "S");
      const result = resolveTick(snapshotOf([source, front, side, dash]),
        [fire("self", "splash"), fire("front", "bigUmbrella"), move("side"), fire("dash", "dash")],
        ["self", "front", "side", "dash"], stubRng());
      const event = result.fires[0];
      if (event?.kind !== "splash") throw new Error("expected Splash");
      expect(event.squares.filter((square) => square.outcome !== "empty").map(({ targetId, outcome }) => [targetId, outcome]))
        .toEqual([["front", "blocked"], ["dash", "dodged"], ["side", "blocked"]]);
      expect(placement(result, "self")).toMatchObject({ score: 0, water: 0, item, itemUses: ITEM_RULES.uses[item] });
      expect(placement(result, "front")).toMatchObject({ ultimateEffect: { kind: "bigUmbrella", blocksLeft: 2 }, itemUses: 2 });
      expect(placement(result, "side").itemUses).toBe(1);
      expect(result.inflicted.size).toBe(0);
    }
  });

  test("Splash rolls share move order with normal throws before pickup and spawn draws", () => {
    const smoke = { kind: "smoke", turnsLeft: 4 } as const;
    const tanks = [
      bot("left", 2, 2, "E"), bot("left-side", 2, 3, "N", { ultimateEffect: smoke }),
      bot("right", 6, 2, "E"), bot("right-side", 6, 3, "S", { ultimateEffect: smoke }),
      bot("picker", 4, 5, "E"), bot("shooter", 1, 2, "E"),
    ];
    const moves = [fire("left", "splash"), move("left-side"), fire("right", "splash"), move("right-side"), move("picker", "F"), move("shooter", "T")];
    const rng = stubRng({ chance: [false, true], int: [0, 0] });
    const rolls = [0.2, 0.3];
    const result = resolveTick(snapshotOf(tanks), moves, ["right", "shooter", "left", "left-side", "right-side", "picker"],
      { ...rng, next: () => {
        rng.calls.push("next");
        const roll = rolls.shift();
        if (roll === undefined) throw new Error("unexpected Splash roll");
        return roll;
      } }, {
      items: [{ kind: "pinwheel", x: 5, y: 5, turnsLeft: 3 }], tick: 9, spawn: true,
    });
    expect(rng.calls).toEqual(["next", "chance:90", "next", "chance:20", "int:10", "int:57"]);
    expect(result.fires.map(({ botId }) => botId)).toEqual(["right", "left"]);
    expect(placement(result, "right").score).toBe(2);
    const left = result.fires[1];
    if (left?.kind !== "splash") throw new Error("expected Splash");
    expect(left.squares.find((square) => square.targetId === "left-side")?.outcome).toBe("miss");
  });

  test("a moved target is hit at its fire-time square and a newly picked umbrella waits", () => {
    const source = tankWith("splash");
    const front = bot("front", 4, 3, "E");
    const result = resolveTick(snapshotOf([source, front]), [fire("self", "splash"), move("front", "F")],
      ["self", "front"], stubRng(), { items: [{ x: 5, y: 3, kind: "umbrella", turnsLeft: 5 }], tick: 0, spawn: false });
    expect(result.fires[0]).toMatchObject({ squares: expect.arrayContaining([{ x: 4, y: 3, targetId: "front", outcome: "hit" }]) });
    expect(placement(result, "front")).toMatchObject({ x: 5, score: -2, item: "umbrella", itemUses: 2 });
  });

  test("Splash uses the last umbrella block before the tank picks up an item under it", () => {
    const front = bot("front", 4, 3, "W", { item: "umbrella", itemUses: 1 });
    const picker = waiting("magnet", mode("main", [], act("goToItem", { item: "any" })));
    const state = placedRound([tankWith("splash"), front, bot("side", 3, 4, "N")], { front: picker }, {
      items: [itemAt("bucket", front.x, front.y)],
    });
    const splash = stepRound(state);
    expect(splash.pickups).toEqual([{ botId: "front", item: "bucket" }]);
    expect(roundTank(state, "front").item).toBe("bucket");
    expect(splash.snapshot.items).toEqual([]);
  });

  test("goToItem cannot act when the nearest item is under the tank, and pickup still takes it", () => {
    const self = bot("self", 3, 3, "E");
    const picker = waiting("magnet", mode("main", [rule("get", [when("itemNear", { item: "any", n: 4 })], act("goToItem", { item: "any" }))], act("wait")));
    const state = placedRound([self, bot("far", 7, 7, "N")], { self: picker },
      { items: [itemAt("bucket", self.x, self.y), itemAt("umbrella", self.x + 1, self.y)] });
    const tick = stepRound(state);
    expect(tick.decisions[0]).toMatchObject({ ruleId: null, actionId: "wait", move: "W" });
    expect(tick.pickups).toEqual([{ botId: "self", item: "bucket" }]);
  });

  test("a ring hit updates the round's hit history", () => {
    const state = placedRound([tankWith("splash"), bot("front", 4, 3, "W"), bot("side", 3, 4, "N")]);
    stepRound(state);
    expect(roundTank(state, "self")).toMatchObject({ water: 0, ticksSinceLandedHit: 0 });
    expect(roundTank(state, "self").hitsLanded).toBeGreaterThanOrEqual(1);
    expect(roundTank(state, "front")).toMatchObject({ wasHit: true, hitsTaken: 1, lastHitBy: "self" });
  });

  test("the last hitter is chosen in move order when a normal throw and Splash both land", () => {
    const tanks = [bot("shooter", 4, 2, "S"), bot("target", 4, 3, "W"), bot("side", 3, 4, "N"), tankWith("splash")];
    const state = placedRound(tanks, { shooter: waiting("magnet", mode("main", [], act("throw"))) });
    const tick = stepRound(state);
    expect(tick.order.slice(0, 2)).toEqual(["self", "shooter"]);
    expect(roundTank(state, "target")).toMatchObject({ wasHit: true, hitsTaken: 2, lastHitBy: "shooter" });
  });
});

describe("Mud Bomb and Whirlwind", () => {
  test("Mud Bomb uses the first tank in line, ignores shields and excludes the thrower and Dash", () => {
    const source = tankWith("mudBomb", { water: 0, item: "bucket" });
    const center = bot("center", 4, 3, "W", { item: "umbrella", ultimateEffect: { kind: "smoke", turnsLeft: 4 } });
    const old = bot("old", 5, 4, "S", { effect: { kind: "dizzy", turnsLeft: 2 } });
    const dash = bot("dash", 4, 2, "N");
    const far = bot("far", 6, 3, "W");
    const bots = [source, center, old, dash, far];
    const result = resolveTick(snapshotOf(bots), [fire("self", "mudBomb"), move("center"), move("old"), fire("dash", "dash"), move("far")],
      bots.map(({ id }) => id), stubRng());
    expect(result.fires[0]).toEqual({ botId: "self", at: { x: 3, y: 3 }, kind: "mudBomb", center: { x: 4, y: 3 },
      area: [2, 3, 4].flatMap((y) => [3, 4, 5].map((x) => ({ x, y }))), affected: ["center", "old"], points: 2 });
    expect([...result.inflicted]).toEqual([["center", { kind: "stuck", turnsLeft: 5 }], ["old", { kind: "stuck", turnsLeft: 5 }]]);
    expect(result.throws).toEqual([{ throwerId: "dash", outcome: "empty" }]);
    expect(result.placements.map((tank) => tank.score)).toEqual([2, -1, -1, 0, 0]);
    expect(placement(result, "self")).toMatchObject({ item: "bucket", itemUses: ITEM_RULES.uses.bucket });
    expect(placement(result, "center")).toMatchObject({ itemUses: 2, ultimateEffect: { kind: "smoke", turnsLeft: 4 } });

    const state = placedRound([source, center, old]);
    stepRound(state);
    expect(roundTank(state, "old").effect).toEqual({ kind: "stuck", turnsLeft: 5 });
    for (let turn = 4; turn >= 0; turn--) {
      stepRound(state);
      expect(roundTank(state, "old").effect).toEqual(turn === 0 ? null : { kind: "stuck", turnsLeft: turn });
    }
  });

  test("Whirlwind covers two squares and turns caught tanks right four times before they read rules again", () => {
    const normal = mode("main", [
      rule("first", [when("enemyAhead", { n: 5 }, true)], act("wait")),
      rule("last", [when("enemyAhead", { n: 5 }, true)], act("wait")),
    ], act("wait"));
    const state = placedRound([tankWith("whirlwind"), bot("near", 3, 5, "NE"), bot("diagonal", 5, 5, "NW"), bot("far", 6, 3, "W")],
      { near: waiting("magnet", normal) });
    const before = state.snapshot;
    const ticks = [stepRound(state)];
    expect(ticks[0]?.fires?.[0]).toMatchObject({ kind: "whirlwind", affected: ["near", "diagonal"] });
    const event = ticks[0]?.fires?.[0];
    if (event?.kind !== "whirlwind") throw new Error("expected Whirlwind");
    expect(event.area).toHaveLength(25);
    expect(roundTank(state, "self").effect).toBeNull();
    expect(roundTank(state, "far").effect).toBeNull();
    expect(roundTank(state, "near").effect).toEqual({ kind: "dizzy", turnsLeft: 4, spinTurnsLeft: 4 });
    for (let i = 0; i < 5; i++) ticks.push(stepRound(state));
    expect(ticks.slice(1).map((tick) => {
      const decision = tick.decisions[1];
      return [decision?.spin, decision?.dizzy, decision?.ruleId, tick.snapshot.bots[1]?.direction];
    })).toEqual([
      [true, true, null, "SE"], [true, true, null, "SW"],
      [true, true, null, "NW"], [true, true, null, "NE"], [undefined, undefined, "first", "NE"],
    ]);
    const selfStats = statsOfRound(before, ticks, "self");
    expect(selfStats.ultimateTurns).toBe(1);
    expect(statsView(selfStats, waiting("whirlwind"))).toMatchObject({ spinTurns: 0, noRuleTurns: 5, ultimateTurns: 1 });
    expect(statsView(statsOfRound(before, ticks, "near"), waiting("magnet", normal)).spinTurns).toBe(4);
  });

  test("Whirlwind takes points only within one square, through Smoke and both umbrellas, and skips Dash", () => {
    for (const item of ["bucket", "pinwheel", "mudBall"] as const) {
      const source = tankWith("whirlwind", { item });
      const smoke = bot("smoke", 4, 3, "W", { item: "umbrella" });
      const umbrella = bot("umbrella", 2, 2, "SE");
      const dashing = bot("dash", 3, 4, "S");
      const outer = bot("outer", 5, 5, "NW", { item: "bucket" });
      const result = resolveTick(snapshotOf([source, smoke, umbrella, dashing, outer]),
        [fire("self", "whirlwind"), fire("smoke", "smoke"), fire("umbrella", "bigUmbrella"), fire("dash", "dash"), move("outer")],
        ["self", "smoke", "umbrella", "dash", "outer"], stubRng());
      expect(result.fires[0]).toMatchObject({ kind: "whirlwind", points: 2, affected: ["umbrella", "smoke", "outer"] });
      expect(result.placements.map(({ score }) => score)).toEqual([2, -1, -1, 0, 0]);
      expect(result.inflicted.has("dash")).toBe(false);
      expect(placement(result, "umbrella").ultimateEffect).toEqual({ kind: "bigUmbrella", blocksLeft: 3 });
      expect(placement(result, "smoke").itemUses).toBe(ITEM_RULES.uses.umbrella);
      expect(placement(result, "self")).toMatchObject({ item, itemUses: ITEM_RULES.uses[item] });
    }
  });

  test("Mud Bomb keeps held attack items while a non-umbrella item provides no protection", () => {
    for (const item of ["bucket", "pinwheel", "mudBall"] as const) {
      const source = tankWith("mudBomb", { item });
      const target = bot("target", 4, 3, "W", { item });
      const result = resolveTick(snapshotOf([source, target]), [fire("self", "mudBomb"), fire("target", "bigUmbrella")],
        ["self", "target"], stubRng());
      expect(result.fires[0]).toMatchObject({ points: 1, affected: ["target"] });
      expect(result.inflicted.get("target")).toEqual({ kind: "stuck", turnsLeft: 5 });
      expect(placement(result, "self")).toMatchObject({ item, itemUses: ITEM_RULES.uses[item] });
      expect(placement(result, "target")).toMatchObject({ score: -1, item, itemUses: ITEM_RULES.uses[item],
        ultimateEffect: { kind: "bigUmbrella", blocksLeft: 3 } });
    }
  });

  test("the pinwheel still gives six turns, with the first two marked as spins in an enabled round", () => {
    const a = bot("a", 0, 1, "E", { item: "pinwheel" });
    const b = tankWith("magnet", { x: 1, y: 1 });
    const result = resolveTick(snapshotOf([a, b]), [move("a", "T"), move("self")], ["a", "self"], stubRng({ chance: [true] }));
    expect(result.inflicted.get("self")).toEqual({ kind: "dizzy", turnsLeft: 6, spinTurnsLeft: 2 });
  });
});

describe("effect collisions", () => {
  test("Mud Bomb's five stuck turns beat Whirlwind's four dizzy turns in either order", () => {
    const tanks = [bot("mud", 2, 3, "E"), bot("target", 3, 3, "N"), bot("wind", 4, 3, "W")];
    const moves = [fire("mud", "mudBomb"), move("target"), fire("wind", "whirlwind")];
    for (const order of [["mud", "target", "wind"], ["wind", "target", "mud"]]) {
      const result = resolveTick(snapshotOf(tanks), moves, order, stubRng());
      expect(result.inflicted.get("target")).toEqual({ kind: "stuck", turnsLeft: 5 });
      expect(result.placements.map(({ score }) => score)).toEqual([2, -2, 0]);
    }
  });

  test("simultaneous item hits keep the longer effect with ultimates on and the last effect with them off", () => {
    const target = bot("target", 3, 3, "N");
    const pinwheel = bot("pinwheel", 2, 3, "E", { item: "pinwheel" });
    const mud = bot("mud", 4, 3, "W", { item: "mudBall" });
    for (const ultimates of [false, true]) {
      const tank = ultimates ? { ...target, ultimate: { id: "dash", kind: "ready" } } as const : target;
      const result = resolveTick(snapshotOf([tank, pinwheel, mud]), [move("target"), move("pinwheel", "T"), move("mud", "T")],
        ["target", "pinwheel", "mud"], stubRng({ chance: [true, true] }));
      expect(result.inflicted.get("target")).toEqual(ultimates ? { kind: "dizzy", turnsLeft: 6, spinTurnsLeft: 2 } : { kind: "stuck", turnsLeft: 4 });
      expect(placement(result, "mud").item).toBeNull();
    }
  });

  test("an existing effect counts down first and keeps a tie with a new item hit only with ultimates on", () => {
    const mud = bot("mud", 2, 3, "E", { item: "mudBall" });
    const target = bot("target", 3, 3, "N", { effect: { kind: "dizzy", turnsLeft: 5 } });
    for (const ultimates of [false, true]) {
      const state = placedRound([mud, target], { mud: waiting("magnet", mode("main", [], act("throw"))) }, {}, ultimates);
      expect(stepRound(state).throws[0]?.outcome).toBe("hit");
      expect(roundTank(state, "target").effect).toEqual(ultimates ? { kind: "dizzy", turnsLeft: 4 } : { kind: "stuck", turnsLeft: 4 });
    }
  });

  test("a pickup backfire competes with an existing effect only with ultimates on", () => {
    const target = bot("target", 3, 3, "N", { effect: { kind: "dizzy", turnsLeft: 6 } });
    for (const ultimates of [false, true]) {
      const state = placedRound([target, bot("other", 7, 7, "N")], {}, { items: [itemAt("mudBall", 3, 3)] }, ultimates, 1);
      expect(stepRound(state).pickups).toEqual([{ botId: "target", item: "mudBall" }]);
      expect(roundTank(state, "target")).toMatchObject({ item: null, effect: ultimates ? { kind: "dizzy", turnsLeft: 5 } : { kind: "stuck", turnsLeft: 4 } });
    }
  });
});

describe("ultimate lifetime and precedence", () => {
  const enemy = bot("enemy", 5, 3, "W");

  test("spin beats a ready ultimate, then the ultimate beats rule evaluation", () => {
    const { dizzyTurns, spinTurns } = ULTIMATE_RULES.whirlwind;
    const state = placedRound([tankWith("whirlwind", { effect: { kind: "dizzy", turnsLeft: dizzyTurns, spinTurnsLeft: spinTurns } }), enemy, bot("other", 3, 4, "S")]);
    for (let i = 0; i < spinTurns; i++) {
      const turn = stepRound(state);
      expect(turn.decisions[0]?.spin).toBe(true);
      expect(turn.fires).toEqual([]);
      expect(roundTank(state, "self").ultimate?.kind).toBe("ready");
    }
    expect(stepRound(state).decisions[0]).toMatchObject({ ultimate: "whirlwind", actionId: "ultimate" });
  });

  test("a running sequence takes its next step before a ready ultimate", () => {
    const state = placedRound(
      [tankWith("mudBomb", { ultimate: { id: "mudBomb", kind: "charging", turnsLeft: 1, turnsTotal: ULTIMATE_RULES.firstReadyTurn } }), enemy],
      { self: waiting("mudBomb", mode("main", [
        rule("steps", [when("enemyAhead", { n: 3 })], { steps: [act("wait"), act("wait")] }),
      ], act("wait"))) },
    );
    expect(stepRound(state).decisions[0]?.step?.index).toBe(1);
    const second = stepRound(state);
    expect(second.decisions[0]?.step?.index).toBe(2);
    expect(second.fires).toEqual([]);
    expect(stepRound(state).fires?.[0]?.kind).toBe("mudBomb");
  });

  test("a spin also takes priority over a running sequence", () => {
    const state = placedRound(
      [tankWith("whirlwind", { ultimate: { id: "whirlwind", kind: "charging", turnsLeft: 1, turnsTotal: ULTIMATE_RULES.firstReadyTurn } }), enemy,
        tankWith("whirlwind", { id: "caster", x: 3, y: 4 })],
      { self: waiting("whirlwind", mode("main", [
        rule("steps", [when("enemyAhead", { n: 3 })], { steps: [act("wait"), act("wait")] }),
      ], act("wait"))) },
    );
    expect(stepRound(state).decisions[0]?.step?.index).toBe(1);
    const decision = stepRound(state).decisions[0];
    expect(decision?.spin).toBe(true);
    expect(decision?.step).toBeUndefined();
    expect(decision?.ultimate).toBeUndefined();
  });

  test("a stuck tank holds its Dash until it can move again", () => {
    const state = placedRound([tankWith("dash", { effect: { kind: "stuck", turnsLeft: 1 } }), enemy]);
    expect(stepRound(state).fires).toEqual([]);
    expect(roundTank(state, "self").ultimate?.kind).toBe("ready");
    expect(stepRound(state).fires?.[0]?.kind).toBe("dash");
  });

  test("first charge and recharge finish at end of turn, and the final snapshot clears ultimate state", () => {
    const { firstReadyTurn, rechargeTurns } = ULTIMATE_RULES;
    const firstFire = firstReadyTurn + 1;
    const secondFire = firstFire + rechargeTurns + 1;
    const state = placedRound([bot("self", 3, 3, "E"), enemy], { self: waiting("mudBomb") }, { ticksTotal: secondFire + 1 });
    expect(roundTank(state, "self").ultimate).toEqual({ id: "mudBomb", kind: "charging", turnsLeft: firstReadyTurn, turnsTotal: firstReadyTurn });
    const fireTurns: number[] = [];
    while (!state.isOver) {
      const result = stepRound(state);
      const turn = result.tick + 1;
      if (result.fires?.some((event) => event.botId === "self")) fireTurns.push(turn);
      if (turn === firstFire - 1 || turn === secondFire - 1) expect(roundTank(state, "self").ultimate).toEqual({ id: "mudBomb", kind: "ready" });
      if (turn === firstFire || turn === secondFire) expect(roundTank(state, "self").ultimate).toEqual({ id: "mudBomb", kind: "charging", turnsLeft: rechargeTurns, turnsTotal: rechargeTurns });
    }
    expect(fireTurns).toEqual([firstFire, secondFire]);
    expect(roundTank(state, "self")).not.toHaveProperty("ultimate");
    expect(roundTank(state, "self")).not.toHaveProperty("ultimateEffect");
  });

  test("a new ultimate clears the old active effect and keeps the separate tank effect", () => {
    const effect = { kind: "stuck", turnsLeft: 3 } as const;
    const ultimateEffect = { kind: "smoke", turnsLeft: 5 } as const;
    const self = tankWith("smoke", { effect, ultimateEffect });
    const round = placedRound([self, enemy]);
    expect(replaceStrategy(round, "self", waiting("smoke")).ultimateEffect).toEqual(ultimateEffect);
    expect(replaceStrategy(round, "self", waiting("dash"))).toMatchObject({ effect, ultimateEffect: null });
  });

  test("a join and a new ultimate start a first charge; the same ultimate stays ready", () => {
    const round = createOpenRound({ seed: 9, ticksTotal: 30, boardFor: 8, ruleSetId: STANDARD_RULE_SET_ID, items: false, ultimates: true });
    stepRound(round);
    const joined = joinRound(round, { id: "self", strategy: waiting("smoke") });
    expect(joined.ultimate).toEqual({ id: "smoke", kind: "charging", turnsLeft: ULTIMATE_RULES.firstReadyTurn, turnsTotal: ULTIMATE_RULES.firstReadyTurn });
    for (let i = 0; i < ULTIMATE_RULES.firstReadyTurn; i++) stepRound(round);
    expect(replaceStrategy(round, "self", waiting("smoke")).ultimate).toEqual({ id: "smoke", kind: "ready" });
    expect(replaceStrategy(round, "self", waiting("dash")).ultimate).toEqual({
      id: "dash", kind: "charging", turnsLeft: ULTIMATE_RULES.firstReadyTurn, turnsTotal: ULTIMATE_RULES.firstReadyTurn,
    });
  });
});

// A quiet second tank keeps the fixture a legal round without affecting the guard or taking a turn away.
const bystander = bot("far", 8, 6, "N");
function firingRound(self: BotState, strategy: Strategy, others: readonly BotState[] = []): RoundState {
  return placedRound([self, ...(others.length === 0 ? [bystander] : others)], { self: strategy, far: waiting("fullTank") });
}

describe("ultimate conditions", () => {
  test("ready and each charge threshold read the first charge and the recharge", () => {
    const { firstReadyTurn, rechargeTurns } = ULTIMATE_RULES;
    const state = firingRound(bot("self", 3, 3, "E"), waiting("magnet"));
    for (const turnsTotal of [firstReadyTurn, rechargeTurns]) {
      for (let elapsed = 0; elapsed <= turnsTotal; elapsed++) {
        const ctx = contextFor(state.snapshot, "self");
        expect(CONDITIONS.ultimateReady!.test(ctx, {})).toBe(elapsed === turnsTotal);
        for (const n of [25, 50, 75]) {
          expect(CONDITIONS.ultimateCharged!.test(ctx, { n }), `${elapsed}/${turnsTotal} at ${n}%`)
            .toBe(elapsed >= turnsTotal * n / 100);
        }
        if (elapsed < turnsTotal) expect(stepRound(state).fires).toEqual([]);
      }
      expect(stepRound(state).fires?.[0]?.kind).toBe("magnet");
    }
  });

  test("reach counts the right tanks for each ultimate even while charging", () => {
    const others = [
      bot("first", 4, 3, "E"),
      bot("near", 4, 2, "E"),
      bot("nearby", 3, 4, "E"),
      bot("next", 5, 3, "E"),
      bot("far", 8, 3, "E"),
    ];
    const expected: Readonly<Record<UltimateId, number>> = {
      dash: 1, splash: 3, mudBomb: 4, whirlwind: 4, smoke: 0, fullTank: 0, bigUmbrella: 0, magnet: 0,
    };
    for (const id of ULTIMATE_IDS) {
      const count = expected[id];
      const turnsTotal = ULTIMATE_RULES.firstReadyTurn;
      const self = tankWith(id, { ultimate: { kind: "charging", id, turnsLeft: turnsTotal, turnsTotal } });
      const snapshot = snapshotOf([self, ...others]);
      expect(ultimateReach(snapshot, self), id).toBe(count);
      for (const n of [1, 2, 3, 4]) {
        expect(CONDITIONS.ultimateCatches!.test({ snapshot, self }, { n }), `${id} >= ${n}`).toBe(count >= n);
      }
    }
    const dash = tankWith("dash");
    expect(ultimateReach(snapshotOf([dash, others[4]!]), dash)).toBe(0);
    const mud = tankWith("mudBomb");
    expect(ultimateReach(snapshotOf([mud, { ...others[0]!, x: 8 }, others[1]!]), mud)).toBe(0);
  });
});

describe("firing an ultimate by rules", () => {
  const use = rule("fire", [when("ultimateReady")], act("useUltimate"));
  const fallback = rule("next", [when("scoreAtLeast", { n: 0 })], act("wait"));
  const target = bot("target", 5, 3, "N");
  const stuck = { kind: "stuck", turnsLeft: 2 } as const;

  test.each([
    ["dash", [], {}],
    ["smoke", [], { effect: stuck }],
    ["splash", [], { water: waterPerThrow }],
    ["fullTank", [], { water: waterCapacity }],
    ["mudBomb", [target], { water: 0, effect: stuck }],
    ["whirlwind", [], {}],
    ["bigUmbrella", [], {}],
    ["magnet", [], {}],
  ] satisfies readonly [UltimateId, readonly BotState[], Partial<BotState>][])(
    "%s can fire by rule when ready, even outside its automatic good moment",
    (id, others, overrides) => {
      const strategy = waiting(id, mode("main", [use, fallback], act("wait")));
      const ready = tankWith(id, overrides);
      const turn = stepRound(firingRound(ready, strategy, others));
      expect(turn.decisions[0]).toMatchObject({ actionId: "useUltimate", ruleId: "fire", move: "W", ultimate: id });
      expect(turn.fires?.filter(({ botId }) => botId === "self").map(({ kind }) => kind)).toEqual([id]);
    },
  );

  test.each([
    ["dash", [bot("near", 4, 3, "N")], {}],
    ["dash", [], { effect: stuck }],
    ["smoke", [], { ultimateEffect: { kind: "smoke", turnsLeft: 2 } }],
    ["splash", [], { water: waterPerThrow - 1 }],
    ["mudBomb", [], {}],
    ["bigUmbrella", [], { ultimateEffect: { kind: "bigUmbrella", blocksLeft: 1 } }],
    ["magnet", [], { item: "bucket", itemsWaiting: ["pinwheel", "umbrella"] }],
    ["fullTank", [], { ultimate: { id: "fullTank", kind: "charging", turnsLeft: 1, turnsTotal: 8 } }],
  ] satisfies readonly [UltimateId, readonly BotState[], Partial<BotState>][])(
    "%s reads the next rule when the action cannot act",
    (id, others, overrides) => {
      // Keep the condition true so the miss comes from the action's own checks.
      const always = { ...use, conditions: [when("scoreAtLeast", { n: 0 })] };
      const strategy = waiting(id, mode("main", [always, fallback], act("wait")));
      const turn = stepRound(firingRound(tankWith(id, overrides), strategy, others));
      expect(turn.decisions[0]).toMatchObject({ ruleId: "next", actionId: "wait" });
      expect(turn.fires).toEqual([]);
    },
  );

  test("an ultimate rule in another mode disables auto fire and can switch modes when it runs", () => {
    const first = mode("main", [{ ...fallback, switchToMode: "fire-mode" }], act("wait"));
    const second = mode("fire-mode", [{ ...use, switchToMode: "main" }], act("wait"));
    const automatic = waiting("magnet");
    const byRules = parseStrategy({ ...automatic, modes: [first, second] });
    if (!byRules.ok) throw new Error(byRules.errors.join("\n"));

    const self = tankWith("magnet");
    const autoRound = firingRound(self, automatic);
    const autoTurn = stepRound(autoRound);
    expect(autoTurn.decisions[0]).toMatchObject({ ruleId: null, actionId: "ultimate" });

    const rulesRound = firingRound(self, byRules.strategy);
    expect(stepRound(rulesRound).fires).toEqual([]);
    const ruleTurn = stepRound(rulesRound);
    expect(ruleTurn.decisions[0]).toMatchObject({ modeId: "fire-mode", ruleId: "fire", nextModeId: "main", actionId: "useUltimate" });
    expect(ruleTurn.fires).toEqual(autoTurn.fires);
  });

  test("spinning and a running sequence each delay an ultimate rule", () => {
    const strategy = waiting("fullTank", mode("main", [
      use,
      rule("steps", [when("scoreAtLeast", { n: 0 })], { steps: [act("wait"), act("wait")] }),
    ], act("wait")));
    const spin = firingRound(tankWith("fullTank", { effect: { kind: "dizzy", turnsLeft: 1, spinTurnsLeft: 1 } }), strategy);
    expect(stepRound(spin).decisions[0]?.spin).toBe(true);
    expect(stepRound(spin).decisions[0]?.ruleId).toBe("fire");
    const steps = firingRound(tankWith("fullTank", {
      ultimate: { id: "fullTank", kind: "charging", turnsLeft: 1, turnsTotal: ULTIMATE_RULES.firstReadyTurn },
    }), strategy);
    expect(stepRound(steps).decisions[0]?.step?.index).toBe(1);
    expect(stepRound(steps).decisions[0]?.step?.index).toBe(2);
    expect(stepRound(steps).decisions[0]?.ruleId).toBe("fire");
  });

  test("with ultimates off, conditions and useUltimate leave replay bytes and chance draws alone", () => {
    const self = bot("self", 3, 3, "E");
    const ctx = contextFor(snapshotOf([self]), "self");
    expect(CONDITIONS.ultimateReady!.test(ctx, {})).toBe(false);
    expect(CONDITIONS.ultimateCharged!.test(ctx, { n: 25 })).toBe(false);
    expect(CONDITIONS.ultimateCatches!.test(ctx, { n: 1 })).toBe(false);
    expect(ACTIONS.useUltimate!.toMove(ctx, {}, stubRng())).toBeNull();

    const ultimateRules = [
      { ...use, conditions: [when("scoreAtLeast", { n: 0 })], chance: 50 },
      rule("test-ready", [when("ultimateReady")], act("turn", { way: "right" })),
      rule("test-charged", [when("ultimateCharged", { n: 25 })], act("turn", { way: "right" })),
      rule("test-catches", [{ ...when("ultimateCatches", { n: 1 }), negate: true }], act("turn", { way: "right" })),
    ];
    const replay = (strategy: Strategy) => runRound({
      seed: 42, ticksTotal: 60, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, items: true, ultimates: false,
      players: [{ id: "self", strategy }, { id: "enemy", strategy: waiting("mudBomb") }],
    });
    const base = waiting("splash", mode("main", [], act("wander")));
    const rules = waiting("splash", mode("main", ultimateRules, act("wander")));
    expect(JSON.stringify(replay(rules))).toBe(JSON.stringify(replay(base)));
  });
});

test("ultimates off matches the pre-phase-B replay byte for byte, with items on", () => {
  const players = PRESETS.filter(({ id }) => id !== "charger").map(({ strategy }, i) => ({ id: `p${i + 1}`, strategy }));
  const replay = runRound({ seed: 42, ticksTotal: 60, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players, items: true, ultimates: false });
  expect(Bun.CryptoHasher.hash("sha256", JSON.stringify(replay), "hex"))
    .toBe("6e538619b06bd6734a6106463c258f4c2280551c061f86af484798d189d6e39c");
});
