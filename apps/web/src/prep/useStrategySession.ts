// The React side of StrategySession: one session per source key, the browser
// events that flush or retry a save, and the handle the pages read.

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { StrategyInput } from "@game/engine";
import { browserClock } from "../ui/timer.ts";
import {
  IDLE_SNAPSHOT,
  StrategySession,
  isDirty,
  type SaveFailure,
  type SaveState,
  type StrategyLoad,
  type StrategySource,
} from "./strategySession.ts";

export interface StrategyHandle {
  readonly load: StrategyLoad;
  readonly save: SaveState;
  /** True when the draft differs from the saved strategy. */
  readonly dirty: boolean;
  /** True while the short wait after an edit runs, before the automatic save starts. */
  readonly pending: boolean;
  /** True when the draft is a valid strategy. An invalid draft is kept but not sent. */
  readonly valid: boolean;
  /** Changes the draft. A valid draft saves itself a moment later. */
  setDraft(next: StrategyInput): void;
  /** Saves the draft now. Retry calls this. */
  saveDraft(): Promise<void>;
  /** Saves a strategy that did not come from the draft, for example a pasted document. The draft follows it. */
  saveStrategy(next: StrategyInput): Promise<void>;
  /**
   * Reads the server's copy again, for a strategy that a script changed. An unsaved draft stays.
   * Returns the failure when the read failed, or null.
   */
  refreshSaved(): Promise<SaveFailure | null>;
  /** Drops a failed save and lets the automatic save try again. The player page calls it when the arena phase changes. */
  clearSaveError(): void;
  reload(): void;
}

const noSubscribe = () => () => undefined;
const idleSnapshot = () => IDLE_SNAPSHOT;
const nothing = async () => undefined;
const IDLE_ACTIONS = {
  setDraft: () => undefined,
  saveDraft: nothing,
  saveStrategy: nothing,
  refreshSaved: async () => null,
  clearSaveError: () => undefined,
  reload: () => undefined,
};

/**
 * `source` is null before there is anything to load (the player has not joined).
 * A new `key` starts a new session; keep it the same while the source is the same.
 */
export function useStrategySession(source: StrategySource | null, key: string, onRefused: () => void): StrategyHandle {
  // The latest callback, read inside async code without starting a new session.
  const refused = useRef(onRefused);
  refused.current = onRefused;
  // The session follows the key only: a source object made on each render must not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const session = useMemo(() => (source === null ? null : new StrategySession(source, browserClock, () => refused.current())), [key]);

  useEffect(() => {
    if (session === null) return;
    session.start();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") session.flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", session.flush);
    window.addEventListener("online", session.online);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", session.flush);
      window.removeEventListener("online", session.online);
      session.dispose();
    };
  }, [session]);

  const getSnapshot = session?.getSnapshot ?? idleSnapshot;
  // The same snapshot in a server render, so a room renders in a test (publicplay/phaseText.test.tsx).
  const snapshot = useSyncExternalStore(session?.subscribe ?? noSubscribe, getSnapshot, getSnapshot);
  const actions = session === null ? IDLE_ACTIONS : { ...session, reload: session.start };
  return {
    load: snapshot.load,
    save: snapshot.save,
    dirty: isDirty(snapshot.load),
    pending: snapshot.pending,
    valid: snapshot.valid,
    setDraft: actions.setDraft,
    saveDraft: actions.saveDraft,
    saveStrategy: actions.saveStrategy,
    refreshSaved: actions.refreshSaved,
    clearSaveError: actions.clearSaveError,
    reload: actions.reload,
  };
}
