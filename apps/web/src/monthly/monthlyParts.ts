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
  return rows.map((row) => ({
    kind: "row",
    row: {
      tank: { playerId: row.seatId, name: row.name, look: row.look, isBot: false },
      place: row.gm ? null : row.rank,
      score: row.points,
      verdict: null,
      ...(row.seated ? {} : { tag: leftLabel }),
      ...(row.gm ? { badge: gm } : {}),
    },
  }));
}

/**
 * This month's ranking: the ranked tanks, then a line, then the tanks with fewer than
 * MONTHLY_RANKED_DAYS counted days, which have no place yet (77-monthly-league.md, section 3).
 */
export function monthItems(rows: readonly LeagueMonthRow[], notRankedLabel: string, gm: GmBadge): RankingItem[] {
  const items: RankingItem[] = [];
  rows.forEach((row, i) => {
    // The game master's row comes last and is never "not ranked yet": it takes no place at all.
    if (!row.gm && row.rank === null && (i === 0 || rows[i - 1]?.rank !== null)) items.push({ kind: "cut", label: notRankedLabel });
    items.push({ kind: "row", row: { tank: { playerId: row.seatId, name: row.name, look: row.look, isBot: false }, place: row.rank, score: row.score, verdict: null, ...(row.gm ? { badge: gm } : {}) } });
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
