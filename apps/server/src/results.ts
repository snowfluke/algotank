// Stored results of owners' tournaments (docs/specs/revamp/75-organiser-tournament.md,
// section 5; the shapes are in packages/arena/src/results-protocol.ts).
//
// Rules that live here:
// - When a game of a private or presenter arena finishes, the result is written once, then the
//   arena learns its id (resultStored), so the finished view can link to it. A failed write is
//   logged and tried again on the arena's next change; the arena keeps resultId null meanwhile.
// - One row per result in the table `result` (db/schema.ts), read on each call: the owner, the
//   arena code and the time as columns, the result and its accounts as one JSON document. The
//   id is 128 random bits, so the link is the only way in.
// - A result is kept RESULT_KEEP_DAYS (180) after the game finished. The 10-minute sweep
//   (arena-lifetime.ts) removes older rows.
// - The row holds account ids, never an email. The email is read from the auth store when
//   the arena's owner asks, so it is the account's current one and leaves only to the owner.
// - A damaged row is reported with its id (PersistenceError), as the other stores do.
//
// Named limit: an arena code can be drawn again after its arena ended, and then the ended-arena
// link answers the newer arena.

import {
  finalPlaceOf,
  isPublicKind,
  isResultId,
  parseTournamentResult,
  RESULT_KEEP_MS,
  type AccountId,
  type AccountResultsResponse,
  type ArenaId,
  type PlayerId,
  type ResultId,
  type ResultResponse,
  type ResultSummary,
  type TournamentResult,
} from "@game/arena";
import { randomBytes } from "node:crypto";
import type { Database, Statement } from "bun:sqlite";
import { invalidRow, jsonColumn } from "./db/rows.ts";
import type { Auth } from "./auth/index.ts";
import { HttpError, jsonResponse } from "./http.ts";
import type { Router } from "./router.ts";
import type { ArenaRecord, Store } from "./store.ts";
import type { AutoSteps } from "./auto-steps.ts";
import type { StreamHub } from "./stream.ts";
import type { Clock } from "./timers.ts";

/** A stored result: the result, and the private parts that never leave in it. */
export interface StoredResult {
  readonly ownerAccountId: AccountId;
  /** The account behind each human of a signed-in-only arena; empty for an arena anyone could join. */
  readonly accounts: readonly { readonly playerId: PlayerId; readonly accountId: AccountId }[];
  readonly result: TournamentResult;
}

interface ResultRow {
  readonly id: string;
  readonly owner_account_id: string;
  readonly document_json: string;
}

/** 128 random bits, base64url: 22 characters (isResultId). */
function newResultId(): ResultId {
  return randomBytes(16).toString("base64url");
}

/** The checked row. The columns beside the document must agree with it. */
function toStoredResult(row: ResultRow): StoredResult {
  const invalid = (reason: string) => invalidRow("result", row.id, reason);
  const raw = jsonColumn("result", row.id, "document_json", row.document_json);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw invalid("the document must be an object.");
  const document = raw as Readonly<Record<string, unknown>>;
  const parsed = parseTournamentResult(document["result"]);
  if (!parsed.ok) throw invalid(parsed.error);
  if (parsed.result.id !== row.id) throw invalid(`the document holds the result ${parsed.result.id}.`);
  const rawAccounts = document["accounts"];
  if (!Array.isArray(rawAccounts)) throw invalid("accounts must be a list.");
  const accounts = rawAccounts.map((entry: unknown, i) => {
    const e = typeof entry === "object" && entry !== null ? (entry as Readonly<Record<string, unknown>>) : {};
    const playerId = e["playerId"];
    const accountId = e["accountId"];
    if (typeof playerId !== "string" || typeof accountId !== "string" || accountId === "" || !parsed.result.players.some((p) => p.id === playerId)) {
      throw invalid(`accounts[${i}] must name a player of the result and an account.`);
    }
    return { playerId, accountId };
  });
  return { ownerAccountId: row.owner_account_id, accounts, result: parsed.result };
}

/** The result of a finished game, from the arena as it is now. `accounts`: the record's players' accounts. */
function buildResult(record: ArenaRecord, id: ResultId, finishedAt: number): StoredResult {
  const { arena, ownerAccountId } = record;
  const { phase, settings } = arena;
  if (phase.kind !== "finished") throw new Error("A result needs a finished game.");
  if (ownerAccountId === null || isPublicKind(settings.kind)) throw new Error("A public arena keeps no result.");
  const kind = settings.kind === "private" ? "private" : "presenter";
  const played = new Set(arena.rounds.flatMap((r) => r.standings.map((s) => s.botId)));
  const players = arena.players.filter((p) => played.has(p.id));
  const ranking = players
    .map((p) => ({ playerId: p.id, place: finalPlaceOf(p.status) }))
    .filter((entry): entry is { playerId: PlayerId; place: number } => entry.place !== null)
    .sort((a, b) => a.place - b.place);
  const result: TournamentResult = {
    id,
    arenaId: arena.id,
    arenaName: settings.name,
    kind,
    finishedAt,
    game: arena.game,
    ticksPerRound: settings.ticksPerRound,
    tickMs: settings.tickMs,
    ruleSetMode: settings.ruleSetMode,
    joinPolicy: settings.joinPolicy,
    players: players.map((p) => ({ id: p.id, name: p.name, look: p.look, isBot: p.isBot })),
    rounds: arena.rounds.map((r) => ({
      round: r.round,
      isFinal: r.isFinal,
      ruleSetId: r.ruleSetId,
      standings: r.standings.map((s) => ({ playerId: s.botId, rank: s.rank, score: s.score })),
      survivors: r.survivors,
    })),
    ranking,
    winnerId: phase.winnerId,
  };
  const accounts = [...record.playerAccounts]
    .filter(([playerId]) => played.has(playerId))
    .map(([playerId, accountId]) => ({ playerId, accountId }));
  return { ownerAccountId, accounts, result };
}

export class ResultStore {
  private readonly now: Clock;
  private readonly insertResult: Statement<unknown, [string, string, string, number, string, string]>;
  private readonly byId: Statement<ResultRow, [string]>;
  private readonly byOwner: Statement<ResultRow, [string]>;
  private readonly latestByArena: Statement<ResultRow, [string]>;
  private readonly deleteOlder: Statement<unknown, [number]>;

  /** Removes the results older than RESULT_KEEP_MS at once, as the sweep does later. */
  constructor(options: { readonly db: Database; readonly now: Clock }) {
    this.now = options.now;
    const { db } = options;
    const columns = "id, owner_account_id, document_json";
    this.insertResult = db.prepare("INSERT INTO result (id, arena_id, owner_account_id, finished_at, kind, document_json) VALUES (?, ?, ?, ?, ?, ?)");
    this.byId = db.prepare(`SELECT ${columns} FROM result WHERE id = ?`);
    this.byOwner = db.prepare(`SELECT ${columns} FROM result WHERE owner_account_id = ? ORDER BY finished_at DESC`);
    this.latestByArena = db.prepare(`SELECT ${columns} FROM result WHERE arena_id = ? ORDER BY finished_at DESC LIMIT 1`);
    this.deleteOlder = db.prepare("DELETE FROM result WHERE finished_at < ?");
    this.prune();
  }

  /** Throws when the write fails; the caller keeps the arena's resultId null and tries again. */
  add(stored: StoredResult): void {
    const { result } = stored;
    if (!isResultId(result.id)) throw new Error(`"${result.id}" is not a result id.`);
    this.insertResult.run(result.id, result.arenaId, stored.ownerAccountId, result.finishedAt, result.kind, JSON.stringify({ accounts: stored.accounts, result }));
  }

  get(id: string): StoredResult | undefined {
    if (!isResultId(id)) return undefined;
    const row = this.byId.get(id);
    return row === null ? undefined : toStoredResult(row);
  }

  /** Newest first. */
  ofOwner(accountId: AccountId): readonly StoredResult[] {
    return this.byOwner.all(accountId).map(toStoredResult);
  }

  /** The newest result of an arena code, for the page of an arena that has ended. */
  latestOfArena(arenaId: ArenaId): StoredResult | undefined {
    const row = this.latestByArena.get(arenaId);
    return row === null ? undefined : toStoredResult(row);
  }

  /** Removes every result older than RESULT_KEEP_MS. */
  prune(): void {
    this.deleteOlder.run(this.now() - RESULT_KEEP_MS);
  }
}

export interface ResultParts {
  readonly store: Store;
  readonly results: ResultStore;
  readonly hub: StreamHub;
  readonly autoSteps: AutoSteps;
  readonly now: Clock;
}

/** Stores the result of every owner's game that finishes, now and for arenas loaded at start. */
export function watchFinishedGames(parts: ResultParts): void {
  parts.store.onChange((record) => keepResult(parts, record));
  for (const record of parts.store.all()) keepResult(parts, record);
}

function keepResult(parts: ResultParts, record: ArenaRecord): void {
  const { phase, settings } = record.arena;
  if (phase.kind !== "finished" || phase.resultId !== null || isPublicKind(settings.kind)) return;
  try {
    const stored = buildResult(record, newResultId(), parts.now());
    parts.results.add(stored);
    const linked = parts.store.apply(record, { kind: "resultStored", resultId: stored.result.id });
    if (!linked.ok) throw new Error(`The arena rejected resultStored: ${linked.error}.`);
    parts.hub.sendArena(parts.autoSteps.view(linked.arena));
  } catch (error) {
    // Runs after the round runner's change, which has no caller to answer; the next change of the arena tries again.
    console.error(`The result of arena ${record.arena.id} could not be stored:`, error);
  }
}

function summaryOf(result: TournamentResult): ResultSummary {
  const winner = result.players.find((p) => p.id === result.winnerId);
  if (winner === undefined) throw new Error(`Result ${result.id} has no winner among its players.`);
  return {
    id: result.id,
    arenaName: result.arenaName,
    kind: result.kind,
    finishedAt: result.finishedAt,
    game: result.game,
    winnerName: winner.name,
    winnerLook: winner.look,
    players: result.players.length,
    rounds: result.rounds.length,
  };
}

export function registerResultRoutes(router: Router, deps: { readonly auth: Auth; readonly results: ResultStore }): void {
  router.add("GET", "/api/results/:id", (ctx) => {
    const stored = deps.results.get(ctx.params["id"] ?? "");
    if (stored === undefined) throw new HttpError(404, "That result does not exist or is older than 180 days.");
    // The email is personal data: only the arena's owner gets it, read now from the auth store.
    const viewer = deps.auth.accountOf(ctx.req);
    const emails =
      viewer !== null && viewer.id === stored.ownerAccountId
        ? stored.accounts.flatMap(({ playerId, accountId }) => {
            const account = deps.auth.accountById(accountId);
            return account === null ? [] : [{ playerId, email: account.email }];
          })
        : null;
    const response: ResultResponse = { result: stored.result, emails };
    return jsonResponse(response);
  });

  router.add("GET", "/api/account/results", (ctx) => {
    const account = deps.auth.requireAccount(ctx.req);
    const response: AccountResultsResponse = { results: deps.results.ofOwner(account.id).map((s) => summaryOf(s.result)) };
    return jsonResponse(response);
  });
}
