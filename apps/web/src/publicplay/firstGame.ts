// "First-timer" (docs/specs/revamp/67-public-arenas.md): a device that has never seen
// the end of a game it played in. Such a device skips the chooser: "Play now" seats it
// in the practice arena, and from its first finished game on "Play now" opens the chooser
// (every public result also links there, publicplay/OtherArenasLink.tsx). The flag is
// a preference, so a blocked store makes every visit a first one, which only costs the
// chooser.

import { PREFERENCE_KEYS, readPreference, writePreference } from "../app/preferences.ts";
import type { JoinedView } from "../player/playerView.ts";
import { browserStore, type KeyValueStore } from "../session/storage.ts";

export function hasFinishedGame(store: KeyValueStore | null = browserStore()): boolean {
  return readPreference(store, PREFERENCE_KEYS.finishedGame) === "1";
}

export function markFinishedGame(store: KeyValueStore | null = browserStore()): void {
  writePreference(store, PREFERENCE_KEYS.finishedGame, "1");
}

/** The viewer's tank played this game to its end. A player who joined during it waited and did not play. */
export function playedToTheEnd(view: JoinedView): boolean {
  return view.kind === "finished" && view.me.status.kind !== "waiting";
}
