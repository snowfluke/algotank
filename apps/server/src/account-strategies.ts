// The play styles each account keeps ("my play styles", built in the tank workshop):
// the three routes in packages/arena/src/strategies-protocol.ts and the table `account_strategy`
// behind them (db/schema.ts), read on each call. The rule set is one JSON text column, because
// the code reads and writes it as one piece.
//
// One saved play style:
// | From  | To    | Actor   | Guard                                                                    |
// |-------|-------|---------|--------------------------------------------------------------------------|
// | none  | saved | account | PUT: valid id, name and strategy; fewer than 20 saved                    |
// | saved | saved | account | PUT: valid name and strategy; updatedAt not older than the stored copy  |
// | saved | none  | account | DELETE                                                                   |
// "none" is terminal for an id only until a PUT makes it again (the browser's Undo).

import type { Database, Statement } from "bun:sqlite";
import {
  ACCOUNT_STRATEGY_ID,
  ACCOUNT_STRATEGY_LIMITS,
  cleanStrategyName,
  type AccountStrategiesResponse,
  type AccountStrategy,
  type AccountStrategyErrorCode,
} from "@game/arena";
import { parseStrategy } from "@game/engine";
import { PersistenceError } from "./db/errors.ts";
import type { Auth } from "./auth/index.ts";
import { HttpError, isRecord, jsonResponse, noContent, readJson } from "./http.ts";
import type { Router } from "./router.ts";
import { sequenceAdded, type MetricsRecorder } from "./metrics/metrics.ts";

/** A device clock may run a little fast; a time further ahead than this is a broken client. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

interface StrategyRow {
  readonly id: string;
  readonly name: string;
  readonly updated_at: number;
  readonly strategy_json: string;
}

/** The checked record, or a sentence that says what is wrong. Used for a request body and for a stored row. */
function parseAccountStrategy(raw: unknown, id: string): { readonly ok: true; readonly value: AccountStrategy } | { readonly ok: false; readonly code: AccountStrategyErrorCode | "strategy"; readonly problem: string; readonly details?: readonly string[] } {
  if (!ACCOUNT_STRATEGY_ID.test(id)) return { ok: false, code: "strategy_id_invalid", problem: "The id must be 8 to 40 letters, digits, - or _." };
  if (!isRecord(raw)) return { ok: false, code: "strategy", problem: "Send the name, the strategy and updatedAt." };
  const name = typeof raw["name"] === "string" ? cleanStrategyName(raw["name"]) : null;
  if (name === null) {
    return { ok: false, code: "strategy_name_invalid", problem: `The name must have 1 to ${ACCOUNT_STRATEGY_LIMITS.nameMax} characters, without control or invisible characters.` };
  }
  const updatedAt = raw["updatedAt"];
  if (typeof updatedAt !== "number" || !Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
    return { ok: false, code: "strategy_time_invalid", problem: "updatedAt must be a whole number of milliseconds since 1970." };
  }
  const parsed = parseStrategy(raw["strategy"]);
  if (!parsed.ok) return { ok: false, code: "strategy", problem: "The strategy has problems.", details: parsed.errors };
  // The checked strategy is stored, not the raw input, so no unknown field reaches the database.
  return { ok: true, value: { id, name, strategy: parsed.strategy, updatedAt } };
}

/** The play styles of every account. */
export class AccountStrategies {
  private readonly selectAll: Statement<StrategyRow, [string]>;
  private readonly countOf: Statement<{ readonly count: number }, [string]>;
  private readonly selectOne: Statement<StrategyRow, [string, string]>;
  private readonly upsert: Statement<unknown, [string, string, string, number, string]>;
  private readonly deleteOne: Statement<unknown, [string, string]>;

  constructor(private readonly db: Database) {
    const columns = "id, name, updated_at, strategy_json";
    this.selectAll = db.prepare(`SELECT ${columns} FROM account_strategy WHERE account_id = ? ORDER BY updated_at DESC`);
    this.countOf = db.prepare("SELECT count(*) AS count FROM account_strategy WHERE account_id = ?");
    this.selectOne = db.prepare(`SELECT ${columns} FROM account_strategy WHERE account_id = ? AND id = ?`);
    this.upsert = db.prepare(
      `INSERT INTO account_strategy (account_id, ${columns}) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (account_id, id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, strategy_json = excluded.strategy_json`,
    );
    this.deleteOne = db.prepare("DELETE FROM account_strategy WHERE account_id = ? AND id = ?");
  }

  /** Newest first. Throws a PersistenceError that names the row when a stored one is damaged. */
  list(accountId: string): AccountStrategy[] {
    return this.selectAll.all(accountId).map((row) => toStrategy(accountId, row));
  }

  /** Creates or replaces one. The caller checked the record. */
  put(accountId: string, strategy: AccountStrategy): { readonly ok: true } | { readonly ok: false; readonly code: "strategy_limit" | "strategy_stale" } {
    return this.db.transaction(() => {
      const row = this.selectOne.get(accountId, strategy.id);
      const stored = row === null ? undefined : toStrategy(accountId, row);
      const counted = this.countOf.get(accountId);
      if (counted === null) throw new Error("SQLite returned no row for count(*).");
      if (stored === undefined && counted.count >= ACCOUNT_STRATEGY_LIMITS.perAccount) return { ok: false, code: "strategy_limit" } as const;
      if (stored !== undefined && stored.updatedAt > strategy.updatedAt) return { ok: false, code: "strategy_stale" } as const;
      this.upsert.run(accountId, strategy.id, strategy.name, strategy.updatedAt, JSON.stringify(strategy.strategy));
      return { ok: true } as const;
    }).immediate();
  }

  remove(accountId: string, id: string): void {
    this.deleteOne.run(accountId, id);
  }
}

function toStrategy(accountId: string, row: StrategyRow): AccountStrategy {
  const invalid = (reason: string) => new PersistenceError(`The row ${accountId}/${row.id} of the table account_strategy is not valid: ${reason}`);
  let strategy: unknown;
  try {
    strategy = JSON.parse(row.strategy_json);
  } catch (error) {
    throw invalid(`strategy_json is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = parseAccountStrategy({ name: row.name, updatedAt: row.updated_at, strategy }, row.id);
  if (!parsed.ok) throw invalid([parsed.problem, ...(parsed.details ?? [])].join(" "));
  return parsed.value;
}

/** Answers a refusal that has a code of its own; HttpError codes are the arena's. */
function refuse(status: number, code: AccountStrategyErrorCode, error: string): Response {
  return jsonResponse({ error, code }, status);
}

export interface AccountStrategyRouteDeps {
  readonly auth: Auth;
  readonly strategies: AccountStrategies;
  /** The server's clock, for the check that updatedAt is not far in the future. */
  readonly now: () => number;
  /** The usage numbers (metrics/metrics.ts). */
  readonly metrics: MetricsRecorder;
}

export function registerAccountStrategyRoutes(router: Router, { auth, strategies, now, metrics }: AccountStrategyRouteDeps): void {
  router.add("GET", "/api/account/strategies", (ctx) => {
    const account = auth.requireAccount(ctx.req);
    const response: AccountStrategiesResponse = { strategies: strategies.list(account.id) };
    return jsonResponse(response);
  });

  router.add("PUT", "/api/account/strategies/:id", async (ctx) => {
    const account = auth.requireAccount(ctx.req);
    const parsed = parseAccountStrategy(await readJson(ctx.req), ctx.params["id"] ?? "");
    if (!parsed.ok) {
      if (parsed.code === "strategy") throw new HttpError(400, parsed.problem, parsed.details === undefined ? {} : { details: parsed.details });
      return refuse(400, parsed.code, parsed.problem);
    }
    if (parsed.value.updatedAt > now() + FUTURE_SLACK_MS) return refuse(400, "strategy_time_invalid", "updatedAt is too far in the future.");
    const saved = strategies.list(account.id).find((s) => s.id === parsed.value.id)?.strategy ?? null;
    const result = strategies.put(account.id, parsed.value);
    if (!result.ok) {
      return result.code === "strategy_limit"
        ? refuse(409, "strategy_limit", `An account keeps at most ${ACCOUNT_STRATEGY_LIMITS.perAccount} play styles.`)
        : refuse(409, "strategy_stale", "The account holds a newer copy of this play style.");
    }
    if (sequenceAdded(saved, parsed.value.strategy)) metrics.count("stepRuleSaved");
    return noContent();
  });

  router.add("DELETE", "/api/account/strategies/:id", (ctx) => {
    const account = auth.requireAccount(ctx.req);
    const id = ctx.params["id"] ?? "";
    if (!ACCOUNT_STRATEGY_ID.test(id)) return refuse(400, "strategy_id_invalid", "The id must be 8 to 40 letters, digits, - or _.");
    strategies.remove(account.id, id);
    return noContent();
  });
}

