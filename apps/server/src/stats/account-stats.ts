// The statistics of each account over time (docs/specs/revamp/81-metrics.md, K2, "Account
// totals"): games, rounds, wins, shots and hits, as a total and for each of the last
// ACCOUNT_STATS_MONTHS months it played in. The shapes and their check are in
// packages/arena/src/stats-protocol.ts.
//
// The totals are the table `account_stats` and the months `account_stats_month`
// (db/schema.ts), written at a round's end, never per turn, and read on each call.
//
// GET /api/account/stats (account) -> AccountStatsResponse

import type { Database, Statement } from "bun:sqlite";
import { ACCOUNT_STATS_MONTHS, parseAccountStats, type AccountId, type AccountMonth, type AccountNumbers, type AccountStats, type AccountStatsResponse } from "@game/arena";
import { PersistenceError } from "../db/errors.ts";
import type { Auth } from "../auth/index.ts";
import { jsonResponse } from "../http.ts";
import type { Router } from "../router.ts";

const ZERO: AccountNumbers = { games: 0, rounds: 0, wins: 0, shots: 0, hits: 0 };

function plus(a: AccountNumbers, b: AccountNumbers): AccountNumbers {
  return { games: a.games + b.games, rounds: a.rounds + b.rounds, wins: a.wins + b.wins, shots: a.shots + b.shots, hits: a.hits + b.hits };
}

/** The stats with `add` counted in `month`; the oldest month goes when more than ACCOUNT_STATS_MONTHS are held. */
function withAdded(stats: AccountStats | null, month: string, add: AccountNumbers): AccountStats {
  const before = stats ?? { total: ZERO, months: [] };
  const existing = before.months.find((m) => m.month === month);
  const others = before.months.filter((m) => m.month !== month);
  const months = [...others, { ...plus(existing ?? ZERO, add), month }].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-ACCOUNT_STATS_MONTHS);
  return { total: plus(before.total, add), months };
}

export class AccountStatsStore {
  private readonly selectTotal: Statement<AccountNumbers, [string]>;
  private readonly selectMonths: Statement<AccountMonth, [string]>;
  private readonly upsertTotal: Statement<unknown, [string, number, number, number, number, number]>;
  private readonly deleteMonths: Statement<unknown, [string]>;
  private readonly insertMonth: Statement<unknown, [string, string, number, number, number, number, number]>;

  constructor(private readonly db: Database) {
    const numbers = "games, rounds, wins, shots, hits";
    this.selectTotal = db.prepare(`SELECT ${numbers} FROM account_stats WHERE account_id = ?`);
    this.selectMonths = db.prepare(`SELECT month, ${numbers} FROM account_stats_month WHERE account_id = ? ORDER BY month`);
    this.upsertTotal = db.prepare(
      `INSERT INTO account_stats (account_id, ${numbers}) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id) DO UPDATE SET games = excluded.games, rounds = excluded.rounds, wins = excluded.wins, shots = excluded.shots, hits = excluded.hits`,
    );
    this.deleteMonths = db.prepare("DELETE FROM account_stats_month WHERE account_id = ?");
    this.insertMonth = db.prepare(`INSERT INTO account_stats_month (account_id, month, ${numbers}) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  }

  /** Throws a PersistenceError that names the account when its stored rows are damaged. */
  get(accountId: AccountId): AccountStats | null {
    const total = this.selectTotal.get(accountId);
    if (total === null) return null;
    // The same check as an answer's (stats-protocol.ts), so a damaged row never reaches a page.
    const stats = parseAccountStats({ total, months: this.selectMonths.all(accountId) });
    if (stats === null) throw new PersistenceError(`The row ${accountId} of the tables account_stats and account_stats_month is not valid.`);
    return stats;
  }

  /** Adds `add` to the account's total and to `month`, in one transaction. */
  add(accountId: AccountId, month: string, add: AccountNumbers): void {
    this.db.transaction(() => {
      const next = withAdded(this.get(accountId), month, add);
      const t = next.total;
      this.upsertTotal.run(accountId, t.games, t.rounds, t.wins, t.shots, t.hits);
      // The months are rewritten whole (at most ACCOUNT_STATS_MONTHS rows), so withAdded stays the one place of the rule.
      this.deleteMonths.run(accountId);
      for (const m of next.months) this.insertMonth.run(accountId, m.month, m.games, m.rounds, m.wins, m.shots, m.hits);
    }).immediate();
  }
}

export function registerAccountStatsRoutes(router: Router, { auth, stats }: { readonly auth: Auth; readonly stats: AccountStatsStore }): void {
  router.add("GET", "/api/account/stats", (ctx) => {
    const account = auth.requireAccount(ctx.req);
    const response: AccountStatsResponse = { stats: stats.get(account.id) };
    return jsonResponse(response);
  });
}
