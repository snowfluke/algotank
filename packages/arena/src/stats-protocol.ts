// A player's statistics on the wire (docs/specs/revamp/81-metrics.md, K2). The engine counts
// (packages/engine/src/stats/stats.ts); this file holds the messages and the one check of each
// shape that arrives as unknown data (a stream event, an answer, a file).
//
// Who sees what: a tank's statistics, its mode names and its per-rule counts go only to the
// player of that tank. They are never in PublicArena, a tick, the league's `state` or `tick`, or
// any answer another player can read.
//
// | Where                                   | What                                     | When                         |
// |-----------------------------------------|------------------------------------------|------------------------------|
// | stream message `stats` (types.ts)       | OwnStats: the last round, the game's sum | at a round's end, just before|
// |                                         |                                          | the arena message, and on    |
// |                                         |                                          | connect while the game lasts |
// | MonthlyMeResponse.seat.stats            | StatsView of today                       | every read of /api/monthly/me|
// | GET /api/account/stats (account)        | AccountStatsResponse                     | on request                   |

import { LIMITS, type StatsNumbers, type StatsView } from "@game/engine";

/** The statistics a player's own stream receives. */
export interface OwnStats {
  /** The arena's game number (PublicArena.game), so a page drops the statistics of an earlier game. */
  readonly game: number;
  /** The round these statistics end with. */
  readonly round: number;
  /** The last round the tank played, with its rules as they were in that round. */
  readonly last: StatsView;
  /** The numbers of every round the tank played in this game. */
  readonly gameTotal: StatsNumbers;
}

/** An account's totals over every game it played signed in. */
export interface AccountNumbers {
  /** Games the account's tank finished, won or not. */
  readonly games: number;
  readonly rounds: number;
  /** Games the account's tank won. */
  readonly wins: number;
  readonly shots: number;
  readonly hits: number;
}

export interface AccountMonth extends AccountNumbers {
  /** YYYY-MM in the league's time zone. */
  readonly month: string;
}

/** How many months an account keeps, so the store has a fixed size. */
export const ACCOUNT_STATS_MONTHS = 12;

export interface AccountStats {
  readonly total: AccountNumbers;
  /** Oldest first, at most ACCOUNT_STATS_MONTHS, only months the account played in. */
  readonly months: readonly AccountMonth[];
}

/** GET /api/account/stats. `stats` is null until the account played a round signed in. */
export interface AccountStatsResponse {
  readonly stats: AccountStats | null;
}

// ---------------------------------------------------------------------------
// Checks. Each returns null for a shape that does not fit, and never throws.
// ---------------------------------------------------------------------------

type Obj = Readonly<Record<string, unknown>>;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const NUMBER_KEYS = ["turns", "shots", "hits", "timesHit", "squaresMoved", "noRuleTurns"] as const;

export function parseStatsNumbers(raw: unknown): StatsNumbers | null {
  if (!isObj(raw)) return null;
  const [turns, shots, hits, timesHit, squaresMoved, noRuleTurns] = NUMBER_KEYS.map((key) => raw[key]);
  if (!count(turns) || !count(shots) || !count(hits) || !count(timesHit) || !count(squaresMoved) || !count(noRuleTurns)) return null;
  // Before ultimates, there were no fires to count (85-ultimates.md).
  const ultimateTurns = raw["ultimateTurns"] === undefined ? 0 : raw["ultimateTurns"];
  if (!count(ultimateTurns) || hits > shots || noRuleTurns + ultimateTurns > turns) return null;
  return { turns, shots, hits, timesHit, squaresMoved, noRuleTurns, ultimateTurns };
}

export function parseStatsView(raw: unknown): StatsView | null {
  const numbers = parseStatsNumbers(raw);
  if (numbers === null || !isObj(raw)) return null;
  const rawModes = raw["modes"];
  if (!Array.isArray(rawModes) || rawModes.length < LIMITS.minModes || rawModes.length > LIMITS.maxModes) return null;
  const modes = [];
  for (const mode of rawModes) {
    if (!isObj(mode)) return null;
    const { id, name, rules, fallback } = mode;
    if (typeof name !== "string" || name.length > LIMITS.maxNameLength) return null;
    if (id !== undefined && (typeof id !== "string" || id.length > LIMITS.maxIdLength)) return null;
    if (!Array.isArray(rules) || rules.length > LIMITS.maxRulesPerMode || !rules.every(count) || !count(fallback)) return null;
    // Absent from statistics saved before 2026-11-23: no id, so the page shows the mode's name as it was typed.
    modes.push({ id: id ?? "", name, rules: rules.filter(count), fallback });
  }
  // Absent from a server older than the pinwheel's spin (2026-11-17), which had no spin turns to count.
  const spinTurns = raw["spinTurns"] === undefined ? 0 : raw["spinTurns"];
  if (!count(spinTurns) || spinTurns + (numbers.ultimateTurns ?? 0) > numbers.turns) return null;
  return { ...numbers, modes, spinTurns };
}

export function parseOwnStats(raw: unknown): OwnStats | null {
  if (!isObj(raw)) return null;
  const { game, round } = raw;
  if (!count(game) || game < 1 || !count(round) || round < 1) return null;
  const last = parseStatsView(raw["last"]);
  const total = parseStatsNumbers(raw["gameTotal"]);
  return last === null || total === null ? null : { game, round, last, gameTotal: total };
}

function parseAccountNumbers(raw: unknown): AccountNumbers | null {
  if (!isObj(raw)) return null;
  const { games, rounds, wins, shots, hits } = raw;
  if (!count(games) || !count(rounds) || !count(wins) || !count(shots) || !count(hits) || wins > games || hits > shots) return null;
  return { games, rounds, wins, shots, hits };
}

export function parseAccountStats(raw: unknown): AccountStats | null {
  if (!isObj(raw)) return null;
  const total = parseAccountNumbers(raw["total"]);
  const rawMonths = raw["months"];
  if (total === null || !Array.isArray(rawMonths) || rawMonths.length > ACCOUNT_STATS_MONTHS) return null;
  const months: AccountMonth[] = [];
  for (const entry of rawMonths) {
    const numbers = parseAccountNumbers(entry);
    const month = isObj(entry) ? entry["month"] : undefined;
    if (numbers === null || typeof month !== "string" || !MONTH.test(month)) return null;
    const previous = months.at(-1);
    if (previous !== undefined && previous.month >= month) return null;
    months.push({ month, ...numbers });
  }
  return { total, months };
}

export function parseAccountStatsResponse(raw: unknown): AccountStatsResponse | null {
  if (!isObj(raw)) return null;
  if (raw["stats"] === null) return { stats: null };
  const stats = parseAccountStats(raw["stats"]);
  return stats === null ? null : { stats };
}
