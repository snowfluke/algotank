// Writes a copy of the server's database to a new file. Safe while the server runs.
//
//   DATA_DIR=./data bun run backup /backups/algotank-2026-11-14.sqlite
//
// DATA_DIR defaults to the server's default. The target must not exist yet; the copy is mode 0600.

import { DEFAULT_DATA_DIR } from "../src/config.ts";
import { backupDatabase } from "../src/db/backup.ts";

const target = process.argv[2];
if (target === undefined || process.argv.length !== 3) {
  console.error("Usage: bun run backup <target file>");
  process.exit(2);
}
const dataDir = process.env["DATA_DIR"] === undefined || process.env["DATA_DIR"] === "" ? DEFAULT_DATA_DIR : process.env["DATA_DIR"];

try {
  backupDatabase(dataDir, target);
  console.log(`The database of ${dataDir} is copied to ${target}.`);
} catch (error) {
  // A PersistenceError names the files and holds no secret.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
