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
  standard: { url: "/music/a-mallets-v2.mp3", loopStart: 0.5, loopEnd: 61.45238095238095 },
  "dry-spell": { url: "/music/b-dry-v2.mp3", loopStart: 0.5, loopEnd: 32.5 },
  downpour: { url: "/music/c-rain-v2.mp3", loopStart: 0.5, loopEnd: 30.976190476190474 },
  "arms-length": { url: "/music/d-close-v2.mp3", loopStart: 0.5, loopEnd: 27.928571428571427 },
  "open-field": { url: "/music/e-open-v2.mp3", loopStart: 0.5, loopEnd: 32.5 },
  "sharp-eyes": { url: "/music/f-sharp-v2.mp3", loopStart: 0.5, loopEnd: 28.944444444444443 },
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
 * The music's gain at full volume (the person's slider scales it). The files measure about -20.5 LUFS, so -11 dB
 * gives about -31.5 LUFS: under the game's sounds, which carry the battle. Owner, 2026-11-19: "lower the bgm" took it
 * from -9.5 dB to -13 dB, then "increase a bit the bgm default" to -11 dB.
 */
export const MUSIC_GAIN = 10 ** (-11 / 20);
/** The further drop under the player's own shot and hit sounds. */
export const DUCK_GAIN = 10 ** (-6 / 20);
export const DUCK_MS = 1000;
export const FADE_SECONDS = 1;
