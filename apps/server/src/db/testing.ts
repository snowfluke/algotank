// Helpers for tests: a database in memory, and a raw row writer, so a test can add an account
// that child rows need (foreign keys) or a damaged row that no store would write.

import type { Database } from "bun:sqlite";
import { openDatabase } from "./open.ts";

/** A new, empty database in memory with the full schema. */
export function memoryDatabase(): Database {
  return openDatabase({ kind: "memory" });
}

/** Inserts `row` as it is, without any store's checks. Table and column names come from the test, never from input. */
export function insertRow(db: Database, table: string, row: Readonly<Record<string, string | number | null>>): void {
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row));
}

/** An account row for the foreign keys of a store test. */
export function insertAccount(db: Database, id: string): void {
  insertRow(db, "account", { id, email: `${id}@example.org`, password_hash: "not a real hash", email_verified: 0, created_at: 0 });
}

/** How many rows `table` holds. The table name comes from the test, never from input. */
export function countRows(db: Database, table: string): number {
  const row = db.query<{ count: number }, []>(`SELECT count(*) AS count FROM ${table}`).get();
  if (row === null) throw new Error("SQLite returned no row for count(*).");
  return row.count;
}
