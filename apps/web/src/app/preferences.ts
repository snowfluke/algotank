// Settings the browser remembers for every arena: the language, the two sound switches,
// "My tank" (mytank/myTank.ts), and the tours for first-timers (guide/guideStore.ts).
// Same rules as session/storage.ts: every access is in try/catch, and a
// blocked store (a private window) makes the setting last for this visit only.

import type { KeyValueStore } from "../session/storage.ts";

export const PREFERENCE_KEYS = {
  language: "algotank:language",
  sound: "algotank:sound",
  myTank: "algotank:my-tank",
  /** Written by versions before "My tank"; read once to fill the first "My tank" on this device. */
  lastName: "algotank:last-name",
  lastColour: "algotank:last-colour",
  /** "1" once this device saw the end of a game it played in. Until then "Play now" seats it in the practice arena (publicplay/firstGame.ts). */
  finishedGame: "algotank:finished-game",
  /** The state of each tour for first-timers, as JSON by tour id (guide/guideStore.ts). */
  tours: "algotank:tours",
  /** The play style used last, built-in or one of "mine", as JSON; a new seat starts with it (prep/lastStyle.ts). */
  lastStyle: "algotank:last-style",
  /** A play style that "Play now with it" asked for, as JSON; the next room gives it to the tank once, new seat or not (prep/lastStyle.ts). */
  playWithRequest: "algotank:play-with-request",
  /** The steps of the first visit this device reported, as a JSON list (metrics/firstTimer.ts). Never sent anywhere. */
  firstVisitPath: "algotank:first-visit-path",
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

export function readPreference(store: KeyValueStore | null, key: PreferenceKey): string | null {
  if (store === null) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the browser refused, so the setting holds for this visit only. */
export function writePreference(store: KeyValueStore | null, key: PreferenceKey, value: string): boolean {
  if (store === null) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removePreference(store: KeyValueStore | null, key: PreferenceKey): void {
  if (store === null) return;
  try {
    store.removeItem(key);
  } catch {
    // A store that refuses the removal refused the write before it as well.
  }
}
