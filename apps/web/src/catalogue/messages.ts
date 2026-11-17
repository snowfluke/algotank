// Interface text for "/catalogue", the catalogue of what a tank meets in the arena. Catalog slot:
// `catalogue`. The play styles, items and arena conditions keep their names and sentences where
// the game already says them (vocabulary/messages.ts, board/messages.ts legend), so the catalogue
// never words a rule differently from the game. Only the ultimates, which the game does not have
// yet (owner, 2026-11-17: "coming soon"), are worded here.

/** The ultimates, in the order of the catalogue. Each is the default of one play style (catalogue.ts). */
export const ULTIMATE_IDS = ["dash", "smoke", "splash", "fullTank", "mudBomb", "whirlwind", "bigUmbrella", "magnet"] as const;
export type UltimateId = (typeof ULTIMATE_IDS)[number];

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
  /** The tag on every ultimate: the game does not have them yet. */
  soon: "Coming soon",
  ultimatesNote: "Ultimates are not in the game yet, so their scenes show the plan.",
  /** `style` is a play style's name. */
  defaultFor: (style: string) => `${style} starts with this ultimate, and any play style may pick it.`,
  /** The board scene, for a screen reader: the sentence under it says the same in words. */
  sceneLabel: (name: string) => `A small board shows ${name}.`,
  /** Under reduced motion the scene does not play by itself. */
  nextStep: "Next step",
  ultimates: {
    dash: { name: "Dash", body: "The tank drives up to 3 squares in a straight line in one turn." },
    smoke: { name: "Smoke screen", body: "For 10 turns, a shot at this tank hits only half as often." },
    splash: { name: "Splash ring", body: "The tank shoots at all 8 squares around it at once, and its water runs out." },
    fullTank: { name: "Full tank", body: "The water fills to the top, and the next 3 shots use no water." },
    mudBomb: { name: "Mud bomb", body: "A mud ball lands on the first tank in line and sticks every tank within 1 square for 5 turns." },
    whirlwind: { name: "Whirlwind", body: "Every tank within 2 squares spins round for 2 turns, then checks its rules from the bottom up for 2." },
    bigUmbrella: { name: "Big umbrella", body: "A big umbrella stops the next 4 shots from the side the tank faces, however long that takes." },
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
  defaultFor: (style) => `${style} memakai jurus ini sejak awal, dan gaya main lain juga boleh memilihnya.`,
  sceneLabel: (name) => `Papan kecil memperlihatkan ${name}.`,
  nextStep: "Langkah berikutnya",
  ultimates: {
    dash: { name: "Lari kencang", body: "Tank maju sampai 3 petak lurus dalam satu giliran." },
    smoke: { name: "Kabut", body: "Selama 10 giliran, tembakan ke tank ini hanya separuh yang kena." },
    splash: { name: "Percikan", body: "Tank menembak ke 8 petak di sekelilingnya sekaligus, lalu airnya habis." },
    fullTank: { name: "Tangki penuh", body: "Air terisi penuh, dan 3 tembakan berikutnya tidak memakai air." },
    mudBomb: { name: "Bom lumpur", body: "Bola lumpur jatuh di tank pertama di garis tembak, dan setiap tank dalam jarak 1 petak darinya terjebak selama 5 giliran." },
    whirlwind: { name: "Angin puyuh", body: "Setiap tank dalam jarak 2 petak berputar selama 2 giliran, lalu memeriksa aturannya dari bawah selama 2 giliran." },
    bigUmbrella: { name: "Payung besar", body: "Payung besar menahan 4 tembakan berikutnya dari arah depan tank, berapa lama pun itu." },
    magnet: { name: "Magnet", body: "3 item terdekat dalam jarak 4 petak meluncur ke tank, lalu tank menyimpan ketiganya dan memakainya sesuai urutan datangnya." },
  },
  open: "Buka katalog",
  homeTile: { title: "Katalog", body: "Cari tahu apa yang ditemui tank di arena, dengan adegan pendek untuk masing-masing." },
};
