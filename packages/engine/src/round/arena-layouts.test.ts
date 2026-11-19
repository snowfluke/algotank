import { describe, expect, test } from "bun:test";
import { RULE_SETS, type RuleSetId } from "../combat/rule-sets.ts";
import { nearestAreaSquare } from "../strategy/actions.ts";
import { decide } from "../strategy/decide.ts";
import { act, bot, contextFor, mode, rule, snapshotOf, strategyOf, stubRng, when } from "../strategy/test-helpers.ts";
import { CONDITIONS } from "../strategy/vocabulary.ts";
import { createArenaLayout, rulesAt, waterCapacityOf, type ArenaLayoutId } from "./arena-layouts.ts";
import { resolveTick } from "./resolve.ts";
import { createRng } from "./rng.ts";
import { changeRoundRules, createOpenRound, freshStartRound, joinRound, stepRound } from "./round.ts";

const waiter = strategyOf([mode("main", [], act("wait"))]);
const open = (ruleSetId: ArenaLayoutId | RuleSetId, boardFor = 1) =>
  createOpenRound({ ruleSetId, boardFor, seed: 87, ticksTotal: 500, items: false, ultimates: false });

describe("hybrid arena geometry", () => {
  test("Four quarters uses whole squares at each edge on an odd board", () => {
    const size = { width: 9, height: 7 };
    const board = { ...snapshotOf([]), layout: createArenaLayout("fourQuarters", size, createRng(0)) };
    const row = (y: number) => Array.from({ length: size.width }, (_, x) => rulesAt(board, x, y).id);
    expect(row(0)).toEqual(row(3));
    expect(row(4)).toEqual(row(6));
    expect(row(3)).toEqual([...Array(5).fill("standard"), ...Array(4).fill("dry-spell")]);
    expect(row(4)).toEqual([...Array(5).fill("downpour"), ...Array(4).fill("arms-length")]);
  });

  test("Eye of the storm rounds both rectangles and includes the last square before each edge", () => {
    const size = { width: 11, height: 9 };
    const layout = createArenaLayout("eyeOfStorm", size, createRng(0));
    const board = snapshotOf([], { ...size, layout });
    expect(layout.areas).toEqual([
      { x: 2, y: 2, width: 7, height: 6, ruleSetId: "dry-spell" },
      { x: 4, y: 3, width: 4, height: 3, ruleSetId: "downpour" },
    ]);
    expect(rulesAt(board, 0, 0)).toBe(RULE_SETS.standard);
    expect(rulesAt(board, 10, 8)).toBe(RULE_SETS.standard);
    expect(rulesAt(board, 8, 7)).toBe(RULE_SETS["dry-spell"]);
    expect(rulesAt(board, 9, 7)).toBe(RULE_SETS.standard);
    expect(rulesAt(board, 7, 5)).toBe(RULE_SETS.downpour);
    expect(rulesAt(board, 8, 5)).toBe(RULE_SETS["dry-spell"]);
    expect(rulesAt(board, 7, 6)).toBe(RULE_SETS["dry-spell"]);
  });

  test("Eye of the storm also rounds fractional heights on an odd board", () => {
    const size = { width: 9, height: 7 };
    const board = snapshotOf([], { layout: createArenaLayout("eyeOfStorm", size, createRng(0)) });
    expect([0, 1, 2, 3, 4, 5, 6].map((y) => rulesAt(board, 4, y).id)).toEqual([
      "standard", "dry-spell", "dry-spell", "downpour", "downpour", "dry-spell", "standard",
    ]);
  });

  test("Rain front moves after every 30 turns, straddles the edges and wraps back to column zero", () => {
    const round = open("rainFront");
    const wet = () => Array.from({ length: round.snapshot.width }, (_, x) => x)
      .filter((x) => rulesAt(round, x, round.snapshot.height - 1) === RULE_SETS.downpour);
    const advanceTo = (tick: number) => { while (round.snapshot.tick < tick) stepRound(round); };
    expect(wet()).toEqual([0, 1, 2]);
    advanceTo(29);
    expect(wet()).toEqual([0, 1, 2]);
    advanceTo(30);
    expect(wet()).toEqual([1, 2, 3]);
    advanceTo(180);
    expect(wet()).toEqual([0, 6, 7]);
    advanceTo(210);
    expect(wet()).toEqual([0, 1, 7]);
    advanceTo(240);
    expect(wet()).toEqual([0, 1, 2]);
    stepRound(round);
    changeRoundRules(round, "standard", 1);
    changeRoundRules(round, "rainFront", 1);
    advanceTo(270);
    expect(wet()).toEqual([0, 1, 2]);
    advanceTo(271);
    expect(wet()).toEqual([1, 2, 3]);
  });

  test("Hills are seeded two-by-two areas with a full square between them and each board edge", () => {
    for (const size of [{ width: 8, height: 6 }, { width: 15, height: 11 }, { width: 67, height: 50 }]) {
      const { width, height } = size;
      const maps = new Set<string>();
      for (const seed of [1, 2, 3, 5, 87]) {
        const layout = createArenaLayout("hills", size, createRng(seed));
        expect(layout).toEqual(createArenaLayout("hills", size, createRng(seed)));
        maps.add(layout.areas.map(({ x, y }) => `${x},${y}`).sort().join(" "));
        const board = snapshotOf([], { ...size, layout });
        expect(layout.areas).toHaveLength(Math.max(2, Math.round(width * height / 60)));
        for (const [i, area] of layout.areas.entries()) {
          const { x, y } = area;
          expect([area.width, area.height]).toEqual([2, 2]);
          expect(x).toBeGreaterThan(0);
          expect(y).toBeGreaterThan(0);
          expect(x + 2).toBeLessThan(width);
          expect(y + 2).toBeLessThan(height);
          for (const other of layout.areas.slice(0, i)) {
            expect(Math.max(Math.abs(x - other.x), Math.abs(y - other.y))).toBeGreaterThan(2);
          }
          expect(rulesAt(board, x + 1, y + 1)).toBe(RULE_SETS["sharp-eyes"]);
          expect(rulesAt(board, x - 1, y)).toBe(RULE_SETS.standard);
        }
        expect(rulesAt(board, 0, height - 1)).toBe(RULE_SETS.standard);
      }
      expect(maps.size).toBeGreaterThan(1);
    }
  });

  test("Four quarters spreads a new round's tanks evenly, including a partial group", () => {
    const round = open("fourQuarters", 28);
    const counts = new Map<RuleSetId, number>();
    for (let i = 0; i < 30; i++) {
      const tank = joinRound(round, { id: String(i), strategy: waiter });
      const id = rulesAt(round, tank.x, tank.y).id as RuleSetId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
      if ((i + 1) % 4 === 0) expect([...counts.values()]).toEqual(Array(4).fill((i + 1) / 4));
    }
    expect([...counts.values()].sort((a, b) => a - b)).toEqual([7, 7, 8, 8]);
  });
});

describe("the rules of a square", () => {
  const size = { width: 8, height: 6 };
  const layout = createArenaLayout("fourQuarters", size, createRng(87));

  test("a shot uses the thrower's reach and water cost across a border", () => {
    const west = bot("west", 2, 0, "E", { water: 10 });
    const east = bot("east", 5, 0, "W", { water: 10 });
    const moves = [{ botId: "west", move: "T" }, { botId: "east", move: "T" }] as const;
    const shot = (target: typeof east, rolls: boolean[]) =>
      resolveTick(snapshotOf([west, target], { ...size, layout }), moves, ["west", "east"], stubRng({ chance: rolls }));
    const reach = shot(east, [true]);
    expect(reach.throws).toMatchObject([{ throwerId: "west", outcome: "hit", distance: 3 }, { throwerId: "east", outcome: "empty" }]);
    expect(reach.placements.map(({ water }) => water)).toEqual([7, 11]);
    const costs = shot({ ...east, x: 4 }, [true, true]);
    expect(costs.placements.map(({ water }) => water)).toEqual([7, 5]);
  });

  test("a tank on a hill uses the hill's hit table against a tank on sand", () => {
    const hills = createArenaLayout("hills", size, createRng(87));
    const area = hills.areas[0]!;
    const build = { reach: 0, aim: 0, dodge: 3 };
    const onHill = bot("hill", area.x, area.y, "W", { build });
    const onSand = bot("sand", area.x - 1, area.y, "E", { build: { ...build, dodge: 2 } });
    const shots = resolveTick(
      snapshotOf([onHill, onSand], { ...size, layout: hills }),
      [{ botId: "hill", move: "T" }, { botId: "sand", move: "T" }], ["hill", "sand"], stubRng({ chance: [false, false] }),
    );
    expect(shots.throws).toMatchObject([{ hitChance: 66 }, { hitChance: 90 }]);
  });

  test("refill on the destination square is capped at the layout limit and crossing keeps carried water", () => {
    const round = open("fourQuarters");
    const tank = joinRound(round, { id: "a", strategy: waiter });
    expect(tank.water).toBe(12);
    expect(freshStartRound(round, tank.id).water).toBe(12);
    expect(waterCapacityOf(round.snapshot)).toBe(12);
    const refill = (water: number) => resolveTick(
      snapshotOf([bot("crossing", 3, 0, "E", { water })], { ...size, layout }),
      [{ botId: "crossing", move: "F" }], ["crossing"], stubRng(),
    ).placements[0];
    // These areas refill at the same rate today, but their individual water ceilings differ.
    expect(refill(9)).toMatchObject({ x: 4, water: 9 + RULE_SETS["dry-spell"].waterRefillPerTick });
    expect(refill(12)).toMatchObject({ x: 4, water: 12 });
    changeRoundRules(round, "dry-spell", 1);
    expect(round.snapshot.layout).toBeUndefined();
    expect(round.snapshot.bots[0]?.water).toBe(6);
  });

  test("leaving Open field builds the hybrid map at the smaller size before tunnelling tanks", () => {
    const round = open("open-field", 16);
    const tank = joinRound(round, { id: "edge", strategy: waiter });
    const wide = round.snapshot;
    const outside = { ...tank, x: wide.width - 1, y: wide.height - 1, score: 5 };
    Object.assign(round, { snapshot: { ...wide, bots: [outside] } });
    const moved = changeRoundRules(round, "fourQuarters", 16);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: "edge", score: 5, water: 12 });
    expect(round.snapshot).toMatchObject({ width: 12, height: 9, layout: { id: "fourQuarters" } });
    expect(rulesAt(round, 11, 8)).toBe(RULE_SETS["arms-length"]);
    expect(round.snapshot.bots[0]?.x).toBeLessThan(round.snapshot.width);
    expect(round.snapshot.bots[0]?.y).toBeLessThan(round.snapshot.height);
  });

  test("a tank goes deep into the nearest area with chosen rules, and the rule gives way there or when no area has them", () => {
    const self = bot("me", 0, 0, "E");
    const hybrid = snapshotOf([self], { ...size, layout });
    const here = rulesAt(hybrid, 0, 0).id;
    const far = rulesAt(hybrid, size.width - 1, size.height - 1).id;
    expect(far).not.toBe(here);
    const deep = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size.width && ny < size.height && rulesAt(hybrid, nx, ny).id !== far) return false;
      }
      return rulesAt(hybrid, x, y).id === far;
    };
    const square = nearestAreaSquare(contextFor(hybrid, self.id), far);
    if (square === null) throw new Error("the far area has a square");
    expect(deep(square.x, square.y)).toBe(true);
    // No deep square of that area is closer than the one it picked.
    for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
      if (deep(x, y)) expect(Math.max(x, y)).toBeGreaterThanOrEqual(Math.max(square.x, square.y));
    }
    // On the area's edge the tank still moves in, so the next rule does not step it straight back out.
    const edge = [...Array(size.width * size.height).keys()].map((i) => ({ x: i % size.width, y: Math.floor(i / size.width) }))
      .find(({ x, y }) => rulesAt(hybrid, x, y).id === far && !deep(x, y));
    if (edge === undefined) throw new Error("the far area has an edge");
    const onEdge = snapshotOf([{ ...self, ...edge }], { ...size, layout });
    expect(nearestAreaSquare(contextFor(onEdge, self.id), far)).not.toBeNull();
    const goTo = (set: string) => strategyOf([mode("main", [rule("go", [when("myWater", { compare: "atLeast", n: 0 })], act("goToArea", { set }))], act("wait"))]);
    expect(decide(contextFor(hybrid, self.id), goTo(far), createRng(87)).ruleId).toBe("go");
    expect(decide(contextFor(hybrid, self.id), goTo(here), createRng(87)).ruleId).toBeNull();
    const single = snapshotOf([self], { ...size, ruleSetId: "dry-spell" });
    expect(decide(contextFor(single, self.id), goTo("downpour"), createRng(87)).ruleId).toBeNull();
  });

  test("rules can read my square and the selected target's square in both round forms", () => {
    const self = bot("me", 3, 2, "E");
    const other = bot("other", 4, 2, "W");
    const single = snapshotOf([self, other], { ...size, ruleSetId: "dry-spell" });
    const hybrid = snapshotOf([self, other], { ...size, layout });
    const strategy = strategyOf([mode("main", [
      rule("cross", [when("myArea", { set: "standard" }), when("targetArea", { target: "nearest", set: "dry-spell" })], act("wait")),
      rule("same", [when("myArea", { set: "dry-spell" }), when("targetArea", { target: "nearest", set: "dry-spell" })], act("wait")),
    ], act("wait"))]);
    expect(decide(contextFor(hybrid, self.id), strategy, createRng(87)).ruleId).toBe("cross");
    expect(decide(contextFor(single, self.id), strategy, createRng(87)).ruleId).toBe("same");
    expect(decide(contextFor({ ...hybrid, bots: [self] }, self.id), strategy, createRng(87)).ruleId).toBeNull();
    expect(CONDITIONS["ruleSet"]?.test(contextFor(hybrid, self.id), { set: "standard" })).toBe(false);
  });
});
