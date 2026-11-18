// Interface text for "/catalogue", the catalogue of what a tank meets in the arena. Catalog slot:
// `catalogue`. The play styles, items and arena conditions keep their names and sentences where
// the game already says them (vocabulary/messages.ts, board/messages.ts legend), so the catalogue
// never words a rule differently from the game. The live feed reuses the ultimate names from here.

import type { UltimateId } from "@game/engine";

type UltimateText = { readonly name: string; readonly body: string };

export const en = {
  pageTitle: "Catalogue",
  heading: "Catalogue",
  intro: "Here is everything a tank meets in the arena, and each card plays a short scene on a small board.",
  sections: {
    label: "What the catalogue shows",
    playStyles: "Play styles",
    items: "Items",
    conditions: "Arena conditions",
    ultimates: "Ultimates",
  },
  /** Below 480px wide, where four whole names do not fit beside each other. */
  short: { playStyles: "Styles", items: "Items", conditions: "Arena", ultimates: "Ultimate" },
  /** The list of one section's cards. */
  listLabel: (section: string) => `${section} to choose from`,
  /** The tag shown until ultimates release (85-ultimates.md). */
  soon: "Coming soon",
  ultimatesNote: "Ultimates are not in the game yet, so their scenes show the plan.",
  /** `style` is a play style's name. */
  defaultFor: (style: string) => `${style} starts with this ultimate. Any play style may pick it.`,
  /** The board scene, for a screen reader: the sentence under it says the same in words. */
  sceneLabel: (name: string) => `A small board shows ${name}.`,
  /** Under reduced motion the scene does not play by itself. */
  nextStep: "Next step",
  ultimates: {
    dash: { name: "Dash", body: "The tank drives up to 3 squares, then rams the first tank ahead for 2 points. Nothing can touch it that turn." },
    smoke: { name: "Smoke screen", body: "For 15 turns, shots hit this tank a quarter as often." },
    splash: { name: "Splash ring", body: "The tank hits every tank in the 8 squares around it with the water of one shot. A tank can still dodge or block the shot." },
    fullTank: { name: "Full tank", body: "The water fills to the top, and the next 3 shots use no water." },
    mudBomb: { name: "Mud bomb", body: "Your tank sticks the first tank in line and every other tank within 1 square of it for 5 turns. Each stuck tank gives 1 point." },
    whirlwind: { name: "Whirlwind", body: "Tanks within 2 squares spin for 2 turns, then check their rules from the bottom up for 2 turns. Each tank within 1 square gives 1 point." },
    bigUmbrella: { name: "Big umbrella", body: "The umbrella stops the next 4 shots from ahead or from either side." },
    magnet: { name: "Magnet", body: "The 3 nearest items within 4 squares slide to the tank, which keeps them and uses them in order." },
  } satisfies Record<UltimateId, UltimateText>,
  /** The links to this page. */
  open: "Open the catalogue",
  homeTile: { title: "Catalogue", body: "Look up what a tank meets in the arena, with a short scene for each." },
};

export const id: typeof en = {
  pageTitle: "Katalog",
  heading: "Katalog",
  intro: "Di sini ada semua yang ditemui tank di arena, dan setiap kartu memutar adegan pendek di papan kecil.",
  sections: {
    label: "Isi katalog",
    playStyles: "Gaya main",
    items: "Item",
    conditions: "Kondisi arena",
    ultimates: "Jurus pamungkas",
  },
  short: { playStyles: "Gaya", items: "Item", conditions: "Arena", ultimates: "Jurus" },
  listLabel: (section) => `Pilihan ${section.toLowerCase()}`,
  soon: "Segera hadir",
  ultimatesNote: "Jurus pamungkas belum ada di permainan, jadi adegannya menunjukkan rencananya.",
  defaultFor: (style) => `${style} memulai dengan jurus ini. Semua gaya main boleh memilihnya.`,
  sceneLabel: (name) => `Papan kecil memperlihatkan ${name}.`,
  nextStep: "Langkah berikutnya",
  ultimates: {
    dash: { name: "Lari kencang", body: "Tank melaju hingga 3 petak, lalu menabrak tank pertama di depannya dan mengambil 2 poin. Tank kebal selama giliran itu." },
    smoke: { name: "Kabut", body: "Selama 15 giliran, peluang tembakan mengenai tank ini tinggal seperempat." },
    splash: { name: "Percikan", body: "Dengan air untuk satu tembakan, tank mengenai semua tank di 8 petak sekelilingnya. Tank lain masih bisa menghindar atau menahan tembakannya." },
    fullTank: { name: "Tangki penuh", body: "Air terisi penuh, dan 3 tembakan berikutnya tidak memakai air." },
    mudBomb: { name: "Bom lumpur", body: "Bom menjebak tank pertama di garis tembak beserta tank lain dalam jarak 1 petak darinya selama 5 giliran. Tiap tank yang terjebak memberi 1 poin." },
    whirlwind: { name: "Angin puyuh", body: "Tank dalam jarak 2 petak berputar selama 2 giliran, lalu memeriksa aturan dari bawah ke atas selama 2 giliran. Tiap tank dalam jarak 1 petak memberi 1 poin." },
    bigUmbrella: { name: "Payung besar", body: "Payung menahan 4 tembakan berikutnya dari depan atau dari samping." },
    magnet: { name: "Magnet", body: "3 item terdekat dalam jarak 4 petak meluncur ke tank, lalu tank menyimpan ketiganya dan memakainya sesuai urutan datangnya." },
  },
  open: "Buka katalog",
  homeTile: { title: "Katalog", body: "Cari tahu apa yang ditemui tank di arena, dengan adegan pendek untuk masing-masing." },
};
