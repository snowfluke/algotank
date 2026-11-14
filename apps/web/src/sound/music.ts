// The page's background music: one player for the whole visit, so changing pages never restarts
// the tune. Music is on where the person's "Music" switch says so, except on the big screen,
// which starts silent and plays only when the presenter turns music on there (that choice is
// not remembered, so every event starts quiet).

import { useEffect, useSyncExternalStore } from "react";
import type { MusicState } from "./musicMachine.ts";
import { createMusicPlayer, type MusicPlayer } from "./musicPlayer.ts";
import { CHOSEN_TRACK } from "./musicTracks.ts";
import { browserContext, browserHasGesture } from "./player.ts";
import { soundSettings } from "./setting.ts";
import type { SoundName } from "./sounds.ts";

export type MusicVenue = "app" | "bigScreen";

/** The effects that lower the music for a moment: the player's own shot and the splash of a hit. */
const DUCKING_SOUNDS: ReadonlySet<SoundName> = new Set<SoundName>(["shot", "splash"]);

async function fetchTrack(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The music file ${url} answered ${response.status}.`);
  return response.arrayBuffer();
}

const player: MusicPlayer = createMusicPlayer({
  track: CHOSEN_TRACK,
  getContext: browserContext,
  fetchTrack,
  hasGesture: browserHasGesture,
  isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
  later: (run, ms) => {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  },
  onError: (error) => console.error("The background music could not load, so the game plays without it.", error),
});

let venue: MusicVenue = "app";
let bigScreenMusic = false;
const venueListeners = new Set<() => void>();

function musicWanted(): boolean {
  return venue === "app" ? soundSettings.get().music : bigScreenMusic;
}

function sync(): void {
  player.setEnabled(musicWanted());
  for (const listener of venueListeners) listener();
}

if (typeof window !== "undefined") {
  soundSettings.subscribe(sync);
  // Touch browsers grant sound on the end of a tap (pointerup, touchend, click), desktop ones on the press as well.
  for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "click", "keydown"] as const) {
    window.addEventListener(type, () => player.gesture(), { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => player.setVisible(document.visibilityState === "visible"));
  sync();
}

/** Which page plays: App sets it from the route, so the big screen starts without music. */
export function useMusicVenue(next: MusicVenue): void {
  useEffect(() => {
    if (venue === next) return;
    venue = next;
    sync();
  }, [next]);
}

function subscribeVenue(listener: () => void): () => void {
  venueListeners.add(listener);
  return () => venueListeners.delete(listener);
}

const getVenue = (): MusicVenue => venue;
const getBigScreenMusic = (): boolean => bigScreenMusic;

/** The music switch of this page: the remembered setting, or the big screen's own switch. */
export function useMusicSwitch(): { readonly venue: MusicVenue; readonly on: boolean; set(on: boolean): void } {
  const current = useSyncExternalStore(subscribeVenue, getVenue, getVenue);
  const screenOn = useSyncExternalStore(subscribeVenue, getBigScreenMusic, getBigScreenMusic);
  const settings = useSyncExternalStore(soundSettings.subscribe, soundSettings.get, soundSettings.get);
  if (current === "bigScreen") {
    return {
      venue: current,
      on: screenOn,
      set(on) {
        bigScreenMusic = on;
        sync();
      },
    };
  }
  return { venue: current, on: settings.music, set: (on) => soundSettings.set({ music: on }) };
}

export function useMusicState(): MusicState {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

/** Lowers the music under one of the player's own effect sounds that just played. */
export function duckMusicUnder(sound: SoundName): void {
  if (DUCKING_SOUNDS.has(sound)) player.duck();
}
