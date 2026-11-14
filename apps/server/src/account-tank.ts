// "My tank" of each account: the name and look a signed-in player keeps, beside their
// play styles (account-strategies.ts holds the same pattern). The routes are listed in
// packages/arena/src/account-tank-protocol.ts.
//
// One row per account in the table `account_tank` (db/schema.ts), read on each call. A stored
// name is checked against the name rule but not the block list, so a word added to the list
// later does not hide a saved tank; the next PUT checks it.
//
// One account's tank:
// | From  | To    | Actor   | Guard                                                                        |
// |-------|-------|---------|------------------------------------------------------------------------------|
// | none  | saved | account | PUT: name passes checkTypedName, look passes parseTankLook, valid updatedAt |
// | saved | saved | account | PUT: the same, and updatedAt not older than the stored copy                 |
// There is no delete, so "saved" is terminal.

import type { Database, Statement } from "bun:sqlite";
import {
  parsePlayerName,
  parseTankLook,
  type AccountTank,
  type AccountTankErrorCode,
  type AccountTankErrorResponse,
  type AccountTankResponse,
} from "@game/arena";
import { PersistenceError } from "./db/errors.ts";
import type { Auth } from "./auth/index.ts";
import { httpErrorFor, isRecord, jsonResponse, noContent, readJson } from "./http.ts";
import { checkTypedName } from "./name-filter.ts";
import type { Router } from "./router.ts";

/** A device clock may run a little fast; a time further ahead than this is a broken client. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

interface TankRow {
  readonly name: string;
  readonly colour: number;
  readonly skin: string;
  readonly second: number;
  readonly plate: number | null;
  readonly icon: string | null;
  readonly updated_at: number;
}

type Refusal = { readonly code: AccountTankErrorCode; readonly problem: string; readonly suggestion?: string };
type TankParse = { readonly ok: true; readonly value: AccountTank } | ({ readonly ok: false } & Refusal);

/** Checks the look and the time, which a request body and a stored row share. The caller checks the name. */
function parseLookAndTime(raw: Readonly<Record<string, unknown>>, name: string): TankParse {
  const look = parseTankLook(raw["look"]);
  if (look === null) return { ok: false, code: "look_invalid", problem: "The tank look is not valid." };
  const updatedAt = raw["updatedAt"];
  if (typeof updatedAt !== "number" || !Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
    return { ok: false, code: "tank_time_invalid", problem: "updatedAt must be a whole number of milliseconds since 1970." };
  }
  // The checked values are stored, not the raw input, so no unknown field reaches the database.
  return { ok: true, value: { name, look, updatedAt } };
}

/** A request body: the name rule and the block list, then the look and the time. */
function parseAccountTankRequest(raw: unknown): TankParse {
  if (!isRecord(raw)) return { ok: false, code: "name_invalid", problem: "Send the name, the look and updatedAt." };
  // An account has no arena, so no name is taken for the suggestion.
  const checked = checkTypedName(raw["name"], []);
  if (!checked.ok) {
    return checked.code === "name_blocked"
      ? { ok: false, code: "name_blocked", problem: "That name has a word we do not use in this game.", suggestion: checked.suggestion }
      : { ok: false, code: "name_invalid", problem: httpErrorFor("name_invalid").message };
  }
  return parseLookAndTime(raw, checked.name);
}

/** The tank of every account. */
export class AccountTanks {
  private readonly select: Statement<TankRow, [string]>;
  private readonly upsert: Statement<unknown, [string, string, number, string, number, number | null, string | null, number]>;

  constructor(private readonly db: Database) {
    const columns = "name, colour, skin, second, plate, icon, updated_at";
    this.select = db.prepare(`SELECT ${columns} FROM account_tank WHERE account_id = ?`);
    this.upsert = db.prepare(
      `INSERT INTO account_tank (account_id, ${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id) DO UPDATE SET name = excluded.name, colour = excluded.colour, skin = excluded.skin,
         second = excluded.second, plate = excluded.plate, icon = excluded.icon, updated_at = excluded.updated_at`,
    );
  }

  /** Throws a PersistenceError that names the account when the stored row is damaged. */
  get(accountId: string): AccountTank | null {
    const row = this.select.get(accountId);
    return row === null ? null : toTank(accountId, row);
  }

  /** Creates or replaces the tank. The caller checked it. "Newer wins": an older copy is refused. */
  put(accountId: string, tank: AccountTank): { readonly ok: true } | { readonly ok: false; readonly code: "tank_stale" } {
    return this.db.transaction(() => {
      const stored = this.get(accountId);
      if (stored !== null && stored.updatedAt > tank.updatedAt) return { ok: false, code: "tank_stale" } as const;
      const { look } = tank;
      this.upsert.run(accountId, tank.name, look.colour, look.skin, look.second, look.plate, look.icon, tank.updatedAt);
      return { ok: true } as const;
    }).immediate();
  }
}

function toTank(accountId: string, row: TankRow): AccountTank {
  const invalid = (reason: string) => new PersistenceError(`The row ${accountId} of the table account_tank is not valid: ${reason}`);
  const name = parsePlayerName(row.name);
  if (name === null) throw invalid("the name breaks the name rule.");
  const look = { colour: row.colour, skin: row.skin, second: row.second, plate: row.plate, icon: row.icon };
  const parsed = parseLookAndTime({ look, updatedAt: row.updated_at }, name);
  if (!parsed.ok) throw invalid(parsed.problem);
  return parsed.value;
}

function refuse(status: number, refusal: Refusal): Response {
  const body: AccountTankErrorResponse = {
    error: refusal.problem,
    code: refusal.code,
    ...(refusal.suggestion === undefined ? {} : { suggestion: refusal.suggestion }),
  };
  return jsonResponse(body, status);
}

export interface AccountTankRouteDeps {
  readonly auth: Auth;
  readonly tanks: AccountTanks;
  /** The server's clock, for the check that updatedAt is not far in the future. */
  readonly now: () => number;
}

export function registerAccountTankRoutes(router: Router, { auth, tanks, now }: AccountTankRouteDeps): void {
  router.add("GET", "/api/account/tank", (ctx) => {
    const account = auth.requireAccount(ctx.req);
    const response: AccountTankResponse = { tank: tanks.get(account.id) };
    return jsonResponse(response);
  });

  router.add("PUT", "/api/account/tank", async (ctx) => {
    const account = auth.requireAccount(ctx.req);
    const parsed = parseAccountTankRequest(await readJson(ctx.req));
    if (!parsed.ok) return refuse(400, parsed);
    if (parsed.value.updatedAt > now() + FUTURE_SLACK_MS) {
      return refuse(400, { code: "tank_time_invalid", problem: "updatedAt is too far in the future." });
    }
    const result = tanks.put(account.id, parsed.value);
    if (!result.ok) return refuse(409, { code: "tank_stale", problem: "The account holds a newer copy of this tank." });
    return noContent();
  });
}
