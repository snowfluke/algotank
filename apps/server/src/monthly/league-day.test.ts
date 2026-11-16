// The bot draw of a league's day round (league-day.ts, "Bot rule"), through its public methods.
import { describe, expect, test } from "bun:test";
import { plainTankLook } from "@game/arena";
import { PRESETS } from "@game/engine";
import { LeagueDay, RESHUFFLE_TURNS, type DayTank } from "./league-day.ts";

const tank = (n: number): DayTank => ({ id: `seat-${n}`, name: `Tank ${n}`, look: plainTankLook(n as 1), strategy: (PRESETS[0] as (typeof PRESETS)[number]).strategy });
const botsOf = (day: LeagueDay) => day.view(1000).tanks.filter((t) => t.isBot);

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

  test("each new start draws again, and the seated tanks keep their points", () => {
    let draw = 0.99;
    const day = new LeagueDay(1, () => draw);
    day.start([1, 2].map((n) => ({ tank: tank(n), points: 5 * n, counts: true, stats: undefined })), 5000);
    expect(botsOf(day)).toHaveLength(3);
    for (let i = 0; i < RESHUFFLE_TURNS; i++) day.step();
    expect(day.reshuffleDue()).toBe(true);
    // A new start seats the tanks in a random order, so the points are compared by tank.
    const pointsById = () => Object.fromEntries(day.standings().map((s) => [s.id, s.points]));
    const points = pointsById();
    draw = 0;
    day.rebuild(4000);
    expect(botsOf(day)).toHaveLength(0);
    expect(pointsById()).toEqual(points);
  });
});
