// One JSON file per arena in DATA_DIR/arenas/: <ARENA CODE>.json. The file holds the
// player tokens, so the directory is 0700 and each file 0600. Closing an arena or its
// expiry removes its file.
//
// Version 1 kept the files directly in DATA_DIR. Such a file stops the start with a
// message, because skipping it would drop an arena without a sign.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isArenaCode, parseStoredArena, type StoredArena } from "@game/arena";

export const ARENAS_FOLDER = "arenas";

const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const ARENA_FILE = /^(.+)\.json$/;

/** A file cannot be saved or read back. The message names the file. */
export class PersistenceError extends Error {}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates the directory with mode 0700 when it does not exist. Throws a PersistenceError
 * that names the directory. The auth files (auth/) use it too.
 */
export function createPrivateDirectory(directory: string): void {
  try {
    const existed = existsSync(directory);
    mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
    // A directory that already existed keeps its mode: it may be a path the owner shares for other uses.
    // The files inside are 0600 either way.
    if (!existed) chmodSync(directory, DIRECTORY_MODE); // mkdir applies the umask; this does not.
  } catch (error) {
    throw new PersistenceError(`The data directory ${directory} cannot be created: ${describe(error)}`);
  }
}

/**
 * Writes `<directory>/<name>` with mode 0600 atomically: a temporary file in the same
 * directory, then a rename, so a crash leaves the old file or the new one and never half
 * of one. The temporary name does not end in .json, so a loader skips it. Throws the
 * file system error; the caller names what was being saved.
 */
export function writePrivateFileAtomically(directory: string, name: string, text: string): void {
  const temporary = join(directory, `.${name}.tmp`);
  rmSync(temporary, { force: true });
  // "wx" creates the file new, so the mode applies even when a crash left an older temporary file.
  writeFileSync(temporary, text, { flag: "wx", mode: FILE_MODE });
  chmodSync(temporary, FILE_MODE); // the umask can only remove bits, but make the mode explicit
  renameSync(temporary, join(directory, name));
}

export class ArenaFiles {
  readonly directory: string;

  /** `dataDirectory` is DATA_DIR. The arena files go in its arenas/ folder. */
  constructor(dataDirectory: string) {
    createPrivateDirectory(dataDirectory);
    refuseOldLayout(dataDirectory);
    this.directory = join(dataDirectory, ARENAS_FOLDER);
    createPrivateDirectory(this.directory);
  }

  private pathOf(arenaId: string): string {
    // The id reaches a file path, so only a code the server could have made may pass.
    if (!isArenaCode(arenaId)) throw new PersistenceError(`"${arenaId}" is not an arena code, so it cannot name a file.`);
    return join(this.directory, `${arenaId}.json`);
  }

  /** Writes the whole arena atomically (see writePrivateFileAtomically). */
  write(stored: StoredArena): void {
    const path = this.pathOf(stored.arena.id);
    try {
      writePrivateFileAtomically(this.directory, `${stored.arena.id}.json`, JSON.stringify(stored));
    } catch (error) {
      throw new PersistenceError(`Arena ${stored.arena.id} could not be saved to ${path}: ${describe(error)}`);
    }
  }

  /** Removes the file of a closed or expired arena. A file that is already gone is not an error. */
  remove(arenaId: string): void {
    const path = this.pathOf(arenaId);
    try {
      rmSync(path, { force: true });
    } catch (error) {
      throw new PersistenceError(`Arena ${arenaId} could not be removed from ${path}: ${describe(error)}`);
    }
  }

  /**
   * Reads every arena file. A file that fails the check stops the read with an error
   * that names the file, because skipping it would drop an event without a sign. A file
   * of a retired kind (the single public arena of version 4) is removed with one log line.
   * Files that do not end in .json (temporary files, notes) are not arena files.
   */
  readAll(): StoredArena[] {
    const arenas: StoredArena[] = [];
    for (const name of readdirSync(this.directory).sort()) {
      const match = ARENA_FILE.exec(name);
      if (match === null) continue;
      const stored = this.readOne(join(this.directory, name), match[1] ?? "");
      if (stored !== null) arenas.push(stored);
    }
    return arenas;
  }

  /** Null for a retired file, which this removes. */
  private readOne(path: string, codeInName: string): StoredArena | null {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new PersistenceError(`The arena file ${path} cannot be read: ${describe(error)}`);
    }
    const parsed = parseStoredArena(raw);
    if (!parsed.ok && parsed.retired) {
      console.log(`Dropped the arena file ${path}: ${parsed.error}.`);
      try {
        rmSync(path, { force: true });
      } catch (error) {
        throw new PersistenceError(`The retired arena file ${path} could not be removed: ${describe(error)}`);
      }
      return null;
    }
    if (!parsed.ok) throw new PersistenceError(`The arena file ${path} is not valid: ${parsed.error}`);
    if (parsed.stored.arena.id !== codeInName || !isArenaCode(codeInName)) {
      throw new PersistenceError(`The arena file ${path} is not valid: its name must be the arena code ${parsed.stored.arena.id}.json.`);
    }
    return parsed.stored;
  }
}

/** Version 1 saved arenas as DATA_DIR/<CODE>.json. */
function refuseOldLayout(dataDirectory: string): void {
  for (const name of readdirSync(dataDirectory).sort()) {
    if (!ARENA_FILE.test(name)) continue;
    const path = join(dataDirectory, name);
    throw new PersistenceError(
      `The arena file ${path} comes from an older version of AlgoTank (version 1, with host keys), which this version cannot load. Move it out of ${dataDirectory} to start.`,
    );
  }
}
