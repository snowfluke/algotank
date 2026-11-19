// One background track per arena condition (80-background-music.md, owner, 2026-11-19).
// The file holds the loop with half a second of its own end before it and of its own start
// after it, so the loop points sit inside periodic audio whatever delay the decoder adds.

import { STANDARD_RULE_SET_ID, type RuleSetId } from "@game/engine";
import measurements from "../../../../tools/music/measurements.json";

export interface MusicTrack {
  /** Under apps/web/public. The name carries a version, so a new render gets a new address. */
  readonly url: string;
  /** Seconds into the decoded file. */
  readonly loopStart: number;
  readonly loopEnd: number;
}

function trackOf(measured: { readonly file: string; readonly loop_start: number; readonly loop_end: number }): MusicTrack {
  return { url: measured.file.slice("apps/web/public".length), loopStart: measured.loop_start, loopEnd: measured.loop_end };
}

export const MUSIC_TRACKS: Readonly<Record<RuleSetId, MusicTrack>> = {
  standard: trackOf(measurements.a),
  "dry-spell": trackOf(measurements.b),
  downpour: trackOf(measurements.c),
  "arms-length": trackOf(measurements.d),
  "open-field": trackOf(measurements.e),
  "sharp-eyes": trackOf(measurements.f),
};

export const DEFAULT_TRACK = MUSIC_TRACKS[STANDARD_RULE_SET_ID];

/**
 * The music's gain. The file measures about -20.5 LUFS, so -9.5 dB gives about -30 LUFS, where the
 * game's shot sound stays 18 dB or more above the music in its own band (900 to 3200 Hz).
 */
export const MUSIC_GAIN = 10 ** (-9.5 / 20);
/** The further drop under the player's own shot and hit sounds. */
export const DUCK_GAIN = 10 ** (-6 / 20);
export const DUCK_MS = 1000;
export const FADE_SECONDS = 1;
