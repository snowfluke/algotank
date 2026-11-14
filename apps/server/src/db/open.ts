// Opens the one SQLite database of the server: DATA_DIR/algotank.sqlite, or a database in
// memory without a data folder (tests). See README.md in this folder.
//
// bun:sqlite loads the system library on macOS (3.51.0 on macOS 26.6) and a copy built into
// Bun on Linux (3.53.2 in Bun 1.4.2). The schema uses STRICT tables, which need 3.37.0, so an
// older library stops the start instead of failing on the first CREATE TABLE.

import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PersistenceError } from "./errors.ts";
import { migrate } from "./schema.ts";

export const DATABASE_FILE = "algotank.sqlite";
/** STRICT tables came in SQLite 3.37.0. */
const MINIMUM_SQLITE: readonly [number, number, number] = [3, 37, 0];
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
/** A second writer (the reset-password tool) waits this long for the lock before it fails. */
const BUSY_TIMEOUT_MS = 5000;
const VERSION = /^(\d+)\.(\d+)\.(\d+)/;

export type DatabaseLocation = { readonly kind: "file"; readonly dataDir: string } | { readonly kind: "memory" };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Opens the database, applies the settings and the migrations. Throws a PersistenceError for a
 * folder or file that cannot be opened, a SQLite library older than 3.37.0, and a database
 * written by a newer version of the code.
 */
export function openDatabase(location: DatabaseLocation): Database {
  const db = location.kind === "memory" ? new Database(":memory:", { strict: true }) : openFile(location.dataDir);
  try {
    refuseOldLibrary(db);
    // Each pragma is read back, because SQLite ignores one it cannot apply without an error.
    if (location.kind === "file") expectPragma(db, "journal_mode", "WAL", "wal");
    // FULL: an account written just before a power cut must still be there after it.
    expectPragma(db, "synchronous", "FULL", 2);
    expectPragma(db, "foreign_keys", "ON", 1);
    expectPragma(db, "busy_timeout", String(BUSY_TIMEOUT_MS), BUSY_TIMEOUT_MS);
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Creates the data folder with mode 0700 when it does not exist. A folder that already existed
 * keeps its mode: it may be a path the owner shares for other uses, and the database is 0600 either way.
 */
function createPrivateDirectory(directory: string): void {
  try {
    const existed = existsSync(directory);
    mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
    if (!existed) chmodSync(directory, DIRECTORY_MODE); // mkdir applies the umask; this does not.
  } catch (error) {
    throw new PersistenceError(`The data directory ${directory} cannot be created: ${describe(error)}`);
  }
}

/** Creates the file with mode 0600 first: SQLite gives the -wal and -shm files the mode of the database file. */
function openFile(dataDir: string): Database {
  createPrivateDirectory(dataDir);
  const path = join(dataDir, DATABASE_FILE);
  try {
    writeFileSync(path, "", { flag: "a", mode: FILE_MODE });
    chmodSync(path, FILE_MODE); // a file that existed keeps its mode otherwise
    return new Database(path, { strict: true, create: false });
  } catch (error) {
    throw new PersistenceError(`The database ${path} cannot be opened: ${describe(error)}`);
  }
}

function refuseOldLibrary(db: Database): void {
  const row = db.query<{ version: string }, []>("SELECT sqlite_version() AS version").get();
  if (row === null) throw new PersistenceError("SQLite did not answer sqlite_version().");
  if (!isSupportedSqlite(row.version)) {
    throw new PersistenceError(`Bun loaded SQLite ${row.version}, and AlgoTank needs SQLite ${MINIMUM_SQLITE.join(".")} or newer. Update Bun or the system's SQLite.`);
  }
}

/** True for a version such as "3.51.0" at or above MINIMUM_SQLITE. A text that is not a version is not supported. */
export function isSupportedSqlite(version: string): boolean {
  const parts = VERSION.exec(version)?.slice(1).map(Number);
  return parts !== undefined && compareVersions(parts, MINIMUM_SQLITE) >= 0;
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < b.length; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** `name` and `value` are constants of this file, never input. */
function expectPragma(db: Database, name: string, value: string, expected: string | number): void {
  db.run(`PRAGMA ${name} = ${value}`);
  const row = db.query<Record<string, unknown>, []>(`PRAGMA ${name}`).get();
  const actual = row === null ? undefined : Object.values(row)[0];
  if (actual !== expected) throw new PersistenceError(`SQLite did not apply PRAGMA ${name} = ${value}: it reads ${String(actual)}.`);
}
