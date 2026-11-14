import { describe, expect, test } from "bun:test";
import { MAX_THROW_RANGE, MAX_WATER_CAPACITY, hitChancePercent } from "../combat/combat.ts";
import { RULE_SET_IDS, RULE_SETS, ruleSet } from "../combat/rule-sets.ts";
import { MOVES } from "../types.ts";
import type { BotState, ParamSpec, ParamValues } from "../types.ts";
import { ACTIONS, CONDITIONS, TARGET_SELECTORS } from "./vocabulary.ts";
import { parseStrategy } from "./parse.ts";
import { STANDARD, bot, contextFor, snapshotOf, stubRng, when } from "./test-helpers.ts";

/** The water parameters default to the standard set: a throw costs 3 and a tank holds 9. */
const WATER_PER_THROW = STANDARD.waterPerThrow;

function defaultsOf(params: readonly ParamSpec[]): ParamValues {
  return Object.fromEntries(params.map((spec) => [spec.key, spec.default]));
}

function placeholdersIn(label: string): string[] {
  return [...label.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "");
}

// A snapshot where every kind of condition has something to read.
const crowd = snapshotOf(
  [
    bot("me", 2, 2, "E", { score: 4, lastMove: "F", lastHitBy: "b", wasHit: true, ticksSinceHit: 0, modeId: "main", hitsTaken: 1 }),
    bot("a", 5, 2, "W", { score: 9 }),
    bot("b", 2, 5, "N", { score: 1 }),
    bot("c", 8, 6, "S", { score: 4 }),
  ],
  { tick: 30 },
);

describe("vocabulary tables", () => {
  test("each table key equals the entry id", () => {
    for (const table of [CONDITIONS, TARGET_SELECTORS, ACTIONS]) {
      for (const [key, def] of Object.entries(table)) expect(def.id).toBe(key);
    }
  });

  test("every condition and action has a group and a plain label, and every label placeholder has a parameter", () => {
    for (const def of [...Object.values(CONDITIONS), ...Object.values(ACTIONS)]) {
      expect(def.group.length, def.id).toBeGreaterThan(0);
      expect(def.label.length, def.id).toBeGreaterThan(0);
      expect(placeholdersIn(def.label).sort(), def.id).toEqual(def.params.map((spec) => spec.key).sort());
    }
    for (const def of Object.values(TARGET_SELECTORS)) expect(def.label.length).toBeGreaterThan(0);
  });

  test("no label puts a plural noun right after a number, because the number can be 1", () => {
    for (const def of [...Object.values(CONDITIONS), ...Object.values(ACTIONS)]) {
      expect(def.label, def.id).not.toMatch(/\{\w+\} (cells|bots|ticks|sides|points)\b/);
    }
  });

  test("the design review's entries are there", () => {
    const conditions = [
      "enemyAhead", "enemyInRange", "hitChance", "aimedAtMe", "enemiesWithin", "targetDistance", "targetBearing",
      "targetInRowOrColumn", "targetAimed", "targetPoints", "targetJustHit", "targetBuild", "hitWithin", "landedWithin",
      "modeTime", "cutMargin", "wallAhead", "wallSides", "borderDistance", "timeLeft", "roundType", "fieldTrait",
      "myWater", "targetWater", "ruleSet",
    ];
    const selectors = [
      "nearest", "inThrowLine", "aimedAtMe", "lastHitMe", "highestScore", "nearestWithMorePoints", "nearestWithFewerPoints",
      "cutRival", "easiestHit", "mostIsolated", "topReach", "topAim", "topDodge", "nearestWithLessWater",
    ];
    const actions = ["throw", "stepForward", "turn", "moveToward", "moveAway", "attack", "faceTarget", "stepOutOfLine", "awayFromCrowd", "goToPlace", "goForward"];
    for (const id of conditions) expect(CONDITIONS[id], id).toBeDefined();
    for (const id of selectors) expect(TARGET_SELECTORS[id], id).toBeDefined();
    for (const id of actions) expect(ACTIONS[id], id).toBeDefined();
  });

  test("the entries the review dropped or merged into another entry are gone", () => {
    // inLineOfFire became "bots aimed at me". The other conditions are one-way forms of a kept condition.
    for (const id of ["inLineOfFire", "wasHit", "rankAtMost", "rankAtLeast", "firstPlace", "lastMove", "aboveCut", "aheadOfCutBy", "behindCutBy", "nearWall", "timeLeftAtMost", "timeLeftAtLeast", "targetHasMorePoints", "targetHasFewerPoints"]) {
      expect(CONDITIONS[id], id).toBeUndefined();
    }
    for (const id of ["lowestScore", "lockedTarget", "locked_target"]) expect(TARGET_SELECTORS[id], id).toBeUndefined();
    for (const id of ["lineUp", "moveToCentre", "moveToWall", "turnLeft", "turnRight"]) expect(ACTIONS[id], id).toBeUndefined();
  });

  test("the first condition and the first action are valid with their default parameters, because the editor uses them for a new rule", () => {
    const firstCondition = Object.values(CONDITIONS)[0];
    const firstAction = Object.values(ACTIONS)[0];
    if (firstCondition === undefined || firstAction === undefined) throw new Error("tables are empty");
    const result = parseStrategy({
      modes: [
        {
          id: "m",
          name: "Main",
          rules: [
            {
              id: "r",
              match: "all",
              conditions: [{ condition: firstCondition.id, params: defaultsOf(firstCondition.params), negate: false }],
              action: { action: firstAction.id, params: defaultsOf(firstAction.params) },
              chance: 100,
              switchToMode: null,
            },
          ],
          fallback: { action: firstAction.id, params: defaultsOf(firstAction.params) },
        },
      ],
      build: { reach: 0, aim: 0, dodge: 0 },
    });
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  test("a parameter default is valid for its own spec, so a new rule from the editor passes parseStrategy", () => {
    const rules = Object.values(CONDITIONS).map((def, index) => ({
      id: `c${index}`,
      match: "all",
      conditions: [{ condition: def.id, params: defaultsOf(def.params), negate: false }],
      action: { action: "throw", params: {} },
      chance: 100,
      switchToMode: null,
    }));
    const fallbacks = Object.values(ACTIONS);
    const modes = fallbacks.map((def, index) => ({
      id: `m${index}`,
      name: def.id,
      rules: index === 0 ? rules.slice(0, 20) : [],
      fallback: { action: def.id, params: defaultsOf(def.params) },
    }));
    // The limits allow 6 modes and 20 rules, so check the tables in slices.
    for (let start = 0; start < rules.length; start += 20) {
      for (let first = 0; first < modes.length; first += 6) {
        const slice = modes.slice(first, first + 6).map((mode, i) => ({ ...mode, rules: i === 0 ? rules.slice(start, start + 20) : [] }));
        const result = parseStrategy({ modes: slice, build: { reach: 0, aim: 0, dodge: 0 } });
        expect(result.ok ? [] : result.errors).toEqual([]);
      }
    }
  });

  test("every condition evaluates on a snapshot without throwing, for every target selector", () => {
    for (const def of Object.values(CONDITIONS)) {
      const targets = def.params.some((spec) => spec.kind === "target") ? Object.keys(TARGET_SELECTORS) : [""];
      for (const target of targets) {
        const params = { ...defaultsOf(def.params), ...(target === "" ? {} : { target }) };
        for (const self of crowd.bots) {
          expect(typeof def.test(contextFor(crowd, self.id), params), def.id).toBe("boolean");
        }
        const alone = snapshotOf([bot("me", 0, 0, "N")]);
        expect(typeof def.test(contextFor(alone, "me"), params), `${def.id} alone`).toBe("boolean");
      }
    }
  });

  test("every action evaluates on a snapshot without throwing, with a stub rng", () => {
    for (const def of Object.values(ACTIONS)) {
      const targets = def.params.some((spec) => spec.kind === "target") ? Object.keys(TARGET_SELECTORS) : [""];
      for (const target of targets) {
        const params = { ...defaultsOf(def.params), ...(target === "" ? {} : { target }) };
        for (const self of crowd.bots) {
          const move = def.toMove(contextFor(crowd, self.id), params, stubRng({ int: [0] }));
          if (move !== null) expect(MOVES, def.id).toContain(move);
        }
      }
    }
  });

  test("a prototype key is not an entry", () => {
    expect(CONDITIONS["constructor"]).toBeUndefined();
    expect(ACTIONS["__proto__"]).toBeUndefined();
  });
});

function check(id: string, bots: readonly BotState[], params: ParamValues = {}, extra: Partial<typeof crowd> = {}): boolean {
  const def = CONDITIONS[id];
  if (def === undefined) throw new Error(`no condition ${id}`);
  const ref = when(id, params);
  return def.test(contextFor(snapshotOf(bots, extra), "me"), ref.params);
}

describe("conditions about other bots", () => {
  test("a bot is the first in my throw line within n cells", () => {
    const me = bot("me", 2, 3, "E");
    expect(check("enemyAhead", [me, bot("e", 5, 3, "W")], { n: 3 })).toBe(true);
    expect(check("enemyAhead", [me, bot("e", 5, 3, "W")], { n: 2 })).toBe(false);
    expect(check("enemyAhead", [me, bot("e", 5, 4, "W")], { n: 5 })).toBe(false);
    expect(check("enemyAhead", [me, bot("e", 0, 3, "W")], { n: 5 })).toBe(false);
  });

  test("a bot in my throw range follows the reach attribute", () => {
    const enemy = bot("e", 6, 3, "W");
    expect(check("enemyInRange", [bot("me", 2, 3, "E"), enemy])).toBe(false);
    expect(check("enemyInRange", [bot("me", 2, 3, "E", { build: { reach: 1, aim: 0, dodge: 0 } }), enemy])).toBe(true);
  });

  test("the hit chance of my throw right now uses the first bot in line, and is 0 without one", () => {
    const aimer = { reach: 0, aim: 3, dodge: 0 };
    const plain = { reach: 0, aim: 0, dodge: 0 };
    const dodgy = { reach: 0, aim: 0, dodge: 3 };
    const me = bot("me", 2, 3, "E", { build: aimer });
    // The bot is 2 cells away, so the chance comes from the table in combat.ts.
    const inLine = [me, bot("e", 4, 3, "W")];
    const expected = hitChancePercent(aimer, plain, 2, STANDARD);
    expect(check("hitChance", inLine, { compare: "atLeast", percent: expected })).toBe(true);
    expect(check("hitChance", inLine, { compare: "atLeast", percent: expected + 1 })).toBe(false);
    expect(check("hitChance", inLine, { compare: "atMost", percent: expected - 1 })).toBe(false);
    expect(check("hitChance", inLine, { compare: "atMost", percent: expected })).toBe(true);
    // The dodge of the bot in line counts.
    const dodger = [me, bot("e", 4, 3, "W", { build: dodgy })];
    const lowered = hitChancePercent(aimer, dodgy, 2, STANDARD);
    expect(lowered).toBeLessThan(expected);
    expect(check("hitChance", dodger, { compare: "atMost", percent: lowered })).toBe(true);
    expect(check("hitChance", dodger, { compare: "atLeast", percent: lowered + 1 })).toBe(false);
    // Nobody in line: the value is 0.
    const alone = [me, bot("e", 4, 5, "W")];
    expect(check("hitChance", alone, { compare: "atMost", percent: 5 })).toBe(true);
    expect(check("hitChance", alone, { compare: "atLeast", percent: 5 })).toBe(false);
    // A tank too low to throw: the throw would do nothing, so the value is 0.
    const lowTank = [{ ...me, water: WATER_PER_THROW - 1 }, bot("e", 4, 3, "W")];
    expect(check("hitChance", lowTank, { compare: "atLeast", percent: 1 })).toBe(false);
    expect(check("hitChance", lowTank, { compare: "atMost", percent: 0 })).toBe(true);
  });

  test("a bot in line shields the bots behind it from the hit chance", () => {
    const me = bot("me", 2, 3, "E");
    const bots = [me, bot("near", 3, 3, "N"), bot("far", 4, 3, "N", { build: { reach: 0, aim: 0, dodge: 3 } })];
    expect(check("hitChance", bots, { compare: "atLeast", percent: hitChancePercent(me.build, me.build, 1, STANDARD) })).toBe(true);
  });

  test("bots aimed at me counts the bots whose throw would hit me", () => {
    const me = bot("me", 4, 3, "E");
    const shooter = bot("shooter", 6, 3, "W");
    expect(check("aimedAtMe", [me, shooter], { k: 1 })).toBe(true);
    expect(check("aimedAtMe", [me, shooter], { k: 2 })).toBe(false);
    expect(check("aimedAtMe", [me, shooter, bot("second", 4, 0, "S")], { k: 2 })).toBe(true);
    // Facing away, or out of range, or shielded: not aimed at me.
    expect(check("aimedAtMe", [me, bot("away", 6, 3, "E")], { k: 1 })).toBe(false);
    expect(check("aimedAtMe", [me, bot("far", 8, 3, "W")], { k: 1 })).toBe(false);
    expect(check("aimedAtMe", [me, shooter, bot("shield", 5, 3, "N")], { k: 1 })).toBe(false);
  });

  test("bots aimed at me include a bot on my diagonal that faces me, up to one per direction", () => {
    const me = bot("me", 4, 3, "E");
    const diagonal = bot("diagonal", 6, 1, "SW");
    expect(check("aimedAtMe", [me, diagonal], { k: 1 })).toBe(true);
    expect(check("aimedAtMe", [me, bot("off", 6, 2, "SW")], { k: 1 })).toBe(false);
    const ring = [
      bot("n", 4, 1, "S"),
      bot("ne", 6, 1, "SW"),
      bot("e", 6, 3, "W"),
      bot("se", 6, 5, "NW"),
      bot("s", 4, 5, "N"),
      bot("sw", 2, 5, "NE"),
      bot("w", 2, 3, "E"),
      bot("nw", 2, 1, "SE"),
    ];
    expect(check("aimedAtMe", [me, ...ring], { k: 8 })).toBe(true);
  });

  test("nearest bot distance is false without other bots", () => {
    const me = bot("me", 2, 3, "E");
    expect(check("nearestEnemyAtMost", [me], { n: 20 })).toBe(false);
    expect(check("nearestEnemyAtLeast", [me], { n: 1 })).toBe(false);
    expect(check("nearestEnemyAtMost", [me, bot("e", 4, 4, "N")], { n: 3 })).toBe(true);
    expect(check("nearestEnemyAtLeast", [me, bot("e", 4, 4, "N")], { n: 4 })).toBe(false);
    // 3 east and 3 south is 3 cells: a diagonal step counts as 1.
    expect(check("nearestEnemyAtMost", [me, bot("e", 5, 6, "N")], { n: 3 })).toBe(true);
    expect(check("nearestEnemyAtLeast", [me, bot("e", 5, 6, "N")], { n: 4 })).toBe(false);
  });

  test("bots within a radius", () => {
    const bots = [bot("me", 2, 3, "E"), bot("a", 3, 3, "N"), bot("b", 2, 5, "N"), bot("c", 8, 6, "N")];
    expect(check("enemiesWithin", bots, { n: 2, r: 2 })).toBe(true);
    expect(check("enemiesWithin", bots, { n: 3, r: 2 })).toBe(false);
    expect(check("enemiesWithin", bots, { n: 3, r: 20 })).toBe(true);
  });
});

describe("conditions about the target", () => {
  const me = bot("me", 2, 3, "E", { score: 4 });

  test("every target condition is false when the selector finds nobody", () => {
    const params: Record<string, ParamValues> = {
      targetDistance: { compare: "atMost", n: 20 },
      targetBearing: { bearing: "ahead" },
      targetPoints: { compare: "fewerThan", n: 30 },
      targetBuild: { attribute: "reach", level: 0 },
      targetWater: { compare: "moreThan", n: 0 },
    };
    for (const id of ["targetDistance", "targetBearing", "targetInRowOrColumn", "targetAimed", "targetFacingAway", "targetPoints", "targetJustHit", "targetBuild", "targetWater"]) {
      expect(check(id, [me], { target: "nearest", ...params[id] }), id).toBe(false);
    }
  });

  test("the target holds at most or more than n water", () => {
    const withWater = (water: number) => [me, bot("e", 5, 4, "N", { water })];
    expect(check("targetWater", withWater(2), { target: "nearest", compare: "atMost", n: WATER_PER_THROW - 1 })).toBe(true);
    expect(check("targetWater", withWater(WATER_PER_THROW), { target: "nearest", compare: "atMost", n: WATER_PER_THROW - 1 })).toBe(false);
    expect(check("targetWater", withWater(5), { target: "nearest", compare: "moreThan", n: 4 })).toBe(true);
    expect(check("targetWater", withWater(4), { target: "nearest", compare: "moreThan", n: 4 })).toBe(false);
  });

  test("distance to the target is within or farther than n cells, a diagonal step counting as 1", () => {
    // 3 east and 2 south of me: 3 cells (Chebyshev), not 5.
    const bots = [me, bot("e", me.x + 3, me.y + 2, "N")];
    expect(check("targetDistance", bots, { target: "nearest", compare: "atMost", n: 3 })).toBe(true);
    expect(check("targetDistance", bots, { target: "nearest", compare: "atMost", n: 2 })).toBe(false);
    expect(check("targetDistance", bots, { target: "nearest", compare: "moreThan", n: 2 })).toBe(true);
    expect(check("targetDistance", bots, { target: "nearest", compare: "moreThan", n: 3 })).toBe(false);
  });

  test("the target is ahead of, left of, right of or behind me", () => {
    const at = (x: number, y: number) => [me, bot("e", x, y, "N")];
    const is = (bearing: string, x: number, y: number) => check("targetBearing", at(x, y), { target: "nearest", bearing });
    expect(is("ahead", 6, 3)).toBe(true);
    expect(is("behind", 0, 3)).toBe(true);
    expect(is("right", 3, 6)).toBe(true);
    expect(is("left", 3, 0)).toBe(true);
    expect(is("left", 6, 3)).toBe(false);
    // A tie between the axes goes to ahead.
    expect(is("ahead", 4, 5)).toBe(true);
    expect(is("right", 4, 5)).toBe(false);
  });

  test("the target is in a straight line with me (row, column or diagonal), and facing away", () => {
    expect(check("targetInRowOrColumn", [me, bot("e", 2, 6, "N")], { target: "nearest" })).toBe(true);
    expect(check("targetInRowOrColumn", [me, bot("e", 7, 3, "N")], { target: "nearest" })).toBe(true);
    expect(check("targetInRowOrColumn", [me, bot("e", 5, 6, "N")], { target: "nearest" })).toBe(true);
    expect(check("targetInRowOrColumn", [me, bot("e", 0, 1, "N")], { target: "nearest" })).toBe(true);
    expect(check("targetInRowOrColumn", [me, bot("e", 3, 6, "N")], { target: "nearest" })).toBe(false);
    expect(check("targetFacingAway", [me, bot("e", 6, 3, "E")], { target: "nearest" })).toBe(true);
    expect(check("targetFacingAway", [me, bot("e", 6, 3, "W")], { target: "nearest" })).toBe(false);
  });

  test("the target is aimed at me only when its throw would hit me", () => {
    expect(check("targetAimed", [me, bot("e", 4, 3, "W")], { target: "nearest" })).toBe(true);
    expect(check("targetAimed", [me, bot("e", 4, 3, "E")], { target: "nearest" })).toBe(false);
    // The nearest bot looks away from me, and a farther bot is the one aimed at me: the nearest is not aimed.
    const bots = [me, bot("near", 2, 4, "S"), bot("shooter", 5, 3, "W")];
    expect(check("targetAimed", bots, { target: "nearest" })).toBe(false);
    expect(check("targetAimed", bots, { target: "aimedAtMe" })).toBe(true);
  });

  test("the target's points compared with mine, as target minus me", () => {
    const bots = [me, bot("e", 3, 3, "E", { score: 6 })];
    expect(check("targetPoints", bots, { target: "nearest", compare: "atLeast", n: 2 })).toBe(true);
    expect(check("targetPoints", bots, { target: "nearest", compare: "atLeast", n: 3 })).toBe(false);
    expect(check("targetPoints", bots, { target: "nearest", compare: "fewerThan", n: 3 })).toBe(true);
    expect(check("targetPoints", bots, { target: "nearest", compare: "fewerThan", n: 2 })).toBe(false);
    expect(check("targetPoints", bots, { target: "nearest", compare: "fewerThan", n: 0 })).toBe(false);
  });

  test("the target was hit on the last tick", () => {
    expect(check("targetJustHit", [me, bot("e", 3, 3, "E", { wasHit: true })], { target: "nearest" })).toBe(true);
    expect(check("targetJustHit", [me, bot("e", 3, 3, "E")], { target: "nearest" })).toBe(false);
  });

  test("the target has an attribute at a level or more", () => {
    const bots = [me, bot("e", 3, 3, "E", { build: { reach: 1, aim: 2, dodge: 0 } })];
    expect(check("targetBuild", bots, { target: "nearest", attribute: "aim", level: 2 })).toBe(true);
    expect(check("targetBuild", bots, { target: "nearest", attribute: "aim", level: 3 })).toBe(false);
    expect(check("targetBuild", bots, { target: "nearest", attribute: "reach", level: 1 })).toBe(true);
    expect(check("targetBuild", bots, { target: "nearest", attribute: "dodge", level: 1 })).toBe(false);
    expect(check("targetBuild", bots, { target: "nearest", attribute: "dodge", level: 0 })).toBe(true);
  });
});

describe("conditions about me", () => {
  test("I was hit within the last n ticks counts the tick after a hit as 1 tick ago", () => {
    const hit = (ticksSinceHit: number | null) => [bot("me", 2, 3, "E", { ticksSinceHit })];
    expect(check("hitWithin", hit(0), { n: 1 })).toBe(true);
    expect(check("hitWithin", hit(1), { n: 1 })).toBe(false);
    expect(check("hitWithin", hit(1), { n: 2 })).toBe(true);
    expect(check("hitWithin", hit(null), { n: 50 })).toBe(false);
  });

  test("I landed a hit within the last n ticks, counted the same way", () => {
    const landed = (ticksSinceLandedHit: number | null) => [bot("me", 2, 3, "E", { ticksSinceLandedHit })];
    expect(check("landedWithin", landed(0), { n: 1 })).toBe(true);
    expect(check("landedWithin", landed(1), { n: 1 })).toBe(false);
    expect(check("landedWithin", landed(4), { n: 5 })).toBe(true);
    expect(check("landedWithin", landed(null), { n: 50 })).toBe(false);
  });

  test("time in this mode is at least or fewer than n ticks", () => {
    const inMode = [bot("me", 2, 3, "E", { ticksInMode: 5 })];
    expect(check("modeTime", inMode, { compare: "atLeast", n: 5 })).toBe(true);
    expect(check("modeTime", inMode, { compare: "atLeast", n: 6 })).toBe(false);
    expect(check("modeTime", inMode, { compare: "fewerThan", n: 6 })).toBe(true);
    expect(check("modeTime", inMode, { compare: "fewerThan", n: 5 })).toBe(false);
  });

  test("my tank holds at least or fewer than n water", () => {
    const tank = (water: number) => [bot("me", 2, 3, "E", { water })];
    expect(check("myWater", tank(6), { compare: "atLeast", n: 6 })).toBe(true);
    expect(check("myWater", tank(5), { compare: "atLeast", n: 6 })).toBe(false);
    expect(check("myWater", tank(2), { compare: "fewerThan", n: 3 })).toBe(true);
    expect(check("myWater", tank(3), { compare: "fewerThan", n: 3 })).toBe(false);
  });

  test("the defaults of the water conditions read as 'can throw' and 'cannot throw'", () => {
    const myWater = CONDITIONS.myWater;
    const targetWater = CONDITIONS.targetWater;
    if (myWater === undefined || targetWater === undefined) throw new Error("conditions missing");
    expect(defaultsOf(myWater.params)).toEqual({ compare: "atLeast", n: WATER_PER_THROW });
    expect(defaultsOf(targetWater.params)).toEqual({ target: "nearest", compare: "atMost", n: WATER_PER_THROW - 1 });
    const limits = (def: typeof myWater) => def.params.flatMap((spec) => (spec.kind === "int" ? [[spec.min, spec.max]] : []));
    expect(limits(myWater)).toEqual([[0, MAX_WATER_CAPACITY]]);
    expect(limits(targetWater)).toEqual([[0, MAX_WATER_CAPACITY]]);
    expect(myWater.label).toBe("My tank holds {compare} {n} water");
    expect(targetWater.label).toBe("The target ({target}) holds {compare} {n} water");
  });

  test("score conditions", () => {
    const me = [bot("me", 2, 3, "E", { score: 4 })];
    expect(check("scoreAtMost", me, { n: 4 })).toBe(true);
    expect(check("scoreAtLeast", me, { n: 5 })).toBe(false);
  });
});

describe("cut margin", () => {
  // The other scores are 9, 5 and 1. With 2 survivors the bot across the cut line is the one with 5.
  const make = (mine: number) => [
    bot("me", 2, 3, "E", { score: mine }),
    bot("a", 0, 0, "E", { score: 9 }),
    bot("b", 0, 1, "E", { score: 5 }),
    bot("c", 0, 2, "E", { score: 1 }),
  ];
  const cut = { survivorsAfterRound: 2 };
  const margin = (compare: string, n: number, mine: number, extra: Partial<typeof crowd> = cut) =>
    check("cutMargin", make(mine), { compare, n }, extra);

  test("inside the cut the margin is the lead over the best bot outside", () => {
    expect(margin("atLeast", 7, 12)).toBe(true);
    expect(margin("atLeast", 8, 12)).toBe(false);
  });

  test("outside the cut the margin is negative: the gap to the worst bot inside", () => {
    expect(margin("fewerThan", 0, 3)).toBe(true);
    expect(margin("atLeast", -2, 3)).toBe(true);
    expect(margin("atLeast", -1, 3)).toBe(false);
  });

  test("a tie with the bot across the line is a margin of 0", () => {
    expect(margin("atLeast", 0, 5)).toBe(true);
    expect(margin("atLeast", 1, 5)).toBe(false);
  });

  test("in the final the leader sees its lead over second place and the others see their gap to the leader", () => {
    const final = { survivorsAfterRound: null };
    expect(margin("atLeast", 3, 12, final)).toBe(true);
    expect(margin("atLeast", 4, 12, final)).toBe(false);
    expect(margin("atLeast", -4, 5, final)).toBe(true);
    expect(margin("atLeast", -3, 5, final)).toBe(false);
  });

  test("when the cut keeps everyone, nobody is across the line and the margin is as large as can be", () => {
    const keepAll = { survivorsAfterRound: 8 };
    expect(margin("atLeast", 30, -50, keepAll)).toBe(true);
    expect(margin("fewerThan", 30, -50, keepAll)).toBe(false);
  });
});

describe("conditions that read the numbers of the rule set", () => {
  const bigTank = (water: number) => [bot("me", 2, 3, "E", { water }), bot("e", 3, 3, "W")];

  test("a throw needs the water of the set: the hit chance condition is 0 below the cost and real at the cost", () => {
    for (const id of RULE_SET_IDS) {
      const cost = ruleSet(id).waterPerThrow;
      const under = check("hitChance", bigTank(cost - 1), { compare: "atLeast", percent: 5 }, { ruleSetId: id });
      const at = check("hitChance", bigTank(cost), { compare: "atLeast", percent: 5 }, { ruleSetId: id });
      expect([id, under, at]).toEqual([id, false, true]);
    }
  });

  test("the range conditions use the base range of the set", () => {
    // The bot stands 2 cells ahead: in range under the standard set, out of range at arm's length.
    const bots = [bot("me", 2, 3, "E"), bot("e", 4, 3, "W")];
    expect(check("enemyInRange", bots, {}, { ruleSetId: "standard" })).toBe(true);
    expect(check("enemyInRange", bots, {}, { ruleSetId: "arms-length" })).toBe(false);
    expect(check("aimedAtMe", [bot("me", 4, 3, "E"), bot("s", 6, 3, "W")], { k: 1 }, { ruleSetId: "arms-length" })).toBe(false);
    expect(check("aimedAtMe", [bot("me", 4, 3, "E"), bot("s", 6, 3, "W")], { k: 1 }, { ruleSetId: "standard" })).toBe(true);
  });

  test("the hit chance condition uses the table of the set", () => {
    const aimer = { reach: 0, aim: 3, dodge: 0 };
    const bots = [bot("me", 2, 3, "E", { build: aimer }), bot("e", 3, 3, "W")];
    const sharp = ruleSet("sharp-eyes");
    const chance = hitChancePercent(aimer, { reach: 0, aim: 0, dodge: 0 }, 1, sharp);
    expect(chance).toBeGreaterThan(hitChancePercent(aimer, { reach: 0, aim: 0, dodge: 0 }, 1, STANDARD));
    expect(check("hitChance", bots, { compare: "atLeast", percent: chance }, { ruleSetId: "sharp-eyes" })).toBe(true);
    expect(check("hitChance", bots, { compare: "atLeast", percent: chance }, { ruleSetId: "standard" })).toBe(false);
  });

  test("the thrown-at selectors use the range of the set", () => {
    const bots = [bot("me", 2, 3, "E"), bot("e", 4, 3, "W")];
    const pickWith = (id: string, ruleSetId: "standard" | "arms-length") => {
      const def = TARGET_SELECTORS[id];
      if (def === undefined) throw new Error(`no selector ${id}`);
      return def.pick(contextFor(snapshotOf(bots, { ruleSetId }), "me"))?.id ?? null;
    };
    expect(pickWith("inThrowLine", "standard")).toBe("e");
    expect(pickWith("inThrowLine", "arms-length")).toBeNull();
    expect(pickWith("easiestHit", "standard")).toBe("e");
    expect(pickWith("easiestHit", "arms-length")).toBeNull();
  });

  test("a parameter limit accepts what any set allows, because parseStrategy runs before the set is known", () => {
    const limit = (conditionId: string) => {
      const spec = CONDITIONS[conditionId]?.params.find((p) => p.kind === "int");
      if (spec?.kind !== "int") throw new Error(`${conditionId} has no number parameter`);
      return spec.max;
    };
    for (const id of RULE_SET_IDS) {
      const rules = ruleSet(id);
      expect(limit("myWater"), id).toBeGreaterThanOrEqual(rules.waterCapacity);
      expect(limit("targetWater"), id).toBeGreaterThanOrEqual(rules.waterCapacity);
      expect(limit("enemyAhead"), id).toBeGreaterThanOrEqual(rules.baseRange + 2);
    }
    expect(limit("enemyAhead")).toBe(MAX_THROW_RANGE);
    expect(limit("myWater")).toBe(MAX_WATER_CAPACITY);
  });
});

describe("conditions about walls and the round", () => {
  test("wall conditions count the wall as the first cell outside the grid", () => {
    expect(check("wallAhead", [bot("me", 8, 3, "E")], { n: 1 })).toBe(true);
    expect(check("wallAhead", [bot("me", 7, 3, "E")], { n: 1 })).toBe(false);
    expect(check("wallAhead", [bot("me", 7, 3, "E")], { n: 2 })).toBe(true);
  });

  test("a wall ahead along a diagonal is reached when either coordinate leaves the grid", () => {
    // 9 x 7 arena. From (6, 3) facing NE: 3 rows up and 2 columns right, so the wall is 3 cells away.
    expect(check("wallAhead", [bot("me", 6, 3, "NE")], { n: 3 })).toBe(true);
    expect(check("wallAhead", [bot("me", 6, 3, "NE")], { n: 2 })).toBe(false);
  });

  test("walls touch me on at least or fewer than k sides", () => {
    const at = (x: number, y: number) => [bot("me", x, y, "E")];
    expect(check("wallSides", at(0, 0), { compare: "atLeast", k: 2 })).toBe(true);
    expect(check("wallSides", at(0, 3), { compare: "atLeast", k: 2 })).toBe(false);
    expect(check("wallSides", at(0, 3), { compare: "atLeast", k: 1 })).toBe(true);
    expect(check("wallSides", at(4, 3), { compare: "fewerThan", k: 1 })).toBe(true);
    expect(check("wallSides", at(0, 3), { compare: "fewerThan", k: 2 })).toBe(true);
    expect(check("wallSides", at(8, 6), { compare: "fewerThan", k: 2 })).toBe(false);
  });

  test("distance to the nearest border is 0 on the border", () => {
    // In the 9 x 7 arena the middle cell (4,3) is 3 cells from the north and south borders.
    const middle = [bot("me", 4, 3, "E")];
    expect(check("borderDistance", middle, { compare: "atMost", n: 3 })).toBe(true);
    expect(check("borderDistance", middle, { compare: "atMost", n: 2 })).toBe(false);
    expect(check("borderDistance", middle, { compare: "moreThan", n: 2 })).toBe(true);
    expect(check("borderDistance", [bot("me", 0, 3, "E")], { compare: "atMost", n: 0 })).toBe(true);
    expect(check("borderDistance", [bot("me", 1, 3, "E")], { compare: "atMost", n: 0 })).toBe(false);
  });

  test("time left, as a percent of the round", () => {
    const me = [bot("me", 2, 3, "E")];
    // Tick 75 of 100: 25 percent of the round is left.
    expect(check("timeLeft", me, { compare: "fewerThan", n: 26 }, { tick: 75 })).toBe(true);
    expect(check("timeLeft", me, { compare: "fewerThan", n: 25 }, { tick: 75 })).toBe(false);
    expect(check("timeLeft", me, { compare: "moreThan", n: 24 }, { tick: 75 })).toBe(true);
    expect(check("timeLeft", me, { compare: "moreThan", n: 25 }, { tick: 75 })).toBe(false);
  });

  test("the rule set condition holds only under the chosen set", () => {
    const me = [bot("me", 2, 3, "E"), bot("o", 5, 5, "N")];
    for (const id of RULE_SET_IDS) {
      for (const other of RULE_SET_IDS) {
        expect(check("ruleSet", me, { set: other }, { ruleSetId: id }), `${other} while playing ${id}`).toBe(id === other);
      }
    }
  });

  test("the rule set condition offers every row of RULE_SETS: the value is the id and the label is the name", () => {
    const def = CONDITIONS.ruleSet;
    if (def === undefined) throw new Error("ruleSet condition missing");
    expect(def.label).toBe("This round's rules are {set}");
    expect(def.group).toBe("The round");
    expect(CONDITIONS.roundType?.group).toBe("The round");
    const spec = def.params[0];
    if (spec?.kind !== "choice") throw new Error("the set parameter is a choice");
    expect(spec.options).toEqual(Object.values(RULE_SETS).map((rules) => ({ value: rules.id, label: rules.name })));
    expect(spec.default).toBe("standard");
    expect(def.params).toHaveLength(1);
  });

  test("the rule set condition rejects an id that is not a set, and accepts each real one, through parseStrategy", () => {
    const strategyWith = (set: string) => ({
      modes: [{ id: "m", name: "M", rules: [{ id: "r", match: "all", conditions: [{ condition: "ruleSet", params: { set }, negate: false }], action: { action: "throw", params: {} }, chance: 100, switchToMode: null }], fallback: { action: "throw", params: {} } }],
      build: { reach: 0, aim: 0, dodge: 0 },
    });
    for (const id of RULE_SET_IDS) expect(parseStrategy(strategyWith(id)).ok, id).toBe(true);
    expect(parseStrategy(strategyWith("nope")).ok).toBe(false);
  });

  test("the round is a cut round or the grand final", () => {
    const me = [bot("me", 2, 3, "E"), bot("o", 5, 5, "N")];
    expect(check("roundType", me, { round: "cut" }, { survivorsAfterRound: 8 })).toBe(true);
    expect(check("roundType", me, { round: "final" }, { survivorsAfterRound: 8 })).toBe(false);
    expect(check("roundType", me, { round: "final" }, { survivorsAfterRound: null })).toBe(true);
    expect(check("roundType", me, { round: "cut" }, { survivorsAfterRound: null })).toBe(false);
  });

  test("a share of the other bots has an attribute at a level or more", () => {
    const dodge = (level: number) => ({ reach: 0, aim: 0, dodge: level });
    const bots = [
      bot("me", 2, 3, "E", { build: dodge(3) }),
      bot("a", 0, 0, "E", { build: dodge(2) }),
      bot("b", 0, 1, "E", { build: dodge(2) }),
      bot("c", 0, 2, "E", { build: dodge(0) }),
    ];
    // Two of the three others: 66.7 percent. My own build does not count.
    expect(check("fieldTrait", bots, { percent: 66, attribute: "dodge", level: 2 })).toBe(true);
    expect(check("fieldTrait", bots, { percent: 67, attribute: "dodge", level: 2 })).toBe(false);
    expect(check("fieldTrait", bots, { percent: 100, attribute: "dodge", level: 3 })).toBe(false);
    expect(check("fieldTrait", [bot("me", 2, 3, "E")], { percent: 1, attribute: "dodge", level: 0 })).toBe(false);
  });
});

function pick(id: string, bots: readonly BotState[], extra: Partial<typeof crowd> = {}): string | null {
  const def = TARGET_SELECTORS[id];
  if (def === undefined) throw new Error(`no selector ${id}`);
  return def.pick(contextFor(snapshotOf(bots, extra), "me"))?.id ?? null;
}

describe("target selectors", () => {
  const me = bot("me", 4, 3, "E", { score: 5, lastHitBy: "far" });

  test("nearest and farthest settle a tie by lower id", () => {
    const bots = [me, bot("zed", 4, 5, "N"), bot("amy", 6, 3, "N"), bot("far", 0, 0, "N"), bot("also-far", 8, 6, "N")];
    expect(pick("nearest", bots)).toBe("amy");
    // far is 7 away and also-far is 7 away: the lower id wins.
    expect(pick("farthest", bots)).toBe("also-far");
  });

  test("the most points settles a tie by distance, then id, and is second place when I lead", () => {
    const bots = [me, bot("b", 6, 3, "N", { score: 9 }), bot("a", 4, 0, "N", { score: 9 }), bot("c", 4, 4, "N", { score: 2 })];
    // b is 2 away and a is 3 away.
    expect(pick("highestScore", bots)).toBe("b");
    const leading = [bot("me", 4, 3, "E", { score: 9 }), bot("second", 6, 3, "N", { score: 7 }), bot("third", 4, 4, "N", { score: 2 })];
    expect(pick("highestScore", leading)).toBe("second");
  });

  test("the first bot in my throw line, within my range", () => {
    const bots = [me, bot("far", 7, 3, "N"), bot("near", 5, 3, "N"), bot("side", 4, 4, "N")];
    expect(pick("inThrowLine", bots)).toBe("near");
    expect(pick("inThrowLine", [me, bot("out", 8, 3, "N")])).toBeNull();
    expect(pick("inThrowLine", [bot("me", 4, 3, "E", { build: { reach: 1, aim: 0, dodge: 0 } }), bot("out", 8, 3, "N")])).toBe("out");
  });

  test("the nearest bot aimed at me, and nobody when no throw would hit me", () => {
    const bots = [me, bot("far", 7, 3, "W"), bot("near", 4, 1, "S"), bot("away", 4, 5, "S")];
    expect(pick("aimedAtMe", bots)).toBe("near");
    expect(pick("aimedAtMe", [me, bot("away", 4, 5, "S")])).toBeNull();
  });

  test("the bot that last hit me, or null", () => {
    expect(pick("lastHitMe", [me, bot("far", 0, 0, "N")])).toBe("far");
    expect(pick("lastHitMe", [bot("me", 4, 3, "E"), bot("far", 0, 0, "N")])).toBeNull();
    expect(pick("lastHitMe", [me, bot("other", 0, 0, "N")])).toBeNull();
  });

  test("the nearest bot with less water than me ignores equal and fuller tanks", () => {
    const mine = bot("me", 4, 3, "E", { water: 6 });
    const bots = [
      mine,
      bot("full-near", 5, 3, "N", { water: 9 }),
      bot("equal", 4, 4, "N", { water: 6 }),
      bot("low-far", 8, 5, "N", { water: 1 }),
      bot("low-near", 4, 0, "N", { water: 3 }),
    ];
    expect(pick("nearestWithLessWater", bots)).toBe("low-near");
    expect(pick("nearestWithLessWater", [mine, bot("full", 5, 3, "N", { water: 9 })])).toBeNull();
    expect(pick("nearestWithLessWater", [mine, bot("equal", 5, 3, "N", { water: 6 })])).toBeNull();
  });

  test("the nearest bot with more or fewer points than me", () => {
    const bots = [me, bot("rich-far", 0, 3, "N", { score: 9 }), bot("rich-near", 4, 0, "N", { score: 7 }), bot("poor-far", 8, 6, "N", { score: 1 }), bot("poor-near", 4, 5, "N", { score: 4 }), bot("equal", 5, 3, "N", { score: 5 })];
    expect(pick("nearestWithMorePoints", bots)).toBe("rich-near");
    expect(pick("nearestWithFewerPoints", bots)).toBe("poor-near");
    expect(pick("nearestWithMorePoints", [me, bot("low", 6, 3, "W", { score: 5 })])).toBeNull();
    expect(pick("nearestWithFewerPoints", [me, bot("high", 6, 3, "W", { score: 5 })])).toBeNull();
  });

  test("the bot across the cut line whose score is closest to mine", () => {
    // Others: 9, 5, 5, 1. With 2 survivors the bot across the line has 5, and the nearer of the two is the rival.
    const bots = [
      bot("me", 4, 3, "E", { score: 7 }),
      bot("top", 0, 0, "N", { score: 9 }),
      bot("mid-far", 8, 6, "N", { score: 5 }),
      bot("mid-near", 4, 5, "N", { score: 5 }),
      bot("low", 4, 4, "N", { score: 1 }),
    ];
    expect(pick("cutRival", bots, { survivorsAfterRound: 2 })).toBe("mid-near");
    // Outside the cut, the rival is the worst bot inside: others 9, 7, 5 with 2 survivors puts it at 7.
    const outside = [bot("me", 4, 3, "E", { score: 0 }), bot("a", 0, 0, "N", { score: 9 }), bot("b", 8, 6, "N", { score: 7 }), bot("c", 4, 4, "N", { score: 5 })];
    expect(pick("cutRival", outside, { survivorsAfterRound: 2 })).toBe("b");
  });

  test("in a final the cut rival is the leader, or second place when I lead", () => {
    const final = { survivorsAfterRound: null };
    const behind = [bot("me", 4, 3, "E", { score: 3 }), bot("lead", 0, 0, "N", { score: 9 }), bot("second", 4, 4, "N", { score: 6 })];
    expect(pick("cutRival", behind, final)).toBe("lead");
    const leading = [bot("me", 4, 3, "E", { score: 12 }), bot("lead", 0, 0, "N", { score: 9 }), bot("second", 4, 4, "N", { score: 6 })];
    expect(pick("cutRival", leading, final)).toBe("lead");
  });

  test("the cut rival does not exist when the cut keeps everyone", () => {
    expect(pick("cutRival", [bot("me", 4, 3, "E"), bot("a", 6, 3, "N")], { survivorsAfterRound: 8 })).toBeNull();
  });

  test("the bot in my range that I am most likely to hit", () => {
    const aimer = { reach: 0, aim: 0, dodge: 0 };
    // 2 cells with dodge 3 is the lowest chance, 2 cells with dodge 0 is higher, and 3 cells away is lower than 2 cells.
    const bots = [bot("me", 4, 3, "E", { build: aimer }), bot("dodger", 6, 3, "N", { build: { reach: 0, aim: 0, dodge: 3 } }), bot("plain", 4, 5, "N"), bot("long", 7, 3, "N")];
    expect(pick("easiestHit", bots)).toBe("plain");
    // Out of range (4 cells with reach 0) is not a choice.
    expect(pick("easiestHit", [bot("me", 4, 3, "E", { build: aimer }), bot("out", 8, 3, "N")])).toBeNull();
  });

  test("the bot with the fewest other bots near it", () => {
    const bots = [
      me,
      bot("x", 0, 0, "N"),
      bot("y", 1, 0, "N"),
      bot("z", 0, 1, "N"),
      bot("lonely", 8, 6, "N"),
    ];
    expect(pick("mostIsolated", bots)).toBe("lonely");
    // A bot more than 10 cells away is not considered: 11 columns and 6 rows is 11 cells.
    expect(pick("mostIsolated", [bot("me", 0, 0, "E"), bot("far", 11, 6, "N")], { width: 20, height: 10 })).toBeNull();
    expect(pick("mostIsolated", [bot("me", 0, 0, "E"), bot("near", 10, 9, "N")], { width: 20, height: 10 })).toBe("near");
  });

  test("the bot with the highest reach, aim or dodge, nearer first on a tie", () => {
    const build = (reach: number, aim: number, dodge: number) => ({ reach, aim, dodge });
    const bots = [me, bot("a", 6, 3, "N", { build: build(2, 0, 0) }), bot("b", 4, 5, "N", { build: build(0, 3, 1) }), bot("c", 0, 3, "N", { build: build(0, 3, 3) })];
    expect(pick("topReach", bots)).toBe("a");
    // b and c both have aim 3: b is nearer.
    expect(pick("topAim", bots)).toBe("b");
    expect(pick("topDodge", bots)).toBe("c");
  });

  test("nearest enemy facing away", () => {
    const bots = [me, bot("facing", 6, 3, "W", { score: 1 }), bot("away", 8, 3, "E", { score: 7 })];
    expect(pick("nearestFacingAway", bots)).toBe("away");
  });

  test("a selector returns null when the bot is alone", () => {
    for (const id of Object.keys(TARGET_SELECTORS)) expect(pick(id, [me]), id).toBeNull();
  });

  test("selectors give the same answer on every call, because a tie never depends on a draw", () => {
    const tied = [me, bot("b", 6, 3, "N"), bot("a", 2, 3, "N"), bot("c", 4, 1, "N")];
    for (const id of Object.keys(TARGET_SELECTORS)) expect(pick(id, tied), id).toBe(pick(id, [...tied].reverse()));
  });
});
