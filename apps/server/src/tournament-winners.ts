// The list of recent tournament winners: the last 50 tournaments that a person won (name,
// look, date, number of tanks). A tournament that a bot wins records nothing.
//
// The table `tournament_winner` (db/schema.ts), read on each call. A game adds its winner once:
// the UNIQUE arena and game make a second record of it do nothing, which covers a restart in the
// finished phase. Rows beyond the newest WINNERS_KEPT are removed in the same transaction.

import type { Database, Statement } from "bun:sqlite";
import { parsePlayerName, parseTankLook, type ArenaId, type TournamentWinner } from "@game/arena";
import { invalidRow, jsonColumn } from "./db/rows.ts";

export const WINNERS_KEPT = 50;

interface WinnerRow {
  readonly sequence: number;
  readonly name: string;
  readonly look_json: string;
  readonly won_at: number;
  readonly tanks: number;
}

export class TournamentWinners {
  private readonly selectRecent: Statement<WinnerRow, [number]>;
  private readonly insertWinner: Statement<unknown, [string, number, string, string, number, number]>;
  private readonly trim: Statement<unknown, [number]>;

  constructor(private readonly db: Database) {
    this.selectRecent = db.prepare("SELECT sequence, name, look_json, won_at, tanks FROM tournament_winner ORDER BY sequence DESC LIMIT ?");
    this.insertWinner = db.prepare(
      "INSERT INTO tournament_winner (arena_id, game, name, look_json, won_at, tanks) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (arena_id, game) DO NOTHING",
    );
    this.trim = db.prepare("DELETE FROM tournament_winner WHERE sequence NOT IN (SELECT sequence FROM tournament_winner ORDER BY sequence DESC LIMIT ?)");
  }

  /** Newest first. Throws a PersistenceError that names a damaged row. */
  recent(count: number): readonly TournamentWinner[] {
    return this.selectRecent.all(count).map(toWinner);
  }

  /** Adds the winner of one tournament, once per game. Throws when the save fails. */
  record(game: { readonly arenaId: ArenaId; readonly game: number }, winner: TournamentWinner): void {
    this.db.transaction(() => {
      this.insertWinner.run(game.arenaId, game.game, winner.name, JSON.stringify(winner.look), Date.parse(winner.wonAt), winner.tanks);
      this.trim.run(WINNERS_KEPT);
    }).immediate();
  }
}

function toWinner(row: WinnerRow): TournamentWinner {
  const key = String(row.sequence);
  const invalid = (what: string) => invalidRow("tournament_winner", key, `${what}.`);
  const name = parsePlayerName(row.name);
  if (name === null) throw invalid("the name does not follow the name rule");
  const look = parseTankLook(jsonColumn("tournament_winner", key, "look_json", row.look_json));
  if (look === null) throw invalid("look_json is not a tank look");
  const wonAt = new Date(row.won_at);
  if (Number.isNaN(wonAt.getTime())) throw invalid("won_at is not a time");
  return { name, look, wonAt: wonAt.toISOString(), tanks: row.tanks };
}
