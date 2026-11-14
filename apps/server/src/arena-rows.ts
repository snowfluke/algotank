// The arenas in the table `arena` (db/schema.ts): one row per arena with its whole StoredArena
// as JSON, written by the Store (store.ts) at each change and read once at start. The row holds
// the player tokens, so the database file is 0600 (db/open.ts). Closing an arena or its expiry
// deletes its row, and with it the arena's chat lines (ON DELETE CASCADE).

import { SQLiteError, type Database, type Statement } from "bun:sqlite";
import { isArenaCode, parseStoredArena, type AccountId, type ArenaId, type StoredArena } from "@game/arena";
import { PersistenceError } from "./db/errors.ts";
import { invalidRow, jsonColumn } from "./db/rows.ts";

/** The owner already has another arena: the UNIQUE index arena_one_per_owner refused the row. */
export class ArenaOwnedError extends Error {
  constructor(readonly ownedArenaId: ArenaId) {
    super(`The owner already has the arena ${ownedArenaId}.`);
    this.name = "ArenaOwnedError";
  }
}

interface ArenaRow {
  readonly id: string;
  readonly snapshot_json: string;
}

export class ArenaRows {
  private readonly upsert: Statement<unknown, [string, string, string | null, string, number, string]>;
  private readonly deleteOne: Statement<unknown, [string]>;
  private readonly selectAll: Statement<ArenaRow, []>;
  private readonly ownedBy: Statement<{ readonly id: string }, [string]>;

  constructor(db: Database) {
    // An update, never INSERT OR REPLACE: a replace deletes the row first, which would delete its chat lines.
    this.upsert = db.prepare(
      `INSERT INTO arena (id, kind, owner_account_id, status, updated_at, snapshot_json) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, owner_account_id = excluded.owner_account_id, status = excluded.status,
         updated_at = excluded.updated_at, snapshot_json = excluded.snapshot_json`,
    );
    this.deleteOne = db.prepare("DELETE FROM arena WHERE id = ?");
    this.selectAll = db.prepare("SELECT id, snapshot_json FROM arena ORDER BY id");
    this.ownedBy = db.prepare("SELECT id FROM arena WHERE owner_account_id = ?");
  }

  /**
   * Writes the whole arena. Throws ArenaOwnedError when its owner has another arena row, and a
   * PersistenceError that names the arena for any other failure.
   */
  write(stored: StoredArena): void {
    const { arena, ownerAccountId } = stored;
    try {
      this.upsert.run(arena.id, arena.settings.kind, ownerAccountId, arena.phase.kind, stored.lastActivityAt, JSON.stringify(stored));
    } catch (error) {
      if (ownerAccountId !== null && error instanceof SQLiteError && error.code === "SQLITE_CONSTRAINT_UNIQUE") throw this.ownedError(ownerAccountId, error);
      throw new PersistenceError(`Arena ${arena.id} could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Deletes the row of a closed or expired arena. A row that is already gone is not an error. */
  remove(arenaId: ArenaId): void {
    this.deleteOne.run(arenaId);
  }

  /**
   * Reads every arena. A row that fails the check stops the read with an error that names it,
   * because skipping it would drop an event without a sign.
   */
  readAll(): StoredArena[] {
    return this.selectAll.all().map((row) => {
      const parsed = parseStoredArena(jsonColumn("arena", row.id, "snapshot_json", row.snapshot_json));
      if (!parsed.ok) throw invalidRow("arena", row.id, parsed.error);
      if (parsed.stored.arena.id !== row.id || !isArenaCode(row.id)) throw invalidRow("arena", row.id, `the id must be the arena code ${parsed.stored.arena.id}.`);
      return parsed.stored;
    });
  }

  private ownedError(ownerAccountId: AccountId, cause: SQLiteError): Error {
    const owned = this.ownedBy.get(ownerAccountId);
    return owned === null ? cause : new ArenaOwnedError(owned.id);
  }
}
