// A copy of the running server's database by VACUUM INTO: SQLite writes a consistent copy of
// one moment in a single read transaction, while the server goes on writing. A copy of the data
// folder is not a safe backup in WAL mode, because the last writes may still be only in the -wal
// file, and a copy taken during a write can hold half of it.

import { Database } from "bun:sqlite";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PersistenceError } from "./errors.ts";
import { DATABASE_FILE } from "./open.ts";

/** The copy holds password hashes and player tokens, like the database itself. */
const FILE_MODE = 0o600;

/**
 * Copies DATA_DIR/algotank.sqlite to `target`. The source is opened read-only and never created
 * or migrated, so a wrong DATA_DIR fails instead of copying a new, empty database. `target` must
 * not exist yet. Throws a PersistenceError that names the file.
 */
export function backupDatabase(dataDir: string, target: string): void {
  const source = join(dataDir, DATABASE_FILE);
  if (!existsSync(source)) throw new PersistenceError(`There is no database at ${source}. Set DATA_DIR to the server's data folder.`);
  if (existsSync(target)) throw new PersistenceError(`${target} exists already. Name a new file, so no backup is overwritten.`);
  const db = new Database(source, { readonly: true, strict: true });
  try {
    const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version;
    if (version === undefined || version === 0) throw new PersistenceError(`${source} is not an AlgoTank database: it has no schema version.`);
    // VACUUM INTO refuses a file that exists (macOS's SQLite even an empty one), so the umask
    // makes the new file 0600 from its first byte, and chmod states the mode.
    const umask = process.umask(0o077);
    try {
      db.run("VACUUM INTO ?", [target]);
    } finally {
      process.umask(umask);
    }
    chmodSync(target, FILE_MODE);
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError(`The backup of ${source} to ${target} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    db.close();
  }
}
