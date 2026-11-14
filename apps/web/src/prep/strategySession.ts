// The player's strategy on this page: the copy the server holds ("saved"), the
// copy being edited ("draft"), and the automatic save between them. Plain
// TypeScript with an injected source and clock, so the tests drive it with a
// fake clock and the kit page drives it with a source in memory.
//
// Save status. The draft is "dirty" when it differs from the saved copy.
//
// | From             | Event                      | Actor   | Guard                      | To                    |
// |------------------|----------------------------|---------|----------------------------|-----------------------|
// | saved            | edit                       | player  | draft valid                | waiting               |
// | any but saving   | edit                       | player  | draft invalid              | invalid (not sent)    |
// | invalid          | edit                       | player  | draft valid                | waiting               |
// | waiting          | delay ends (AUTO_SAVE_MS)  | clock   |                            | saving                |
// | waiting          | tab hidden                 | browser |                            | saving                |
// | saving           | server accepts             | server  | no edit since sending      | saved                 |
// | saving           | server accepts             | server  | edit since sending         | waiting               |
// | saving           | server refuses             | server  |                            | failed(reason)        |
// | failed(any)      | Retry                      | player  | draft valid                | saving                |
// | failed(any)      | edit                       | player  | draft valid                | waiting               |
// | failed(any)      | clearSaveError (new phase) | page    | dirty and valid            | waiting               |
// | failed(offline)  | browser is online again    | browser | dirty and valid            | waiting               |
// | failed(offline)  | retry delay ends           | clock   | dirty and valid            | waiting               |
//
// "saving" while a request runs takes no other transition: an edit only changes
// the draft and is saved after the answer. No state is terminal; "saved" is the
// resting state. A failed draft stays in the browser (writeDraft), so a reload
// keeps it and the load restores and saves it.

import { parseStrategy } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import type { ErrorView } from "../api/errorSentences.ts";
import type { ErrorText } from "../api/messages.ts";
import { sameData } from "../editor/compare.ts";
import type { Clock } from "../ui/timer.ts";

/** Wait after the last edit before saving, so a run of taps sends one request. */
export const AUTO_SAVE_MS = 800;

/**
 * Wait before trying again without a connection: the first delay, doubled after
 * each failure up to the longest. The browser "online" event does not fire when
 * only the server was away, so the clock tries too.
 */
export const OFFLINE_RETRY_FIRST_MS = 2000;
const OFFLINE_RETRY_MAX_MS = 30000;

export type SaveFailureReason = "roundRunning" | "offline" | "refused" | "other";

export interface SaveFailure {
  readonly reason: SaveFailureReason;
  /**
   * The error sentence and details for "other" and "refused", in the language of
   * `text`. The failure keeps its cause, not a sentence, so a language switch
   * changes a failure that is already on screen.
   */
  readonly describe: (text: ErrorText) => ErrorView;
}

export type SourceResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly failure: SaveFailure };

/** Where the strategy comes from and goes to: the API for a player, memory for the kit page. */
export interface StrategySource {
  load(): Promise<SourceResult<StrategyInput>>;
  save(strategy: StrategyInput): Promise<SourceResult<void>>;
  /** The unsaved draft this browser kept, or null. */
  readDraft(): StrategyInput | null;
  /** Keeps the draft, or forgets it with null. */
  writeDraft(draft: StrategyInput | null): void;
}

export type StrategyLoad =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly describe: SaveFailure["describe"] }
  | { readonly kind: "ready"; readonly saved: StrategyInput; readonly draft: StrategyInput };

export type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | ({ readonly kind: "failed" } & SaveFailure);

export interface SessionSnapshot {
  readonly load: StrategyLoad;
  readonly save: SaveState;
  /** True while the delay after an edit runs: a save is about to start. */
  readonly pending: boolean;
  /** True when the draft passes parseStrategy. A draft that does not is never sent by the automatic save. */
  readonly valid: boolean;
}

export const IDLE_SNAPSHOT: SessionSnapshot = { load: { kind: "idle" }, save: { kind: "idle" }, pending: false, valid: true };

export function isDirty(load: StrategyLoad): boolean {
  return load.kind === "ready" && !sameData(load.saved, load.draft);
}

export class StrategySession {
  private snapshot: SessionSnapshot = IDLE_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private timer: unknown = null;
  /** Bumped by start and dispose, so an answer to an older request is dropped. */
  private generation = 0;
  /** Failed tries in a row without a connection; sets the next retry delay. */
  private offlineTries = 0;

  constructor(
    private readonly source: StrategySource,
    private readonly clock: Clock,
    private readonly onRefused: () => void,
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  private set(next: Partial<SessionSnapshot>): void {
    const merged = { ...this.snapshot, ...next };
    const valid = merged.load.kind === "ready" ? parseStrategy(merged.load.draft).ok : true;
    this.snapshot = { ...merged, valid };
    // Only a change of the strategy touches browser storage, not a change of the save status.
    if (next.load !== undefined && merged.load.kind === "ready") this.source.writeDraft(isDirty(merged.load) ? merged.load.draft : null);
    for (const listener of this.listeners) listener();
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    if (this.snapshot.pending) this.set({ pending: false });
  }

  /** Starts the delay when a save is due. A failed save waits for Retry, an edit or a new phase. */
  private schedule(): void {
    this.cancelTimer();
    const { load, save, valid } = this.snapshot;
    if (load.kind !== "ready" || !isDirty(load) || !valid || save.kind !== "idle") return;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.saveDraft();
    }, AUTO_SAVE_MS);
    this.set({ pending: true });
  }

  readonly start = (): void => {
    this.generation += 1;
    const generation = this.generation;
    this.cancelTimer();
    this.set({ load: { kind: "loading" }, save: { kind: "idle" } });
    void this.source.load().then((result) => {
      if (generation !== this.generation) return;
      if (!result.ok) {
        if (result.failure.reason === "refused") this.onRefused();
        this.set({ load: { kind: "failed", describe: result.failure.describe } });
        return;
      }
      this.set({ load: { kind: "ready", saved: result.data, draft: this.source.readDraft() ?? result.data } });
      // A draft this browser kept from before is saved now that saving is possible.
      this.schedule();
    });
  };

  /** Stops the timer and drops the answers of running requests. */
  readonly dispose = (): void => {
    this.generation += 1;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  };

  readonly setDraft = (next: StrategyInput): void => {
    const { load, save } = this.snapshot;
    if (load.kind !== "ready") return;
    // A failure belongs to the draft that was sent, so an edit clears it and tries again.
    this.set({ load: { ...load, draft: next }, save: save.kind === "failed" ? { kind: "idle" } : save });
    this.schedule();
  };

  readonly saveDraft = async (): Promise<void> => {
    this.cancelTimer();
    const { load, valid, save } = this.snapshot;
    if (load.kind !== "ready" || !valid || save.kind === "saving") return;
    await this.send(load.draft, true);
  };

  /** Saves a strategy that did not come from the draft, for example a pasted document. The draft follows it. */
  readonly saveStrategy = async (next: StrategyInput): Promise<void> => {
    this.cancelTimer();
    await this.send(next, false);
  };

  // `keepDraft` is true when the draft is what is sent: an edit made while the request runs stays in the draft.
  private async send(sent: StrategyInput, keepDraft: boolean): Promise<void> {
    const generation = this.generation;
    this.set({ save: { kind: "saving" } });
    const result = await this.source.save(sent);
    if (generation !== this.generation) return;
    if (result.ok) {
      const load = this.snapshot.load;
      this.set({
        load: load.kind === "ready" ? { ...load, saved: sent, draft: keepDraft ? load.draft : sent } : load,
        save: { kind: "idle" },
      });
      this.offlineTries = 0;
      this.schedule();
      return;
    }
    if (result.failure.reason === "refused") this.onRefused();
    this.set({ save: { kind: "failed", ...result.failure } });
    if (result.failure.reason === "offline" && keepDraft) {
      const delay = Math.min(OFFLINE_RETRY_FIRST_MS * 2 ** this.offlineTries, OFFLINE_RETRY_MAX_MS);
      this.offlineTries += 1;
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        this.clearSaveError();
      }, delay);
    }
  }

  /**
   * Reads the server's copy again, for a strategy that a script changed. An unsaved draft stays.
   * Returns the failure when the read failed, or null.
   */
  readonly refreshSaved = async (): Promise<SaveFailure | null> => {
    const generation = this.generation;
    const result = await this.source.load();
    if (generation !== this.generation) return null;
    if (!result.ok) {
      if (result.failure.reason === "refused") this.onRefused();
      return result.failure;
    }
    const load = this.snapshot.load;
    if (load.kind !== "ready" || sameData(load.saved, result.data)) return null;
    // A draft equal to the old copy has no edits of its own, so it follows the new copy.
    this.set({ load: { ...load, saved: result.data, draft: sameData(load.saved, load.draft) ? result.data : load.draft } });
    return null;
  };

  /** Drops a failed save. The page calls it when the arena phase changes, so a draft that waited for the break is saved now. */
  readonly clearSaveError = (): void => {
    if (this.snapshot.save.kind !== "failed") return;
    this.set({ save: { kind: "idle" } });
    this.schedule();
  };

  /** Saves at once instead of after the delay: the tab is being hidden. */
  readonly flush = (): void => {
    if (this.timer !== null) void this.saveDraft();
  };

  /** The connection is back: a save that failed for lack of it is tried again. */
  readonly online = (): void => {
    const { save } = this.snapshot;
    if (save.kind === "failed" && save.reason === "offline") this.clearSaveError();
  };
}
