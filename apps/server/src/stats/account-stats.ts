// The statistics of each account over time (docs/specs/revamp/81-metrics.md, K2, "Account
// totals"): games, rounds, wins, shots and hits, as a total and for each of the last
// ACCOUNT_STATS_MONTHS months it played in. The shapes and their check are in
// packages/arena/src/stats-protocol.ts.
//
// One small file per account in DATA_DIR/stats/<account id>.json (the folder 0700), written
// atomically with mode 0600 at a round's end, never per turn. Every file is read at start; a
// damaged file stops the start with its name, as the other stores do. Without DATA_DIR the
// totals live in memory (tests).
//
// GET /api/account/stats (account) -> AccountStatsResponse

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNT_STATS_MONTHS, parseAccountStats, type AccountId, type AccountNumbers, type AccountStats, type AccountStatsResponse } from "@game/arena";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "../arena-files.ts";
import type { Auth } from "../auth/index.ts";
import { isRecord, jsonResponse } from "../http.ts";
import type { Router } from "../router.ts";

const STATS_FOLDER = "stats";
const STORED_VERSION = 1;
/** The server makes account ids with crypto.randomUUID; only that shape may name a file. */
const ACCOUNT_FILE = /^([0-9a-f-]{36})\.json$/;
const ACCOUNT_ID = /^[0-9a-f-]{36}$/;

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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AccountStatsStore {
  private readonly byAccount = new Map<AccountId, AccountStats>();
  private readonly directory: string | null;

  /** `dataDirectory` is DATA_DIR, or undefined to keep everything in memory. Throws a PersistenceError that names a damaged file. */
  constructor(dataDirectory: string | undefined) {
    this.directory = dataDirectory === undefined ? null : join(dataDirectory, STATS_FOLDER);
    if (this.directory === null || !existsSync(this.directory)) return;
    for (const name of readdirSync(this.directory).sort()) {
      if (!name.endsWith(".json")) continue; // temporary files of an interrupted write
      const match = ACCOUNT_FILE.exec(name);
      const path = join(this.directory, name);
      if (match === null) throw new PersistenceError(`The statistics file ${path} is not valid: its name must be an account id.`);
      this.byAccount.set(match[1] ?? "", readFile(path));
    }
  }

  get(accountId: AccountId): AccountStats | null {
    return this.byAccount.get(accountId) ?? null;
  }

  /** Adds `add` to the account's total and to `month`. Writes before memory changes, so a failed write leaves both as they were. */
  add(accountId: AccountId, month: string, add: AccountNumbers): void {
    const next = withAdded(this.get(accountId), month, add);
    this.write(accountId, next);
    this.byAccount.set(accountId, next);
  }

  private write(accountId: AccountId, stats: AccountStats): void {
    if (this.directory === null) return;
    // The id reaches a file path, so only the shape the server makes may pass.
    if (!ACCOUNT_ID.test(accountId)) throw new PersistenceError(`"${accountId}" is not an account id, so it cannot name a file.`);
    const name = `${accountId}.json`;
    createPrivateDirectory(this.directory);
    try {
      writePrivateFileAtomically(this.directory, name, JSON.stringify({ version: STORED_VERSION, stats }));
    } catch (error) {
      throw new PersistenceError(`The statistics of account ${accountId} could not be saved to ${join(this.directory, name)}: ${describe(error)}`);
    }
  }
}

function readFile(path: string): AccountStats {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The statistics file ${path} cannot be read: ${describe(error)}`);
  }
  const stats = isRecord(raw) && raw["version"] === STORED_VERSION ? parseAccountStats(raw["stats"]) : null;
  if (stats === null) throw new PersistenceError(`The statistics file ${path} is not valid: it must hold version ${STORED_VERSION} and the statistics.`);
  return stats;
}

export function registerAccountStatsRoutes(router: Router, { auth, stats }: { readonly auth: Auth; readonly stats: AccountStatsStore }): void {
  router.add("GET", "/api/account/stats", (ctx) => {
    const account = auth.requireAccount(ctx.req);
    const response: AccountStatsResponse = { stats: stats.get(account.id) };
    return jsonResponse(response);
  });
}
