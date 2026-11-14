// Interface text for sound: the header's sound button, its panel with the music and effect
// switches, and the name of each effect (the gallery plays them by name). Catalog slot: `sound`.

import type { SoundName } from "./sounds.ts";

const namesEn: Record<SoundName, string> = {
  shot: "Shot",
  splash: "Splash",
  miss: "Miss",
  dry: "Dry shot",
  countdown: "Countdown beep",
  roundStart: "Round start",
  roundEnd: "Round end",
  win: "Win",
  tap: "Button tap",
};

export const en = {
  /** Accessible name of the header button and the panel's heading. */
  label: "Sound",
  close: "Close",
  music: "Music",
  effects: "Sound effects",
  /** One sentence under the music switch for each state of the music. */
  musicOn: "Calm music plays quietly while you play.",
  musicLoading: "The music is loading now.",
  musicFailed: "The music could not load, so the game plays without it.",
  musicOff: "The music is turned off.",
  /** On the big screen the music starts off, so the room stays quiet until the presenter wants music. */
  musicOffBigScreen: "The big screen plays music only after you turn it on.",
  effectsOn: "Shots and hits make a short sound.",
  effectsOff: "Shots and hits make no sound now.",
  names: namesEn,
};

export const id: typeof en = {
  label: "Suara",
  close: "Tutup",
  music: "Musik",
  effects: "Efek suara",
  musicOn: "Musik tenang diputar pelan selama kamu main.",
  musicLoading: "Musiknya sedang dimuat.",
  musicFailed: "Musiknya gagal dimuat, jadi permainan tetap jalan tanpa musik.",
  musicOff: "Musiknya sedang dimatikan.",
  musicOffBigScreen: "Layar besar baru memutar musik setelah kamu menyalakannya.",
  effectsOn: "Tembakan dan cipratan berbunyi singkat.",
  effectsOff: "Tembakan dan cipratan sedang tidak berbunyi.",
  names: {
    shot: "Tembakan",
    splash: "Cipratan kena",
    miss: "Meleset",
    dry: "Air kurang",
    countdown: "Bunyi hitung mundur",
    roundStart: "Ronde mulai",
    roundEnd: "Ronde selesai",
    win: "Menang",
    tap: "Ketukan tombol",
  },
};
