// "My play styles": the one place that knows where the play styles a player built in
// the tank workshop live. Two backings: this browser (localStorage, which may be blocked;
// then the styles live for the visit) and, when the player is signed in, the account
// (the routes in packages/arena/src/strategies-protocol.ts). The device copy is the
// working copy: every change is written here first, and the account follows. A failed
// sync never blocks an edit; the snapshot says that the account is behind, and the
// library tries again.
//
// One saved play style (61-workshop.md):
// | From  | To      | Actor  | Guard                                                                 |
// |-------|---------|--------|-----------------------------------------------------------------------|
// | none  | saved   | player | create: valid, unique name; fewer than 20 on the device               |
// | saved | saved   | player | save (any draft, a problem included), rename (valid, unique name)    |
// | saved | removed | player | remove; restore (Undo) puts it back with the same id and time        |
// "removed" is terminal once the page's Undo time has passed.
//
// Account sync:
// | From               | Event                       | To                                |
// |--------------------|-----------------------------|-----------------------------------|
// | deviceOnly         | connect(account)            | syncing (merge, see merge.ts)     |
// | syncing            | every request succeeded     | synced                            |
// | syncing            | a request failed            | behind (retry after a delay)      |
// | behind             | delay ends, or online again | syncing (merge again)             |
// | synced             | a local change              | syncing (push after PUSH_MS)      |
// | any                | connect(null), 401          | deviceOnly                        |

import { ACCOUNT_STRATEGY_LIMITS, cleanStrategyName, type AccountStrategiesResponse } from "@game/arena";
import { assignUltimate, hasStrategyBody, isUltimateId, parseStrategy } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import type { ApiResult } from "../api/client.ts";
import { sameData } from "../editor/compare.ts";
import type { KeyValueStore } from "../session/storage.ts";
import type { Clock } from "../ui/timer.ts";
import { emptyMemory, mergePlan, type MyPlayStyle, type SyncMemory } from "./merge.ts";

export type { MyPlayStyle } from "./merge.ts";

export const LIBRARY_KEY = "algotank:workshop:play-styles";
/** Where a stored library that cannot be read is moved, so a new save does not overwrite the player's work. */
export const DAMAGED_KEY = `${LIBRARY_KEY}:damaged`;
export const MAX_PLAY_STYLES = ACCOUNT_STRATEGY_LIMITS.perAccount;
/** Wait after the last change before the account copy is sent, so a run of edits sends one request. */
export const PUSH_MS = 1000;
export const RETRY_FIRST_MS = 2000;
export const RETRY_MAX_MS = 30000;

/** The stored form in localStorage under LIBRARY_KEY. */
export interface StoredLibrary {
  readonly version: 2;
  readonly styles: readonly MyPlayStyle[];
  /** What the last signed-in account held, for the merge. Null before the first sign-in on this device. */
  readonly sync: SyncMemory | null;
}

export interface AccountApi {
  list(): Promise<ApiResult<AccountStrategiesResponse>>;
  put(style: MyPlayStyle): Promise<ApiResult<void>>;
  remove(id: string): Promise<ApiResult<void>>;
}

export type AccountCopy =
  | { readonly kind: "deviceOnly" }
  | { readonly kind: "syncing" }
  | { readonly kind: "synced" }
  /** A request failed; the library tries again by itself. */
  | { readonly kind: "behind"; readonly offline: boolean };

export interface LibrarySnapshot {
  /** Newest change first. */
  readonly styles: readonly MyPlayStyle[];
  readonly account: AccountCopy;
  /** Styles that stay on this device only because the account keeps 20. */
  readonly keptOnDevice: number;
  /** False when the browser blocks storage: the styles last for this visit only. */
  readonly persistent: boolean;
}

export type NameProblem = "name" | "nameTaken";
export type CreateResult = { readonly ok: true; readonly style: MyPlayStyle } | { readonly ok: false; readonly problem: NameProblem | "full" };
export type RenameResult = { readonly ok: true } | { readonly ok: false; readonly problem: NameProblem };

/** True when the play style can be loaded in an arena. One with a problem stays in the workshop until it is fixed. */
export function isLoadable(style: Pick<MyPlayStyle, "strategy">): boolean {
  return parseStrategy(style.strategy).ok;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

type StyleWithoutUltimate = Omit<MyPlayStyle, "strategy"> & { readonly strategy: Omit<StrategyInput, "ultimate"> };

function hasStoredStyleBody(v: unknown): v is StyleWithoutUltimate {
  return isRecord(v) && typeof v["id"] === "string" && typeof v["name"] === "string" &&
    typeof v["updatedAt"] === "number" && hasStrategyBody(v["strategy"]);
}

function isStoredStyle(style: StyleWithoutUltimate): style is MyPlayStyle {
  return "ultimate" in style.strategy && isUltimateId(style.strategy.ultimate);
}

/** Keep old drafts, including ones with rule problems that the workshop can fix (85-ultimates.md). */
function upgradeLibraryStyle(style: StyleWithoutUltimate): MyPlayStyle {
  if (isStoredStyle(style)) return style;
  return { ...style, strategy: { ...style.strategy, ultimate: assignUltimate(style.strategy, Math.random) } };
}

function isMemory(v: unknown): v is SyncMemory {
  const numbers = (o: unknown) => isRecord(o) && Object.values(o).every((n) => typeof n === "number");
  return isRecord(v) && typeof v["accountId"] === "string" && numbers(v["known"]) && numbers(v["deleted"]);
}

const EMPTY: StoredLibrary = { version: 2, styles: [], sync: null };

/** The stored library, or null when the text is there but cannot be read (it is then kept aside, not overwritten). */
function parseStoredLibrary(raw: string | null): StoredLibrary | null {
  if (raw === null) return EMPTY;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { version, styles, sync } = value;
  if (!Array.isArray(styles) || !styles.every(hasStoredStyleBody) || (sync !== null && !isMemory(sync))) return null;
  if (version === 1) return { version: 2, styles: styles.map(upgradeLibraryStyle), sync };
  if (version === 2 && styles.every(isStoredStyle)) return { version: 2, styles, sync };
  return null;
}

/** The problem with a name, or null. `exceptId` is the style being renamed. */
function nameProblem(raw: string, styles: readonly MyPlayStyle[], exceptId: string | null): NameProblem | null {
  const name = cleanStrategyName(raw);
  if (name === null) return "name";
  const key = name.toLocaleLowerCase();
  return styles.some((style) => style.id !== exceptId && style.name.toLocaleLowerCase() === key) ? "nameTaken" : null;
}

const newest = (styles: readonly MyPlayStyle[]) => [...styles].sort((a, b) => b.updatedAt - a.updatedAt);

export class PlayStyleLibrary {
  private snapshot: LibrarySnapshot;
  private memory: SyncMemory | null;
  private readonly listeners = new Set<() => void>();
  private accountId: string | null = null;
  private timer: unknown = null;
  private running = false;
  private again: "push" | "merge" | null = null;
  private failures = 0;

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly api: AccountApi,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {
    const stored = this.read();
    this.memory = stored.sync;
    this.snapshot = { styles: newest(stored.styles), account: { kind: "deviceOnly" }, keptOnDevice: 0, persistent: store !== null };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): LibrarySnapshot => this.snapshot;

  get(id: string): MyPlayStyle | undefined {
    return this.snapshot.styles.find((style) => style.id === id);
  }

  create(rawName: string, strategy: StrategyInput | Omit<StrategyInput, "ultimate">): CreateResult {
    const { styles } = this.snapshot;
    if (styles.length >= MAX_PLAY_STYLES) return { ok: false, problem: "full" };
    const problem = nameProblem(rawName, styles, null);
    const name = cleanStrategyName(rawName);
    if (problem !== null || name === null) return { ok: false, problem: problem ?? "name" };
    // ponytail: let the player pick an ultimate when they start from empty (85-ultimates.md).
    const ultimate = "ultimate" in strategy ? strategy.ultimate : assignUltimate(strategy, Math.random);
    const style: MyPlayStyle = { id: this.newId(), name, strategy: { ...strategy, ultimate }, updatedAt: this.clock.now() };
    this.change([style, ...styles]);
    return { ok: true, style };
  }

  /** Keeps any draft, one with a problem too: the device copy never loses an edit. */
  save(id: string, input: StrategyInput): StrategyInput | undefined {
    const style = this.get(id);
    if (style === undefined) return undefined;
    const strategy = { ...input, ultimate: style.strategy.ultimate };
    if (sameData(style.strategy, strategy)) return style.strategy;
    this.replace({ ...style, strategy, updatedAt: this.nextTime(style) });
    return strategy;
  }

  rename(id: string, rawName: string): RenameResult {
    const style = this.get(id);
    const problem = nameProblem(rawName, this.snapshot.styles, id);
    const name = cleanStrategyName(rawName);
    if (problem !== null || name === null) return { ok: false, problem: problem ?? "name" };
    if (style !== undefined && style.name !== name) this.replace({ ...style, name, updatedAt: this.nextTime(style) });
    return { ok: true };
  }

  /** Returns the removed style, for Undo. The account loses it at the next push. */
  remove(id: string): MyPlayStyle | null {
    const style = this.get(id);
    if (style === undefined) return null;
    const knownAt = this.memory?.known[id];
    if (this.memory !== null && knownAt !== undefined) this.memory = { ...this.memory, deleted: { ...this.memory.deleted, [id]: knownAt } };
    this.change(this.snapshot.styles.filter((s) => s.id !== id));
    return style;
  }

  /** Undo of remove: the style comes back as it was, with its id and time. */
  restore(style: MyPlayStyle): void {
    if (this.get(style.id) !== undefined) return;
    if (this.memory !== null && style.id in this.memory.deleted) {
      const deleted = { ...this.memory.deleted };
      delete deleted[style.id];
      this.memory = { ...this.memory, deleted };
    }
    this.change([style, ...this.snapshot.styles]);
  }

  /** The signed-in account, or null when signed out. A new account starts a merge. */
  connect(accountId: string | null): void {
    if (accountId === this.accountId) return;
    this.accountId = accountId;
    this.cancelTimer();
    this.failures = 0;
    if (accountId === null) {
      this.set({ account: { kind: "deviceOnly" }, keptOnDevice: 0 });
      return;
    }
    if (this.memory?.accountId !== accountId) this.memory = emptyMemory(accountId);
    void this.run("merge");
  }

  /** The connection is back: a sync that is behind tries at once. */
  readonly online = (): void => {
    if (this.snapshot.account.kind !== "behind") return;
    this.cancelTimer();
    void this.run("merge");
  };

  /** Another tab changed the stored library. */
  readonly reload = (): void => {
    const stored = this.read();
    this.memory = this.accountId !== null && stored.sync?.accountId !== this.accountId ? this.memory : stored.sync;
    this.set({ styles: newest(stored.styles) });
  };

  // --- device ----------------------------------------------------------------

  /** One more than the last time at least, so a fast second edit still counts as newer. */
  private nextTime(style: MyPlayStyle): number {
    return Math.max(this.clock.now(), style.updatedAt + 1);
  }

  private replace(style: MyPlayStyle): void {
    this.change(newest(this.snapshot.styles.map((s) => (s.id === style.id ? style : s))));
  }

  private change(styles: readonly MyPlayStyle[]): void {
    this.set({ styles: newest(styles) });
    this.write();
    if (this.accountId !== null) this.schedule("push", PUSH_MS);
  }

  private read(): StoredLibrary {
    if (this.store === null) return EMPTY;
    let raw: string | null = null;
    try {
      raw = this.store.getItem(LIBRARY_KEY);
    } catch {
      return EMPTY;
    }
    const parsed = parseStoredLibrary(raw);
    if (parsed !== null) return parsed;
    try {
      this.store.setItem(DAMAGED_KEY, raw ?? "");
    } catch {
      // The damaged text stays under its own key then, and the next write replaces it.
    }
    return EMPTY;
  }

  private write(): void {
    if (this.store === null) return;
    const stored: StoredLibrary = { version: 2, styles: this.snapshot.styles, sync: this.memory };
    try {
      this.store.setItem(LIBRARY_KEY, JSON.stringify(stored));
    } catch {
      // A full or blocked storage keeps the styles in memory for this visit; `persistent` says so.
      if (this.snapshot.persistent) this.set({ persistent: false });
    }
  }

  private set(next: Partial<LibrarySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  // --- account ---------------------------------------------------------------

  private cancelTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(kind: "push" | "merge", ms: number): void {
    this.cancelTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.run(kind);
    }, ms);
  }

  /** One exchange at a time; a request for another while one runs is done after it. */
  private async run(kind: "push" | "merge"): Promise<void> {
    if (this.running) {
      this.again = this.again === "merge" ? "merge" : kind;
      return;
    }
    const accountId = this.accountId;
    if (accountId === null) return;
    this.running = true;
    this.set({ account: { kind: "syncing" } });
    const outcome = kind === "merge" ? await this.merge(accountId) : await this.push(accountId);
    this.running = false;
    if (this.accountId !== accountId) {
      // The account changed while this ran: connect() asked for a merge of the new one, which runs now.
      const next = this.again;
      this.again = null;
      if (next !== null) void this.run(next);
      return;
    }
    if (outcome === "signedOut") {
      this.accountId = null;
      this.set({ account: { kind: "deviceOnly" } });
      return;
    }
    if (outcome === "mergeAgain") this.again = "merge";
    if (typeof outcome === "object") {
      const delay = Math.min(RETRY_FIRST_MS * 2 ** this.failures, RETRY_MAX_MS);
      this.failures += 1;
      this.set({ account: { kind: "behind", offline: outcome.offline } });
      this.schedule("merge", delay);
      return;
    }
    this.failures = 0;
    const next = this.again;
    this.again = null;
    if (next !== null) {
      void this.run(next);
      return;
    }
    this.set({ account: { kind: "synced" } });
  }

  private async merge(accountId: string): Promise<Outcome> {
    const listed = await this.api.list();
    if (this.accountId !== accountId) return "done";
    if (!listed.ok) return failed(listed);
    const memory = this.memory ?? emptyMemory(accountId);
    const plan = mergePlan(this.snapshot.styles, listed.data.strategies, memory, isLoadable);
    this.memory = plan.memory;
    this.set({ styles: plan.device, keptOnDevice: plan.keptOnDevice });
    this.write();
    for (const style of plan.upload) {
      const result = await this.api.put(style);
      if (this.accountId !== accountId) return "done";
      if (!result.ok) return failed(result);
      this.know(style.id, style.updatedAt);
    }
    for (const id of plan.removeFromAccount) {
      const result = await this.api.remove(id);
      if (this.accountId !== accountId) return "done";
      if (!result.ok) return failed(result);
      this.forget(id);
    }
    return "done";
  }

  /** Sends what changed on this device since the account last acknowledged it. */
  private async push(accountId: string): Promise<Outcome> {
    const memory = this.memory ?? emptyMemory(accountId);
    const changed = this.snapshot.styles.filter((style) => memory.known[style.id] !== style.updatedAt && isLoadable(style));
    for (const style of changed) {
      const result = await this.api.put(style);
      if (this.accountId !== accountId) return "done";
      // The account has a newer copy, or no room: the merge decides what to keep.
      if (!result.ok && (result.code === "strategy_stale" || result.code === "strategy_limit")) return "mergeAgain";
      if (!result.ok) return failed(result);
      // A later edit of the same style made while the request ran is sent by the next push.
      this.know(style.id, style.updatedAt);
    }
    for (const id of Object.keys(memory.deleted)) {
      const result = await this.api.remove(id);
      if (this.accountId !== accountId) return "done";
      if (!result.ok) return failed(result);
      this.forget(id);
    }
    return "done";
  }

  private know(id: string, updatedAt: number): void {
    if (this.memory === null) return;
    this.memory = { ...this.memory, known: { ...this.memory.known, [id]: updatedAt } };
    this.write();
  }

  private forget(id: string): void {
    if (this.memory === null) return;
    const known = { ...this.memory.known };
    const deleted = { ...this.memory.deleted };
    delete known[id];
    delete deleted[id];
    this.memory = { ...this.memory, known, deleted };
    this.write();
  }
}

type Outcome = "done" | "mergeAgain" | "signedOut" | { readonly offline: boolean };

function failed(result: Extract<ApiResult<unknown>, { ok: false }>): Outcome {
  if (result.status === 401 || result.code === "not_signed_in") return "signedOut";
  return { offline: result.status === 0 };
}
