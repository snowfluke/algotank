// The play style a device used last, and when a room gives it to the tank
// (docs/specs/revamp/73-after-first-timer-test.md, row 5). Without it every new arena
// started the tank as the server's default play style, whatever the player built or chose.
//
// - "Used" means: chosen in the Play style tab of any arena (a built-in one or one of
//   "mine"), or "Play now with it" after the first play style in the workshop.
// - A new seat is one this browser just took: every join stores it with saveNewSeat
//   (session/storage.ts), which marks it. The room gives that seat the remembered style
//   once, when its strategy has loaded and the server accepts a save, then drops the mark.
//   So a reload, a later lobby or the next game never overwrite what the player did since.
// - "Play now with it" is a promise about the next game, and the player may still hold a
//   public seat from before the workshop, which is not new. So the button also stores an
//   explicit request (requestPlayWith), and the next room gives that style to the tank once,
//   new seat or held, edited draft or not, then drops the request.
//
// | Request          | New seat | Loaded and can save | Draft changed | Decision                                  |
// |------------------|----------|---------------------|---------------|-------------------------------------------|
// | usable, gone or  | any      | no                  | any           | wait                                      |
// | broken           |          |                     |               |                                           |
// | a usable style   | any      | yes                 | any           | apply the request, drop request and mark  |
// | gone or broken   | no       | yes                 | any           | keep, drop the request                    |
// | gone or broken   | yes      | yes                 | as below      | the new-seat rows below, drop the request |
// | none             | no       | any                 | any           | none                                      |
// | none             | yes      | no                  | any           | wait                                      |
// | none             | yes      | yes                 | yes           | keep, drop the mark                       |
// | none             | yes      | yes                 | no            | apply the style used last (keep when it is |
// |                  |          |                     |               | none, gone or broken), drop the mark      |

import { useEffect } from "react";
import type { ArenaId, PlayerId } from "@game/arena";
import { PRESETS, type PresetId, type StrategyInput } from "@game/engine";
import { PREFERENCE_KEYS, readPreference, removePreference, writePreference } from "../app/preferences.ts";
import { browserStore, clearNewSeat, isNewSeat, type KeyValueStore } from "../session/storage.ts";
import { isLoadable, type MyPlayStyle } from "../workshop/library.ts";
import { useLibrary } from "../workshop/useLibrary.ts";
import type { StrategyHandle } from "./useStrategySession.ts";

export type LastStyle = { readonly kind: "builtIn"; readonly id: PresetId } | { readonly kind: "mine"; readonly id: string };

/** The stored value, or null when there is none or it is not one this version wrote. */
export function parseLastStyle(raw: string | null): LastStyle | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { kind, id } = value as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return null;
  if (kind === "mine") return { kind, id };
  const preset = PRESETS.find((p) => p.id === id);
  return kind === "builtIn" && preset !== undefined ? { kind, id: preset.id } : null;
}

export function rememberLastStyle(style: LastStyle): void {
  writePreference(browserStore(), PREFERENCE_KEYS.lastStyle, JSON.stringify(style));
}

export function readLastStyle(): LastStyle | null {
  return parseLastStyle(readPreference(browserStore(), PREFERENCE_KEYS.lastStyle));
}

/** "Play now with it": the next room gives this style to the tank, and later new seats start with it too. */
export function requestPlayWith(style: LastStyle, store: KeyValueStore | null = browserStore()): void {
  writePreference(store, PREFERENCE_KEYS.lastStyle, JSON.stringify(style));
  writePreference(store, PREFERENCE_KEYS.playWithRequest, JSON.stringify(style));
}

/** The style "Play now with it" asked for that no room has given yet, or null. */
export function readPlayWithRequest(store: KeyValueStore | null = browserStore()): LastStyle | null {
  return parseLastStyle(readPreference(store, PREFERENCE_KEYS.playWithRequest));
}

export type StartStyleDecision =
  /** Nothing to do: no request, and the seat is not new. */
  | { readonly kind: "none" }
  /** Not yet: the strategy has not loaded, or the server refuses a save now (the tank plays in a running round). */
  | { readonly kind: "wait" }
  /** The seat keeps what it has, and the request and the mark go. */
  | { readonly kind: "keep" }
  /** The tank gets `strategy`, and the request and the mark go. */
  | { readonly kind: "apply"; readonly strategy: StrategyInput };

export interface StartStyleInput {
  readonly newSeat: boolean;
  readonly loaded: boolean;
  /** False while the tank plays in a running round, where the server refuses a save. */
  readonly canSave: boolean;
  /** The player changed the draft already. */
  readonly dirty: boolean;
  readonly last: LastStyle | null;
  /** What "Play now with it" asked for and no room has given yet. */
  readonly requested: LastStyle | null;
  readonly styles: readonly MyPlayStyle[];
}

/** The strategy of a remembered style, or null when it is gone or has a problem. */
function strategyOf(style: LastStyle, styles: readonly MyPlayStyle[]): StrategyInput | null {
  if (style.kind === "builtIn") return PRESETS.find((p) => p.id === style.id)?.strategy ?? null;
  const mine = styles.find((s) => s.id === style.id);
  return mine !== undefined && isLoadable(mine) ? mine.strategy : null;
}

/** The table at the top of this file. */
export function startStyleDecision({ newSeat, loaded, canSave, dirty, last, requested, styles }: StartStyleInput): StartStyleDecision {
  if (!newSeat && requested === null) return { kind: "none" };
  if (!loaded || !canSave) return { kind: "wait" };
  const asked = requested === null ? null : strategyOf(requested, styles);
  if (asked !== null) return { kind: "apply", strategy: asked };
  if (!newSeat || dirty || last === null) return { kind: "keep" };
  const remembered = strategyOf(last, styles);
  return remembered === null ? { kind: "keep" } : { kind: "apply", strategy: remembered };
}

/** Drops what a decision used up: the request and the seat's mark. */
export function settleStartStyle(store: KeyValueStore | null, arenaId: ArenaId): void {
  removePreference(store, PREFERENCE_KEYS.playWithRequest);
  clearNewSeat(store, arenaId);
}

/** In a room: gives the tank the style "Play now with it" asked for, or a new seat's tank the play style used last, once. */
export function useStartStyle(arenaId: ArenaId, playerId: PlayerId, canSave: boolean, strategy: StrategyHandle): void {
  const { styles } = useLibrary();
  const loaded = strategy.load.kind === "ready";
  useEffect(() => {
    const store = browserStore();
    const decision = startStyleDecision({
      newSeat: isNewSeat(store, arenaId, playerId),
      loaded,
      canSave,
      dirty: strategy.dirty,
      last: readLastStyle(),
      requested: readPlayWithRequest(store),
      styles,
    });
    if (decision.kind === "none" || decision.kind === "wait") return;
    settleStartStyle(store, arenaId);
    if (decision.kind === "apply") {
      // Through the draft, not saveStrategy: a save that fails leaves the style as the unsaved draft, which the
      // session saves again (offline retry, a new phase), so the request is not lost with the stored mark.
      strategy.setDraft(decision.strategy);
      void strategy.saveDraft();
    }
    // Runs when the seat, its load or the save rule change; the draft, the request and the remembered style are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arenaId, playerId, loaded, canSave, styles]);
}
