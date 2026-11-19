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
  /** The badge on a live tank: the gold rim fills with the charge; these say the same in words. */
  ultimateReady: "Ready!",
  ultimateCharge: (percent: number) => `${percent}% charged`,
  /** The board scene, for a screen reader: the sentence under it says the same in words. */
  sceneLabel: (name: string) => `A small board shows ${name}.`,
  /** Under reduced motion the scene does not play by itself. */
  nextStep: "Next step",
  // Owner, 2026-11-19: one simple pattern for kids. Each body starts with "Your tank", says what happens, then
  // what it gives, in at most two sentences. Exact numbers live in 85-ultimates.md.
  ultimates: {
    dash: { name: "Dash", body: "Your tank zooms up to 3 squares ahead and bumps the first tank in front for 2 points. No shot can hit it that turn." },
    smoke: { name: "Smoke screen", body: "Your tank hides in smoke for 15 turns, so shots hit it only 1 time in 4. A shot the smoke turns away can hit a tank next to yours, and your tank gets 1 point." },
    splash: { name: "Splash ring", body: "Your tank sprays all 8 squares around it and uses up its water. Every tank it hits gives 2 points." },
    fullTank: { name: "Full tank", body: "Your tank fills up with water, and its next 3 shots use no water." },
    mudBomb: { name: "Mud bomb", body: "Your tank throws mud at the first tank in line. That tank and every tank next to it get stuck for 5 turns, and each gives 1 point." },
    whirlwind: { name: "Whirlwind", body: "Your tank makes every tank within 2 squares spin for 4 turns. Each tank right next to your tank gives 1 point." },
    bigUmbrella: { name: "Big umbrella", body: "Your tank opens a big umbrella that stops the next 3 shots from the front or the sides. Shots from behind still hit." },
    magnet: { name: "Magnet", body: "Your tank gets a new bucket first, then pulls the nearest items within 4 squares to fill any remaining space. Your tank can hold 3 items." },
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
  ultimateReady: "Siap!",
  ultimateCharge: (percent) => `Terisi ${percent}%`,
  sceneLabel: (name) => `Papan kecil memperlihatkan ${name}.`,
  nextStep: "Langkah berikutnya",
  ultimates: {
    dash: { name: "Lari kencang", body: "Tankmu melaju hingga 3 petak ke depan dan menabrak tank pertama di depannya untuk 2 poin. Tembakan tidak bisa mengenai tankmu pada giliran itu." },
    smoke: { name: "Kabut", body: "Tankmu bersembunyi dalam kabut selama 15 giliran, jadi tembakan hanya mengenainya 1 dari 4 kali. Tembakan yang dibelokkan kabut bisa mengenai tank di sebelahmu, dan tankmu mendapat 1 poin." },
    splash: { name: "Percikan", body: "Tankmu menyemprot 8 petak di sekelilingnya sampai airnya habis. Tiap tank yang kena memberi 2 poin." },
    fullTank: { name: "Tangki penuh", body: "Air tankmu terisi penuh, dan 3 tembakan berikutnya tidak memakai air." },
    mudBomb: { name: "Bom lumpur", body: "Tankmu melempar lumpur ke tank pertama di garis tembak. Tank itu dan semua tank di sebelahnya terjebak selama 5 giliran, dan tiap tank memberi 1 poin." },
    whirlwind: { name: "Angin puyuh", body: "Tankmu membuat semua tank dalam jarak 2 petak berputar selama 4 giliran. Tiap tank tepat di sebelah tankmu memberi 1 poin." },
    bigUmbrella: { name: "Payung besar", body: "Tankmu membuka payung besar yang menahan 3 tembakan berikutnya dari depan atau samping. Tembakan dari belakang tetap kena." },
    magnet: { name: "Magnet", body: "Tankmu mendapat ember baru dulu, lalu menarik item terdekat dalam jarak 4 petak untuk mengisi tempat yang tersisa. Tankmu bisa membawa 3 item." },
  },
  open: "Buka katalog",
  homeTile: { title: "Katalog", body: "Cari tahu apa yang ditemui tank di arena, dengan adegan pendek untuk masing-masing." },
};
