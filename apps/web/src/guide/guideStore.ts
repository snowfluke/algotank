// Where the tours' states live: one TourState per tour id, kept through app/preferences.ts
// (key `tours`), so a finished or skipped tour does not come back by itself and a paused
// one resumes at its step after a reload. A blocked store keeps the states for this visit.
// Screens also send signals here for the "do" steps that no tap shows (tours.ts).

import { useSyncExternalStore } from "react";
import { PREFERENCE_KEYS, readPreference, writePreference } from "../app/preferences.ts";
import { browserStore, type KeyValueStore } from "../session/storage.ts";
import { NOT_STARTED, parseTourState, transition, type TourEvent, type TourState } from "./tourMachine.ts";
import { TOUR_LENGTHS, type GuideSignal, type TourId } from "./tours.ts";

const TOUR_IDS = Object.keys(TOUR_LENGTHS) as TourId[];

type States = Readonly<Record<TourId, TourState>>;

function readStates(store: KeyValueStore | null): States {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(readPreference(store, PREFERENCE_KEYS.tours) ?? "{}");
    if (typeof parsed === "object" && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    // A broken value is a device that saw no tour yet.
  }
  return Object.fromEntries(TOUR_IDS.map((id) => [id, parseTourState(stored[id], TOUR_LENGTHS[id])])) as States;
}

export class GuideStore {
  private states: States;
  private readonly listeners = new Set<() => void>();
  private readonly signalListeners = new Set<(signal: GuideSignal) => void>();

  constructor(private readonly store: KeyValueStore | null) {
    this.states = readStates(store);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly stateOf = (id: TourId): TourState => this.states[id];

  /** Applies the event; returns the new state, or null when the machine refuses it (nothing changes). */
  dispatch(id: TourId, event: TourEvent): TourState | null {
    const next = transition(this.states[id], event, TOUR_LENGTHS[id]);
    if (next === null) return null;
    this.states = { ...this.states, [id]: next };
    // Only the place in the tour is kept; "waiting" comes back as running and looks for its target again.
    writePreference(this.store, PREFERENCE_KEYS.tours, JSON.stringify(this.states));
    for (const listener of this.listeners) listener();
    return next;
  }

  /** Another tab of this browser changed the tours. */
  reload(): void {
    this.states = readStates(this.store);
    for (const listener of this.listeners) listener();
  }

  signal(signal: GuideSignal): void {
    for (const listener of this.signalListeners) listener(signal);
  }

  onSignal(listener: (signal: GuideSignal) => void): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }
}

export const guideStore = new GuideStore(typeof window === "undefined" ? null : browserStore());

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === PREFERENCE_KEYS.tours || event.key === null) guideStore.reload();
  });
}

export function useTourState(id: TourId): TourState {
  return useSyncExternalStore(
    guideStore.subscribe,
    () => guideStore.stateOf(id),
    () => NOT_STARTED,
  );
}

/** A screen tells the running tour that the player did the thing of a "do" step. */
export function guideSignal(signal: GuideSignal): void {
  guideStore.signal(signal);
}

/** "Show me around": the tour starts again at its first step. */
export function showAround(id: TourId): void {
  guideStore.dispatch(id, { type: "replay" });
}
