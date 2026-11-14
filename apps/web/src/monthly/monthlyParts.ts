// Pure rules of the monthly page: the day's clock, which league switch it shows, the
// rankings as rows of a paged list, and which finished day it names as yesterday's.

import { type LeagueDayRecord, type LeagueMonthRow, type LeagueTodayRow } from "@game/arena";
import type { RankingItem } from "../standings/StandingsTable.tsx";

/** Time left in the day round as "05:12:44", rounded up to the second. */
export function formatDayClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

/** The calendar day before `day` (YYYY-MM-DD). */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
  return date.toISOString().slice(0, 10);
}

/** The newest finished day, and whether it was yesterday; null before the month's first finished day. */
export function lastFinishedDay(days: readonly LeagueDayRecord[], today: string): { readonly record: LeagueDayRecord; readonly yesterday: boolean } | null {
  const record = days[0];
  if (record === undefined || record.top.length === 0) return null;
  return { record, yesterday: record.day === dayBefore(today) };
}

/**
 * The league switch: none for one league, a row of buttons for 2 to 5, and a list for more,
 * because a row of 6 or more does not fit a phone (11-foundation-guide.md, section 1).
 */
export type LeagueSwitchKind = "none" | "row" | "list";
const LEAGUE_ROW_MAX = 5;

export function leagueSwitchKind(leagues: number): LeagueSwitchKind {
  if (leagues <= 1) return "none";
  return leagues <= LEAGUE_ROW_MAX ? "row" : "list";
}

/** The league to show: the asked one while it exists, else the viewer's own, else League 1. */
export function leagueToShow(asked: number, leagues: number, own: number | null): number {
  if (asked >= 1 && asked <= leagues) return asked;
  if (own !== null && own >= 1 && own <= leagues) return own;
  return 1;
}

export function todayItems(rows: readonly LeagueTodayRow[]): RankingItem[] {
  return rows.map((row) => ({ kind: "row", row: { tank: { playerId: row.seatId, name: row.name, look: row.look, isBot: false }, place: row.rank, score: row.points, verdict: null } }));
}

/**
 * This month's ranking: the ranked tanks, then a line, then the tanks with fewer than
 * MONTHLY_RANKED_DAYS counted days, which have no place yet (77-monthly-league.md, section 3).
 */
export function monthItems(rows: readonly LeagueMonthRow[], notRankedLabel: string): RankingItem[] {
  const items: RankingItem[] = [];
  rows.forEach((row, i) => {
    if (row.rank === null && (i === 0 || rows[i - 1]?.rank !== null)) items.push({ kind: "cut", label: notRankedLabel });
    items.push({ kind: "row", row: { tank: { playerId: row.seatId, name: row.name, look: row.look, isBot: false }, place: row.rank, score: row.score, verdict: null } });
  });
  return items;
}

