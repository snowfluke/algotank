// Pure rules of the monthly page: the day's clock, which league switch it shows, the
// rankings as rows of a paged list, and which finished day it names as yesterday's.

import { RESHUFFLE_TURNS, type LeagueDayRecord, type LeagueMonthRow, type LeagueRankingResponse, type LeagueTodayRow } from "@game/arena";
import type { RankingItem } from "../standings/StandingsTable.tsx";

/** Time left in the day round as "05:12:44", rounded up to the second. */
export function formatDayClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

/**
 * Time until the league draws the next arena (a condition or a hybrid layout): it draws when the round's turn is a
 * multiple of RESHUFFLE_TURNS (league-day.ts), and the round starts again at turn 0 on a new day, a restart or a
 * rebuild. The draw may give the same arena again.
 */
export function nextArenaInMs(tick: number, tickMs: number): number {
  return (RESHUFFLE_TURNS - (tick % RESHUFFLE_TURNS)) * tickMs;
}

/** Minutes and seconds ("04:12"), for a wait of less than an hour. */
export function formatMinuteClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`;
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

/** Today's ranking. A tank that quit today keeps its row with `leftLabel` after its name. */
/** The game master's badge (server monthly/game-masters.ts): its row has no place. */
export interface GmBadge {
  readonly text: string;
  readonly title: string;
}

export function todayItems(rows: readonly LeagueTodayRow[], leftLabel: string, gm: GmBadge): RankingItem[] {
  // Each row shows how far it is behind the tank just above it in points; the game master counts in that order,
  // though it takes no place and its row comes first. The top tank by points shows none.
  const byPoints = [...rows].sort((a, b) => b.points - a.points);
  const above = new Map(byPoints.slice(1).map((row, i) => [row.seatId, byPoints[i]!.points]));
  return rows.map((row) => ({
    kind: "row",
    row: {
      tank: { playerId: row.seatId, name: row.name, look: row.look, isBot: false },
      place: row.gm ? null : row.rank,
      score: row.points,
      verdict: null,
      ...(row.seated ? {} : { tag: leftLabel }),
      ...(row.gm ? { badge: gm } : {}),
      ...(above.has(row.seatId) ? { behind: above.get(row.seatId)! - row.points } : {}),
      ...podiumOf(row.gm ? null : row.rank),
    },
  }));
}

/** The nameplate of places 1 to 3 (owner, 2026-11-28); tanks that share a place share its metal. */
function podiumOf(place: number | null): { readonly podium?: 1 | 2 | 3 } {
  return place === 1 || place === 2 || place === 3 ? { podium: place } : {};
}

/**
 * This month's ranking: every tank has a place (77-monthly-league.md, section 3), and the game master's row, which
 * takes none, comes last. Since 2026-11-20 there is no "not ranked yet" line.
 */
export function monthItems(rows: readonly LeagueMonthRow[], gm: GmBadge): RankingItem[] {
  // The interval to the tank above, without the game master (owner, 2026-11-28: "no need for GM" in the month).
  // Ratings have one decimal, so the difference is rounded to one, or 0.1 would show as 0.09999999999999432.
  const ranked = rows.filter((row) => !row.gm).sort((a, b) => b.score - a.score);
  const above = new Map(ranked.slice(1).map((row, i) => [row.seatId, ranked[i]!.score]));
  const items: RankingItem[] = [];
  rows.forEach((row) => {
    const behind = above.get(row.seatId);
    items.push({ kind: "row", row: { tank: { playerId: row.seatId, name: row.name, look: row.look, isBot: false }, place: row.rank, score: row.score, verdict: null, ...(row.gm ? { badge: gm } : {}), ...podiumOf(row.rank), ...(behind === undefined ? {} : { behind: Math.round((behind - row.score) * 10) / 10 }) } });
  });
  return items;
}


/**
 * The game master's rows first (owner, 2026-11-17: players could not find the GM's open rules,
 * because the GM's row sat at the end of the ranking by its points and last in the month's). The
 * other items keep their order, "not ranked yet" line included. The monthly page only; the
 * champions page keeps the server's order.
 */
export function gameMastersFirst(items: readonly RankingItem[], gameMasters: ReadonlySet<string>): RankingItem[] {
  const isGm = (item: RankingItem) => item.kind === "row" && gameMasters.has(item.row.tank.playerId);
  return [...items.filter(isGm), ...items.filter((item) => !isGm(item))];
}

/**
 * Today's ranking with each seated tank's points from the stream's latest turn, sorted again. The
 * page reads the ranking every few seconds (useMonthlyData.ts), but the board moves every turn, so
 * without this the ranking trailed the tanks by up to one poll. Only a ranking and a board of the
 * same league and day are merged; a tank that quit keeps the points the server gave it. Ties keep
 * the server's order, which already puts the earlier seat first.
 */
export function withLivePoints(
  ranking: LeagueRankingResponse | null,
  board: { readonly league: number; readonly day: string; readonly snapshot: { readonly bots: readonly { readonly id: string; readonly score: number }[] } } | null,
): LeagueRankingResponse | null {
  if (ranking === null || board === null || ranking.league !== board.league || ranking.day !== board.day) return ranking;
  const live = new Map(board.snapshot.bots.map((bot) => [bot.id, bot.score]));
  const today = ranking.today
    .map((row, index) => ({ row: row.livePoints ? { ...row, points: live.get(row.seatId) ?? row.points } : row, index }))
    .sort((a, b) => b.row.points - a.row.points || a.index - b.index);
  // The game master takes no place (rank 0, as the server sends it), so the places skip its row.
  let place = 0;
  return { ...ranking, today: today.map(({ row }) => ({ ...row, rank: row.gm ? 0 : ++place })) };
}
