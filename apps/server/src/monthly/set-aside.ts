// Old data of the monthly room (before the league, docs/specs/revamp/77-monthly-league.md, section 5):
// stored arenas of the kind "monthly" in DATA_DIR/arenas/ and the month files DATA_DIR/league/YYYY-MM.json.
// The first start moves them into DATA_DIR/set-aside/<YYYY-MM-DD>/ with one log line each and goes
// on; it never stops for them. It runs before the Store reads the arenas, because the arena
// package no longer knows the kind "monthly" and would refuse such a file. The champions file
// (DATA_DIR/league/champions.json) stays where it is: the league adds to it.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { ARENAS_FOLDER } from "../arena-files.ts";
import { isRecord } from "../http.ts";
import { LEAGUE_FOLDER } from "./champions.ts";

const SET_ASIDE_FOLDER = "set-aside";
const OLD_MONTH_FILE = /^\d{4}-\d{2}\.json$/;
const JSON_FILE = /\.json$/;

/** True for the raw JSON of a stored arena of the old monthly kind. Only the kind is read. */
function isOldMonthlyArena(path: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // A damaged file is the Store's to report, with its name.
    return false;
  }
  const arena = isRecord(raw) ? raw["arena"] : undefined;
  const settings = isRecord(arena) ? arena["settings"] : undefined;
  return isRecord(settings) && settings["kind"] === "monthly";
}

/** Moves the old monthly data aside. Returns the paths it moved, for the tests and the log. */
export function setAsideOldMonthlyData(dataDir: string, now: number): readonly string[] {
  const target = join(dataDir, SET_ASIDE_FOLDER, new Date(now).toISOString().slice(0, 10));
  const moved: string[] = [];
  const move = (folder: string, name: string): void => {
    const from = join(dataDir, folder, name);
    const toFolder = join(target, folder);
    try {
      mkdirSync(toFolder, { recursive: true, mode: 0o700 });
      let to = join(toFolder, name);
      for (let n = 2; existsSync(to); n++) to = join(toFolder, `${n}-${name}`);
      renameSync(from, to);
      moved.push(from);
      console.log(`Set aside the old monthly file ${from} in ${to}.`);
    } catch (error) {
      console.error(`The old monthly file ${from} could not be set aside:`, error);
    }
  };
  const arenas = join(dataDir, ARENAS_FOLDER);
  if (existsSync(arenas)) {
    for (const name of readdirSync(arenas)) if (JSON_FILE.test(name) && isOldMonthlyArena(join(arenas, name))) move(ARENAS_FOLDER, name);
  }
  const league = join(dataDir, LEAGUE_FOLDER);
  if (existsSync(league)) {
    for (const name of readdirSync(league)) if (OLD_MONTH_FILE.test(name)) move(LEAGUE_FOLDER, name);
  }
  return moved;
}
