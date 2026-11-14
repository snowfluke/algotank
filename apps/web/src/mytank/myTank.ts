// "My tank": the player's name and look, kept on this device with the other preferences
// (app/preferences.ts) and, for a signed-in player, in the account (the routes in
// packages/arena/src/account-tank-protocol.ts). The device copy is the working copy:
// every change is written there first and the account follows, as for the play styles
// (workshop/library.ts). The merge rule is the same: the newer copy wins.
//
// The record:
// | From  | To    | Actor  | Guard                                                         |
// |-------|-------|--------|---------------------------------------------------------------|
// | none  | first | page   | first read on a device: a random look, the last join's colour |
// |       |       |        | and name when an older version stored them; updatedAt 0, so   |
// |       |       |        | any account copy wins                                         |
// | any   | any   | player | setLook (parseTankLook), setName ("" or parsePlayerName)      |
// | any   | any   | page   | a join gave the stored name; the account's copy is newer;     |
// |       |       |        | the account refused a blocked name (the suggestion replaces   |
// |       |       |        | it and `blockedName` says so)                                 |
// There is no terminal state: a player always has a tank.
//
// Account sync (one exchange: read the account copy, then send the device copy when it is newer):
// | From       | Event                             | To                                |
// |------------|-----------------------------------|-----------------------------------|
// | deviceOnly | connect(account)                  | syncing                           |
// | syncing    | the exchange succeeded            | synced                            |
// | syncing    | a request failed                  | behind (retry after a delay)      |
// | behind     | delay ends, or online again       | syncing                           |
// | synced     | a local change                    | syncing (after PUSH_MS)           |
// | any        | connect(null), 401                | deviceOnly                        |
// A tank without a name stays on the device: the account keeps only a named tank.

import { parsePlayerName, parseTankLook, type AccountTank, type AccountTankResponse } from "@game/arena";
import type { ApiResult } from "../api/client.ts";
import { PREFERENCE_KEYS, readPreference, writePreference } from "../app/preferences.ts";
import type { KeyValueStore } from "../session/storage.ts";
import { toTankColour } from "../tank/colours.ts";
import { randomLook, withColour, type Random, type TankLook } from "../tank/look.ts";
import type { Clock } from "../ui/timer.ts";
import { PUSH_MS, RETRY_FIRST_MS, RETRY_MAX_MS } from "../workshop/library.ts";

export interface MyTank {
  /** "" until the player types one or a join gives one; otherwise the result of parsePlayerName. */
  readonly name: string;
  readonly look: TankLook;
  /** Milliseconds since 1970 of the last change on any device; 0 for a tank the device made up. */
  readonly updatedAt: number;
}

/** The stored form under PREFERENCE_KEYS.myTank. */
export interface StoredMyTank {
  readonly version: 1;
  readonly tank: MyTank;
}

export interface TankAccountApi {
  get(): Promise<ApiResult<AccountTankResponse>>;
  put(tank: AccountTank): Promise<ApiResult<void>>;
}

export type TankAccountCopy =
  | { readonly kind: "deviceOnly" }
  | { readonly kind: "syncing" }
  | { readonly kind: "synced" }
  /** A request failed; the store tries again by itself. */
  | { readonly kind: "behind"; readonly offline: boolean };

export interface MyTankSnapshot {
  readonly tank: MyTank;
  readonly account: TankAccountCopy;
  /** The name the account refused, after the store put the game's suggestion in its place; null otherwise. */
  readonly blockedName: string | null;
  /** False when the browser blocks storage: the tank lasts for this visit only. */
  readonly persistent: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The stored tank, or null when there is none or it cannot be read (a new one is made then). */
export function parseStoredMyTank(raw: string | null): StoredMyTank | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value["version"] !== 1 || !isRecord(value["tank"])) return null;
  const { name, look, updatedAt } = value["tank"];
  const parsedLook = parseTankLook(look);
  if (typeof name !== "string" || (name !== "" && parsePlayerName(name) !== name) || parsedLook === null) return null;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
  return { version: 1, tank: { name, look: parsedLook, updatedAt } };
}

/** The first tank on a device. An older version kept the last join's name and colour; they carry over. */
function firstTank(lastName: string | null, lastColour: string | null, random: Random): MyTank {
  const look = randomLook(random);
  const colour = lastColour === null ? null : toTankColour(Number(lastColour));
  const kept = colour === null ? look : { ...withColour(look, colour), plate: look.plate === colour ? look.colour : look.plate };
  return { name: parsePlayerName(lastName) ?? "", look: kept, updatedAt: 0 };
}

export class MyTankStore {
  private snapshot: MyTankSnapshot;
  private readonly listeners = new Set<() => void>();
  private accountId: string | null = null;
  private timer: unknown = null;
  private running = false;
  private again = false;
  private failures = 0;

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly api: TankAccountApi,
    private readonly clock: Clock,
    random: Random,
  ) {
    const stored = parseStoredMyTank(readPreference(store, PREFERENCE_KEYS.myTank));
    const tank = stored?.tank ?? firstTank(readPreference(store, PREFERENCE_KEYS.lastName), readPreference(store, PREFERENCE_KEYS.lastColour), random);
    this.snapshot = { tank, account: { kind: "deviceOnly" }, blockedName: null, persistent: store !== null };
    // A tank made up on the first visit is stored at once, so the next page shows the same one.
    if (stored === null) this.write();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): MyTankSnapshot => this.snapshot;

  setLook(look: TankLook): void {
    this.change({ ...this.snapshot.tank, look });
  }

  /** "" clears the name; anything else must pass parsePlayerName. False when it does not, and nothing changes. */
  setName(raw: string): boolean {
    const name = raw.trim() === "" ? "" : parsePlayerName(raw);
    if (name === null) return false;
    if (name !== this.snapshot.tank.name) this.change({ ...this.snapshot.tank, name }, null);
    return true;
  }

  /** The signed-in account, or null when signed out. A new account starts an exchange. */
  connect(accountId: string | null): void {
    if (accountId === this.accountId) return;
    this.accountId = accountId;
    this.cancelTimer();
    this.failures = 0;
    if (accountId === null) {
      this.set({ account: { kind: "deviceOnly" } });
      return;
    }
    void this.run();
  }

  /** The connection is back: a sync that is behind tries at once. */
  readonly online = (): void => {
    if (this.snapshot.account.kind !== "behind") return;
    this.cancelTimer();
    void this.run();
  };

  /** Another tab changed the stored tank. */
  readonly reload = (): void => {
    this.set({ tank: this.read() });
  };

  // --- device ----------------------------------------------------------------

  /** A player's change: stored, and sent to the account after PUSH_MS. */
  private change(next: Omit<MyTank, "updatedAt">, blockedName: string | null = this.snapshot.blockedName): void {
    this.replace(next, blockedName);
    if (this.accountId !== null) this.schedule(PUSH_MS);
  }

  private replace(next: Omit<MyTank, "updatedAt">, blockedName: string | null): void {
    // One more than the last time at least, so a fast second edit still counts as newer.
    const tank: MyTank = { ...next, updatedAt: Math.max(this.clock.now(), this.snapshot.tank.updatedAt + 1) };
    this.set({ tank, blockedName });
    this.write();
  }

  /** The stored tank, or the one in memory when the store holds none that can be read (another tab cleared it). */
  private read(): MyTank {
    return parseStoredMyTank(readPreference(this.store, PREFERENCE_KEYS.myTank))?.tank ?? this.snapshot.tank;
  }

  private write(): void {
    const stored: StoredMyTank = { version: 1, tank: this.snapshot.tank };
    if (!writePreference(this.store, PREFERENCE_KEYS.myTank, JSON.stringify(stored)) && this.snapshot.persistent) this.set({ persistent: false });
  }

  private set(next: Partial<MyTankSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  // --- account ---------------------------------------------------------------

  private cancelTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  /** One exchange at a time; a change while one runs starts another after it. */
  private async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    const accountId = this.accountId;
    if (accountId === null) return;
    this.running = true;
    this.set({ account: { kind: "syncing" } });
    const outcome = await this.exchange(accountId);
    this.running = false;
    if (this.accountId !== accountId || outcome === "stopped") {
      if (this.again) {
        this.again = false;
        void this.run();
      }
      return;
    }
    if (outcome === "signedOut") {
      this.accountId = null;
      this.set({ account: { kind: "deviceOnly" } });
      return;
    }
    if (typeof outcome === "object") {
      const delay = Math.min(RETRY_FIRST_MS * 2 ** this.failures, RETRY_MAX_MS);
      this.failures += 1;
      this.set({ account: { kind: "behind", offline: outcome.offline } });
      this.schedule(delay);
      return;
    }
    this.failures = 0;
    if (this.again || outcome === "again") {
      this.again = false;
      void this.run();
      return;
    }
    this.set({ account: { kind: "synced" } });
  }

  private async exchange(accountId: string): Promise<Outcome> {
    const got = await this.api.get();
    if (this.accountId !== accountId) return "stopped";
    if (!got.ok) return failed(got);
    const remote = got.data.tank;
    const local = this.snapshot.tank;
    if (remote !== null && remote.updatedAt >= local.updatedAt) {
      if (remote.updatedAt > local.updatedAt || remote.name !== local.name) {
        this.set({ tank: { name: remote.name, look: remote.look, updatedAt: remote.updatedAt } });
        this.write();
      }
      return "done";
    }
    const name = parsePlayerName(local.name);
    if (name === null) return "done";
    const put = await this.api.put({ name, look: local.look, updatedAt: local.updatedAt });
    if (this.accountId !== accountId) return "stopped";
    if (put.ok) return "done";
    // The account got a newer copy meanwhile: read it again.
    if (put.code === "tank_stale") return "again";
    const suggestion = put.error.suggestion;
    if (put.code === "name_blocked" && suggestion !== undefined && parsePlayerName(suggestion) !== null) {
      // The exchange that follows sends the suggestion, so no push is scheduled for it.
      this.replace({ ...local, name: suggestion }, local.name);
      return "again";
    }
    return failed(put);
  }
}

type Outcome = "done" | "again" | "stopped" | "signedOut" | { readonly offline: boolean };

function failed(result: Extract<ApiResult<unknown>, { ok: false }>): Outcome {
  if (result.status === 401 || result.code === "not_signed_in") return "signedOut";
  return { offline: result.status === 0 };
}
