// The bot draw of a league's day round (league-day.ts, "Bot rule"), through its public methods.
import { describe, expect, test } from "bun:test";
import { plainTankLook, ULTIMATES_FROM } from "@game/arena";
import { ARENA_LAYOUT_IDS, arenaConditionOf, arenaSize, createRng, isArenaLayoutId, parseStrategy, PRESETS, ruleSet, waterCapacityOf, type ArenaConditionId, type Strategy, type UltimateId } from "@game/engine";
import { RESHUFFLE_TURNS } from "@game/arena";
import { LeagueDay, MONTHLY_CONDITIONS, relieved, type DayTank } from "./league-day.ts";
import { secureRandom } from "../secrets.ts";

const tank = (n: number): DayTank => ({ id: `seat-${n}`, name: `Tank ${n}`, look: plainTankLook(n as 1), strategy: (PRESETS[0] as (typeof PRESETS)[number]).strategy });
function weatherDraws() {
  let pending: number[] = [];
  let count = 0;
  return {
    set(id: ArenaConditionId, odds = isArenaLayoutId(id) ? 0 : 0.99) {
      const group: readonly ArenaConditionId[] = isArenaLayoutId(id) ? ARENA_LAYOUT_IDS : MONTHLY_CONDITIONS;
      pending = [odds, (group.indexOf(id) + 0.5) / group.length];
    },
    random() {
      count++;
      return pending.shift() ?? 0;
    },
    count: () => count,
  };
}
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
      const water = waterCapacityOf(day.view(turns).board);
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
  // Hybrid layouts join the draw only from the ultimates release (owner, 2026-11-19), so these tests draw after it.
  const conditionWith = (id: ArenaConditionId, now = ULTIMATES_FROM) => {
    const draw = weatherDraws();
    draw.set(id);
    const day = new LeagueDay(1, draw.random, () => now);
    day.start(two, 1000);
    return day.view(1000).board;
  };

  test("all six normal conditions and all four layouts share equal odds within their group", () => {
    expect(MONTHLY_CONDITIONS).toHaveLength(6);
    expect(ARENA_LAYOUT_IDS).toHaveLength(4);
    const day = new LeagueDay(1, createRng(8237).next, () => ULTIMATES_FROM, { rng: () => createRng(10) });
    const totals = new Map<ArenaConditionId, number>();
    day.start(two, 1000);
    for (let i = 0; i < 4000; i++) {
      day.rebuild(1000);
      const id = arenaConditionOf(day.view(1000).board);
      totals.set(id, (totals.get(id) ?? 0) + 1);
    }
    for (const group of [MONTHLY_CONDITIONS, ARENA_LAYOUT_IDS]) {
      const mean = group.reduce((sum, id) => sum + (totals.get(id) ?? 0), 0) / group.length;
      for (const id of group) expect(Math.abs((totals.get(id) ?? 0) / mean - 1), id).toBeLessThan(0.15);
    }
  });

  test("hybrid odds rise after each pair of normal draws and return to 20 percent after a hybrid", () => {
    const draw = weatherDraws();
    const day = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
    for (const [streak, chance] of [20, 20, 40, 40, 60, 60, 80, 80, 100].entries()) {
      const odds = Math.min(chance / 100, 0.999);
      draw.set(chance === 100 ? "fourQuarters" : "standard", odds);
      if (streak === 0) day.start(two, 1000);
      else day.rebuild(1000);
      expect(arenaConditionOf(day.view(1000).board)).toBe(chance === 100 ? "fourQuarters" : "standard");
      expect(day.normalWeatherStreak()).toBe(chance === 100 ? 0 : streak + 1);

      // A draw just below the threshold also checks that the real odds are not lower.
      const probe = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
      draw.set("fourQuarters", (chance - 0.1) / 100);
      probe.start(two, 1000, streak);
      expect(arenaConditionOf(probe.view(1000).board)).toBe("fourQuarters");
    }
    draw.set("standard", 0.20);
    day.rebuild(1000);
    expect(day.normalWeatherStreak()).toBe(1);
    draw.set("eyeOfStorm", 0.199);
    day.rebuild(1000);
    expect(arenaConditionOf(day.view(1000).board)).toBe("eyeOfStorm");
    expect(day.normalWeatherStreak()).toBe(0);
  });

  test("before the ultimates release the draw gives only single conditions; from it, layouts with ultimates", () => {
    const before = new LeagueDay(1, createRng(31).next, () => ULTIMATES_FROM - 1, { rng: () => createRng(10) });
    before.start(two, 1000);
    for (let i = 0; i < 400; i++) {
      before.rebuild(1000);
      expect(isArenaLayoutId(arenaConditionOf(before.view(1000).board))).toBe(false);
    }
    expect(before.normalWeatherStreak()).toBe(0);
    for (const layout of ARENA_LAYOUT_IDS) {
      const after = conditionWith(layout, ULTIMATES_FROM);
      expect(arenaConditionOf(after)).toBe(layout);
      expect(after.bots[0]?.ultimate).toMatchObject({ kind: "charging" });
    }
  });

  test("a rebuild draws again", () => {
    const draw = weatherDraws();
    draw.set("standard");
    const day = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
    day.start(two, 1000);
    expect(arenaConditionOf(day.view(1000).board)).toBe("standard");
    draw.set("hills");
    day.rebuild(1000);
    expect(arenaConditionOf(day.view(1000).board)).toBe("hills");
  });

  test("draws once on each weather turn and leaves the round alone when the draw repeats", () => {
    const draw = weatherDraws();
    draw.set("standard");
    const day = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
    const total = 2 * RESHUFFLE_TURNS + 1;
    day.start(two, total);
    const drawsBefore = draw.count();
    for (let i = 1; i < RESHUFFLE_TURNS; i++) expect(day.step()?.weatherChanged).toBe(false);
    expect(draw.count()).toBe(drawsBefore);
    draw.set("standard");
    expect(day.step()?.weatherChanged).toBe(false);
    expect(draw.count()).toBe(drawsBefore + 2);
    expect(day.normalWeatherStreak()).toBe(2);
    expect(day.view(total).board).toMatchObject({ tick: RESHUFFLE_TURNS, ticksTotal: total, ruleSetId: "standard" });

    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    draw.set("dry-spell");
    const turn = day.step();
    expect(turn?.weatherChanged).toBe(true);
    expect(draw.count()).toBe(drawsBefore + 4);
    const board = day.view(total).board;
    expect(board).toMatchObject({ tick: turn?.snapshot.tick, ticksTotal: total, ruleSetId: "dry-spell" });
    const scores = (bots: typeof board.bots) => Object.fromEntries(bots.map(({ id, score }) => [id, score]));
    expect(scores(board.bots)).toEqual(scores(turn?.snapshot.bots ?? []));
    expect(day.statsOf("seat-1").turns).toBe(2 * RESHUFFLE_TURNS);
  });

  test("weather can enter a layout and a repeat keeps its map and rain clock", () => {
    const draw = weatherDraws();
    draw.set("standard");
    const day = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
    const total = 2 * RESHUFFLE_TURNS + 1;
    day.start(two, total);
    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    draw.set("rainFront");
    expect(day.step()?.weatherChanged).toBe(true);
    expect(day.view(total).board.layout).toEqual({ id: "rainFront", areas: [], firstColumn: 0 });
    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    draw.set("rainFront");
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
    const draw = weatherDraws();
    draw.set("standard");
    const day = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
    day.start(seats, total);
    for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
    draw.set("dry-spell");

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
    const draw = weatherDraws();
    draw.set("standard");
    const day = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
    day.start(seats, total);
    for (const [condition, previous] of [["rainFront", "standard"], ["standard", "rainFront"]] as const) {
      for (let i = 1; i < RESHUFFLE_TURNS; i++) day.step();
      draw.set(condition);
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
      const draw = weatherDraws();
      draw.set(shrink ? "open-field" : "standard");
      const day = new LeagueDay(1, draw.random, () => ULTIMATES_FROM);
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

      if (condition !== null) draw.set(condition);
      const dash = day.step();
      expect(dash?.fires).toContainEqual(expect.objectContaining({ botId: id, kind: "dash" }));
      expect(dash?.freshStarts.some((fresh) => fresh.id === id)).toBe(false);
      expect(dash?.weatherChanged).toBe(false);

      const drawsBefore = draw.count();
      const tunnel = day.step();
      expect(draw.count()).toBe(drawsBefore); // A deferred weather change applies the original draw.
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

  test("each change of rules today takes a 24th of the handicap off, to another built-in style too, and a rebuild keeps the count", () => {
    const handicap = { miss: 6, exposure: 12 };
    const day = new LeagueDay(1, () => 0.5, () => 0, { rng: () => createRng(1), handicap: () => handicap });
    day.start([{ tank: tank(1), points: 0, counts: true, stats: undefined }, { tank: tank(2), points: 0, counts: true, stats: undefined }], 1000);
    day.restrategy("seat-1", (PRESETS[1] as (typeof PRESETS)[number]).strategy);
    day.restrategy("seat-1", (PRESETS[2] as (typeof PRESETS)[number]).strategy);
    expect(day.ruleChangesOf("seat-1")).toBe(2);
    expect(day.ruleChangesOf("seat-2")).toBe(0);
    day.rebuild(1000);
    expect(day.ruleChangesOf("seat-1")).toBe(2);
    expect(relieved(handicap, 2)).toEqual({ miss: 6 * (22 / 24), exposure: 12 * (22 / 24) });
    expect(relieved(handicap, 0)).toEqual(handicap);
    expect(relieved(handicap, 24)).toBeUndefined();
    expect(relieved(handicap, 30)).toBeUndefined();
  });

  test("a built-in style plays with its handicap only while it holds a place of HANDICAP_PLACES, game masters left out", () => {
    const handicap = { miss: 6, exposure: 12 };
    const seats = [{ tank: tank(1), points: 50, counts: true, stats: undefined }, { tank: tank(2), points: 10, counts: true, stats: undefined }, { tank: tank(3), points: 0, counts: true, stats: undefined }];
    const day = new LeagueDay(1, () => 0.5, () => 0, { rng: () => createRng(1), handicap: () => handicap, handicapPlaces: 1 });
    day.start(seats, 1000);
    expect(day.handicapNow("seat-1")).toBeUndefined();
    day.step();
    expect([day.handicapNow("seat-1"), day.handicapNow("seat-2"), day.handicapNow("seat-3")]).toEqual([handicap, undefined, undefined]);
    // A rebuild starts a new round without handicaps, and its first turn sets them again.
    day.rebuild(1000);
    expect(day.handicapNow("seat-1")).toBeUndefined();
    day.step();
    expect(day.handicapNow("seat-1")).toEqual(handicap);
    // A game master takes no place, so the next tank holds the first one.
    const withGm = new LeagueDay(1, () => 0.5, () => 0, { rng: () => createRng(1), handicap: () => handicap, handicapPlaces: 1, unranked: () => new Set(["seat-1"]) });
    withGm.start(seats, 1000);
    withGm.step();
    expect([withGm.handicapNow("seat-1"), withGm.handicapNow("seat-2"), withGm.handicapNow("seat-3")]).toEqual([undefined, handicap, undefined]);
  });

  test("new rules start without the handicap, and the next turn gives it back with the change's relief", () => {
    const handicap = { miss: 6, exposure: 12 };
    const day = new LeagueDay(1, () => 0.5, () => 0, { rng: () => createRng(1), handicap: () => handicap, handicapPlaces: 1 });
    day.start([{ tank: tank(1), points: 50, counts: true, stats: undefined }, { tank: tank(2), points: 0, counts: true, stats: undefined }], 1000);
    day.step();
    day.restrategy("seat-1", (PRESETS[1] as (typeof PRESETS)[number]).strategy);
    expect(day.handicapNow("seat-1")).toBeUndefined();
    day.step();
    expect(day.handicapNow("seat-1")).toEqual(relieved(handicap, 1));
  });

  test("a restart seats the tank with the changes the checkpoint saved", () => {
    const day = new LeagueDay(1, () => 0.5, () => 0);
    day.start([{ tank: tank(1), points: 0, counts: true, stats: undefined, ruleChanges: 5 }, { tank: tank(2), points: 0, counts: true, stats: undefined }], 1000);
    expect(day.ruleChangesOf("seat-1")).toBe(5);
  });
});

describe("the day's draws (secrets.ts, secureRng)", () => {
  test("two days with the same tanks and the same league draws still play differently, because the round draws from the system", () => {
    const play = () => {
      const day = new LeagueDay(1, () => 0, () => 0);
      day.start([1, 2, 3, 4].map((n) => ({ tank: tank(n), points: 0, counts: true, stats: undefined })), 5000);
      for (let turn = 0; turn < 300; turn++) day.step();
      return JSON.stringify(day.view(5000).board.bots.map((bot) => [bot.id, bot.x, bot.y, bot.score]));
    };
    expect(play()).not.toBe(play());
  });

  test("a secure number is in [0, 1) and spread over it", () => {
    const draws = Array.from({ length: 20_000 }, secureRandom);
    expect(draws.every((n) => n >= 0 && n < 1)).toBe(true);
    const mean = draws.reduce((sum, n) => sum + n, 0) / draws.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02);
    expect(draws.filter((n) => n < 0.1).length / draws.length).toBeGreaterThan(0.08);
  });
});
