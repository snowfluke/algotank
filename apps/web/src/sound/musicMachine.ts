// The background music's states (80-background-music.md). Pure: musicPlayer.ts carries out
// what each transition means for the audio.
//
// Facts the driver passes with an event: `gestured` (the person touched the page or pressed a
// key, so the browser lets sound start), `visible` (the tab shows) and `buffered` (the track is
// already decoded, so turning music on again needs no download).
//
// | From              | Event      | Guard                         | To                | Actor                           |
// |-------------------|------------|-------------------------------|-------------------|---------------------------------|
// | off               | enable     | not gestured                  | waitingForGesture | person (switch) or page (venue) |
// | off               | enable     | gestured, hidden              | hidden            | person (switch) or page (venue) |
// | off               | enable     | gestured, visible, buffered   | playing           | person (switch) or page (venue) |
// | off               | enable     | gestured, visible, unbuffered | loading           | person (switch) or page (venue) |
// | waitingForGesture | gesture    | buffered, visible             | playing           | person (first tap or key)       |
// | waitingForGesture | gesture    | hidden                        | hidden            | person (first tap or key)       |
// | waitingForGesture | gesture    | visible, unbuffered           | loading           | person (first tap or key)       |
// | loading           | loaded     | visible                       | playing           | network and decoder             |
// | loading           | loaded     | hidden                        | hidden            | network and decoder             |
// | loading           | loadFailed |                               | failed            | network and decoder             |
// | playing           | duck       |                               | ducked            | the player's own shot or hit    |
// | ducked            | duck       |                               | ducked            | the player's own shot or hit    |
// | ducked            | duckEnded  |                               | playing           | timer (DUCK_MS)                 |
// | loading, playing, ducked | hide |                              | hidden            | browser (tab hidden)            |
// | hidden            | show       | buffered                      | playing           | browser (tab shown)             |
// | hidden            | show       | unbuffered                    | loading           | browser (tab shown)             |
// | any but off       | disable    |                               | off               | person (switch) or page (venue) |
//
// Every other pair is rejected: `transition` returns null and the state stays. For example a
// duck while the music is off, or a load that ends after the person turned the music off (the
// driver keeps the decoded track for later). No state is terminal: the page can always turn the
// music on or off. "failed" is added to the spec's six states so the panel can say that the music
// could not load; turning the music off and on again retries the download.
// Condition changes go through the driver, so a crossfade keeps the playing or ducked state.

export const MUSIC_STATES = ["off", "waitingForGesture", "loading", "playing", "ducked", "hidden", "failed"] as const;
export type MusicState = (typeof MUSIC_STATES)[number];

export interface MusicFacts {
  readonly gestured: boolean;
  readonly visible: boolean;
  readonly buffered: boolean;
}

export type MusicEvent =
  | ({ readonly type: "enable" } & MusicFacts)
  | ({ readonly type: "gesture" } & Omit<MusicFacts, "gestured">)
  | { readonly type: "loaded"; readonly visible: boolean }
  | { readonly type: "loadFailed" }
  | { readonly type: "duck" }
  | { readonly type: "duckEnded" }
  | { readonly type: "hide" }
  | { readonly type: "show"; readonly buffered: boolean }
  | { readonly type: "disable" };

function start(buffered: boolean, visible: boolean): MusicState {
  if (!visible) return "hidden";
  return buffered ? "playing" : "loading";
}

/** The next state, or null when no row of the table allows the event in this state. */
export function transition(state: MusicState, event: MusicEvent): MusicState | null {
  switch (event.type) {
    case "enable":
      if (state !== "off") return null;
      return event.gestured ? start(event.buffered, event.visible) : "waitingForGesture";
    case "gesture":
      return state === "waitingForGesture" ? start(event.buffered, event.visible) : null;
    case "loaded":
      if (state !== "loading") return null;
      return event.visible ? "playing" : "hidden";
    case "loadFailed":
      return state === "loading" ? "failed" : null;
    case "duck":
      return state === "playing" || state === "ducked" ? "ducked" : null;
    case "duckEnded":
      return state === "ducked" ? "playing" : null;
    case "hide":
      return state === "loading" || isAudible(state) ? "hidden" : null;
    case "show":
      return state === "hidden" ? start(event.buffered, true) : null;
    case "disable":
      return state === "off" ? null : "off";
  }
}

/** Whether a source is (or should be) sounding in this state. */
export function isAudible(state: MusicState): boolean {
  return state === "playing" || state === "ducked";
}
