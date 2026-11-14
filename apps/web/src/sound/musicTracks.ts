// The background music's tracks, made by tools/music/render.py (80-background-music.md).
// The values come from tools/music/measurements.json; re-rendering a track changes them there.
// Each file holds the loop with half a second of its own end before it and of its own start
// after it, so the loop points sit inside periodic audio whatever delay the decoder adds.

export interface MusicTrack {
  /** Under apps/web/public. The name carries a version, so a new render gets a new address. */
  readonly url: string;
  /** Seconds into the decoded file. */
  readonly loopStart: number;
  readonly loopEnd: number;
}

export const MUSIC_TRACKS = {
  /** Soft mallets with a warm pad, F major, 75 BPM, 102.4 s. */
  a: { url: "/music/a-mallets-v1.mp3", loopStart: 0.5, loopEnd: 102.9 },
  /** Mellow electric piano with a quiet brushed beat, C major, 80 BPM, 108 s. */
  b: { url: "/music/b-keys-v1.mp3", loopStart: 0.5, loopEnd: 108.5 },
  /** Slow ambient pads with sparse plucks, G major, 70 BPM, 109.7 s. */
  c: { url: "/music/c-pads-v1.mp3", loopStart: 0.5, loopEnd: 0.5 + (32 * 4 * 60) / 70 },
} as const satisfies Record<string, MusicTrack>;

/** The one track of the whole game. The owner picks it by ear; A plays until then. */
export const CHOSEN_TRACK: MusicTrack = MUSIC_TRACKS.a;

/**
 * The music's gain. The files measure about -20.5 LUFS, so -9.5 dB gives about -30 LUFS, where the
 * game's shot sound stays 18 dB or more above the music in its own band (900 to 3200 Hz).
 */
export const MUSIC_GAIN = 10 ** (-9.5 / 20);
/** The further drop under the player's own shot and hit sounds. */
export const DUCK_GAIN = 10 ** (-6 / 20);
export const DUCK_MS = 1000;
export const FADE_SECONDS = 1;
