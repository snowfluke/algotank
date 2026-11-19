// The bot draw of a league's day round (league-day.ts, "Bot rule"), through its public methods.
import { describe, expect, test } from "bun:test";
import { plainTankLook } from "@game/arena";
import { ARENA_LAYOUT_IDS, arenaConditionOf, parseStrategy, PRESETS, ruleSet, type ArenaConditionId } from "@game/engine";
import { LeagueDay, MONTHLY_CONDITIONS, RESHUFFLE_TURNS, type DayTank } from "./league-day.ts";

const tank = (n: number): DayTank => ({ id: `seat-${n}`, name: `Tank ${n}`, look: plainTankLook(n as 1), strategy: (PRESETS[0] as (typeof PRESETS)[number]).strategy });
const drawFor = (id: ArenaConditionId) => (MONTHLY_CONDITIONS.indexOf(id) + 0.5) / MONTHLY_CONDITIONS.length;
const botsOf = (day: LeagueDay) => day.view(1000).tanks.filter((t) => t.isBot);
const waiter = parseStrategy({ modes: [{ id: "main", name: "Wait", rules: [], fallback: { action: "wait", params: {} } }], build: { reach: 0, aim: 0, dodge: 0 } });

describe("the league's bots", () => {
  test("a high draw gives 3 bots, each with its own name and a colour no other tank has", () => {
    const day = new LeagueDay(1, () => 0.99);
    day.start([1, 2].map((n) => ({ tank: tank(n), points: 0, counts: true, stats: undefined })), 5000);
    const bots = botsOf(day);
    expect(bots).toHaveLength(3);
    expect(new Set(bots.map((b) => b.name)).size).toBe(3);
    expect(new Set(day.view(1000).tanks.map((t) => t.look.colour)).size).toBe(5);
    expect(day.phase()).toBe("withBot");
  });

  test("a draw of 0 leaves two tanks alone, and raises a lone tank's draw to one bot", () => {
    const pair = new LeagueDay(1, () => 0);
    pair.start([1, 2].map((n) => ({ tank: tank(n), points: 0, counts: true, stats: undefined })), 5000);
    expect(botsOf(pair)).toHaveLength(0);
    const lone = new LeagueDay(1, () => 0);
    lone.seat(tank(1), 0, true, 5000);
    expect(botsOf(lone)).toHaveLength(1);
  });

  for (const [seats, drawn, remaining] of [[1, 0, 1], [2, 0, 0], [2, 0.99, 1]] as const) {
    test(`with ${seats} seats, a bot's fresh start draw of ${drawn} leaves ${remaining} bots`, () => {
      let draw = 0.3; // One bot at the start.
      const day = new LeagueDay(1, () => draw);
      day.start(Array.from({ length: seats }, (_, i) => ({ tank: tank(i + 1), points: 0, counts: true, stats: undefined })), 5000);
      const original = botsOf(day)[0];
      if (original === undefined) throw new Error("expected a bot");
      draw = drawn;
      for (let i = 0; i < RESHUFFLE_TURNS; i++) {
        const turn = day.step();
        if (!turn?.botsChanged) continue;
        const bots = botsOf(day);
        expect(bots).toHaveLength(remaining);
        expect(bots.some((b) => b.id === original.id)).toBe(false);
        if (remaining > 0) {
          const old = turn.snapshot.bots.find((b) => b.id === original.id);
          const added = day.view(1000).board.bots.at(-1);
          expect([added?.x, added?.y]).not.toEqual([old?.x, old?.y]);
          expect(added?.score).toBe(0);
        }
        return;
      }
      throw new Error("the bot missed its turn");
    });
  }
});

describe("the fresh start rotation", () => {
  for (const count of [5, RESHUFFLE_TURNS + 5]) {
    test(`each of ${count} tanks takes one fresh start every ${RESHUFFLE_TURNS} turns`, () => {
      if (!waiter.ok) throw new Error(JSON.stringify(waiter.errors));
      const strategy = waiter.strategy;
      const turns = 3 * RESHUFFLE_TURNS;
      const day = new LeagueDay(1, () => 0);
      day.start(Array.from({ length: count }, (_, i) => ({
        tank: { ...tank(i + 1), strategy },
        points: i,
        counts: true,
        stats: undefined,
      })), turns);
      const visits = new Map<string, number[]>(day.view(turns).board.bots.map(({ id }) => [id, []]));
      const water = ruleSet(day.view(turns).board.ruleSetId).waterCapacity;
      for (let i = 0; i < turns; i++) {
        const turn = day.step();
        if (turn === null) throw new Error("the round stopped early");
        if (turn.tick !== i) throw new Error("the round's tick stopped counting");
        if (turn.freshStarts.length === 0) continue;
        expect(turn.freshStarts.length).toBeLessThanOrEqual(Math.ceil(count / RESHUFFLE_TURNS));
        const placed = day.view(turns - i).board.bots.slice(-turn.freshStarts.length);
        for (const [j, fresh] of turn.freshStarts.entries()) {
          const old = turn.snapshot.bots.find((b) => b.id === fresh.id);
          const bot = placed[j];
          expect(bot).toMatchObject({ ...fresh, water, score: old?.score });
          expect(bot?.tieRank).not.toBe(old?.tieRank);
          expect(day.statsOf(fresh.id).turns).toBe(i + 1);
          visits.get(fresh.id)?.push(i);
        }
      }
      expect(day.view(0).board.tick).toBe(turns);
      for (const visitsOfTank of visits.values()) {
        expect(visitsOfTank).toHaveLength(3);
        const first = visitsOfTank[0] as number;
        expect(visitsOfTank).toEqual([first, first + RESHUFFLE_TURNS, first + 2 * RESHUFFLE_TURNS]);
      }
    });
  }
});

describe("the arena condition", () => {
  const two = [tank(1), tank(2)].map((t) => ({ tank: t, points: 0, counts: true, stats: undefined }));
  const conditionWith = (draw: number) => {
    const day = new LeagueDay(1, () => draw);
    day.start(two, 1000);
    return day.view(1000).board;
  };

  test("each single condition and layout takes one equal slot in the monthly draw", () => {
    const drawn = MONTHLY_CONDITIONS.map((id) => arenaConditionOf(conditionWith(drawFor(id))));
    expect(drawn).toEqual(["standard", "sharp-eyes", "dry-spell", "arms-length", "open-field", ...ARENA_LAYOUT_IDS]);
    expect(arenaConditionOf(conditionWith(0.99))).toBe("hills");
  });

  test("a rebuild draws again", () => {
    let draw = 0.01;
    const day = new LeagueDay(1, () => draw);
    day.start(two, 1000);
    expect(arenaConditionOf(day.view(1000).board)).toBe("standard");
    draw = 0.99;
    day.rebuild(1000);
    expect(arenaConditionOf(day.view(1000).board)).toBe("hills");
  });

  test("draws once on each weather turn and leaves the round alone when the draw repeats", () => {
    let draw = 0;
    let draws = 0;
    const day = new LeagueDay(1, () => {
      draws++;
      return draw;
    });
    const total = 2 * RESHUFFLE_TURNS + 1;
    day.start(two, total);
    draws = 0;
    for (let i = 1; i < RESHUFFLE_TURNS; i++) expect(day.step()?.weatherChanged).toBe(false);
    expect(draws).toBe(0);
    expect(day.step()?.weatherChanged).toBe(false);
    expect(draws).toBe(1);
    expect(day.view(total).board).toMatchObject({ tick: RESHUFFLE_TURNS, ticksTotal: total, ruleSetId: "standard" });

    draw = drawFor("dry-spell");
    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    const turn = day.step();
    expect(turn?.weatherChanged).toBe(true);
    expect(draws).toBe(2);
    const board = day.view(total).board;
    expect(board).toMatchObject({ tick: turn?.snapshot.tick, ticksTotal: total, ruleSetId: "dry-spell" });
    const scores = (bots: typeof board.bots) => Object.fromEntries(bots.map(({ id, score }) => [id, score]));
    expect(scores(board.bots)).toEqual(scores(turn?.snapshot.bots ?? []));
    expect(day.statsOf("seat-1").turns).toBe(2 * RESHUFFLE_TURNS);
  });

  test("weather can enter a layout and a repeat keeps its map and rain clock", () => {
    let draw = 0;
    const day = new LeagueDay(1, () => draw);
    const total = 2 * RESHUFFLE_TURNS + 1;
    day.start(two, total);
    draw = drawFor("rainFront");
    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    expect(day.step()?.weatherChanged).toBe(true);
    expect(day.view(total).board.layout).toEqual({ id: "rainFront", areas: [], firstColumn: 0 });
    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    expect(day.step()?.weatherChanged).toBe(false);
    expect(day.view(total).board.layout).toEqual({ id: "rainFront", areas: [], firstColumn: 11 });
  });

});

describe("new rules for a seated tank", () => {
  test("restrategy keeps the tank's id, place, water, today's points, today's count and its statistics", () => {
    const day = new LeagueDay(1, () => 0.5);
    day.start([{ tank: tank(1), points: 40, counts: true, stats: undefined }, { tank: tank(2), points: 0, counts: false, stats: undefined }], 1000);
    const stats = day.statsOf("seat-1");
    const strategy = (PRESETS[1] as (typeof PRESETS)[number]).strategy;
    const place = day.view(1000).board.bots.find((b) => b.id === "seat-1");
    day.restrategy("seat-1", strategy);
    const placed = day.view(1000).board.bots.find((b) => b.id === "seat-1");
    // No escape or refill: the same square, facing and water.
    expect([placed?.x, placed?.y, placed?.direction, placed?.water]).toEqual([place?.x, place?.y, place?.direction, place?.water]);
    expect([day.pointsOf("seat-1"), day.countsToday("seat-1"), day.statsOf("seat-1")]).toEqual([40, true, stats]);
    expect(day.view(1000).tanks.filter((t) => t.id === "seat-1")).toHaveLength(1);
    // The round goes on with it, and a rebuild keeps the new rules' tank and its points.
    expect(() => day.step()).not.toThrow();
    day.rebuild(1000);
    expect(day.countsToday("seat-1")).toBe(true);
  });
});
