// The play styles each account keeps ("my play styles", built in the tank workshop):
// the three routes in packages/arena/src/strategies-protocol.ts and the files behind them.
//
// One JSON file per account in DATA_DIR/strategies/<account id>.json (the folder 0700, made
// by the first save), written atomically with mode 0600 like the arena files. Every file is read at start, and a file that
// cannot be read stops the start with a message that names it, because skipping it
// would drop a player's work without a sign. Without DATA_DIR they live in memory (tests).
//
// One saved play style:
// | From  | To    | Actor   | Guard                                                                    |
// |-------|-------|---------|--------------------------------------------------------------------------|
// | none  | saved | account | PUT: valid id, name and strategy; fewer than 20 saved                    |
// | saved | saved | account | PUT: valid name and strategy; updatedAt not older than the stored copy  |
// | saved | none  | account | DELETE                                                                   |
// "none" is terminal for an id only until a PUT makes it again (the browser's Undo).

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_STRATEGY_ID,
  ACCOUNT_STRATEGY_LIMITS,
  cleanStrategyName,
  type AccountStrategiesResponse,
  type AccountStrategy,
  type AccountStrategyErrorCode,
} from "@game/arena";
import { parseStrategy } from "@game/engine";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "./arena-files.ts";
import type { Auth } from "./auth/index.ts";
import { HttpError, isRecord, jsonResponse, noContent, readJson } from "./http.ts";
import type { Router } from "./router.ts";
import { sequenceAdded, type MetricsRecorder } from "./metrics/metrics.ts";

export const STRATEGIES_FOLDER = "strategies";
const STORED_VERSION = 1;
/** The server makes account ids with crypto.randomUUID; only that shape may name a file. */
const ACCOUNT_FILE = /^([0-9a-f-]{36})\.json$/;
const ACCOUNT_ID = /^[0-9a-f-]{36}$/;
/** A device clock may run a little fast; a time further ahead than this is a broken client. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

interface StoredFile {
  readonly version: typeof STORED_VERSION;
  readonly strategies: readonly AccountStrategy[];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The checked record, or a sentence that says what is wrong. Used for a request body and for a stored file. */
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
  // The checked strategy is stored, not the raw input, so no unknown field reaches the file.
  return { ok: true, value: { id, name, strategy: parsed.strategy, updatedAt } };
}

/** The play styles of every account, in memory, with one file per account when a directory is given. */
export class AccountStrategies {
  private readonly byAccount = new Map<string, Map<string, AccountStrategy>>();
  private readonly directory: string | null;

  /** `dataDirectory` is DATA_DIR, or undefined to keep everything in memory. Throws a PersistenceError that names a damaged file. */
  constructor(dataDirectory: string | undefined) {
    this.directory = dataDirectory === undefined ? null : join(dataDirectory, STRATEGIES_FOLDER);
    // The folder is made by the first save, so a server whose players never saved one adds nothing to DATA_DIR.
    if (this.directory === null || !existsSync(this.directory)) return;
    for (const name of readdirSync(this.directory).sort()) {
      if (!name.endsWith(".json")) continue; // temporary files of an interrupted write
      const match = ACCOUNT_FILE.exec(name);
      const path = join(this.directory, name);
      if (match === null) throw new PersistenceError(`The play style file ${path} is not valid: its name must be an account id.`);
      this.byAccount.set(match[1] ?? "", readFile(path));
    }
  }

  list(accountId: string): AccountStrategy[] {
    return [...(this.byAccount.get(accountId)?.values() ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Creates or replaces one. The caller checked the record. */
  put(accountId: string, strategy: AccountStrategy): { readonly ok: true } | { readonly ok: false; readonly code: "strategy_limit" | "strategy_stale" } {
    const own = this.byAccount.get(accountId) ?? new Map<string, AccountStrategy>();
    const stored = own.get(strategy.id);
    if (stored === undefined && own.size >= ACCOUNT_STRATEGY_LIMITS.perAccount) return { ok: false, code: "strategy_limit" };
    if (stored !== undefined && stored.updatedAt > strategy.updatedAt) return { ok: false, code: "strategy_stale" };
    const next = new Map(own).set(strategy.id, strategy);
    this.write(accountId, next);
    this.byAccount.set(accountId, next);
    return { ok: true };
  }

  remove(accountId: string, id: string): void {
    const own = this.byAccount.get(accountId);
    if (own === undefined || !own.has(id)) return;
    const next = new Map(own);
    next.delete(id);
    this.write(accountId, next);
    this.byAccount.set(accountId, next);
  }

  /** Writes before memory changes, so a failed write leaves both as they were. */
  private write(accountId: string, strategies: ReadonlyMap<string, AccountStrategy>): void {
    if (this.directory === null) return;
    // The id reaches a file path, so only the shape the server makes may pass.
    if (!ACCOUNT_ID.test(accountId)) throw new PersistenceError(`"${accountId}" is not an account id, so it cannot name a file.`);
    const name = `${accountId}.json`;
    const path = join(this.directory, name);
    createPrivateDirectory(this.directory);
    try {
      if (strategies.size === 0) {
        rmSync(path, { force: true });
        return;
      }
      const file: StoredFile = { version: STORED_VERSION, strategies: [...strategies.values()] };
      writePrivateFileAtomically(this.directory, name, JSON.stringify(file));
    } catch (error) {
      throw new PersistenceError(`The play styles of account ${accountId} could not be saved to ${path}: ${describe(error)}`);
    }
  }
}

function readFile(path: string): Map<string, AccountStrategy> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The play style file ${path} cannot be read: ${describe(error)}`);
  }
  if (!isRecord(raw) || raw["version"] !== STORED_VERSION || !Array.isArray(raw["strategies"])) {
    throw new PersistenceError(`The play style file ${path} is not valid: it must hold version ${STORED_VERSION} and a list of play styles.`);
  }
  const strategies = new Map<string, AccountStrategy>();
  for (const [index, entry] of raw["strategies"].entries()) {
    const id = isRecord(entry) && typeof entry["id"] === "string" ? entry["id"] : "";
    const parsed = parseAccountStrategy(entry, id);
    if (!parsed.ok) throw new PersistenceError(`The play style file ${path} is not valid: entry ${index + 1}: ${parsed.problem}`);
    strategies.set(id, parsed.value);
  }
  return strategies;
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

