// The list of recent tournament winners: the last 50 tournaments that a person won (name,
// look, date, number of tanks). A tournament that a bot wins records nothing.
//
// Stored in DATA_DIR/public/tournament-winners.json, written atomically (0600 in a 0700
// folder), file first, then memory. A damaged file stops the start with its name. The file
// also remembers the last settled games, so a restart in the finished phase does not add a
// winner twice. Without DATA_DIR the list lives in memory (tests).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlayerName, parseTankLook, type ArenaId, type TournamentWinner } from "@game/arena";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "./arena-files.ts";
import { isRecord } from "./http.ts";

const PUBLIC_FOLDER = "public";
const WINNERS_FILE = "tournament-winners.json";
export const WINNERS_KEPT = 50;
const STORED_VERSION = 1;
const SETTLED_MEMORY = 10;

interface WinnersFile {
  readonly version: typeof STORED_VERSION;
  readonly settledGames: readonly string[];
  /** Newest first. */
  readonly winners: readonly TournamentWinner[];
}

export class TournamentWinners {
  private readonly directory: string | null;
  private file: WinnersFile = { version: STORED_VERSION, settledGames: [], winners: [] };

  /** Throws a PersistenceError that names a damaged file. */
  constructor(dataDir: string | undefined) {
    this.directory = dataDir === undefined ? null : join(dataDir, PUBLIC_FOLDER);
    if (this.directory === null) return;
    const path = join(this.directory, WINNERS_FILE);
    if (existsSync(path)) this.file = readWinnersFile(path);
  }

  /** Newest first. */
  recent(count: number): readonly TournamentWinner[] {
    return this.file.winners.slice(0, count);
  }

  /** Adds the winner of one tournament, once per game. Throws when the save fails. */
  record(game: { readonly arenaId: ArenaId; readonly game: number }, winner: TournamentWinner): void {
    const key = `${game.arenaId}#${game.game}`;
    if (this.file.settledGames.includes(key)) return;
    const next: WinnersFile = {
      version: STORED_VERSION,
      settledGames: [...this.file.settledGames, key].slice(-SETTLED_MEMORY),
      winners: [winner, ...this.file.winners].slice(0, WINNERS_KEPT),
    };
    if (this.directory !== null) {
      createPrivateDirectory(this.directory);
      try {
        writePrivateFileAtomically(this.directory, WINNERS_FILE, JSON.stringify(next));
      } catch (error) {
        throw new PersistenceError(`The tournament winners could not be saved to ${join(this.directory, WINNERS_FILE)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.file = next;
  }
}

function readWinnersFile(path: string): WinnersFile {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The tournament winners file ${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const invalid = (what: string) => new PersistenceError(`The tournament winners file ${path} is not valid: ${what}.`);
  if (!isRecord(raw) || raw["version"] !== STORED_VERSION) throw invalid(`it must hold version ${STORED_VERSION}`);
  const { settledGames, winners } = raw;
  if (!Array.isArray(settledGames) || !settledGames.every((k) => typeof k === "string")) throw invalid("settledGames must be a list of text");
  if (!Array.isArray(winners) || winners.length > WINNERS_KEPT) throw invalid(`winners must be a list of at most ${WINNERS_KEPT}`);
  const read = winners.map((w: unknown, i): TournamentWinner => {
    if (!isRecord(w)) throw invalid(`winners[${i}] must be an object`);
    const name = parsePlayerName(w["name"]);
    const look = parseTankLook(w["look"]);
    const { wonAt, tanks } = w;
    if (name === null || look === null) throw invalid(`winners[${i}] must have a valid name and look`);
    if (typeof wonAt !== "string" || Number.isNaN(Date.parse(wonAt))) throw invalid(`winners[${i}].wonAt must be an ISO time`);
    if (typeof tanks !== "number" || !Number.isSafeInteger(tanks) || tanks < 2) throw invalid(`winners[${i}].tanks must be a whole number of at least 2`);
    return { name, look, wonAt, tanks };
  });
  return { version: STORED_VERSION, settledGames: settledGames as string[], winners: read };
}
