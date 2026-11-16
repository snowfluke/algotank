// The game master accounts of the monthly league (owner, 2026-11-17): the organizer's own tank
// plays in a league as its hardest opponent, under a "GM" badge, and takes no place: no day place,
// no day record, no month rank, no move between leagues and no championship. The admin page sets
// it (PUT /api/admin/players/:seatId/gm). The table `league_game_master` holds one row per account.

import type { Database, Statement } from "bun:sqlite";
import type { AccountId } from "@game/arena";

export class GameMasters {
  private readonly selectAll: Statement;
  private readonly insert: Statement;
  private readonly remove: Statement;

  constructor(db: Database) {
    this.selectAll = db.prepare("SELECT account_id FROM league_game_master");
    this.insert = db.prepare("INSERT INTO league_game_master (account_id) VALUES (?) ON CONFLICT (account_id) DO NOTHING");
    this.remove = db.prepare("DELETE FROM league_game_master WHERE account_id = ?");
  }

  read(): ReadonlySet<AccountId> {
    return new Set((this.selectAll.all() as { account_id: string }[]).map((row) => row.account_id));
  }

  set(accountId: AccountId, gameMaster: boolean): void {
    if (gameMaster) this.insert.run(accountId);
    else this.remove.run(accountId);
  }
}
