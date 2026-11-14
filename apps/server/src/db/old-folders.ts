// The JSON folders of earlier versions. Their data is not read and not imported (83-sqlite.md:
// the game was never deployed), so the start says so once and leaves them untouched.

import { existsSync } from "node:fs";
import { join } from "node:path";

/** The folders of the stores that moved into the database, and set-aside/ of the monthly room before the league. */
const OLD_JSON_FOLDERS: readonly string[] = ["auth", "tanks", "strategies", "stats", "arenas", "chat", "results", "public", "league", "monthly", "metrics", "set-aside"];

/** Logs one line when `dataDir` holds a folder of an earlier version. */
export function reportOldJsonFolders(dataDir: string): void {
  const found = OLD_JSON_FOLDERS.filter((name) => existsSync(join(dataDir, name)));
  if (found.length === 0) return;
  console.log(`${dataDir} holds ${found.map((name) => `${name}/`).join(", ")} from an earlier version of AlgoTank. The server does not read them and leaves them as they are.`);
}
