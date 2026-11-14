// The background music's one track, track A, made by tools/music/render.py (80-background-music.md).
// The values come from tools/music/measurements.json; re-rendering the track changes them there.
// The file holds the loop with half a second of its own end before it and of its own start
// after it, so the loop points sit inside periodic audio whatever delay the decoder adds.

export interface MusicTrack {
  /** Under apps/web/public. The name carries a version, so a new render gets a new address. */
  readonly url: string;
  /** Seconds into the decoded file. */
  readonly loopStart: number;
  readonly loopEnd: number;
}

/** The one track of the whole game: soft mallets with a warm pad, F major, 75 BPM, 102.4 s. */
export const CHOSEN_TRACK: MusicTrack = { url: "/music/a-mallets-v1.mp3", loopStart: 0.5, loopEnd: 102.9 };

/**
 * The music's gain. The file measures about -20.5 LUFS, so -9.5 dB gives about -30 LUFS, where the
 * game's shot sound stays 18 dB or more above the music in its own band (900 to 3200 Hz).
 */
export const MUSIC_GAIN = 10 ** (-9.5 / 20);
/** The further drop under the player's own shot and hit sounds. */
export const DUCK_GAIN = 10 ** (-6 / 20);
export const DUCK_MS = 1000;
export const FADE_SECONDS = 1;
