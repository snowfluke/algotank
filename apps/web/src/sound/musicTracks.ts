// One background track per arena condition (80-background-music.md, owner, 2026-11-19).
// The file holds the loop with half a second of its own end before it and of its own start
// after it, so the loop points sit inside periodic audio whatever delay the decoder adds.

import { STANDARD_RULE_SET_ID, type ArenaConditionId, type ArenaLayoutId, type RuleSetId } from "@game/engine";

export interface MusicTrack {
  /** Under apps/web/public. The name carries a version, so a new render gets a new address. */
  readonly url: string;
  /** Seconds into the decoded file. */
  readonly loopStart: number;
  readonly loopEnd: number;
}

// The loop points come from tools/music/measurements.json; musicTracks.test.ts checks that they still match. They are
// copied, not imported, because the release package holds only the apps and packages, not tools/.
export const MUSIC_TRACKS: Readonly<Record<RuleSetId, MusicTrack>> = {
  standard: { url: "/music/a-mallets-v1.mp3", loopStart: 0.5, loopEnd: 102.9 },
  "dry-spell": { url: "/music/b-dry-v1.mp3", loopStart: 0.5, loopEnd: 55.357142857142854 },
  downpour: { url: "/music/c-rain-v1.mp3", loopStart: 0.5, loopEnd: 46.214285714285715 },
  "arms-length": { url: "/music/d-close-v1.mp3", loopStart: 0.5, loopEnd: 38.9 },
  "open-field": { url: "/music/e-open-v1.mp3", loopStart: 0.5, loopEnd: 55.357142857142854 },
  "sharp-eyes": { url: "/music/f-sharp-v1.mp3", loopStart: 0.5, loopEnd: 43.166666666666664 },
};

export const DEFAULT_TRACK = MUSIC_TRACKS[STANDARD_RULE_SET_ID];

/**
 * A hybrid layout (87-hybrid-arenas.md) plays the track of the condition that gives it its character: rain in
 * the eye of the storm and the rain front, Mata tajam on the hills, and Standar for four even quarters.
 */
const LAYOUT_TRACK: Readonly<Record<ArenaLayoutId, RuleSetId>> = {
  fourQuarters: STANDARD_RULE_SET_ID,
  eyeOfStorm: "downpour",
  rainFront: "downpour",
  hills: "sharp-eyes",
};

export function musicTrackOf(condition: ArenaConditionId): MusicTrack {
  return condition in LAYOUT_TRACK ? MUSIC_TRACKS[LAYOUT_TRACK[condition as ArenaLayoutId]] : MUSIC_TRACKS[condition as RuleSetId];
}

/**
 * The music's gain. The file measures about -20.5 LUFS, so -9.5 dB gives about -30 LUFS, where the
 * game's shot sound stays 18 dB or more above the music in its own band (900 to 3200 Hz).
 */
export const MUSIC_GAIN = 10 ** (-9.5 / 20);
/** The further drop under the player's own shot and hit sounds. */
export const DUCK_GAIN = 10 ** (-6 / 20);
export const DUCK_MS = 1000;
export const FADE_SECONDS = 1;
