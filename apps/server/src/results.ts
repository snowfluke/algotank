// Stored results of owners' tournaments (docs/specs/revamp/75-organiser-tournament.md,
// section 5; the shapes are in packages/arena/src/results-protocol.ts).
//
// Rules that live here:
// - When a game of a private or presenter arena finishes, the result is written once, then the
//   arena learns its id (resultStored), so the finished view can link to it. A failed write is
//   logged and tried again on the arena's next change; the arena keeps resultId null meanwhile.
// - One file per result: DATA_DIR/results/<resultId>.json, 0600, written atomically. The id is
//   128 random bits, so the link is the only way in.
// - A result is kept RESULT_KEEP_DAYS (180) after the game finished. The 10-minute sweep
//   (arena-lifetime.ts) removes older ones from memory and disk.
// - The file holds account ids, never an email. The email is read from the auth store when
//   the arena's owner asks, so it is the account's current one and leaves only to the owner.
// - A damaged file stops the start with its name, as the other stores do.
//
// Named limits: every kept result is held in memory (a 512-player, 7-round result is about
// 150 KB as JSON); an index on disk would clear it. An arena code can be drawn again after its
// arena ended, and then the ended-arena link answers the newer arena.

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
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
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "./arena-files.ts";
import type { Auth } from "./auth/index.ts";
import { HttpError, jsonResponse } from "./http.ts";
import type { Router } from "./router.ts";
import type { ArenaRecord, Store } from "./store.ts";
import type { AutoSteps } from "./auto-steps.ts";
import type { StreamHub } from "./stream.ts";
import type { Clock } from "./timers.ts";

export const RESULTS_FOLDER = "results";
const FILE_VERSION = 1;
const RESULT_FILE = /^(.+)\.json$/;

/** What a result file holds: the result, and the private parts that never leave in it. */
export interface StoredResult {
  readonly version: typeof FILE_VERSION;
  readonly ownerAccountId: AccountId;
  /** The account behind each human of a signed-in-only arena; empty for an arena anyone could join. */
  readonly accounts: readonly { readonly playerId: PlayerId; readonly accountId: AccountId }[];
  readonly result: TournamentResult;
}

/** 128 random bits, base64url: 22 characters (isResultId). */
function newResultId(): ResultId {
  return randomBytes(16).toString("base64url");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseStoredResult(raw: unknown, path: string): StoredResult {
  const invalid = (reason: string) => new PersistenceError(`The result file ${path} is not valid: ${reason}`);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw invalid("it must be an object.");
  const file = raw as Readonly<Record<string, unknown>>;
  if (file["version"] !== FILE_VERSION) throw invalid(`version must be ${FILE_VERSION}.`);
  const owner = file["ownerAccountId"];
  if (typeof owner !== "string" || owner === "") throw invalid("ownerAccountId must be the id of an account.");
  const parsed = parseTournamentResult(file["result"]);
  if (!parsed.ok) throw invalid(parsed.error);
  const rawAccounts = file["accounts"];
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
  return { version: FILE_VERSION, ownerAccountId: owner, accounts, result: parsed.result };
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
  return { version: FILE_VERSION, ownerAccountId, accounts, result };
}

export class ResultStore {
  private readonly results = new Map<ResultId, StoredResult>();
  private readonly directory: string | null;

  /** With `dataDir`, every result file is loaded; a damaged one throws a PersistenceError that names it. */
  constructor(options: { readonly dataDir?: string | undefined; readonly now: Clock }) {
    this.now = options.now;
    this.directory = options.dataDir === undefined ? null : join(options.dataDir, RESULTS_FOLDER);
    if (this.directory === null) return;
    createPrivateDirectory(this.directory);
    for (const name of readdirSync(this.directory).sort()) {
      const match = RESULT_FILE.exec(name);
      if (match === null) continue;
      const path = join(this.directory, name);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        throw new PersistenceError(`The result file ${path} cannot be read: ${describe(error)}`);
      }
      const stored = parseStoredResult(raw, path);
      if (stored.result.id !== match[1]) throw new PersistenceError(`The result file ${path} is not valid: its name must be ${stored.result.id}.json.`);
      this.results.set(stored.result.id, stored);
    }
    this.prune();
  }

  private readonly now: Clock;

  /** Writes the file first, so memory never holds a result the disk lacks. */
  add(stored: StoredResult): void {
    if (!isResultId(stored.result.id)) throw new Error(`"${stored.result.id}" is not a result id.`);
    if (this.directory !== null) {
      try {
        writePrivateFileAtomically(this.directory, `${stored.result.id}.json`, JSON.stringify(stored));
      } catch (error) {
        throw new PersistenceError(`The result ${stored.result.id} could not be saved in ${this.directory}: ${describe(error)}`);
      }
    }
    this.results.set(stored.result.id, stored);
  }

  get(id: string): StoredResult | undefined {
    return isResultId(id) ? this.results.get(id) : undefined;
  }

  ofOwner(accountId: AccountId): readonly StoredResult[] {
    return [...this.results.values()].filter((s) => s.ownerAccountId === accountId).sort((a, b) => b.result.finishedAt - a.result.finishedAt);
  }

  /** The newest result of an arena code, for the page of an arena that has ended. */
  latestOfArena(arenaId: ArenaId): StoredResult | undefined {
    let latest: StoredResult | undefined;
    for (const stored of this.results.values()) {
      if (stored.result.arenaId === arenaId && (latest === undefined || stored.result.finishedAt > latest.result.finishedAt)) latest = stored;
    }
    return latest;
  }

  /** Removes every result older than RESULT_KEEP_MS. A file that cannot be removed stays and is tried again at the next sweep. */
  prune(): void {
    const oldest = this.now() - RESULT_KEEP_MS;
    for (const [id, stored] of this.results) {
      if (stored.result.finishedAt >= oldest) continue;
      if (this.directory !== null) {
        try {
          rmSync(join(this.directory, `${id}.json`), { force: true });
        } catch (error) {
          console.error(`The expired result ${id} could not be removed; the next sweep tries again:`, error);
          continue;
        }
      }
      this.results.delete(id);
    }
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
