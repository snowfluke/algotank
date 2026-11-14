// Made-up leagues for the view's tests and the kit harness (/kit?show=monthly&case=…), so every
// state of the page shows without a server. The names include one as long as the name rule allows.

import { playedStats } from "../stats/statsFixtures.ts";
import { MONTHLY_SEATS, plainTankLook, type LeagueDayRecord, type LeagueLive, type LeagueMonthRow, type LeagueRankingResponse, type LeagueTodayRow, type MonthMove, type PublicSnapshot, type TankLook } from "@game/arena";
import { arenaSize, DEFAULT_PRESET_ID, PRESETS, ruleSet, STANDARD_RULE_SET_ID } from "@game/engine";
import type { LeagueLiveLoad } from "./leagueLive.ts";
import type { MonthlySeat } from "./MonthlyView.tsx";

const NAMES = ["Bima", "Bartholomew Kusu", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hana", "Irfan", "Joko", "Kirana", "Laras", "Maya", "Nadia", "Oki", "Putri"];
const SKINS = ["dots", "stripes", "stars", "waves"] as const;
const ICONS = ["star", "fish", null, "rocket"] as const;

function fixtureLook(i: number): TankLook {
  return { ...plainTankLook((((i % 12) + 1) as 1)), skin: SKINS[i % 4] ?? "dots", second: (((i + 5) % 12) + 1) as 1, plate: i % 3 === 0 ? null : ((((i + 2) % 12) + 1) as 1), icon: ICONS[i % 4] ?? null };
}

const FIXTURE_DAY = "2026-11-14";
export const OWN_SEAT = "seat-3";

/** A league of `count` tanks spread over the board; `bot` adds the bot of a league with one tank. */
export function fixtureLive(league: number, count: number): LeagueLive {
  const { width, height } = arenaSize(MONTHLY_SEATS, ruleSet(STANDARD_RULE_SET_ID));
  const bot = count === 1;
  const tanks = [
    ...Array.from({ length: count }, (_, i) => ({ id: `seat-${i + 1}`, name: NAMES[i % NAMES.length] ?? "Tank", look: fixtureLook(i), isBot: false })),
    ...(bot ? [{ id: "bot", name: "Splashy", look: plainTankLook(8), isBot: true }] : []),
  ];
  const directions = ["N", "E", "S", "W"] as const;
  const board: PublicSnapshot = {
    width,
    height,
    tick: 1200,
    ticksTotal: 96_000,
    survivorsAfterRound: null,
    ruleSetId: STANDARD_RULE_SET_ID,
    bots: tanks.map((tank, i) => ({
      id: tank.id,
      x: (i * 5 + 2) % width,
      y: (i * 3 + 1) % height,
      direction: directions[i % 4] ?? "N",
      score: 20 - i,
      wasHit: false,
      build: {},
      hitsLanded: 0,
      hitsTaken: 0,
      water: 6,
    })),
  };
  return { league, month: "2026-11", day: FIXTURE_DAY, dayEndsInMs: (5 * 3600 + 12 * 60 + 44) * 1000, tickMs: 900, phase: count === 0 ? "idle" : bot ? "withBot" : "withoutBot", tanks, board };
}

export function fixtureLoad(live: LeagueLive, now: number): LeagueLiveLoad {
  return { kind: "ready", board: { live, snapshot: live.board, throws: [], dayEndsAt: now + live.dayEndsInMs, own: [] } };
}

export function fixtureRanking(live: LeagueLive): LeagueRankingResponse {
  const seated = live.tanks.filter((tank) => !tank.isBot);
  const today: LeagueTodayRow[] = seated.map((tank, i) => ({ rank: i + 1, seatId: tank.id, name: tank.name, look: tank.look, points: 20 - i, counts: true, seated: true }));
  const thisMonth: LeagueMonthRow[] = seated.map((tank, i) => ({ rank: i < seated.length - 3 ? i + 1 : null, seatId: tank.id, name: tank.name, look: tank.look, score: Math.round((18.4 - i) * 10) / 10, countedDays: i < seated.length - 3 ? 9 : 4 }));
  return { league: live.league, month: live.month, day: live.day, today, thisMonth };
}

export function fixtureDays(league: number): LeagueDayRecord[] {
  return [{ day: "2026-11-13", league, top: [{ name: "Citra", look: fixtureLook(2), points: 31 }] }];
}

export function fixtureSeat(league: number): MonthlySeat {
  const preset = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
  if (preset === undefined) throw new Error("The engine has no play style.");
  return { seatId: OWN_SEAT, league, name: "Citra", look: fixtureLook(2), points: 18, countsToday: true, countedDays: 5, score: 16.2, rank: null, strategy: preset.strategy, stats: playedStats(preset.strategy, 300) };
}

export const FIXTURE_MOVE: MonthMove = { month: "2026-10", from: 2, to: 1, kind: "up" };

export function fixtureLeagues(count: number, tanks: number): { league: number; tanks: number }[] {
  return Array.from({ length: count }, (_, i) => ({ league: i + 1, tanks: i === count - 1 ? Math.max(1, tanks % MONTHLY_SEATS) : MONTHLY_SEATS }));
}
