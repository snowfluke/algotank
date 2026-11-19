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
  musicFailed: "The music could not load, so the game plays without it.",
  names: namesEn,
};

export const id: typeof en = {
  label: "Suara",
  close: "Tutup",
  music: "Musik",
  effects: "Efek suara",
  musicFailed: "Musiknya gagal dimuat, jadi permainan tetap jalan tanpa musik.",
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
