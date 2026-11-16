/// <reference types="bun" />
// "My tank" through its public interface: the device copy, the first tank on a device,
// the name rule, and the exchange with an account in memory that keeps the server's
// rules (a stale copy refused, a blocked name answered with a suggestion). Also the
// editor's pure rules: a part's choices and how many fit a page.

import { describe, expect, test } from "bun:test";
import { parseTankLook, type AccountTank } from "@game/arena";
import type { ApiFailure, ApiResult } from "../api/client.ts";
import { PREFERENCE_KEYS } from "../app/preferences.ts";
import type { KeyValueStore } from "../session/storage.ts";
import type { TankLook } from "../tank/look.ts";
import type { Clock } from "../ui/timer.ts";
import { PUSH_MS, RETRY_FIRST_MS } from "../workshop/library.ts";
import { joinRequest } from "./joinRequest.ts";
import { MyTankStore, parseStoredMyTank, type TankAccountApi } from "./myTank.ts";
import { choose, partChoices, planGrid } from "./parts.ts";
import { followStored } from "./useNameDraft.ts";

const ACCOUNT = "0b1c2d3e-0000-4000-8000-000000000001";
const LOOK: TankLook = { colour: 2, skin: "dots", second: 7, plate: 9, icon: "cat", flag: null };
const OTHER: TankLook = { colour: 4, skin: "waves", second: 3, plate: null, icon: "star", flag: null };

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function fakeClock(start = 1_000_000) {
  let now = start;
  let timers: { at: number; run: () => void; handle: number }[] = [];
  let next = 1;
  const clock: Clock = {
    now: () => now,
    setTimeout: (run, ms) => {
      timers.push({ at: now + ms, run, handle: next });
      return next++;
    },
    clearTimeout: (handle) => {
      timers = timers.filter((t) => t.handle !== handle);
    },
  };
  return {
    clock,
    async advance(ms: number) {
      now += ms;
      const due = timers.filter((t) => t.at <= now);
      timers = timers.filter((t) => t.at > now);
      for (const t of due) t.run();
      await settle();
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

const OFFLINE: ApiFailure = { ok: false, status: 0, error: { error: "network_error" }, code: "network_error" };

/** The account side with the server's rules: newer wins, a blocked word is refused with a suggestion. */
function memoryAccount(initial: AccountTank | null = null) {
  let tank = initial;
  let offline = false;
  const puts: AccountTank[] = [];
  const api: TankAccountApi = {
    get: async () => (offline ? OFFLINE : { ok: true, data: { tank } }),
    put: async (next): Promise<ApiResult<void>> => {
      if (offline) return OFFLINE;
      puts.push(next);
      if (next.name.toLowerCase().includes("bad")) {
        return { ok: false, status: 400, error: { error: "blocked", suggestion: "Brave Otter" }, code: "name_blocked" };
      }
      if (tank !== null && tank.updatedAt > next.updatedAt) return { ok: false, status: 409, error: { error: "stale" }, code: "tank_stale" };
      tank = next;
      return { ok: true, data: undefined };
    },
  };
  return {
    api,
    puts,
    get tank() {
      return tank;
    },
    setOffline(value: boolean) {
      offline = value;
    },
  };
}

const always = (value: number) => () => value;

describe("the device copy", () => {
  test("the first visit makes up a valid look without a name, stores it, and gives the same tank on the next page", () => {
    const store = memoryStore();
    const first = new MyTankStore(store, memoryAccount().api, fakeClock().clock, always(0.3)).getSnapshot().tank;
    expect(parseTankLook(first.look)).toEqual(first.look);
    expect(first.name).toBe("");
    expect(first.updatedAt).toBe(0);
    const again = new MyTankStore(store, memoryAccount().api, fakeClock().clock, always(0.9)).getSnapshot().tank;
    expect(again).toEqual(first);
  });

  test("the name and colour an older version kept carry over into the first tank", () => {
    const store = memoryStore({ [PREFERENCE_KEYS.lastName]: "Ana", [PREFERENCE_KEYS.lastColour]: "5" });
    const tank = new MyTankStore(store, memoryAccount().api, fakeClock().clock, always(0.5)).getSnapshot().tank;
    expect(tank.name).toBe("Ana");
    expect(tank.look.colour).toBe(5);
    expect(parseTankLook(tank.look)).not.toBeNull();
  });

  test("a damaged stored tank is replaced by a new one", () => {
    expect(parseStoredMyTank("{not json")).toBeNull();
    expect(parseStoredMyTank(JSON.stringify({ version: 1, tank: { name: "A!", look: LOOK, updatedAt: 1 } }))).toBeNull();
    expect(parseStoredMyTank(JSON.stringify({ version: 1, tank: { name: "Ana", look: { ...LOOK, second: 2 }, updatedAt: 1 } }))).toBeNull();
    expect(parseStoredMyTank(JSON.stringify({ version: 1, tank: { name: "Ana", look: LOOK, updatedAt: 1 } }))?.tank.name).toBe("Ana");
  });

  test("a name must follow the rule or be empty; a refused name changes nothing", () => {
    const store = new MyTankStore(memoryStore(), memoryAccount().api, fakeClock().clock, Math.random);
    expect(store.setName("  Brave   Otter ")).toBe(true);
    expect(store.getSnapshot().tank.name).toBe("Brave Otter");
    expect(store.setName("Ab")).toBe(false);
    expect(store.setName("Ana!")).toBe(false);
    expect(store.getSnapshot().tank.name).toBe("Brave Otter");
    expect(store.setName("")).toBe(true);
    expect(store.getSnapshot().tank.name).toBe("");
  });

  test("every change is stored and counts as newer than the last", () => {
    const device = memoryStore();
    const { clock } = fakeClock();
    const store = new MyTankStore(device, memoryAccount().api, clock, Math.random);
    store.setLook(LOOK);
    const first = store.getSnapshot().tank.updatedAt;
    store.setLook(OTHER);
    expect(store.getSnapshot().tank.updatedAt).toBe(first + 1);
    expect(parseStoredMyTank(device.data.get(PREFERENCE_KEYS.myTank) ?? null)?.tank.look).toEqual(OTHER);
  });
});

describe("the account copy", () => {
  test("a newer account copy replaces the device copy, so a second device gets the tank", async () => {
    const account = memoryAccount({ name: "Ana", look: LOOK, updatedAt: 5 });
    const store = new MyTankStore(memoryStore(), account.api, fakeClock().clock, always(0.2));
    store.connect(ACCOUNT);
    await settle();
    expect(store.getSnapshot().tank).toEqual({ name: "Ana", look: LOOK, updatedAt: 5 });
    expect(store.getSnapshot().account.kind).toBe("synced");
    expect(account.puts).toEqual([]);
  });

  test("a newer device copy is sent after a change, and a nameless tank stays on the device", async () => {
    const account = memoryAccount();
    const time = fakeClock();
    const store = new MyTankStore(memoryStore(), account.api, time.clock, always(0.2));
    store.connect(ACCOUNT);
    await settle();
    expect(account.puts).toEqual([]);
    store.setName("Ana");
    store.setLook(LOOK);
    await time.advance(PUSH_MS);
    expect(account.tank?.name).toBe("Ana");
    expect(account.tank?.look).toEqual(LOOK);
  });

  test("a blocked name is replaced by the game's suggestion and the refused name is reported", async () => {
    const account = memoryAccount();
    const time = fakeClock();
    const store = new MyTankStore(memoryStore(), account.api, time.clock, always(0.2));
    store.connect(ACCOUNT);
    store.setName("Bad Word");
    await time.advance(PUSH_MS);
    expect(store.getSnapshot().tank.name).toBe("Brave Otter");
    expect(store.getSnapshot().blockedName).toBe("Bad Word");
    expect(account.tank?.name).toBe("Brave Otter");
  });

  test("an unreachable account is retried, and the device copy keeps working", async () => {
    const account = memoryAccount();
    account.setOffline(true);
    const time = fakeClock();
    const store = new MyTankStore(memoryStore(), account.api, time.clock, always(0.2));
    store.setName("Ana");
    store.connect(ACCOUNT);
    await settle();
    expect(store.getSnapshot().account).toEqual({ kind: "behind", offline: true });
    account.setOffline(false);
    await time.advance(RETRY_FIRST_MS);
    expect(store.getSnapshot().account.kind).toBe("synced");
    expect(account.tank?.name).toBe("Ana");
  });

  test("signing out leaves the device copy alone", () => {
    const store = new MyTankStore(memoryStore(), memoryAccount().api, fakeClock().clock, always(0.2));
    store.connect(ACCOUNT);
    store.connect(null);
    expect(store.getSnapshot().account.kind).toBe("deviceOnly");
  });
});

describe("the editor's rules", () => {
  test("the pattern colour cannot be the hull colour, and a new hull colour keeps the look valid", () => {
    expect(choose(LOOK, { part: "second", value: LOOK.colour })).toBeNull();
    expect(choose(LOOK, { part: "colour", value: LOOK.second })).toEqual({ ...LOOK, colour: 7, second: 2 });
    expect(partChoices("icon")[0]).toEqual({ part: "icon", value: null });
    expect(partChoices("plate")).toHaveLength(13);
    expect(partChoices("icon")).toHaveLength(25);
  });

  test("all choices fit when there is room, at the largest size that fits", () => {
    const plan = planGrid({ width: 328, height: 400 }, 12);
    expect(plan.pages).toBe(1);
    expect(plan.cell).toBeLessThanOrEqual(80);
    expect(Math.ceil(12 / plan.columns) * (plan.cell + 8) - 8).toBeLessThanOrEqual(400);
  });

  test("when they do not fit, choices are paged in whole rows at no less than 48 px", () => {
    const plan = planGrid({ width: 328, height: 200 }, 25);
    expect(plan.pages).toBeGreaterThan(1);
    expect(plan.cell).toBeGreaterThanOrEqual(48);
    expect(plan.perPage % plan.columns).toBe(0);
    expect(plan.perPage * plan.pages).toBeGreaterThanOrEqual(25);
  });

  test("a box too short for a row and the controls under it gets one row with Previous and Next beside it", () => {
    const plan = planGrid({ width: 328, height: 70 }, 12);
    expect(plan.controls).toBe("beside");
    expect(plan.perPage).toBe(plan.columns);
    expect(plan.cell).toBeGreaterThanOrEqual(48);
    expect(plan.columns * plan.cell + (plan.columns - 1) * 8 + 2 * (44 + 8)).toBeLessThanOrEqual(328);
    expect(planGrid({ width: 328, height: 400 }, 12).controls).toBe("below");
  });

  test("a join sends the typed name, or none so the game gives one", () => {
    expect(joinRequest(" Ana ", LOOK)).toEqual({ name: "Ana", look: LOOK });
    expect(joinRequest("", LOOK)).toEqual({ look: LOOK });
  });
});

describe("the name field", () => {
  test("follows a stored name that changes elsewhere, unless the player typed over it", () => {
    const empty = { value: "", base: "" };
    // The account's copy arrives on a second device: the empty field takes its name.
    expect(followStored(empty, "Ana")).toEqual({ value: "Ana", base: "Ana" });
    // The account replaced a blocked name: the field shows the suggestion.
    expect(followStored({ value: "Ana", base: "Ana" }, "Brave Otter")).toEqual({ value: "Brave Otter", base: "Brave Otter" });
    // The player is typing: the store kept the trimmed form, the field keeps the typing.
    expect(followStored({ value: "Ana ", base: "Ana" }, "Ana B")).toEqual({ value: "Ana ", base: "Ana B" });
    const same = { value: "Ab", base: "Ana" };
    expect(followStored(same, "Ana")).toBe(same);
  });
});
