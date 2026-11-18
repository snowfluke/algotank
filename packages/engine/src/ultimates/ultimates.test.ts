import { describe, expect, test } from "bun:test";
import {
  DIRECTIONS, ITEM_RULES, PRESETS, STANDARD_RULE_SET_ID, ULTIMATE_RULES, createOpenRound, createRound,
  joinRound, parseStrategy, replaceStrategy, runRound, statsOfRound, statsView, stepRound,
} from "../index.ts";
import type { BotState, Direction, Move, RoundState, Snapshot, Strategy, UltimateId } from "../index.ts";
import { rotate } from "../directions.ts";
import { cellAhead } from "../round/grid.ts";
import { resolveTick, type TickMove } from "../round/resolve.ts";
import { STANDARD, act, bot, mode, rule, snapshotOf, stubRng, when } from "../strategy/test-helpers.ts";

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
): RoundState {
  const players = bots.map((tank) => ({ id: tank.id, strategy: strategies[tank.id] ?? waiting(tank.ultimate?.id ?? "magnet") }));
  const state = createRound({
    seed: 42, ticksTotal: options.ticksTotal ?? 100, survivorsAfterRound: null,
    ruleSetId: STANDARD_RULE_SET_ID, players, items: false, ultimates: true,
  });
  const placed = state.snapshot.bots.map((spawn, i) => ({ ...spawn, ...bots[i] }));
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
    id: Exclude<UltimateId, "magnet">;
    yes: readonly (readonly [enemies: readonly BotState[], own?: Partial<BotState>])[];
    no: readonly (readonly [enemies: readonly BotState[], own?: Partial<BotState>])[];
  }[] = [
    { id: "dash", yes: [[[ahead]], [[bot("four", 7, 3, "N")]]], no: [
      [[near, ahead]], [[bot("five", 8, 3, "W")]], [[far]], [[ahead], { effect: stuck }],
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

  test("Magnet charges, becomes ready, and waits even with an item nearby and an empty hand", () => {
    const state = placedRound(
      [tankWith("magnet", { ultimate: { id: "magnet", kind: "charging", turnsLeft: ULTIMATE_RULES.firstReadyTurn } }), far],
      {},
      { items: [{ kind: "bucket", x: 4, y: 3, turnsLeft: 30 }] },
    );
    for (let turn = 1; turn <= 20; turn++) {
      expect(stepRound(state).fires).toEqual([]);
      if (turn >= 15) {
        expect(roundTank(state, "self").ultimate).toEqual({ kind: "ready", id: "magnet" });
        expect(roundTank(state, "self").item).toBeNull();
        expect(state.snapshot.items).toHaveLength(1);
      }
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
      ] }]);
      expect(result.throws).toEqual([{ throwerId: "shooter", targetId: "self", distance, outcome: "dodged" }]);
      expect(placement(result, "shooter").water).toBe(waterCapacity - waterPerThrow);
      expect(placement(result, "self").score).toBe(0);
    }
  });

  test("a blocker arriving during the turn can stop the dash at zero without removing immunity", () => {
    const block = bot("block", 3, 2, "S");
    const result = resolveTick(snapshotOf([dashing, shooter, block]), [...moves, move("block", "F")],
      ["block", "self", "shooter"], stubRng());
    expect(result.fires[0]).toMatchObject({ path: [] });
    expect(result.throws[0]?.outcome).toBe("dodged");
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
});

describe("Smoke", () => {
  test("halves and rounds down the existing throw roll while the tank is stuck", () => {
    const smoked = tankWith("smoke", { x: 4, effect: { kind: "stuck", turnsLeft: 2 } });
    const shooter = bot("shooter", 0, 3, "E", { build: { reach: 1, aim: 0, dodge: 0 }, item: "bucket" });
    const rng = stubRng();
    const result = resolveTick(snapshotOf([smoked, shooter]), [fire("self", "smoke"), move("shooter", "T")], ["self", "shooter"],
      { ...rng, next: () => { rng.calls.push("next"); return 0.17; } });
    expect(rng.calls).toEqual(["next"]);
    expect(result.throws[0]).toMatchObject({ outcome: "miss", hitChance: 17, protection: { kind: "smoke", pointsSaved: 2 } });
    expect(placement(result, "self").ultimateEffect).toEqual({ kind: "smoke", turnsLeft: 10 });
    expect(placement(result, "shooter").itemUses).toBe(ITEM_RULES.uses.bucket);
  });

  test("smoke counts its activation turn and expires after ten turns", () => {
    const state = placedRound([tankWith("smoke"), bot("threat", 4, 3, "W")]);
    for (let turn = 1; turn <= 10; turn++) {
      stepRound(state);
      expect(roundTank(state, "self").ultimateEffect).toEqual(turn === 10 ? null : { kind: "smoke", turnsLeft: 10 - turn });
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
      const from = cellAhead(target, incoming);
      const shooter = bot("shooter", from.x, from.y, rotate(incoming, 4));
      for (const item of [null, "umbrella"] as const) {
        const withItem = { ...target, item, itemUses: item === null ? 0 : ITEM_RULES.uses.umbrella };
        const result = resolveTick(snapshotOf([withItem, shooter]), [fire("self", "bigUmbrella"), move("shooter", "T")],
          ["self", "shooter"], stubRng({ chance: [true] }));
        expect(result.throws[0]?.outcome).toBe(covered[eighth] || item !== null ? "blocked" : "hit");
        expect(placement(result, "self").ultimateEffect).toEqual({ kind: "bigUmbrella", blocksLeft: covered[eighth] ? 3 : 4 });
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
      target = { ...target, ...placement(result, "self") };
      expect(target.ultimateEffect).toEqual(blocks === 0 ? null : { kind: "bigUmbrella", blocksLeft: blocks });
    }
  });
});

test("Full Tank fills up and grants three free aimed shots, including misses and blocks", () => {
  const empty = tankWith("fullTank", { water: 0 });
  const away = bot("target", 7, 5, "W");
  const result = resolveTick(snapshotOf([empty, away]), [fire("self", "fullTank"), move("target")], ["target", "self"], stubRng());
  let source = { ...empty, ...placement(result, "self") };
  expect(source.water).toBe(waterCapacity);
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
    source = { ...source, ...placement(turn, "self") };
    expect(source.ultimateEffect).toEqual(shots === 0 ? null : { kind: "fullTank", freeShots: shots });
    expect(source.water).toBe(outcome === "hit" && shots === 0 ? waterCapacity - waterPerThrow : waterCapacity);
  }
});

describe("Splash Ring", () => {
  test("starts at the front and rolls clockwise for occupied side squares only", () => {
    const source = tankWith("splash", { direction: "N", item: "bucket" });
    const bots = [source, bot("back", 3, 4, "S"), bot("left", 2, 3, "N"), bot("front", 3, 2, "E"), bot("right", 4, 3, "N")];
    const rng = stubRng({ chance: [true, false, true] });
    const result = resolveTick(snapshotOf(bots), [fire("self", "splash"), ...bots.slice(1).map(({ id }) => move(id))],
      bots.map(({ id }) => id), rng);
    const event = result.fires[0];
    if (event?.kind !== "splash") throw new Error("expected Splash");
    expect(event.squares.map((square) => [square.x, square.y, square.outcome])).toEqual([
      [3, 2, "hit"], [4, 2, "empty"], [4, 3, "hit"], [4, 4, "empty"],
      [3, 4, "miss"], [2, 4, "empty"], [2, 3, "hit"], [2, 2, "empty"],
    ]);
    expect(rng.calls).toEqual(Array(3).fill(`chance:${100 / 3}`));
    expect(result.throws).toEqual([]);
    expect(placement(result, "self")).toMatchObject({ score: 3, water: 0, item: "bucket", itemUses: 2 });
    expect(placement(result, "front").score).toBe(-1);
  });

  test("smoke rolls the front at one in two and side at one in six", () => {
    const smoke = { kind: "smoke", turnsLeft: 4 } as const;
    const bots = [tankWith("splash"), bot("front", 4, 3, "W", { ultimateEffect: smoke }), bot("side", 3, 4, "N", { ultimateEffect: smoke })];
    const expected = [["front", "miss"], ["side", "hit"]];
    const values = [0.5, 0.16];
    const rng = stubRng();
    const result = resolveTick(snapshotOf(bots), [fire("self", "splash"), move("front"), move("side")],
      ["self", "side", "front"], { ...rng, next: () => { const roll = values.shift(); if (roll === undefined) throw new Error("unexpected roll"); return roll; } });
    const event = result.fires[0];
    if (event?.kind !== "splash") throw new Error("expected Splash");
    expect(event.squares.filter((square) => square.outcome !== "empty").map(({ targetId, outcome }) => [targetId, outcome])).toEqual(expected);
    expect(values).toEqual([]);
    expect(rng.calls).toEqual([]);
  });

  test("held attack items stay and defenses block a ring hit as they do a throw", () => {
    for (const item of ["bucket", "pinwheel", "mudBall"] as const) {
      const source = tankWith("splash", { item });
      const front = bot("front", 4, 3, "W", { item: "umbrella", ultimateEffect: { kind: "bigUmbrella", blocksLeft: 1 } });
      const side = bot("side", 3, 4, "S", { item: "umbrella" });
      const dash = bot("dash", 4, 4, "S");
      const result = resolveTick(snapshotOf([source, front, side, dash]),
        [fire("self", "splash"), move("front"), move("side"), fire("dash", "dash")],
        ["self", "front", "side", "dash"], stubRng({ chance: [true, true] }));
      const event = result.fires[0];
      if (event?.kind !== "splash") throw new Error("expected Splash");
      expect(event.squares.filter((square) => square.outcome !== "empty").map(({ targetId, outcome }) => [targetId, outcome]))
        .toEqual([["front", "blocked"], ["dash", "dodged"], ["side", "blocked"]]);
      expect(placement(result, "self")).toMatchObject({ score: 0, water: 0, item, itemUses: ITEM_RULES.uses[item] });
      expect(placement(result, "front")).toMatchObject({ ultimateEffect: null, itemUses: 2 });
      expect(placement(result, "side").itemUses).toBe(1);
      expect(result.inflicted.size).toBe(0);
    }
  });

  test("existing throw, pickup and spawn draws come before the fires' rolls in move order", () => {
    const tanks = [
      bot("left", 2, 2, "E"), bot("left-side", 2, 3, "N"),
      bot("right", 6, 2, "E"), bot("right-side", 6, 3, "S"),
      bot("picker", 4, 5, "E"), bot("shooter", 1, 3, "E"),
    ];
    const moves = [fire("left", "splash"), move("left-side"), fire("right", "splash"), move("right-side"), move("picker", "F"), move("shooter", "T")];
    const rng = stubRng({ chance: [false, true, true, false, false], int: [0, 0] });
    const result = resolveTick(snapshotOf(tanks), moves, ["right", "left", "left-side", "right-side", "picker", "shooter"], rng, {
      items: [{ kind: "pinwheel", x: 5, y: 5, turnsLeft: 3 }], tick: 9, spawn: true,
    });
    expect(rng.calls).toEqual(["chance:90", "chance:20", "int:10", "int:57", ...Array(3).fill(`chance:${100 / 3}`)]);
    expect(result.fires.map(({ botId }) => botId)).toEqual(["right", "left"]);
    expect(placement(result, "right").score).toBe(1);
    expect(placement(result, "left").score).toBe(0);
  });

  test("a moved target is hit at its fire-time square and a newly picked umbrella waits", () => {
    const source = tankWith("splash");
    const front = bot("front", 4, 3, "E");
    const result = resolveTick(snapshotOf([source, front]), [fire("self", "splash"), move("front", "F")],
      ["self", "front"], stubRng(), { items: [{ x: 5, y: 3, kind: "umbrella", turnsLeft: 5 }], tick: 0, spawn: false });
    expect(result.fires[0]).toMatchObject({ squares: expect.arrayContaining([{ x: 4, y: 3, targetId: "front", outcome: "hit" }]) });
    expect(placement(result, "front")).toMatchObject({ x: 5, score: -1, item: "umbrella", itemUses: 2 });
  });

  test("a ring hit updates the round's hit history", () => {
    const state = placedRound([tankWith("splash"), bot("front", 4, 3, "W"), bot("side", 3, 4, "N")]);
    stepRound(state);
    expect(roundTank(state, "self")).toMatchObject({ water: 0, ticksSinceLandedHit: 0 });
    expect(roundTank(state, "self").hitsLanded).toBeGreaterThanOrEqual(1);
    expect(roundTank(state, "front")).toMatchObject({ wasHit: true, hitsTaken: 1, lastHitBy: "self" });
  });
});

describe("Mud Bomb and Whirlwind", () => {
  test("Mud Bomb uses the first tank in line, ignores shields and excludes the thrower and Dash", () => {
    const source = tankWith("mudBomb", { water: 0 });
    const center = bot("center", 4, 3, "W", { item: "umbrella", ultimateEffect: { kind: "smoke", turnsLeft: 4 } });
    const old = bot("old", 5, 4, "S", { effect: { kind: "dizzy", turnsLeft: 2 } });
    const dash = bot("dash", 4, 2, "N");
    const far = bot("far", 6, 3, "W");
    const bots = [source, center, old, dash, far];
    const result = resolveTick(snapshotOf(bots), [fire("self", "mudBomb"), move("center"), move("old"), fire("dash", "dash"), move("far")],
      bots.map(({ id }) => id), stubRng());
    expect(result.fires[0]).toEqual({ botId: "self", at: { x: 3, y: 3 }, kind: "mudBomb", center: { x: 4, y: 3 },
      area: [2, 3, 4].flatMap((y) => [3, 4, 5].map((x) => ({ x, y }))), affected: ["center", "old"] });
    expect([...result.inflicted]).toEqual([["center", { kind: "stuck", turnsLeft: 5 }], ["old", { kind: "stuck", turnsLeft: 5 }]]);
    expect(result.throws).toEqual([]);
    expect(result.placements.map((tank) => tank.score)).toEqual([0, 0, 0, 0, 0]);
    expect(placement(result, "center")).toMatchObject({ itemUses: 2, ultimateEffect: { kind: "smoke", turnsLeft: 4 } });

    const state = placedRound([source, center, old]);
    stepRound(state);
    expect(roundTank(state, "old").effect).toEqual({ kind: "stuck", turnsLeft: 5 });
    for (let turn = 4; turn >= 0; turn--) {
      stepRound(state);
      expect(roundTank(state, "old").effect).toEqual(turn === 0 ? null : { kind: "stuck", turnsLeft: turn });
    }
  });

  test("Whirlwind covers two squares and gives two spins and then two reverse-rule turns", () => {
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
    expect(roundTank(state, "near").effect).toEqual({ kind: "dizzy", turnsLeft: 4, spinTurnsLeft: 2 });
    for (let i = 0; i < 5; i++) ticks.push(stepRound(state));
    expect(ticks.slice(1).map((tick) => {
      const decision = tick.decisions[1];
      return [decision?.spin, decision?.dizzy, decision?.ruleId, tick.snapshot.bots[1]?.direction];
    })).toEqual([
      [true, true, null, "SE"], [true, true, null, "SW"],
      [undefined, true, "last", "SW"], [undefined, true, "last", "SW"], [undefined, undefined, "first", "SW"],
    ]);
    const selfStats = statsOfRound(before, ticks, "self");
    expect(selfStats.ultimateTurns).toBe(1);
    expect(statsView(selfStats, waiting("whirlwind"))).toMatchObject({ spinTurns: 0, noRuleTurns: 5 });
    expect(statsView(statsOfRound(before, ticks, "near"), waiting("magnet", normal)).spinTurns).toBe(2);
  });

  test("the pinwheel still gives six turns, with the first two marked as spins in an enabled round", () => {
    const a = bot("a", 0, 1, "E", { item: "pinwheel" });
    const b = tankWith("magnet", { x: 1, y: 1 });
    const result = resolveTick(snapshotOf([a, b]), [move("a", "T"), move("self")], ["a", "self"], stubRng({ chance: [true] }));
    expect(result.inflicted.get("self")).toEqual({ kind: "dizzy", turnsLeft: 6, spinTurnsLeft: 2 });
  });
});

describe("ultimate lifetime and precedence", () => {
  const enemy = bot("enemy", 5, 3, "W");

  test("spin beats a ready ultimate, then the ultimate beats rule evaluation", () => {
    const state = placedRound([tankWith("whirlwind", { effect: { kind: "dizzy", turnsLeft: 4, spinTurnsLeft: 2 } }), enemy, bot("other", 3, 4, "S")]);
    for (let i = 0; i < 2; i++) {
      const turn = stepRound(state);
      expect(turn.decisions[0]?.spin).toBe(true);
      expect(turn.fires).toEqual([]);
      expect(roundTank(state, "self").ultimate?.kind).toBe("ready");
    }
    expect(stepRound(state).decisions[0]).toMatchObject({ ultimate: "whirlwind", actionId: "ultimate" });
  });

  test("a running sequence takes its next step before a ready ultimate", () => {
    const state = placedRound(
      [tankWith("mudBomb", { ultimate: { id: "mudBomb", kind: "charging", turnsLeft: 1 } }), enemy],
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
      [tankWith("whirlwind", { ultimate: { id: "whirlwind", kind: "charging", turnsLeft: 1 } }), enemy,
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
    const state = placedRound([bot("self", 3, 3, "E"), enemy], { self: waiting("mudBomb") }, { ticksTotal: 58 });
    expect(roundTank(state, "self").ultimate).toEqual({ id: "mudBomb", kind: "charging", turnsLeft: 15 });
    const fireTurns: number[] = [];
    while (!state.isOver) {
      const result = stepRound(state);
      const turn = result.tick + 1;
      if (result.fires?.some((event) => event.botId === "self")) fireTurns.push(turn);
      if (turn === 15 || turn === 56) expect(roundTank(state, "self").ultimate).toEqual({ id: "mudBomb", kind: "ready" });
      if (turn === 16 || turn === 57) expect(roundTank(state, "self").ultimate).toEqual({ id: "mudBomb", kind: "charging", turnsLeft: 40 });
    }
    expect(fireTurns).toEqual([16, 57]);
    expect(roundTank(state, "self")).not.toHaveProperty("ultimate");
    expect(roundTank(state, "self")).not.toHaveProperty("ultimateEffect");
  });

  test("a join starts its own charge and replacing rules preserves the tank's ultimate", () => {
    const round = createOpenRound({ seed: 9, ticksTotal: 30, boardFor: 8, ruleSetId: STANDARD_RULE_SET_ID, items: false, ultimates: true });
    stepRound(round);
    const joined = joinRound(round, { id: "self", strategy: waiting("smoke") });
    expect(joined.ultimate).toEqual({ id: "smoke", kind: "charging", turnsLeft: 15 });
    stepRound(round);
    expect(replaceStrategy(round, "self", waiting("dash")).ultimate).toEqual({ id: "smoke", kind: "charging", turnsLeft: 14 });
  });
});

test("ultimates off matches the pre-phase-B replay byte for byte, with items on", () => {
  const players = PRESETS.filter(({ id }) => id !== "charger").map(({ strategy }, i) => ({ id: `p${i + 1}`, strategy }));
  const replay = runRound({ seed: 42, ticksTotal: 60, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players, items: true, ultimates: false });
  expect(Bun.CryptoHasher.hash("sha256", JSON.stringify(replay), "hex"))
    .toBe("6e538619b06bd6734a6106463c258f4c2280551c061f86af484798d189d6e39c");
});
