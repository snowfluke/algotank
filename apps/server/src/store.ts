// The arenas of this server process and the secrets that belong to them. Memory is the
// live copy, because the turn loop reads it; every change is also saved to the database
// (arena-rows.ts), so a restart brings the arenas back.
//
// Rules that live here:
// - One open arena per account: an account owns at most one arena record. Closing or
//   expiry (remove) frees it.
// - lastActivityAt moves with every accepted event, for the expiry in arena-lifetime.ts.
// - A removed player loses their token in the same save, and a reset forgets the round
//   configs and replays of the game that ended (round numbers start again at 1).
// - One seat per account in a signed-in-only arena (joinPolicy "account" or "verified"): seatOf finds it. A player
//   the owner removed in a break keeps the account until the reset drops them, so the stored
//   result can still name it.
// - A scheduled start does not survive a restart: the timer lived in the old process, so the
//   plan goes back to waiting at load (75-organiser-tournament.md, named limit).
//
// Every save writes the whole arena. With 512 players that is a row of about a
// megabyte, and in a break hundreds of players edit their tank at once, so edits are
// coalesced: an arena whose only changes are edits is written at most once per
// SAVE_INTERVAL_MS. Everything else is written at once.
//
// | Change                              | When written | Order        | When the save fails                      |
// |-------------------------------------|--------------|--------------|------------------------------------------|
// | A new arena, a join, a player who   | at once      | save, then   | Nothing changed, the request gets the    |
// | leaves, bots, a start, a reset      |              | memory       | error, and the client can send it again. |
// | From the round runner (round config,| at once      | memory, then | The round still ends for the clients.    |
// | round completed, round aborted)     |              | save         | The next successful save writes it all.  |
// | An edit: strategy, look, bot fill   | within       | memory, then | The request already got its answer. The  |
// | (COALESCED_EVENT_KINDS)             | SAVE_INTERVAL| save         | error is logged and the store tries again|
// |                                     | _MS          |              | after SAVE_INTERVAL_MS.                  |
//
// A join is written at once because the player holds a token from that moment, and a
// phase change because a restart must find the round that runs. Any save writes the
// pending edits of that arena too, and flush() writes them all at shutdown.
//
// Worst loss: a crash (not a shutdown) loses up to SAVE_INTERVAL_MS, 1 second, of
// strategy, look and bot-fill edits. Joins, leaves and phases are never lost.

import type { Database } from "bun:sqlite";
import {
  applyEvent,
  joinNeedsAccount,
  type AccountId,
  type Arena,
  type ArenaEvent,
  type ArenaId,
  type ArenaResult,
  type PlayerId,
  type StoredArena,
  STORED_ARENA_VERSION,
} from "@game/arena";
import type { Decision, RoundConfig } from "@game/engine";
import { ArenaOwnedError, ArenaRows } from "./arena-rows.ts";
import { newArenaCode, safeEqual } from "./secrets.ts";
import type { Clock, Scheduler } from "./timers.ts";
import { NO_METRICS, type MetricsRecorder } from "./metrics/metrics.ts";

/** The most often an arena whose only changes are edits is written. */
export const SAVE_INTERVAL_MS = 1000;

/** The public part of a completed round's replay, serialized once, and each player's decisions. */
export interface StoredReplay {
  readonly spawnJson: string;
  readonly ticksJson: string;
  readonly ownByPlayer: ReadonlyMap<PlayerId, readonly Decision[]>;
  /**
   * The gzip form of the response body, by audience: a player id, or null for a viewer.
   * The body differs per player only in `own`, but a gzip body cannot be assembled from
   * parts, so each audience that asked gets its own copy (about 1/4 of the JSON in a 512-player round).
   */
  readonly gzipByAudience: Map<PlayerId | null, Uint8Array<ArrayBuffer>>;
}

export type JoinEvent = Extract<ArenaEvent, { kind: "join" }>;

/** The events the round runner sends. They change memory before the save (see the table at the top). */
const RUNNER_EVENT_KINDS: ReadonlySet<ArenaEvent["kind"]> = new Set(["roundCompleted", "roundAborted"]);
/** Edits that are written within SAVE_INTERVAL_MS rather than at once (see the table at the top). */
const COALESCED_EVENT_KINDS: ReadonlySet<ArenaEvent["kind"]> = new Set(["submitStrategy", "setLook", "setBotFill", "setTankCount", "setReady"]);

export interface ArenaRecord {
  /** Replaced by the Store methods. Nothing else assigns it. */
  arena: Arena;
  /** The account that created the arena; null for a public arena. */
  readonly ownerAccountId: AccountId | null;
  /** Milliseconds since 1970 of the last accepted event. Replaced by the Store methods. */
  lastActivityAt: number;
  /** Replaced, never changed in place, by the Store methods. */
  playerTokens: ReadonlyMap<PlayerId, string>;
  /**
   * The players and strategies of every round of the current game that started, by
   * round number. Players edit strategies during a break, so a replay needs the copy
   * taken at the start. Strategy objects are never changed in place, so holding the
   * reference is a copy. Replaced, never changed in place, by the Store methods.
   */
  roundConfigs: ReadonlyMap<number, RoundConfig>;
  /** Signed-in-only arenas (needsAccount): the account behind each human player. Replaced, never changed in place, by the Store methods. */
  playerAccounts: ReadonlyMap<PlayerId, AccountId>;
  /** Filled by the first replay request for a completed round. It is not saved: a replay is recomputed from the round config. */
  readonly replays: Map<number, StoredReplay>;
}

export type AddResult =
  | { readonly ok: true; readonly record: ArenaRecord }
  /** The account already owns an open arena. */
  | { readonly ok: false; readonly ownedArenaId: ArenaId };

export interface StoreOptions {
  /** The server's database: a file under DATA_DIR, or in memory for tests. */
  readonly db: Database;
  readonly now: Clock;
  /** Runs the coalesced save of edits. */
  readonly scheduler: Scheduler;
  /** Counts the arenas created (metrics/metrics.ts). NO_METRICS when not given. */
  readonly metrics?: MetricsRecorder;
}

/**
 * A change to an arena the store no longer holds (closed or expired while a request
 * waited). The store does not know about HTTP; server.ts answers it with 404.
 */
export class ArenaGoneError extends Error {
  constructor(readonly arenaId: ArenaId) {
    super(`The arena ${arenaId} is no longer held by the store.`);
    this.name = "ArenaGoneError";
  }
}

export class Store {
  private readonly records = new Map<ArenaId, ArenaRecord>();
  private readonly rows: ArenaRows;
  private readonly metrics: MetricsRecorder;
  private readonly now: Clock;
  private readonly scheduler: Scheduler;
  private readonly listeners: ((record: ArenaRecord) => void)[] = [];
  /** Arenas with edits that are in memory but not yet in their row. */
  private readonly pending = new Set<ArenaRecord>();
  private cancelFlush: (() => void) | null = null;

  /**
   * Loads every arena row, and throws a PersistenceError that names the first row that
   * fails. An arena that was running when the old
   * process stopped comes back aborted, so its round can start again.
   */
  constructor(options: StoreOptions) {
    this.metrics = options.metrics ?? NO_METRICS;
    this.now = options.now;
    this.scheduler = options.scheduler;
    this.rows = new ArenaRows(options.db);
    for (const stored of this.rows.readAll()) {
      const record = recordFrom(stored);
      if (record.arena.phase.kind === "running") {
        const aborted = applyEvent(record.arena, { kind: "roundAborted" });
        if (!aborted.ok) throw new Error(`Arena ${record.arena.id} was running but rejected roundAborted: ${aborted.error}.`);
        record.arena = aborted.arena;
        this.save(record);
      }
      const { phase } = record.arena;
      if ((phase.kind === "lobby" || phase.kind === "break") && phase.start.kind === "scheduled") {
        const dropped = applyEvent(record.arena, { kind: "cancelStart" });
        if (!dropped.ok) throw new Error(`Arena ${record.arena.id} had a scheduled start but rejected cancelStart: ${dropped.error}.`);
        record.arena = dropped.arena;
        this.save(record);
      }
      this.records.set(record.arena.id, record);
    }
  }

  /** Called after every accepted change, after the save. The public arenas arm their timers here. */
  onChange(listener: (record: ArenaRecord) => void): void {
    this.listeners.push(listener);
  }

  /** A code no arena uses yet. */
  newArenaId(): ArenaId {
    for (;;) {
      const id = newArenaCode();
      if (!this.records.has(id)) return id;
    }
  }

  /** Adds an arena owned by `ownerAccountId`, or null for a public arena. An account owns at most one. */
  add(arena: Arena, ownerAccountId: AccountId | null): AddResult {
    if (ownerAccountId !== null) {
      const owned = this.ownedBy(ownerAccountId);
      if (owned !== undefined) return { ok: false, ownedArenaId: owned.arena.id };
    }
    const record: ArenaRecord = {
      arena,
      ownerAccountId,
      lastActivityAt: this.now(),
      playerTokens: new Map(),
      roundConfigs: new Map(),
      playerAccounts: new Map(),
      replays: new Map(),
    };
    // Saved before it is known, so a failed save leaves no arena in memory that the database lacks.
    // The UNIQUE owner index is the second guard of the check above.
    try {
      this.save(record);
    } catch (error) {
      if (error instanceof ArenaOwnedError) return { ok: false, ownedArenaId: error.ownedArenaId };
      throw error;
    }
    this.records.set(arena.id, record);
    this.metrics.count("arenaCreated", arena.settings.kind);
    return { ok: true, record };
  }

  /** Codes are typed by hand, so the lookup ignores case. */
  get(id: string): ArenaRecord | undefined {
    return this.records.get(id.toUpperCase());
  }

  ownedBy(accountId: AccountId): ArenaRecord | undefined {
    for (const record of this.records.values()) {
      if (record.ownerAccountId === accountId) return record;
    }
    return undefined;
  }

  all(): readonly ArenaRecord[] {
    return [...this.records.values()];
  }

  /** The player behind this account in a signed-in-only arena, if any. */
  seatOf(record: ArenaRecord, accountId: AccountId): PlayerId | undefined {
    for (const [playerId, holder] of record.playerAccounts) if (holder === accountId) return playerId;
    return undefined;
  }

  /**
   * A new player joins with a token, in one save, so a saved player always has a token. A
   * rejected event changes nothing. `accountId` is required in a signed-in-only arena
   * (needsAccount) and refused elsewhere; an account that already holds a seat in this arena is
   * a caller bug (the route checks first).
   */
  addPlayer(record: ArenaRecord, event: JoinEvent, token: string, accountId: AccountId | null): ArenaResult {
    this.assertHeld(record);
    const needs = needsAccount(record.arena);
    if (needs !== (accountId !== null)) throw new Error(`A join in a ${record.arena.settings.kind} arena ${needs ? "needs" : "takes no"} account.`);
    if (accountId !== null && this.seatOf(record, accountId) !== undefined) throw new Error(`Account ${accountId} already holds a seat in arena ${record.arena.id}.`);
    const result = applyEvent(record.arena, event);
    if (!result.ok) return result;
    const playerTokens = new Map(record.playerTokens).set(event.playerId, token);
    const playerAccounts = accountId === null ? record.playerAccounts : new Map(record.playerAccounts).set(event.playerId, accountId);
    const lastActivityAt = this.now();
    // Saved first: a failed save must not leave a player whose token was never sent.
    this.save({ ...record, arena: result.arena, playerTokens, playerAccounts, lastActivityAt });
    record.arena = result.arena;
    record.playerTokens = playerTokens;
    record.playerAccounts = playerAccounts;
    record.lastActivityAt = lastActivityAt;
    this.changed(record);
    return result;
  }

  /**
   * Gives an account's seat a new token, so the account plays it from another device; the old
   * token stops working in the same save. The arena itself does not change.
   */
  replaceToken(record: ArenaRecord, playerId: PlayerId, token: string): void {
    this.assertHeld(record);
    if (!record.playerTokens.has(playerId)) throw new Error(`Player ${playerId} has no token in arena ${record.arena.id}.`);
    const playerTokens = new Map(record.playerTokens).set(playerId, token);
    const lastActivityAt = this.now();
    // Saved first: the new token is sent only after it is in the database.
    this.save({ ...record, playerTokens, lastActivityAt });
    record.playerTokens = playerTokens;
    record.lastActivityAt = lastActivityAt;
  }

  /** Every other change to an arena. A rejected event leaves the arena as it was. */
  apply(record: ArenaRecord, event: Exclude<ArenaEvent, JoinEvent>): ArenaResult {
    this.assertHeld(record);
    const result = applyEvent(record.arena, event);
    if (!result.ok) return result;
    const removed = event.kind === "removePlayers" ? event.playerIds : event.kind === "ownerRemove" ? [event.playerId] : [];
    const next: ArenaRecord = {
      ...record,
      arena: result.arena,
      lastActivityAt: this.now(),
      // A removed player's token goes in the same save: a row must not hold a token without a player.
      playerTokens: without(record.playerTokens, removed),
      // An account stays while its player is in the arena (a player removed in a break stays until the reset).
      playerAccounts: onlyPlayersOf(record.playerAccounts, result.arena),
      // The next game numbers its rounds from 1 again, so the old configs would answer its replays.
      roundConfigs: event.kind === "reset" ? new Map() : record.roundConfigs,
    };
    if (COALESCED_EVENT_KINDS.has(event.kind)) {
      assign(record, next);
      this.saveSoon(record);
    } else if (RUNNER_EVENT_KINDS.has(event.kind)) {
      assign(record, next);
      this.save(record);
    } else {
      // Saved first: a failed save must not leave, for example, a running round that no timer plays.
      this.save(next);
      assign(record, next);
    }
    if (event.kind === "reset") record.replays.clear();
    this.changed(record);
    return result;
  }

  setRoundConfig(record: ArenaRecord, round: number, config: RoundConfig): void {
    this.assertHeld(record);
    record.roundConfigs = new Map(record.roundConfigs).set(round, config);
    this.save(record);
  }

  /** Removes the arena and its row, which frees its owner to create another. */
  remove(record: ArenaRecord): void {
    this.assertHeld(record);
    // The row first: when it cannot be removed, the arena stays whole and the caller gets the error.
    this.rows.remove(record.arena.id);
    this.records.delete(record.arena.id);
    // A pending edit must not write the closed arena back.
    this.pending.delete(record);
  }

  /**
   * Writes every arena with pending edits now. The server calls it at shutdown, and the
   * timer of saveSoon calls it. An arena whose save fails is logged and tried again later.
   */
  flush(): void {
    this.cancelFlush?.();
    this.cancelFlush = null;
    for (const record of [...this.pending]) {
      try {
        this.save(record);
      } catch (error) {
        console.error(`Arena ${record.arena.id} could not be saved; trying again in ${SAVE_INTERVAL_MS} ms:`, error);
      }
    }
    if (this.pending.size > 0) this.armFlush();
  }

  get size(): number {
    return this.records.size;
  }

  /**
   * A request may hold a record across an await while the arena is closed. Its change
   * must not write the row back, so a record the store no longer holds is refused.
   */
  private assertHeld(record: ArenaRecord): void {
    if (this.records.get(record.arena.id) !== record) throw new ArenaGoneError(record.arena.id);
  }

  private changed(record: ArenaRecord): void {
    for (const listener of this.listeners) listener(record);
  }

  /** Writes the whole arena, pending edits included. */
  private save(record: ArenaRecord): void {
    this.rows.write(storedFrom(record));
    // `record` can be a copy that the caller assigns only after the save; the held record is what waits.
    const held = this.records.get(record.arena.id);
    if (held !== undefined) this.pending.delete(held);
  }

  /** Marks an edit for the next coalesced save. */
  private saveSoon(record: ArenaRecord): void {
    this.pending.add(record);
    this.armFlush();
  }

  private armFlush(): void {
    this.cancelFlush ??= this.scheduler.after(() => {
      this.cancelFlush = null;
      this.flush();
    }, SAVE_INTERVAL_MS);
  }
}

function assign(record: ArenaRecord, next: ArenaRecord): void {
  record.arena = next.arena;
  record.lastActivityAt = next.lastActivityAt;
  record.playerTokens = next.playerTokens;
  record.playerAccounts = next.playerAccounts;
  record.roundConfigs = next.roundConfigs;
}

/** A join here records the account behind the player: "Only signed-in players". */
function needsAccount(arena: Arena): boolean {
  return joinNeedsAccount(arena.settings.joinPolicy);
}

function onlyPlayersOf<V>(byPlayer: ReadonlyMap<PlayerId, V>, arena: Arena): ReadonlyMap<PlayerId, V> {
  if ([...byPlayer.keys()].every((id) => arena.players.some((p) => p.id === id))) return byPlayer;
  return new Map([...byPlayer].filter(([id]) => arena.players.some((p) => p.id === id)));
}

function without<V>(byPlayer: ReadonlyMap<PlayerId, V>, playerIds: readonly PlayerId[]): ReadonlyMap<PlayerId, V> {
  if (playerIds.length === 0) return byPlayer;
  const next = new Map(byPlayer);
  for (const playerId of playerIds) next.delete(playerId);
  return next;
}

function recordFrom(stored: StoredArena): ArenaRecord {
  return {
    arena: stored.arena,
    ownerAccountId: stored.ownerAccountId,
    lastActivityAt: stored.lastActivityAt,
    playerTokens: new Map(stored.playerTokens.map((entry) => [entry.playerId, entry.token])),
    roundConfigs: new Map(stored.roundConfigs.map((entry) => [entry.round, entry.config])),
    playerAccounts: new Map(stored.playerAccounts.map((entry) => [entry.playerId, entry.accountId])),
    replays: new Map(),
  };
}

function storedFrom(record: ArenaRecord): StoredArena {
  return {
    version: STORED_ARENA_VERSION,
    arena: record.arena,
    ownerAccountId: record.ownerAccountId,
    lastActivityAt: record.lastActivityAt,
    playerTokens: [...record.playerTokens].map(([playerId, token]) => ({ playerId, token })),
    roundConfigs: [...record.roundConfigs].map(([round, config]) => ({ round, config })),
    playerAccounts: [...record.playerAccounts].map(([playerId, accountId]) => ({ playerId, accountId })),
  };
}

/** The player this token belongs to. It compares against every player so the time does not depend on a match. */
export function playerIdForToken(record: ArenaRecord, token: string): PlayerId | undefined {
  let found: PlayerId | undefined;
  for (const [playerId, playerToken] of record.playerTokens) {
    if (safeEqual(playerToken, token)) found = playerId;
  }
  return found;
}
