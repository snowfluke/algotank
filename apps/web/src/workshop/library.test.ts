/// <reference types="bun" />
// The library through its public interface: the device copy, and the merge with the
// account (each case of the table in merge.ts) against an account in memory that keeps
// the server's rules (20 per account, a stale copy refused), with a clock the test moves.

import { describe, expect, spyOn, test } from "bun:test";
import { ACCOUNT_STRATEGY_LIMITS, type AccountStrategy } from "@game/arena";
import { DEFAULT_PRESET_ID, parseStrategy, PRESETS } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import type { ApiFailure, ApiResult } from "../api/client.ts";
import type { KeyValueStore } from "../session/storage.ts";
import type { Clock } from "../ui/timer.ts";
import { newStyleDraft, saveNewStyle } from "./creation.ts";
import { DAMAGED_KEY, LIBRARY_KEY, PlayStyleLibrary, PUSH_MS, RETRY_FIRST_MS, type AccountApi } from "./library.ts";

const evader = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.strategy as StrategyInput;
const other = PRESETS.find((p) => p.id !== DEFAULT_PRESET_ID)!.strategy as StrategyInput;
const broken: StrategyInput = { ...evader, modes: [{ ...evader.modes[0]!, name: "" }] };
const ACCOUNT = "0b1c2d3e-0000-4000-8000-000000000001";

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

/** Lets the library's chain of awaited requests finish. */
const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

const OFFLINE: ApiFailure = { ok: false, status: 0, error: { error: "network_error" }, code: "network_error" };

/** The account side with the server's rules, and a switch to make it unreachable. */
function memoryAccount(initial: AccountStrategy[] = []) {
  const styles = new Map(initial.map((s) => [s.id, s]));
  let offline = false;
  const api: AccountApi = {
    list: async () => (offline ? OFFLINE : { ok: true, data: { strategies: [...styles.values()] } }),
    put: async (style): Promise<ApiResult<void>> => {
      if (offline) return OFFLINE;
      const stored = styles.get(style.id);
      if (stored === undefined && styles.size >= ACCOUNT_STRATEGY_LIMITS.perAccount) return { ok: false, status: 409, error: { error: "full" }, code: "strategy_limit" };
      if (stored !== undefined && stored.updatedAt > style.updatedAt) return { ok: false, status: 409, error: { error: "stale" }, code: "strategy_stale" };
      styles.set(style.id, style);
      return { ok: true, data: undefined };
    },
    remove: async (id) => {
      if (offline) return OFFLINE;
      styles.delete(id);
      return { ok: true, data: undefined };
    },
  };
  return {
    api,
    styles,
    setOffline: (value: boolean) => {
      offline = value;
    },
    names: () => [...styles.values()].map((s) => s.name).sort(),
  };
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

let ids = 0;
function setUp(account = memoryAccount(), store: KeyValueStore | null = memoryStore()) {
  const time = fakeClock();
  const library = new PlayStyleLibrary(store, account.api, time.clock, () => `style-id-${String(++ids).padStart(4, "0")}`);
  const names = () => library.getSnapshot().styles.map((s) => s.name).sort();
  return { library, account, time, names, store };
}

/** Signs in and lets the merge finish. */
async function signIn(s: ReturnType<typeof setUp>, accountId = ACCOUNT) {
  s.library.connect(accountId);
  await settle();
}

const style = (id: string, name: string, updatedAt: number, strategy = evader): AccountStrategy => ({ id, name, strategy, updatedAt });

describe("the device copy", () => {
  test("create checks the name and the limit of 20, and a play style is newest first after an edit", () => {
    const { library, names } = setUp();
    expect(library.create("  ", evader)).toEqual({ ok: false, problem: "name" });
    expect(library.create("x".repeat(25), evader)).toEqual({ ok: false, problem: "name" });
    const first = library.create("Sneaky", evader);
    expect(first.ok).toBe(true);
    expect(library.create("sneaky", other)).toEqual({ ok: false, problem: "nameTaken" });
    for (let n = 2; n <= 20; n++) library.create(`Style ${n}`, evader);
    expect(library.create("One more", evader)).toEqual({ ok: false, problem: "full" });
    expect(names()).toHaveLength(20);
    if (!first.ok) return;
    library.save(first.style.id, other);
    expect(library.getSnapshot().styles[0]?.name).toBe("Sneaky");
  });

  test("a draft with a problem is kept, and a rename to a taken name is refused", () => {
    const { library } = setUp();
    const made = library.create("Sneaky", evader);
    library.create("Splashy", evader);
    if (!made.ok) throw new Error("not created");
    library.save(made.style.id, broken);
    expect(library.get(made.style.id)?.strategy).toEqual(broken);
    expect(library.rename(made.style.id, "SPLASHY")).toEqual({ ok: false, problem: "nameTaken" });
    expect(library.rename(made.style.id, "Sneaky two")).toEqual({ ok: true });
  });

  test("remove and restore (Undo) give back the same style; the stored copy survives a new page", () => {
    const store = memoryStore();
    const { library } = setUp(memoryAccount(), store);
    const made = library.create("Sneaky", evader);
    if (!made.ok) throw new Error("not created");
    const removed = library.remove(made.style.id);
    expect(library.getSnapshot().styles).toEqual([]);
    if (removed !== null) library.restore(removed);
    expect(library.getSnapshot().styles).toEqual([made.style]);
    expect(setUp(memoryAccount(), store).library.getSnapshot().styles).toEqual([made.style]);
  });

  test("a preset supplies the initial ultimate and the first save takes the player's choice", () => {
    const { library } = setUp();
    const draft = newStyleDraft(evader, "Mode 1");
    expect(draft.ultimate).toBe(evader.ultimate);
    expect(library.getSnapshot().styles).toEqual([]);

    const defaultStyle = saveNewStyle(library, "Default", draft);
    expect(defaultStyle.ok && defaultStyle.style.strategy).toEqual(evader);
    const created = saveNewStyle(library, "Switched", { ...draft, ultimate: "bigUmbrella" });
    if (!created.ok) throw new Error("not created");
    expect(created.style.strategy).toEqual({ ...evader, ultimate: "bigUmbrella" });
    expect(library.save(created.style.id, evader)?.ultimate).toBe("bigUmbrella");
  });

  test("an empty style requires the player to pick an ultimate before it can be saved", () => {
    const { library } = setUp();
    const draft = newStyleDraft(null, "Mode 1");
    expect(draft.ultimate).toBeNull();
    expect(saveNewStyle(library, "Empty", draft)).toEqual({ ok: false, problem: "ultimate" });
    expect(library.getSnapshot().styles).toEqual([]);

    const created = saveNewStyle(library, "Empty", { ...draft, ultimate: "splash" });
    if (!created.ok) throw new Error("not created");
    expect(parseStrategy(created.style.strategy).ok).toBe(true);
    expect(created.style.strategy.ultimate).toBe("splash");
    expect(created.style.strategy.modes[0]?.rules).toEqual([]);
  });

  test("version 1 upgrades preset styles and invalid drafts, and the next save keeps their ultimates", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.875);
    try {
      const store = memoryStore();
      const sync = { accountId: ACCOUNT, known: { "old-preset": 1 }, deleted: {} };
      const preset = { modes: evader.modes, build: evader.build };
      const invalid = { modes: [{ ...evader.modes[0]!, rules: [], name: "" }], build: evader.build };
      store.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, styles: [
        { id: "old-preset", name: "Preset", updatedAt: 1, strategy: preset },
        { id: "old-draft", name: "Draft", updatedAt: 2, strategy: invalid },
      ], sync }));
      const { library } = setUp(memoryAccount(), store);
      expect(library.get("old-preset")?.strategy).toEqual(evader);
      expect(library.get("old-draft")?.strategy).toEqual({ ...invalid, ultimate: "magnet" });
      expect(library.rename("old-draft", "Renamed").ok).toBe(true);
      expect(JSON.parse(store.getItem(LIBRARY_KEY)!)).toMatchObject({ version: 2, sync });
      expect(setUp(memoryAccount(), store).library.getSnapshot().styles).toEqual(library.getSnapshot().styles);
      expect(random).toHaveBeenCalledTimes(1);
    } finally {
      random.mockRestore();
    }
  });

  test("blocked storage keeps the styles for the visit, and damaged storage is kept aside, not overwritten", () => {
    const blocked = setUp(memoryAccount(), null);
    expect(blocked.library.create("Sneaky", evader).ok).toBe(true);
    expect(blocked.library.getSnapshot().persistent).toBe(false);

    const store = memoryStore();
    store.data.set(LIBRARY_KEY, "{ half a save");
    const { library } = setUp(memoryAccount(), store);
    expect(library.getSnapshot().styles).toEqual([]);
    expect(store.data.get(DAMAGED_KEY)).toBe("{ half a save");
  });
});

describe("the merge at sign-in", () => {
  test("a style only on the device is uploaded, and one only in the account is downloaded", async () => {
    const account = memoryAccount([style("from-account-1", "From the account", 500)]);
    const s = setUp(account);
    s.library.create("From the device", evader);
    await signIn(s);
    expect(s.names()).toEqual(["From the account", "From the device"]);
    expect(account.names()).toEqual(["From the account", "From the device"]);
    expect(s.library.getSnapshot().account).toEqual({ kind: "synced" });
  });

  test("for the same id the newer copy wins, on either side", async () => {
    const account = memoryAccount([style("shared-0001", "Account newer", 9_000_000), style("shared-0002", "Account older", 1)]);
    const store = memoryStore();
    store.data.set(
      LIBRARY_KEY,
      JSON.stringify({ version: 1, styles: [style("shared-0001", "Device older", 1), style("shared-0002", "Device newer", 9_000_000)], sync: null }),
    );
    const s = setUp(account, store);
    await signIn(s);
    expect(s.names()).toEqual(["Account newer", "Device newer"]);
    expect(account.names()).toEqual(["Account newer", "Device newer"]);
  });

  test("newer device rules keep the ultimate fixed by the account", async () => {
    const id = "shared-ultimate";
    const account = memoryAccount([style(id, "Account older", 1, other)]);
    const store = memoryStore();
    store.setItem(LIBRARY_KEY, JSON.stringify({ version: 2, styles: [style(id, "Device newer", 2)], sync: null }));
    const s = setUp(account, store);
    await signIn(s);
    const expected = style(id, "Device newer", 2, { ...evader, ultimate: other.ultimate });
    expect(s.library.get(id)).toEqual(expected);
    expect(account.styles.get(id)).toEqual(expected);
    expect(setUp(account, store).library.get(id)).toEqual(expected);
  });

  test("deleted on the device while signed out: the account loses it, unless it changed there since", async () => {
    const account = memoryAccount([style("keep-0001", "Unchanged", 100), style("keep-0002", "Will change", 100)]);
    const s = setUp(account);
    await signIn(s);
    s.library.connect(null);
    for (const id of ["keep-0001", "keep-0002"]) s.library.remove(id);
    // Another device edits one of them in the meantime.
    account.styles.set("keep-0002", style("keep-0002", "Changed elsewhere", 200));
    await signIn(s);
    expect(account.names()).toEqual(["Changed elsewhere"]);
    expect(s.names()).toEqual(["Changed elsewhere"]);
  });

  test("deleted in the account: the device drops it, unless it changed on the device since", async () => {
    const account = memoryAccount([style("gone-0001", "Unchanged here", 100), style("gone-0002", "Changed here", 100)]);
    const s = setUp(account);
    await signIn(s);
    s.library.connect(null);
    s.library.save("gone-0002", other);
    account.styles.clear();
    await signIn(s);
    expect(s.names()).toEqual(["Changed here"]);
    expect(account.names()).toEqual(["Changed here"]);
  });

  test("over 20 after a merge: all stay on the device, the newest go up while there is room", async () => {
    const account = memoryAccount(Array.from({ length: 15 }, (_, i) => style(`acct-${String(i).padStart(4, "0")}`, `Account ${i}`, 100 + i)));
    const s = setUp(account);
    for (let n = 1; n <= 8; n++) {
      s.library.create(`Device ${n}`, evader);
      await s.time.advance(10);
    }
    await signIn(s);
    expect(s.library.getSnapshot().styles).toHaveLength(23);
    expect(account.styles.size).toBe(20);
    // The 5 newest device styles fit; the 3 oldest stay on the device.
    expect(account.names().filter((n) => n.startsWith("Device"))).toEqual(["Device 4", "Device 5", "Device 6", "Device 7", "Device 8"]);
    expect(s.library.getSnapshot().keptOnDevice).toBe(3);
  });

  test("a style with a problem stays on the device and is not uploaded", async () => {
    const account = memoryAccount();
    const s = setUp(account);
    s.library.create("Broken", broken);
    await signIn(s);
    expect(s.names()).toEqual(["Broken"]);
    expect(account.names()).toEqual([]);
  });

  test("another account on the same device gets the device styles uploaded, not deleted", async () => {
    const first = memoryAccount();
    const s = setUp(first);
    s.library.create("Mine", evader);
    await signIn(s);
    const second = memoryAccount();
    const t = setUp(second, s.store);
    await signIn(t, "0b1c2d3e-0000-4000-8000-000000000002");
    expect(second.names()).toEqual(["Mine"]);
  });
});

describe("switching accounts", () => {
  test("a second account that signs in while the first one's merge runs still gets its merge", async () => {
    const first = memoryAccount();
    const second = memoryAccount();
    let current = first;
    let release: () => void = () => undefined;
    const slow: AccountApi = {
      // The first list answers only when the test says so, after the second account connected.
      list: () => (current === first ? new Promise((resolve) => (release = () => resolve(first.api.list()))) : current.api.list()),
      put: (style) => current.api.put(style),
      remove: (id) => current.api.remove(id),
    };
    const time = fakeClock();
    const library = new PlayStyleLibrary(memoryStore(), slow, time.clock, () => "style-id-9001");
    library.create("Mine", evader);
    library.connect(ACCOUNT);
    await settle();
    current = second;
    library.connect("0b1c2d3e-0000-4000-8000-000000000002");
    release();
    await settle();
    expect(second.names()).toEqual(["Mine"]);
    expect(library.getSnapshot().account).toEqual({ kind: "synced" });
  });
});

describe("after the merge", () => {
  test("an edit is pushed after the wait; a failed sync never blocks editing and retries by itself", async () => {
    const account = memoryAccount();
    const s = setUp(account);
    await signIn(s);
    const made = s.library.create("Sneaky", evader);
    if (!made.ok) throw new Error("not created");
    await s.time.advance(PUSH_MS);
    expect(account.names()).toEqual(["Sneaky"]);

    account.setOffline(true);
    s.library.save(made.style.id, other);
    await s.time.advance(PUSH_MS);
    expect(s.library.getSnapshot().account).toEqual({ kind: "behind", offline: true });
    expect(s.library.get(made.style.id)?.strategy).toEqual({ ...other, ultimate: made.style.strategy.ultimate });
    expect(s.library.rename(made.style.id, "Still editing")).toEqual({ ok: true });

    account.setOffline(false);
    await s.time.advance(RETRY_FIRST_MS * 2);
    expect(s.library.getSnapshot().account).toEqual({ kind: "synced" });
    expect(account.styles.get(made.style.id)?.name).toBe("Still editing");
    expect(account.styles.get(made.style.id)?.strategy.ultimate).toBe(made.style.strategy.ultimate);
  });

  test("a newer copy in the account is not overwritten by a late push: the merge takes it", async () => {
    const account = memoryAccount();
    const s = setUp(account);
    await signIn(s);
    const made = s.library.create("Sneaky", evader);
    if (!made.ok) throw new Error("not created");
    await s.time.advance(PUSH_MS);
    account.styles.set(made.style.id, { ...made.style, name: "Edited on the phone", updatedAt: made.style.updatedAt + 1_000_000 });
    s.library.save(made.style.id, other);
    await s.time.advance(PUSH_MS);
    expect(s.names()).toEqual(["Edited on the phone"]);
  });

  test("a delete is sent to the account, and Undo before the push sends nothing", async () => {
    const account = memoryAccount();
    const s = setUp(account);
    await signIn(s);
    const a = s.library.create("Kept by Undo", evader);
    const b = s.library.create("Deleted", evader);
    await s.time.advance(PUSH_MS);
    if (!a.ok || !b.ok) throw new Error("not created");
    const undone = s.library.remove(a.style.id);
    if (undone !== null) s.library.restore(undone);
    s.library.remove(b.style.id);
    await s.time.advance(PUSH_MS);
    expect(account.names()).toEqual(["Kept by Undo"]);
  });
});
