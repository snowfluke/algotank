// The bot draw of a league's day round (league-day.ts, "Bot rule"), through its public methods.
import { describe, expect, test } from "bun:test";
import { plainTankLook, ULTIMATES_FROM } from "@game/arena";
import { ARENA_LAYOUT_IDS, arenaConditionOf, arenaSize, parseStrategy, PRESETS, ruleSet, type ArenaConditionId, type Strategy, type UltimateId } from "@game/engine";
import { LeagueDay, MONTHLY_CONDITIONS, RESHUFFLE_TURNS, type DayTank } from "./league-day.ts";

const tank = (n: number): DayTank => ({ id: `seat-${n}`, name: `Tank ${n}`, look: plainTankLook(n as 1), strategy: (PRESETS[0] as (typeof PRESETS)[number]).strategy });
const drawFor = (id: ArenaConditionId) => (MONTHLY_CONDITIONS.indexOf(id) + 0.5) / MONTHLY_CONDITIONS.length;
const botsOf = (day: LeagueDay) => day.view(1000).tanks.filter((t) => t.isBot);
const waiter = parseStrategy({ ultimate: "fullTank", modes: [{ id: "main", name: "Wait", rules: [], fallback: { action: "wait", params: {} } }], build: { reach: 0, aim: 0, dodge: 0 } });

function firesWhenReady(ultimate: UltimateId): Strategy {
  if (!waiter.ok) throw new Error(JSON.stringify(waiter.errors));
  const { strategy } = waiter;
  return {
    ...strategy,
    ultimate,
    modes: strategy.modes.map((mode) => ({
      ...mode,
      rules: [{
        id: "fire",
        match: "all",
        conditions: [{ condition: "ultimateReady", params: {}, negate: false }],
        action: { action: "useUltimate", params: {} },
        chance: 100,
        switchToMode: null,
      }],
    })),
  };
}

describe("the league's bots", () => {
  test("a high draw gives 3 bots, each with its own name and a colour no other tank has", () => {
    const day = new LeagueDay(1, () => 0.99, () => 0);
    day.start([1, 2].map((n) => ({ tank: tank(n), points: 0, counts: true, stats: undefined })), 5000);
    const bots = botsOf(day);
    expect(bots).toHaveLength(3);
    expect(new Set(bots.map((b) => b.name)).size).toBe(3);
    expect(new Set(day.view(1000).tanks.map((t) => t.look.colour)).size).toBe(5);
    expect(day.phase()).toBe("withBot");
  });

  test("a draw of 0 leaves two tanks alone, and raises a lone tank's draw to one bot", () => {
    const pair = new LeagueDay(1, () => 0, () => 0);
    pair.start([1, 2].map((n) => ({ tank: tank(n), points: 0, counts: true, stats: undefined })), 5000);
    expect(botsOf(pair)).toHaveLength(0);
    const lone = new LeagueDay(1, () => 0, () => 0);
    lone.seat(tank(1), 0, true, 5000);
    expect(botsOf(lone)).toHaveLength(1);
  });

  test("a rebuild draws the bots again, and the seated tanks keep their points", () => {
    let draw = 0.99;
    const day = new LeagueDay(1, () => draw, () => 0);
    day.start([1, 2].map((n) => ({ tank: tank(n), points: 5 * n, counts: true, stats: undefined })), 5000);
    expect(botsOf(day)).toHaveLength(3);
    for (let i = 0; i < RESHUFFLE_TURNS; i++) day.step();
    // A new start seats the tanks in a random order, so the points are compared by tank.
    const pointsById = () => Object.fromEntries(day.standings().map((s) => [s.id, s.points]));
    const points = pointsById();
    draw = 0;
    day.rebuild(4000);
    expect(botsOf(day)).toHaveLength(0);
    expect(pointsById()).toEqual(points);
  });
  for (const [seats, drawn, remaining] of [[1, 0, 1], [2, 0, 0], [2, 0.99, 1]] as const) {
    test(`with ${seats} seats, a bot's fresh start draw of ${drawn} leaves ${remaining} bots`, () => {
      let draw = 0.3; // One bot at the start.
      const day = new LeagueDay(1, () => draw, () => 0);
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
      const day = new LeagueDay(1, () => 0, () => 0);
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
  const conditionWith = (draw: number, now = 0) => {
    const day = new LeagueDay(1, () => draw, () => now);
    day.start(two, 1000);
    return day.view(1000).board;
  };

  test("each single condition and layout takes one equal slot in the monthly draw", () => {
    const drawn = MONTHLY_CONDITIONS.map((id) => arenaConditionOf(conditionWith(drawFor(id))));
    expect(drawn).toEqual(["standard", "sharp-eyes", "dry-spell", "arms-length", "open-field", ...ARENA_LAYOUT_IDS]);
    expect(arenaConditionOf(conditionWith(0.99))).toBe("hills");
  });

  test("each layout can start a new round on either side of the ultimates release gate", () => {
    for (const layout of ARENA_LAYOUT_IDS) {
      const before = conditionWith(drawFor(layout), ULTIMATES_FROM - 1);
      const after = conditionWith(drawFor(layout), ULTIMATES_FROM);
      expect(arenaConditionOf(before)).toBe(layout);
      expect(arenaConditionOf(after)).toBe(layout);
      expect(before.bots[0]?.ultimate).toBeUndefined();
      expect(after.bots[0]?.ultimate).toMatchObject({ kind: "charging" });
    }
  });

  test("a rebuild draws again", () => {
    let draw = 0.01;
    const day = new LeagueDay(1, () => draw, () => 0);
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
    }, () => 0);
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
    const day = new LeagueDay(1, () => draw, () => 0);
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

describe("ultimates in a running league", () => {
  const total = 1000;
  const seats = [tank(1), tank(2)].map((t, i) => ({
    tank: { ...t, strategy: firesWhenReady("fullTank") },
    points: i + 10,
    counts: true,
    stats: undefined,
  }));

  test("a scheduled tunnel keeps the seat's charge and active effect", () => {
    const day = new LeagueDay(1, () => 0, () => ULTIMATES_FROM);
    day.start(seats, total);
    for (let i = 1; i < Math.ceil(RESHUFFLE_TURNS / seats.length); i++) day.step();

    const turn = day.step();
    expect(turn?.freshStarts).toHaveLength(1);
    const fresh = turn?.freshStarts[0];
    const before = turn?.snapshot.bots.find((bot) => bot.id === fresh?.id);
    const after = day.view(total).board.bots.find((bot) => bot.id === fresh?.id);
    expect(before?.ultimate).toMatchObject({ id: "fullTank", kind: "charging" });
    expect(before?.ultimateEffect).toEqual({ kind: "fullTank", freeShots: 3 });
    expect(after).toMatchObject({ ...fresh, ultimate: before?.ultimate, ultimateEffect: before?.ultimateEffect, score: before?.score });
    expect(day.statsOf(fresh!.id).turns).toBe(turn!.snapshot.tick);
  });

  test("weather keeps charge and active effects through the new state", () => {
    let draw = 0;
    const day = new LeagueDay(1, () => draw, () => ULTIMATES_FROM);
    day.start(seats, total);
    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    draw = drawFor("dry-spell");

    const turn = day.step();
    expect(turn?.weatherChanged).toBe(true);
    const after = day.view(total).board;
    expect(after).toMatchObject({ tick: RESHUFFLE_TURNS, ruleSetId: "dry-spell" });
    for (const before of turn!.snapshot.bots) {
      expect(before.ultimate).toMatchObject({ id: "fullTank", kind: "charging" });
      expect(before.ultimateEffect).toEqual({ kind: "fullTank", freeShots: 3 });
      expect(after.bots.find(({ id }) => id === before.id)).toMatchObject({
        ultimate: before.ultimate, ultimateEffect: before.ultimateEffect, score: before.score,
      });
    }
  });

  test("weather enters and leaves Rain front with ultimates on and preserves each tank's charge and effect", () => {
    let draw = drawFor("standard");
    const day = new LeagueDay(1, () => draw, () => ULTIMATES_FROM);
    day.start(seats, total);
    for (const [condition, previous] of [["rainFront", "standard"], ["standard", "rainFront"]] as const) {
      draw = drawFor(condition);
      for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
      const turn = day.step()!;
      expect(turn.weatherChanged).toBe(true);
      expect(arenaConditionOf(turn.snapshot)).toBe(previous);
      const board = day.view(total).board;
      expect(arenaConditionOf(board)).toBe(condition);
      for (const before of turn.snapshot.bots) {
        expect(before.ultimate).toMatchObject({ id: "fullTank", kind: "charging" });
        expect(before.ultimateEffect).toEqual({ kind: "fullTank", freeShots: 3 });
        expect(board.bots.find(({ id }) => id === before.id)).toMatchObject({
          ultimate: before.ultimate, ultimateEffect: before.ultimateEffect,
        });
      }
      expect(board.bots).toHaveLength(seats.length);
    }
  });

  for (const [condition, tunnel] of [
    [null, "a scheduled tunnel"], ["standard", "a tunnel caused by shrinking weather"], ["rainFront", "a tunnel caused by shrinking into Rain front"],
  ] as const) {
    const shrink = condition !== null;
    test(`Dash defers ${tunnel}`, () => {
      let draw = 0;
      let first = true;
      const day = new LeagueDay(1, () => {
        const result = first && shrink ? drawFor("open-field") : draw;
        first = false;
        return result;
      }, () => ULTIMATES_FROM);
      day.start(seats, total);
      const scheduled = shrink ? RESHUFFLE_TURNS : Math.ceil(RESHUFFLE_TURNS / seats.length);
      for (let i = 1; i < scheduled; i++) day.step();

      // Place the next tank in the rotation on a clear Dash path, independent of the round seed.
      const round = day["round"]!;
      const id = round.snapshot.bots[0]!.id;
      day.restrategy(id, firesWhenReady("dash"));
      const y = shrink ? arenaSize(16, ruleSet("standard")).height : 0;
      Object.assign(round, {
        snapshot: { ...round.snapshot, bots: round.snapshot.bots.map((bot) => bot.id === id
          ? { ...bot, x: 0, y, direction: "E", ultimate: { id: "dash", kind: "ready" } }
          : { ...bot, x: 0, y: 1 }) },
      });

      if (condition !== null) draw = drawFor(condition);
      const dash = day.step();
      expect(dash?.fires).toContainEqual(expect.objectContaining({ botId: id, kind: "dash" }));
      expect(dash?.freshStarts.some((fresh) => fresh.id === id)).toBe(false);
      expect(dash?.weatherChanged).toBe(false);

      draw = 0.5; // A deferred weather change applies the original draw.
      const tunnel = day.step();
      expect(tunnel?.fires?.some((fire) => fire.botId === id && fire.kind === "dash")).toBe(false);
      expect(tunnel?.freshStarts).toContainEqual(expect.objectContaining({ id }));
      expect(tunnel?.weatherChanged).toBe(shrink);
      const after = day.view(total).board;
      expect(arenaConditionOf(after)).toBe(condition ?? "standard");
      expect(after.bots.find((bot) => bot.id === id)?.ultimate).toEqual(tunnel?.snapshot.bots.find((bot) => bot.id === id)?.ultimate);
    });
  }
});

describe("new rules for a seated tank", () => {
  test("restrategy keeps the tank's id, place, water, today's points, today's count and its statistics", () => {
    const day = new LeagueDay(1, () => 0.5, () => 0);
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
