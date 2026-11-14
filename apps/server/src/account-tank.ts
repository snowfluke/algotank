// "My tank" of each account: the name and look a signed-in player keeps, beside their
// play styles (account-strategies.ts holds the same pattern). The routes are listed in
// packages/arena/src/account-tank-protocol.ts.
//
// One JSON file per account in DATA_DIR/tanks/<account id>.json (the folder 0700, made by
// the first save), written atomically with mode 0600 like the arena files. Every file is
// read at start, and a file that cannot be read stops the start with a message that names
// it. A stored name is checked against the name rule but not the block list, so a word
// added to the list later does not stop the start; the next PUT checks it. Without
// DATA_DIR the tanks live in memory (tests).
//
// One account's tank:
// | From  | To    | Actor   | Guard                                                                        |
// |-------|-------|---------|------------------------------------------------------------------------------|
// | none  | saved | account | PUT: name passes checkTypedName, look passes parseTankLook, valid updatedAt |
// | saved | saved | account | PUT: the same, and updatedAt not older than the stored copy                 |
// There is no delete, so "saved" is terminal.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePlayerName,
  parseTankLook,
  type AccountTank,
  type AccountTankErrorCode,
  type AccountTankErrorResponse,
  type AccountTankResponse,
} from "@game/arena";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "./arena-files.ts";
import type { Auth } from "./auth/index.ts";
import { httpErrorFor, isRecord, jsonResponse, noContent, readJson } from "./http.ts";
import { checkTypedName } from "./name-filter.ts";
import type { Router } from "./router.ts";

export const TANKS_FOLDER = "tanks";
const STORED_VERSION = 1;
/** The server makes account ids with crypto.randomUUID; only that shape may name a file. */
const ACCOUNT_FILE = /^([0-9a-f-]{36})\.json$/;
const ACCOUNT_ID = /^[0-9a-f-]{36}$/;
/** A device clock may run a little fast; a time further ahead than this is a broken client. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

interface StoredFile {
  readonly version: typeof STORED_VERSION;
  readonly tank: AccountTank;
}

type Refusal = { readonly code: AccountTankErrorCode; readonly problem: string; readonly suggestion?: string };
type TankParse = { readonly ok: true; readonly value: AccountTank } | ({ readonly ok: false } & Refusal);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Checks the look and the time, which a request body and a stored file share. The caller checks the name. */
function parseLookAndTime(raw: Readonly<Record<string, unknown>>, name: string): TankParse {
  const look = parseTankLook(raw["look"]);
  if (look === null) return { ok: false, code: "look_invalid", problem: "The tank look is not valid." };
  const updatedAt = raw["updatedAt"];
  if (typeof updatedAt !== "number" || !Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
    return { ok: false, code: "tank_time_invalid", problem: "updatedAt must be a whole number of milliseconds since 1970." };
  }
  // The checked values are stored, not the raw input, so no unknown field reaches the file.
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

/** The tank of every account, in memory, with one file per account when a directory is given. */
export class AccountTanks {
  private readonly byAccount = new Map<string, AccountTank>();
  private readonly directory: string | null;

  /** `dataDirectory` is DATA_DIR, or undefined to keep everything in memory. Throws a PersistenceError that names a damaged file. */
  constructor(dataDirectory: string | undefined) {
    this.directory = dataDirectory === undefined ? null : join(dataDirectory, TANKS_FOLDER);
    if (this.directory === null || !existsSync(this.directory)) return;
    for (const name of readdirSync(this.directory).sort()) {
      if (!name.endsWith(".json")) continue; // temporary files of an interrupted write
      const match = ACCOUNT_FILE.exec(name);
      const path = join(this.directory, name);
      if (match === null) throw new PersistenceError(`The tank file ${path} is not valid: its name must be an account id.`);
      this.byAccount.set(match[1] ?? "", readFile(path));
    }
  }

  get(accountId: string): AccountTank | null {
    return this.byAccount.get(accountId) ?? null;
  }

  /** Creates or replaces the tank. The caller checked it. "Newer wins": an older copy is refused. */
  put(accountId: string, tank: AccountTank): { readonly ok: true } | { readonly ok: false; readonly code: "tank_stale" } {
    const stored = this.byAccount.get(accountId);
    if (stored !== undefined && stored.updatedAt > tank.updatedAt) return { ok: false, code: "tank_stale" };
    this.write(accountId, tank);
    this.byAccount.set(accountId, tank);
    return { ok: true };
  }

  /** Writes before memory changes, so a failed write leaves both as they were. */
  private write(accountId: string, tank: AccountTank): void {
    if (this.directory === null) return;
    // The id reaches a file path, so only the shape the server makes may pass.
    if (!ACCOUNT_ID.test(accountId)) throw new PersistenceError(`"${accountId}" is not an account id, so it cannot name a file.`);
    const name = `${accountId}.json`;
    createPrivateDirectory(this.directory);
    try {
      const file: StoredFile = { version: STORED_VERSION, tank };
      writePrivateFileAtomically(this.directory, name, JSON.stringify(file));
    } catch (error) {
      throw new PersistenceError(`The tank of account ${accountId} could not be saved to ${join(this.directory, name)}: ${describe(error)}`);
    }
  }
}

function readFile(path: string): AccountTank {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The tank file ${path} cannot be read: ${describe(error)}`);
  }
  if (!isRecord(raw) || raw["version"] !== STORED_VERSION || !isRecord(raw["tank"])) {
    throw new PersistenceError(`The tank file ${path} is not valid: it must hold version ${STORED_VERSION} and a tank.`);
  }
  const tank = raw["tank"];
  const name = parsePlayerName(tank["name"]);
  if (name === null) throw new PersistenceError(`The tank file ${path} is not valid: the name breaks the name rule.`);
  const parsed = parseLookAndTime(tank, name);
  if (!parsed.ok) throw new PersistenceError(`The tank file ${path} is not valid: ${parsed.problem}`);
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
