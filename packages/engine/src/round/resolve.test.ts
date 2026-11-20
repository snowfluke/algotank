import { describe, expect, test } from "bun:test";
import { POINTS_PER_HIT, hitChancePercent } from "../combat/combat.ts";
import { STANDARD_RULE_SET_ID, ruleSet } from "../combat/rule-sets.ts";
import type { RuleSetId } from "../combat/rule-sets.ts";
import { createRng } from "./rng.ts";
import { DIRECTIONS } from "../types.ts";
import type { BotState, Build, Direction, Handicap, Move, Rng } from "../types.ts";
import { DIRECTION_STEP, rotate } from "../directions.ts";
import { resolveTick } from "./resolve.ts";
import type { TickMove } from "./resolve.ts";

const BASE: Build = { reach: 0, aim: 0, dodge: 0 };
const STANDARD = ruleSet(STANDARD_RULE_SET_ID);
const WATER_CAPACITY = STANDARD.waterCapacity;
const WATER_PER_THROW = STANDARD.waterPerThrow;
const WATER_REFILL_PER_TICK = STANDARD.waterRefillPerTick;

function bot(id: string, x: number, y: number, direction: Direction, extra: Partial<Omit<BotState, "itemsWaiting">> = {}): BotState {
  return {
    id,
    x,
    y,
    direction,
    score: 0,
    wasHit: false,
    lastHitBy: null,
    ticksSinceHit: null,
    lastMove: null,
    modeId: "main",
    build: BASE,
    ticksInMode: 0,
    hitsLanded: 0,
    hitsTaken: 0,
    ticksSinceLandedHit: null,
    water: WATER_CAPACITY,
    item: null,
    itemUses: 0,
    effect: null,
    ...extra,
  };
}

/** A generator whose rolls are fixed, so a test names the outcome it wants. */
function fixedRng(outcome: boolean | "forbidden"): Rng & { rolls: number[] } {
  const rolls: number[] = [];
  return {
    rolls,
    next: () => {
      throw new Error("resolveTick must not call next()");
    },
    int: () => {
      throw new Error("resolveTick must not call int()");
    },
    chance: (percent) => {
      if (outcome === "forbidden") throw new Error("no roll expected");
      rolls.push(percent);
      return outcome;
    },
    shuffle: () => {
      throw new Error("resolveTick must not call shuffle()");
    },
  };
}

function moves(entries: Record<string, Move>): TickMove[] {
  return Object.entries(entries).map(([botId, move]) => ({ botId, move }));
}

function arena(bots: BotState[], width = 8, height = 6, ruleSetId: RuleSetId = STANDARD_RULE_SET_ID) {
  return { width, height, ruleSetId, bots };
}

function placeOf(result: ReturnType<typeof resolveTick>, id: string) {
  const found = result.placements.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no placement for ${id}`);
  return found;
}

describe("movement", () => {
  test("F moves one cell ahead when it is free", () => {
    const result = resolveTick(arena([bot("a", 2, 2, "E"), bot("b", 6, 5, "N")]), moves({ a: "F", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(result, "a")).toMatchObject({ x: 3, y: 2 });
  });

  test("F toward each wall does nothing", () => {
    const cases: [number, number, Direction][] = [
      [3, 0, "N"],
      [7, 3, "E"],
      [3, 5, "S"],
      [0, 3, "W"],
    ];
    for (const [x, y, d] of cases) {
      const result = resolveTick(arena([bot("a", x, y, d), bot("b", 4, 2, "N")]), moves({ a: "F", b: "L" }), ["a", "b"], fixedRng("forbidden"));
      expect(placeOf(result, "a")).toMatchObject({ x, y, direction: d });
    }
  });

  test("F into an occupied cell does nothing, also when that bot only turns", () => {
    const result = resolveTick(arena([bot("a", 2, 2, "E"), bot("b", 3, 2, "N")]), moves({ a: "F", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(result, "a")).toMatchObject({ x: 2, y: 2 });
    expect(placeOf(result, "b")).toMatchObject({ x: 3, y: 2, direction: "W" });
  });

  test("L and R turn without moving", () => {
    const result = resolveTick(arena([bot("a", 2, 2, "N"), bot("b", 5, 4, "E")]), moves({ a: "L", b: "R" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(result, "a")).toMatchObject({ x: 2, y: 2, direction: "W" });
    expect(placeOf(result, "b")).toMatchObject({ x: 5, y: 4, direction: "S" });
  });

  test.each(DIRECTIONS)("facing %s, F moves one cell along the facing, diagonals included", (direction) => {
    const step = DIRECTION_STEP[direction];
    const result = resolveTick(arena([bot("a", 3, 2, direction), bot("b", 7, 5, "N")]), moves({ a: "F", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(result, "a")).toMatchObject({ x: 3 + step.x, y: 2 + step.y, direction });
  });

  test.each(DIRECTIONS)("facing %s, L and R turn 90 degrees and L45 and R45 turn 45 degrees, without moving", (direction) => {
    const expected: Record<"L" | "R" | "L45" | "R45", Direction> = {
      L: rotate(direction, -2),
      R: rotate(direction, 2),
      L45: rotate(direction, -1),
      R45: rotate(direction, 1),
    };
    for (const [move, facing] of Object.entries(expected) as [Move, Direction][]) {
      const result = resolveTick(arena([bot("a", 3, 2, direction), bot("b", 7, 5, "N")]), moves({ a: move, b: "T" }), ["a", "b"], fixedRng("forbidden"));
      expect(placeOf(result, "a")).toMatchObject({ x: 3, y: 2, direction: facing });
    }
  });

  test("a diagonal F out of the grid does nothing, also when only one coordinate would leave it", () => {
    const cases: [number, number, Direction][] = [
      [0, 0, "NW"],
      [3, 0, "NE"],
      [7, 3, "SE"],
      [0, 3, "SW"],
      [7, 5, "SE"],
    ];
    for (const [x, y, d] of cases) {
      const result = resolveTick(arena([bot("a", x, y, d), bot("b", 4, 2, "N")]), moves({ a: "F", b: "L" }), ["a", "b"], fixedRng("forbidden"));
      expect(placeOf(result, "a")).toMatchObject({ x, y, direction: d });
    }
  });

  test("a diagonal step passes between two occupied cells", () => {
    // a at (2,2) facing NE; (3,2) and (2,1) are held, (3,1) is free.
    const bots = [bot("a", 2, 2, "NE"), bot("east", 3, 2, "N"), bot("north", 2, 1, "N")];
    const result = resolveTick(arena(bots), moves({ a: "F", east: "L", north: "L" }), ["a", "east", "north"], fixedRng("forbidden"));
    expect(placeOf(result, "a")).toMatchObject({ x: 3, y: 1 });
  });

  test("a diagonal F into an occupied cell does nothing", () => {
    const bots = [bot("a", 2, 2, "SE"), bot("b", 3, 3, "N")];
    const result = resolveTick(arena(bots), moves({ a: "F", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(result, "a")).toMatchObject({ x: 2, y: 2 });
  });

  test("two bots that want the same cell: the one earlier in the order gets it", () => {
    const bots = [bot("a", 2, 2, "E"), bot("b", 4, 2, "W")];
    const aFirst = resolveTick(arena(bots), moves({ a: "F", b: "F" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(aFirst, "a")).toMatchObject({ x: 3, y: 2 });
    expect(placeOf(aFirst, "b")).toMatchObject({ x: 4, y: 2 });
    const bFirst = resolveTick(arena(bots), moves({ a: "F", b: "F" }), ["b", "a"], fixedRng("forbidden"));
    expect(placeOf(bFirst, "a")).toMatchObject({ x: 2, y: 2 });
    expect(placeOf(bFirst, "b")).toMatchObject({ x: 3, y: 2 });
  });

  test("a cell that an earlier bot left is free, one that it entered is taken", () => {
    // a leaves (2,0) for (3,0). b wants (2,0), and c wants (3,0).
    const bots = [bot("a", 2, 0, "E"), bot("b", 1, 0, "E"), bot("c", 3, 1, "N")];
    const m = moves({ a: "F", b: "F", c: "F" });
    const aFirst = resolveTick(arena(bots), m, ["a", "b", "c"], fixedRng("forbidden"));
    expect(placeOf(aFirst, "a")).toMatchObject({ x: 3, y: 0 });
    expect(placeOf(aFirst, "b")).toMatchObject({ x: 2, y: 0 });
    expect(placeOf(aFirst, "c")).toMatchObject({ x: 3, y: 1 });
    const bFirst = resolveTick(arena(bots), m, ["b", "c", "a"], fixedRng("forbidden"));
    expect(placeOf(bFirst, "b")).toMatchObject({ x: 1, y: 0 });
    expect(placeOf(bFirst, "c")).toMatchObject({ x: 3, y: 0 });
    expect(placeOf(bFirst, "a")).toMatchObject({ x: 2, y: 0 });
  });
});

describe("handicap (built-in styles, owner 2026-11-20)", () => {
  // a throws at b from 1 square away: 90% for everyone. A number is both parts, as rounds stored before the parts.
  const shot = (handicaps: Record<string, number | Handicap>) => {
    const rng = fixedRng(true);
    const parts = Object.entries(handicaps).map(([id, h]): [string, Handicap] => [id, typeof h === "number" ? { miss: h, exposure: h } : h]);
    const result = resolveTick(arena([bot("a", 1, 2, "E"), bot("b", 2, 2, "N")]), moves({ a: "T", b: "L" }), ["a", "b"], rng, undefined, new Map(parts));
    return { rolled: rng.rolls, shown: result.throws };
  };

  test("a handicapped thrower rolls with less, a handicapped target is hit with more, and the event shows the plain chance", () => {
    expect(shot({ a: 15 }).rolled).toEqual([75]);
    expect(shot({ b: 15 }).rolled).toEqual([95]);
    expect(shot({ a: 15 }).shown).toEqual([{ throwerId: "a", outcome: "hit", targetId: "b", distance: 1, hitChance: 90 }]);
  });

  test("two handicapped tanks fight as two plain ones, and no handicap rolls the plain chance", () => {
    expect(shot({ a: 15, b: 15 }).rolled).toEqual([90]);
    expect(shot({}).rolled).toEqual([90]);
  });

  test("the rolled chance stays within 5 to 95", () => {
    expect(shot({ a: 99 }).rolled).toEqual([5]);
  });

  test("the miss part comes off the thrower's throws and the exposure part onto throws at the tank", () => {
    const h = { miss: 10, exposure: 30 };
    expect(shot({ a: h }).rolled).toEqual([80]);
    expect(shot({ b: { miss: 10, exposure: 3 } }).rolled).toEqual([93]);
    expect(shot({ a: h, b: h }).rolled).toEqual([90]);
    // A tweaked tank throwing at a built-in one: only what the target has more of counts.
    expect(shot({ a: { miss: 4, exposure: 10 }, b: { miss: 10, exposure: 30 } }).rolled).toEqual([95]);
    expect(shot({ a: { miss: 10, exposure: 30 }, b: { miss: 4, exposure: 2 } }).rolled).toEqual([84]);
  });
});

describe("throws", () => {
  test("a throw hits the first bot in line only", () => {
    const bots = [bot("a", 1, 2, "E"), bot("b", 2, 2, "N"), bot("c", 3, 2, "N")];
    const rng = fixedRng(true);
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L", c: "L" }), ["a", "b", "c"], rng);
    expect(result.throws).toEqual([{ throwerId: "a", outcome: "hit", targetId: "b", distance: 1, hitChance: 90 }]);
    expect(placeOf(result, "b").score).toBe(-POINTS_PER_HIT);
    expect(placeOf(result, "c").score).toBe(0);
    expect(rng.rolls).toEqual([90]);
  });

  test.each(DIRECTIONS)("facing %s, a throw travels along the facing and the distance counts diagonal steps", (direction) => {
    const step = DIRECTION_STEP[direction];
    const target = bot("t", 3 + 2 * step.x, 3 + 2 * step.y, "N");
    const rng = fixedRng(true);
    const result = resolveTick(arena([bot("a", 3, 3, direction), target], 8, 7), moves({ a: "T", t: "L" }), ["a", "t"], rng);
    expect(result.throws).toEqual([{ throwerId: "a", outcome: "hit", targetId: "t", distance: 2, hitChance: hitChancePercent(BASE, BASE, 2, STANDARD) }]);
  });

  test("a diagonal throw of range 3 reaches the third cell on the diagonal and not the fourth", () => {
    const third = resolveTick(arena([bot("a", 0, 0, "SE"), bot("t", 3, 3, "N")]), moves({ a: "T", t: "L" }), ["a", "t"], fixedRng(true));
    expect(third.throws).toEqual([{ throwerId: "a", outcome: "hit", targetId: "t", distance: 3, hitChance: hitChancePercent(BASE, BASE, 3, STANDARD) }]);
    const fourth = resolveTick(arena([bot("a", 0, 0, "SE"), bot("t", 4, 4, "N")]), moves({ a: "T", t: "L" }), ["a", "t"], fixedRng("forbidden"));
    expect(fourth.throws).toEqual([{ throwerId: "a", outcome: "empty" }]);
  });

  test("a diagonal throw hits the first bot on the diagonal and passes bots beside it", () => {
    // (2,1) and (1,2) stand beside the diagonal from (1,1); (3,3) stands on it.
    const bots = [bot("a", 1, 1, "SE"), bot("side1", 2, 1, "N"), bot("side2", 1, 2, "N"), bot("on", 3, 3, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", side1: "L", side2: "L", on: "L" }), ["a", "side1", "side2", "on"], fixedRng(true));
    expect(result.throws).toEqual([{ throwerId: "a", outcome: "hit", targetId: "on", distance: 2, hitChance: hitChancePercent(BASE, BASE, 2, STANDARD) }]);
  });

  test("aim and dodge do not change the chance at 1 cell, and they do at 2 cells", () => {
    const sharp: Build = { reach: 0, aim: 3, dodge: 0 };
    const slippery: Build = { reach: 0, aim: 0, dodge: 3 };
    const at = (distance: number, thrower: Build, target: Build) =>
      resolveTick(
        arena([bot("a", 1, 2, "E", { build: thrower }), bot("b", 1 + distance, 2, "N", { build: target })]),
        moves({ a: "T", b: "L" }),
        ["a", "b"],
        fixedRng(true),
      ).throws[0];
    const chanceAt = (...args: Parameters<typeof at>) => {
      const event = at(...args);
      if (event?.outcome !== "hit") throw new Error("test setup: the roll was fixed to hit");
      return event.hitChance;
    };
    expect(chanceAt(1, sharp, slippery)).toBe(chanceAt(1, slippery, sharp));
    expect(chanceAt(1, sharp, slippery)).toBe(chanceAt(1, BASE, BASE));
    expect(chanceAt(2, sharp, BASE)).toBeGreaterThan(chanceAt(2, BASE, BASE));
    expect(chanceAt(2, BASE, slippery)).toBeLessThan(chanceAt(2, BASE, BASE));
  });

  test("a miss at the first bot does not carry the throw on to the next bot", () => {
    const bots = [bot("a", 1, 2, "E"), bot("b", 2, 2, "N"), bot("c", 3, 2, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L", c: "L" }), ["a", "b", "c"], fixedRng(false));
    expect(result.throws).toEqual([{ throwerId: "a", outcome: "miss", targetId: "b", distance: 1, hitChance: 90 }]);
    expect(result.placements.map((p) => p.score)).toEqual([0, 0, 0]);
  });

  test("a bot beyond the throw range is not a target and costs no roll", () => {
    // Base range is 3, so a bot 4 cells away is out of reach.
    const bots = [bot("a", 1, 2, "E"), bot("b", 5, 2, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(result.throws).toEqual([{ throwerId: "a", outcome: "empty" }]);
    expect(result.placements.map((p) => p.score)).toEqual([0, 0]);
  });

  test("a build with more range reaches farther, and the hit chance uses the distance", () => {
    const longArm: Build = { ...BASE, reach: 2 };
    const bots = [bot("a", 1, 2, "E", { build: longArm }), bot("b", 6, 2, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng(true));
    expect(result.throws[0]).toMatchObject({ outcome: "hit", targetId: "b", distance: 5, hitChance: hitChancePercent(longArm, BASE, 5, STANDARD) });
  });

  test("a throw at a wall has no target", () => {
    const bots = [bot("a", 7, 2, "E"), bot("b", 0, 2, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(result.throws[0]).toEqual({ throwerId: "a", outcome: "empty" });
  });

  test("a hit moves exactly one point from the target to the thrower, and a score may go below zero", () => {
    const strong: Build = { reach: 2, aim: 3, dodge: 0 };
    const bots = [bot("a", 1, 2, "E", { build: strong, score: 5 }), bot("b", 2, 2, "N", { score: 1 })];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng(true));
    expect(placeOf(result, "a").score).toBe(5 + POINTS_PER_HIT);
    expect(placeOf(result, "b").score).toBe(1 - POINTS_PER_HIT);

    const fromZero = resolveTick(arena([bot("a", 1, 2, "E"), bot("b", 2, 2, "N")]), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng(true));
    expect(placeOf(fromZero, "b").score).toBe(-POINTS_PER_HIT);
  });

  test("the scores sum to the same total before and after any tick", () => {
    const bots = [bot("a", 1, 2, "E", { score: 3 }), bot("b", 2, 2, "W", { score: -1 }), bot("c", 2, 3, "N", { score: -2 })];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "T", c: "T" }), ["a", "b", "c"], fixedRng(true));
    expect(result.placements.reduce((sum, p) => sum + p.score, 0)).toBe(0);
  });

  test("a miss changes no score", () => {
    const result = resolveTick(arena([bot("a", 1, 2, "E"), bot("b", 2, 2, "N")]), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng(false));
    expect(result.placements.map((p) => p.score)).toEqual([0, 0]);
  });

  test("a bot that was hit earlier in the tick still throws", () => {
    const bots = [bot("a", 1, 2, "E"), bot("b", 2, 2, "W")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "T" }), ["a", "b"], fixedRng(true));
    expect(result.throws.map((t) => t.outcome)).toEqual(["hit", "hit"]);
    expect(placeOf(result, "a").score).toBe(0);
    expect(placeOf(result, "b").score).toBe(0);
  });

  test("a throw sees the positions as changed earlier in the same tick", () => {
    // b steps out of a's reach (distance 3 to 4) when b moves first.
    const bots = [bot("a", 1, 2, "E"), bot("b", 4, 2, "E")];
    const m = moves({ a: "T", b: "F" });
    const bFirst = resolveTick(arena(bots), m, ["b", "a"], fixedRng("forbidden"));
    expect(bFirst.throws[0]).toEqual({ throwerId: "a", outcome: "empty" });
    const aFirst = resolveTick(arena(bots), m, ["a", "b"], fixedRng(true));
    expect(aFirst.throws[0]).toMatchObject({ outcome: "hit", targetId: "b", distance: 3, hitChance: hitChancePercent(BASE, BASE, 3, STANDARD) });
  });
});

describe("input checks and purity", () => {
  test("placements keep the snapshot order, whatever the resolve order", () => {
    const bots = [bot("a", 0, 0, "E"), bot("b", 3, 3, "E"), bot("c", 6, 5, "W")];
    const result = resolveTick(arena(bots), moves({ a: "L", b: "L", c: "L" }), ["c", "a", "b"], fixedRng("forbidden"));
    expect(result.placements.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  test("does not change the snapshot it receives", () => {
    const bots = [bot("a", 1, 2, "E"), bot("b", 2, 2, "N")];
    const before = JSON.stringify(bots);
    resolveTick(arena(bots), moves({ a: "T", b: "F" }), ["a", "b"], fixedRng(true));
    expect(JSON.stringify(bots)).toBe(before);
  });

  test("throws on a missing move, an extra move, or an order that is not a permutation", () => {
    const bots = [bot("a", 1, 2, "E"), bot("b", 5, 4, "N")];
    const rng = fixedRng("forbidden");
    expect(() => resolveTick(arena(bots), moves({ a: "L" }), ["a", "b"], rng)).toThrow();
    expect(() => resolveTick(arena(bots), moves({ a: "L", b: "L", z: "L" }), ["a", "b"], rng)).toThrow();
    expect(() => resolveTick(arena(bots), moves({ a: "L", b: "L" }), ["a", "a"], rng)).toThrow();
    expect(() => resolveTick(arena(bots), moves({ a: "L", b: "L" }), ["a"], rng)).toThrow();
    expect(() => resolveTick(arena(bots), moves({ a: "L", b: "L" }), ["a", "z"], rng)).toThrow();
  });
});

describe("water", () => {
  const LOW = WATER_PER_THROW - 1;

  test("a throw at a bot spends WATER_PER_THROW, on a hit and on a miss", () => {
    for (const outcome of [true, false]) {
      const bots = [bot("a", 1, 2, "E"), bot("b", 2, 2, "N")];
      const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng(outcome));
      expect(result.throws[0]?.outcome).toBe(outcome ? "hit" : "miss");
      expect(placeOf(result, "a").water).toBe(WATER_CAPACITY - WATER_PER_THROW);
      expect(placeOf(result, "b").water).toBe(WATER_CAPACITY);
    }
  });

  test("a throw at an empty line spends nothing, and the tank refills on that tick", () => {
    const bots = [bot("a", 1, 2, "N", { water: 0 }), bot("b", 5, 5, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(result.throws).toEqual([{ throwerId: "a", outcome: "empty" }]);
    expect(placeOf(result, "a").water).toBe(WATER_REFILL_PER_TICK);
  });

  test("a bot that does not throw refills", () => {
    const bots = [bot("a", 1, 2, "E", { water: 2 }), bot("b", 5, 5, "N")];
    const result = resolveTick(arena(bots), moves({ a: "F", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(result, "a").water).toBe(2 + WATER_REFILL_PER_TICK);
  });

  test("refill stops at WATER_CAPACITY", () => {
    const bots = [bot("a", 1, 2, "E", { water: WATER_CAPACITY - 1 }), bot("b", 5, 5, "N")];
    const once = resolveTick(arena(bots), moves({ a: "L", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(placeOf(once, "a").water).toBe(WATER_CAPACITY);
    expect(placeOf(once, "b").water).toBe(WATER_CAPACITY);
  });

  test("a throw from a tank with less than WATER_PER_THROW is dry: no points, no roll, and the tank refills", () => {
    const bots = [bot("a", 1, 2, "E", { water: LOW }), bot("b", 2, 2, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(result.throws).toEqual([{ throwerId: "a", outcome: "dry", targetId: "b", distance: 1 }]);
    expect(placeOf(result, "b").score).toBe(0);
    expect(placeOf(result, "a").score).toBe(0);
    expect(placeOf(result, "a").water).toBe(LOW + WATER_REFILL_PER_TICK);
  });

  test("a dry throw leaves the later random draws of the tick as they are without that throw", () => {
    // c throws at d after a. The generator must give c the same roll whether a threw dry or turned.
    const bots = [bot("a", 1, 0, "E", { water: LOW }), bot("b", 2, 0, "N"), bot("c", 1, 4, "E"), bot("d", 2, 4, "N")];
    const run = (aMove: "T" | "L") => {
      const rng = createRng(11);
      const result = resolveTick(arena(bots), moves({ a: aMove, b: "L", c: "T", d: "L" }), ["a", "b", "c", "d"], rng);
      return { throws: result.throws.filter((t) => t.throwerId === "c"), nextDraw: rng.next() };
    };
    expect(run("T")).toEqual(run("L"));
  });

  test("a throw checks the water from before the tick, not the refill of the same tick", () => {
    // One unit short of a throw: refill would reach WATER_PER_THROW at the end of the tick, but too late for this throw.
    const bots = [bot("a", 1, 2, "E", { water: WATER_PER_THROW - WATER_REFILL_PER_TICK }), bot("b", 2, 2, "N")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "L" }), ["a", "b"], fixedRng("forbidden"));
    expect(result.throws[0]?.outcome).toBe("dry");
  });

  test("a thrower hit earlier in the tick keeps its water and pays for its own throw", () => {
    const bots = [bot("a", 1, 2, "E"), bot("b", 2, 2, "W")];
    const result = resolveTick(arena(bots), moves({ a: "T", b: "T" }), ["a", "b"], fixedRng(true));
    expect(placeOf(result, "a").water).toBe(WATER_CAPACITY - WATER_PER_THROW);
    expect(placeOf(result, "b").water).toBe(WATER_CAPACITY - WATER_PER_THROW);
  });
});

describe("the numbers of the snapshot's rule set", () => {
  const aimsAt = (distance: number, ruleSetId: RuleSetId, extra: Partial<BotState> = {}, rng: Rng = fixedRng(true)) =>
    resolveTick(
      arena([bot("a", 1, 2, "E", extra), bot("b", 1 + distance, 2, "N")], 12, 8, ruleSetId),
      moves({ a: "T", b: "L" }),
      ["a", "b"],
      rng,
    );

  test("the throw range is the base range of the set", () => {
    expect(aimsAt(2, "arms-length", {}, fixedRng("forbidden")).throws).toEqual([{ throwerId: "a", outcome: "empty" }]);
    expect(aimsAt(1, "arms-length").throws[0]).toMatchObject({ outcome: "hit", distance: 1 });
    expect(aimsAt(2, "dry-spell").throws[0]).toMatchObject({ outcome: "hit", distance: 2 });
    expect(aimsAt(3, "dry-spell", {}, fixedRng("forbidden")).throws).toEqual([{ throwerId: "a", outcome: "empty" }]);
  });

  test("a throw spends the cost of the set and the tank refills up to the capacity of the set", () => {
    for (const id of ["dry-spell", "downpour"] as const) {
      const rules = ruleSet(id);
      const thrown = aimsAt(1, id, { water: rules.waterCapacity });
      expect(placeOf(thrown, "a").water, id).toBe(rules.waterCapacity - rules.waterPerThrow);
      const refilled = resolveTick(
        arena([bot("a", 1, 2, "E", { water: rules.waterCapacity - 1 }), bot("b", 5, 5, "N")], 12, 8, id),
        moves({ a: "L", b: "L" }),
        ["a", "b"],
        fixedRng("forbidden"),
      );
      expect(placeOf(refilled, "a").water, id).toBe(rules.waterCapacity);
    }
  });

  test("the set decides whether a tank holds enough for a throw", () => {
    // 4 water is a throw under the standard set (cost 3) and a dry throw under dry-spell (cost 5).
    const holdsFour = { water: 4 };
    expect(aimsAt(1, "standard", holdsFour).throws[0]?.outcome).toBe("hit");
    expect(aimsAt(1, "dry-spell", holdsFour, fixedRng("forbidden")).throws[0]?.outcome).toBe("dry");
  });

  test("Aim and Dodge count from 1 cell under sharp-eyes and not under the standard set", () => {
    const sharp: Build = { reach: 0, aim: 3, dodge: 0 };
    const chance = (id: RuleSetId) => {
      const event = aimsAt(1, id, { build: sharp }).throws[0];
      if (event?.outcome !== "hit") throw new Error("test setup: the roll was fixed to hit");
      return event.hitChance;
    };
    const sharpEyes = ruleSet("sharp-eyes");
    expect(chance("standard")).toBe(STANDARD.baseHitChance[1] as number);
    expect(chance("sharp-eyes")).toBe(Math.min(95, (sharpEyes.baseHitChance[1] as number) + 3 * sharpEyes.hitChancePerLevel));
  });

  test("an unknown rule set id is rejected", () => {
    expect(() => resolveTick(arena([bot("a", 1, 2, "E"), bot("b", 5, 5, "N")], 8, 6, "nope" as RuleSetId), moves({ a: "L", b: "L" }), ["a", "b"], fixedRng("forbidden"))).toThrow(/unknown rule set/);
  });
});
