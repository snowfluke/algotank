import { describe, expect, test } from "bun:test";
import { STANDARD_RULE_SET_ID, ruleSet } from "../combat/rule-sets.ts";
import { PRESETS } from "../strategy/presets.ts";
import { act, bot, mode, rule, snapshotOf, strategyOf, when } from "../strategy/test-helpers.ts";
import { TARGET_SELECTORS } from "../strategy/vocabulary.ts";
import type { BoardItem, RoundState, Strategy } from "../types.ts";
import { arenaSize, cellKey, isInside } from "./grid.ts";
import { changeRoundRules, createOpenRound, createRound, freshStartRound, joinRound, leaveRound, replaceStrategy, roundHoldings, standings, stepRound } from "./round.ts";

const strategyAt = (i: number): Strategy => (PRESETS[i % PRESETS.length] as (typeof PRESETS)[number]).strategy;
const open = (seed = 7, ticksTotal = 500): RoundState => createOpenRound({ seed, ticksTotal, ruleSetId: STANDARD_RULE_SET_ID, boardFor: 16, items: false });

describe("an open round", () => {
  test("starts with no tank on a board sized for 16 that keeps its size", () => {
    const round = open();
    const size = arenaSize(16, ruleSet(STANDARD_RULE_SET_ID));
    expect(round.snapshot.bots).toEqual([]);
    expect({ width: round.snapshot.width, height: round.snapshot.height }).toEqual(size);
    joinRound(round, { id: "a", strategy: strategyAt(0) });
    joinRound(round, { id: "b", strategy: strategyAt(1) });
    stepRound(round);
    leaveRound(round, "a");
    expect({ width: round.snapshot.width, height: round.snapshot.height }).toEqual(size);
  });

  test("a tank that joins between turns spawns on a free square with full water and plays from the next turn", () => {
    const round = open();
    joinRound(round, { id: "a", strategy: strategyAt(0) });
    joinRound(round, { id: "b", strategy: strategyAt(1) });
    for (let i = 0; i < 10; i++) stepRound(round);
    const placed = joinRound(round, { id: "c", strategy: strategyAt(2) });
    const cells = new Set(round.snapshot.bots.map((b) => `${b.x},${b.y}`));
    expect(cells.size).toBe(3);
    expect(placed.water).toBe(ruleSet(STANDARD_RULE_SET_ID).waterCapacity);
    expect(placed.score).toBe(0);
    const result = stepRound(round);
    expect(result.decisions.map((d) => d.botId)).toEqual(["a", "b", "c"]);
    expect(result.tick).toBe(10);
  });

  test("a tank that resumes its day joins with its points", () => {
    const round = open();
    expect(joinRound(round, { id: "a", strategy: strategyAt(0) }, 12).score).toBe(12);
    expect(() => joinRound(round, { id: "b", strategy: strategyAt(0) }, 1.5)).toThrow();
  });

  test("a fresh start keeps points and hits, refills water, draws a tie rank, ends the sequence and goes last", () => {
    const always = when("myWater", { compare: "atLeast", n: 0 });
    const strategy = strategyOf([mode("main", [rule("go", [always], { steps: [act("wait"), act("wait"), act("wait")] })], act("wait"))]);
    const round = open();
    joinRound(round, { id: "a", strategy }, 12);
    joinRound(round, { id: "b", strategy: strategyOf([mode("main", [], act("wait"))]) });
    const played = stepRound(round).snapshot;
    const [a, b] = played.bots;
    if (a === undefined || b === undefined) throw new Error("expected two tanks");
    const old = { ...a, hitsLanded: 5, hitsTaken: 4, water: 1 };
    // Start from a partly spent tank in a running sequence, independent of the shots a seed gives.
    Object.assign(round, { snapshot: { ...played, bots: [old, b] } });
    expect(roundHoldings(round).sequences).toBe(1);

    const placed = freshStartRound(round, "a");
    expect([placed.x, placed.y]).not.toEqual([old.x, old.y]);
    expect([placed.x, placed.y]).not.toEqual([b.x, b.y]);
    expect(placed.water).toBe(ruleSet(STANDARD_RULE_SET_ID).waterCapacity);
    expect(placed.tieRank).not.toBe(old.tieRank);
    expect([placed.score, placed.hitsLanded, placed.hitsTaken]).toEqual([12, 5, 4]);
    expect(round.snapshot.bots).toEqual([b, placed]);
    expect(roundHoldings(round).sequences).toBe(0);
    const next = stepRound(round);
    expect(next.tick).toBe(1);
    expect(next.decisions.find((decision) => decision.botId === "a")?.step?.index).toBe(1);
  });

  test("a tank that leaves is gone from the next turn, its sequence and tie-break included", () => {
    // Holds on every turn: a tank never has less than 0 water.
    const always = when("myWater", { compare: "atLeast", n: 0 });
    const waiter = strategyOf([mode("main", [rule("go", [always], { steps: [act("wait"), act("wait"), act("wait")] })], act("wait"))]);
    const round = open();
    joinRound(round, { id: "a", strategy: waiter });
    joinRound(round, { id: "b", strategy: strategyAt(1) });
    stepRound(round);
    expect(roundHoldings(round).sequences).toBe(1);
    leaveRound(round, "a");
    expect(roundHoldings(round)).toEqual({ tanks: 1, strategies: 1, tieBreaks: 1, sequences: 0 });
    joinRound(round, { id: "c", strategy: strategyAt(2) });
    const result = stepRound(round);
    expect(result.decisions.map((d) => d.botId)).toEqual(["b", "c"]);
    expect(standings(round).map((s) => s.botId).sort()).toEqual(["b", "c"]);
  });

  test("refuses a second tank with the same id and a leave of a tank that is not there", () => {
    const round = open();
    joinRound(round, { id: "a", strategy: strategyAt(0) });
    expect(() => joinRound(round, { id: "a", strategy: strategyAt(0) })).toThrow(/already/);
    expect(() => leaveRound(round, "x")).toThrow(/not in the round/);
  });

  test("the same seed with the same joins and leaves plays the same turns", () => {
    const play = () => {
      const round = open(42);
      joinRound(round, { id: "a", strategy: strategyAt(0) });
      joinRound(round, { id: "b", strategy: strategyAt(3) });
      const log: string[] = [];
      for (let i = 0; i < 60; i++) {
        if (i === 20) joinRound(round, { id: "c", strategy: strategyAt(4) });
        if (i === 40) leaveRound(round, "b");
        log.push(JSON.stringify(stepRound(round)));
      }
      return log;
    };
    expect(play()).toEqual(play());
  });

  test("nothing it holds grows with the turns", () => {
    const round = open(3, 20_000);
    for (let i = 0; i < 16; i++) joinRound(round, { id: `t${i}`, strategy: strategyAt(i) });
    for (let i = 0; i < 500; i++) stepRound(round);
    const early = roundHoldings(round);
    for (let i = 0; i < 5_000; i++) {
      // A quit and a new tank now and then, as in a day of the league.
      if (i % 1000 === 0) {
        leaveRound(round, "t0");
        joinRound(round, { id: "t0", strategy: strategyAt(0) });
      }
      stepRound(round);
    }
    const late = roundHoldings(round);
    expect(late.tanks).toBe(early.tanks);
    expect(late.strategies).toBe(early.strategies);
    expect(late.tieBreaks).toBe(early.tieBreaks);
    expect(late.sequences).toBeLessThanOrEqual(16);
  });
});

describe("weather in an open round", () => {
  const sequence = strategyOf([mode("main", [rule("go", [when("myWater", { compare: "atLeast", n: 0 })], { steps: [act("wait"), act("wait"), act("wait")] })], act("wait"))]);

  test("changing to Dry spell cuts water in place and the next turn reads the new rules", () => {
    const round = open();
    const readsWeather = strategyOf([mode("main", [rule("dry", [when("ruleSet", { set: "dry-spell" })], act("wait"))], act("wait"))]);
    joinRound(round, { id: "a", strategy: sequence }, 12);
    joinRound(round, { id: "b", strategy: readsWeather }, -3);
    const first = stepRound(round);
    expect(first.decisions[1]?.ruleId).toBeNull();
    const [a, b] = first.snapshot.bots;
    if (a === undefined || b === undefined) throw new Error("expected two tanks");
    const low = { ...b, water: 4 };
    const before = { ...first.snapshot, bots: [a, low] };
    Object.assign(round, { snapshot: before });

    expect(changeRoundRules(round, "standard", 16)).toEqual([]);
    expect(round.snapshot).toBe(before);
    expect(changeRoundRules(round, "dry-spell", 16)).toEqual([]);
    expect(round.snapshot).toEqual({ ...before, ruleSetId: "dry-spell", bots: [{ ...a, water: 6 }, low] });
    const after = stepRound(round);
    expect(after.tick).toBe(1);
    expect(after.decisions[0]?.step?.index).toBe(2);
    expect(after.decisions[1]?.ruleId).toBe("dry");
  });

  test("Open field adds squares at the edges and shrinking tunnels only tanks on removed squares", () => {
    const play = () => {
      const round = open();
      for (const id of ["kept", "right", "bottom"]) joinRound(round, { id, strategy: sequence }, 12);
      const played = stepRound(round).snapshot;
      const item: BoardItem = { kind: "bucket", x: 0, y: 0, turnsLeft: 15 };
      const before = { ...played, items: [item] };
      Object.assign(round, { snapshot: before });
      const large = arenaSize(16, ruleSet("open-field"));
      expect(changeRoundRules(round, "open-field", 16)).toEqual([]);
      expect(round.snapshot).toEqual({ ...before, ...large, ruleSetId: "open-field" });
      expect(large.width).toBeGreaterThan(before.width);
      expect(large.height).toBeGreaterThan(before.height);

      const [a, b, c] = round.snapshot.bots;
      if (a === undefined || b === undefined || c === undefined) throw new Error("expected three tanks");
      const kept = { ...a, x: 1, y: 1, water: 4 };
      const right = { ...b, x: large.width - 1, y: 0, hitsLanded: 2, water: 1 };
      const bottom = { ...c, x: 0, y: large.height - 1, hitsTaken: 3, water: 2 };
      Object.assign(round, { snapshot: { ...round.snapshot, bots: [kept, right, bottom], items: [item, { ...item, x: right.x, y: 1 }] } });
      const moved = changeRoundRules(round, "dry-spell", 16);
      expect(moved.map(({ id }) => id)).toEqual([right.id, bottom.id]);
      expect(round.snapshot).toEqual({ ...before, ruleSetId: "dry-spell", bots: [kept, ...moved] });
      for (const [index, old] of [right, bottom].entries()) {
        const tank = moved[index];
        if (tank?.tieRank === undefined) throw new Error("expected a tank to move and draw a tie rank");
        expect(isInside(before, tank)).toBe(true);
        expect(tank.tieRank).not.toBe(old.tieRank);
        expect(tank).toEqual({ ...old, x: tank.x, y: tank.y, tieRank: tank.tieRank, water: 6 });
      }
      expect(new Set([...round.snapshot.bots, ...round.snapshot.items].map(cellKey)).size).toBe(4);
      expect(roundHoldings(round).sequences).toBe(1);
      expect(stepRound(round).decisions.map((decision) => decision.step?.index)).toEqual([2, 1, 1]);
      return moved;
    };
    expect(play()).toEqual(play());
  });
});

describe("target ties in an open round", () => {
  test("a tank that joins carries a tie rank, and the nearest of two tanks at one distance is the lower rank, not the lower id", () => {
    const round = open(11);
    const a = joinRound(round, { id: "a", strategy: strategyAt(0) });
    const z = joinRound(round, { id: "z", strategy: strategyAt(1) });
    expect([typeof a.tieRank, typeof z.tieRank]).toEqual(["number", "number"]);
    // The rank stays with the tank turn after turn.
    stepRound(round);
    expect(round.snapshot.bots.map((t) => t.tieRank)).toEqual([a.tieRank, z.tieRank]);
    const me = bot("me", 4, 4, "N");
    // "a" and "z" stand at the same distance; only their ranks decide, and the ids would pick "a".
    for (const [rankA, rankZ, nearest] of [[0.9, 0.1, "z"], [0.1, 0.9, "a"]] as const) {
      const snapshot = snapshotOf([me, bot("a", 4, 2, "S", { tieRank: rankA }), bot("z", 4, 6, "N", { tieRank: rankZ })]);
      expect(TARGET_SELECTORS["nearest"]?.pick({ self: me, snapshot })?.id).toBe(nearest);
    }
  });

  test("a round of fixed players carries no tie rank, so it settles ties by id as before", () => {
    const round = createRound({ seed: 3, ticksTotal: 5, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, players: [{ id: "a", strategy: strategyAt(0) }, { id: "b", strategy: strategyAt(1) }], items: false });
    expect(round.snapshot.bots.map((t) => t.tieRank)).toEqual([undefined, undefined]);
  });

  test("each new open round draws new ranks, so the order changes when the monthly league starts again", () => {
    const ranks = (seed: number) => {
      const round = open(seed);
      return ["a", "b", "c"].map((id) => joinRound(round, { id, strategy: strategyAt(0) }).tieRank);
    };
    expect(ranks(1)).not.toEqual(ranks(2));
  });
});

describe("new rules for a tank on the board", () => {
  test("replaceStrategy keeps its square, facing, points, water, item and effect, and starts the new first mode", () => {
    const round = open();
    joinRound(round, { id: "a", strategy: strategyAt(0) });
    joinRound(round, { id: "b", strategy: strategyAt(1) });
    for (let i = 0; i < 30; i++) stepRound(round);
    const before = round.snapshot.bots.find((b) => b.id === "a");
    const next = strategyAt(2);
    const after = replaceStrategy(round, "a", next);
    const kept = ({ x, y, direction, score, water, item, itemUses, effect, hitsLanded, hitsTaken, lastHitBy, tieRank }: NonNullable<typeof before>) => ({ x, y, direction, score, water, item, itemUses, effect, hitsLanded, hitsTaken, lastHitBy, tieRank });
    expect(kept(after)).toEqual(kept(before as NonNullable<typeof before>));
    expect(after.modeId).toBe(next.modes[0]?.id ?? "");
    expect(after.ticksInMode).toBe(0);
    expect(after.build).toEqual(next.build);
    expect(round.snapshot.bots.find((b) => b.id === "a")).toEqual(after);
    expect(roundHoldings(round)).toEqual({ tanks: 2, strategies: 2, tieBreaks: 2, sequences: roundHoldings(round).sequences });
    expect(() => stepRound(round)).not.toThrow();
    expect(() => replaceStrategy(round, "nobody", next)).toThrow();
  });
});
