// Interface text for "/catalogue", the catalogue of what a tank meets in the arena. Catalog slot:
// `catalogue`. The play styles, items and arena conditions keep their names where the game already
// says them (vocabulary/messages.ts, board/messages.ts legend). Each card's sentence is the short
// `briefs` text below, written for children; it repeats a rule's numbers, so a rule change edits
// the game's sentence and the brief. The live feed reuses the ultimate names from here.

import type { ItemKind, RuleSetId, UltimateId } from "@game/engine";

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
  /** The rules guide at "/rules" (RulesGuide.tsx). The parts and most entries use the rules editor's own words (prep/messages.ts). */
  rulesGuide: {
    pageTitle: "Rules guide",
    heading: "Rules guide",
    /** The catalogue's button to the guide. */
    open: "Rules guide",
    /** "More options" on a phone, where the part switch has less room. */
    moreShort: "More",
    partsLabel: "Part of a rule",
    targets: "Targets",
    range: (min: number, max: number) => `${min} to ${max}`,
    pickTarget: "one of the tanks under Targets",
    negateName: "The opposite of a condition",
    match: "A rule fits when all its conditions are true, or when any one of them is true: you choose.",
    modes: (max: number) => `A play style has up to ${max} modes, each with its own rules, and a rule can switch to another mode.`,
    fallback: "When no rule fits, your tank does this one action.",
  },
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
  /** The arrows beside the phone's row of cards. */
  moreCards: "More cards",
  earlierCards: "Earlier cards",
  /**
   * One short sentence per card for the catalogue (owner, 2026-11-20: "kids don't read that long"). The game's longer
   * texts stay where a player sets things up; these only teach the idea next to the scene. The ultimates' sentences
   * follow the trailer's narration (trailer-1122/tools/narration.json), because players compare the two (owner,
   * 2026-11-20); a rule change edits the trailer's line, this sentence and the long `ultimates` body.
   */
  briefs: {
    items: {
      bucket: "Your next 2 hits take 2 points each.",
      umbrella: "Stops the next 2 shots at your tank.",
      pinwheel: "Makes a tank dizzy, but sometimes you get dizzy.",
      mudBall: "Sticks a tank in mud, but sometimes you get stuck.",
    } satisfies Record<ItemKind, string>,
    conditions: {
      standard: "Shots reach 3 squares and use 3 water.",
      "arms-length": "Shots reach only 1 square, so get close.",
      "dry-spell": "Water is scarce, and each shot uses 5.",
      downpour: "Plenty of water, but shots reach only 1 square.",
      "open-field": "The arena is twice as big.",
      "sharp-eyes": "Aim and Dodge are twice as strong.",
    } satisfies Record<RuleSetId, string>,
    ultimates: {
      dash: "Zooms 3 squares, then rams a tank for 2 points.",
      smoke: "Your tank hides, and shots at it can turn to another tank.",
      splash: "All 8 squares around your tank get hit at once.",
      fullTank: "Your water is full again, and the next 3 shots are free.",
      mudBomb: "A tank and the tanks next to it get stuck for 5 turns.",
      whirlwind: "Every tank near you spins in a daze.",
      bigUmbrella: "3 shots from the front and the sides are stopped.",
      magnet: "The nearest items fly to you, and a new bucket lands in your hand.",
    } satisfies Record<UltimateId, string>,
  },
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
  rulesGuide: {
    pageTitle: "Kamus aturan",
    heading: "Kamus aturan",
    open: "Kamus aturan",
    moreShort: "Opsi",
    partsLabel: "Bagian aturan",
    targets: "Sasaran",
    range: (min, max) => `${min} sampai ${max}`,
    pickTarget: "salah satu tank di Sasaran",
    negateName: "Kebalikan kondisi",
    match: "Aturan cocok kalau semua kondisinya benar, atau kalau salah satunya benar: kamu yang memilih.",
    modes: (max) => `Gaya main punya sampai ${max} mode dengan aturannya masing-masing, dan sebuah aturan bisa pindah ke mode lain.`,
    fallback: "Kalau tidak ada aturan yang cocok, tank kamu menjalankan satu tindakan ini.",
  },
  listLabel: (section) => `Pilihan ${section.toLowerCase()}`,
  soon: "Segera hadir",
  ultimateReady: "Siap!",
  ultimateCharge: (percent) => `Terisi ${percent}%`,
  sceneLabel: (name) => `Papan kecil memperlihatkan ${name}.`,
  nextStep: "Langkah berikutnya",
  moreCards: "Kartu berikutnya",
  earlierCards: "Kartu sebelumnya",
  briefs: {
    items: {
      bucket: "2 tembakan kena berikutnya dapat 2 poin.",
      umbrella: "Menahan 2 tembakan berikutnya ke tankmu.",
      pinwheel: "Membuat lawan pusing, tapi kadang kamu yang pusing.",
      mudBall: "Membuat lawan terjebak, tapi kadang kamu yang terjebak.",
    },
    conditions: {
      standard: "Tembakan sampai 3 petak dan memakai 3 air.",
      "arms-length": "Tembakan hanya 1 petak, jadi dekati lawan.",
      "dry-spell": "Air sedikit, dan tiap tembakan memakai 5 air.",
      downpour: "Air melimpah, tapi tembakan hanya 1 petak.",
      "open-field": "Arenanya dua kali lebih luas.",
      "sharp-eyes": "Bidikan dan Hindaran dua kali lebih kuat.",
    },
    ultimates: {
      dash: "Tankmu melaju 3 petak, lalu menabrak lawan untuk 2 poin.",
      smoke: "Tankmu bersembunyi, dan tembakan lawan bisa berbelok ke tank lain.",
      splash: "8 petak di sekeliling tankmu kena sekaligus.",
      fullTank: "Airmu penuh lagi, dan 3 tembakan berikutnya gratis.",
      mudBomb: "Lawan dan tank di sebelahnya terjebak 5 giliran.",
      whirlwind: "Semua tank di dekatmu berputar kebingungan.",
      bigUmbrella: "3 tembakan dari depan dan samping tertahan.",
      magnet: "Item terdekat tertarik, dan ember baru langsung di tanganmu.",
    },
  },
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
