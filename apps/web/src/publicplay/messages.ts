// Interface text for the arenas on /play: their names, the chooser, the first-timer's join
// step, and the parts the room adds in a public arena (Ready, the tournament's winner line).
// Catalog slot: `publicplay`. The names follow the glossary in docs/specs/revamp/00-overview.md.

import type { ChooserKind } from "./chooserKinds.ts";

const players = (n: number) => (n === 1 ? "1 player is" : `${n} players are`);
const tanks = (n: number) => (n === 1 ? "1 tank plays" : `${n} tanks play`);

/** What happens in each arena, said once and reused by the tile and the monthly rule. */
const aboutEn = {
  practice: "Quick games start often, so you can try new ideas.",
  tournament: "After each round, the top half go through, until one tank wins.",
  monthly: "Your tank plays a round every day, and the best average of the month wins.",
} satisfies Record<ChooserKind, string>;

export const en = {
  names: { practice: "Practice arena", tournament: "Tournament arena", monthly: "Monthly arena" } satisfies Record<ChooserKind, string>,
  /** One sentence per arena that says what happens there. */
  about: aboutEn,
  chooser: {
    heading: "Choose an arena",
    legend: "Arena",
    play: "Play",
    /** The monthly arena has its own page, where anyone can watch. */
    openMonthly: "Open the monthly arena",
  },
  /** The first-timer's join step: no chooser, straight into the practice arena. */
  first: {
    heading: "Play now",
    intro: "Your tank joins the practice arena, where bots fill the empty seats.",
  },
  /** The live line on each tile, from GET /api/public. */
  live: {
    loading: "Checking who plays here now.",
    failed: "The page cannot check this arena right now, and you can still play.",
    practice: (humans: number) => (humans === 0 ? "Nobody is playing right now, so bots will join you." : `${players(humans)} here now.`),
    /** `clock` is "0:42". */
    tournamentStartsIn: (clock: string) => `The next tournament starts in ${clock}.`,
    tournamentWaits: "The next tournament starts soon after the first player joins.",
    tournamentRunning: (round: number) => `Round ${round} is running, and the next tournament starts after it.`,
    tournamentBreak: (round: number) => `Round ${round} starts soon, and the next tournament starts after this one.`,
    tournamentEnded: "This tournament just ended, and the next one starts soon.",
    monthly: (count: number) => (count === 0 ? "No tank plays in the monthly arena yet." : `${tanks(count)} in the monthly arena now.`),
  },
  problems: {
    tournamentFull: "The tournament arena is full, so play in the practice arena for now.",
    choosePractice: "Choose the practice arena",
    goToPractice: "Go to the practice arena",
  },
  /** "I'm ready" in the bottom bar of a public lobby and of a public result. */
  ready: {
    button: "I'm ready",
    detail: "When everyone is ready, the game starts sooner.",
    done: "You are ready, and the game starts when the others are ready or the clock ends.",
    /** On a result: ready carries into the next lobby, and the result itself does not get shorter. */
    detailOnResult: "When everyone is ready, the next game starts sooner.",
    doneOnResult: "You are ready for the next game.",
    /** The tag on a player's row in the lobby. */
    tag: "ready",
  },
  /** The monthly arena's rule (77-monthly-league.md, section 3). The spec's "Skor" is "Poin" here, because the glossary bans "skor". */
  league: {
    rule: "Your monthly points are the average of your points on the days your tank played from the start of the day.",
  },
  tournament: {
    nextIn: "Next tournament",
    botWon: "A bot won this time, so no new champion goes on the champions page.",
    youOnList: "Your tank is a champion and goes on the champions page.",
    onList: (name: string) => `${name} is the champion and goes on the champions page.`,
  },
  champions: "Champions",
  /** The link on a public result to the chooser of the three arenas (publicplay/OtherArenasLink.tsx). */
  otherArenas: "Other arenas",
};

export type PublicPlayText = typeof en;

const pemain = (n: number) => `${n} pemain`;

const aboutId: typeof aboutEn = {
  practice: "Permainan cepat sering mulai, jadi kamu bisa coba ide baru.",
  tournament: "Setelah tiap ronde, separuh teratas lolos sampai satu tank menang.",
  monthly: "Tank kamu main satu ronde tiap hari, dan rata-rata terbaik bulan ini menang.",
};

export const id: typeof en = {
  names: { practice: "Arena latihan", tournament: "Arena turnamen", monthly: "Arena bulanan" },
  about: aboutId,
  chooser: {
    heading: "Pilih arena",
    legend: "Arena",
    play: "Main",
    openMonthly: "Buka arena bulanan",
  },
  first: {
    heading: "Main sekarang",
    intro: "Tank kamu masuk ke arena latihan, dan bot mengisi kursi yang masih kosong.",
  },
  live: {
    loading: "Memeriksa siapa yang main di sini.",
    failed: "Halaman ini belum bisa memeriksa arena ini, tapi kamu tetap bisa main.",
    practice: (humans) => (humans === 0 ? "Belum ada yang main sekarang, jadi bot akan menemanimu." : `Ada ${pemain(humans)} di sini sekarang.`),
    tournamentStartsIn: (clock) => `Turnamen berikutnya mulai dalam ${clock}.`,
    tournamentWaits: "Turnamen berikutnya mulai tak lama setelah pemain pertama masuk.",
    tournamentRunning: (round) => `Ronde ${round} sedang berjalan, dan turnamen berikutnya mulai setelahnya.`,
    tournamentBreak: (round) => `Ronde ${round} segera mulai, dan turnamen berikutnya mulai setelah turnamen ini.`,
    tournamentEnded: "Turnamen ini baru selesai, dan turnamen berikutnya segera mulai.",
    monthly: (count) => (count === 0 ? "Belum ada tank yang main di arena bulanan." : `${count} tank sedang main di arena bulanan.`),
  },
  problems: {
    tournamentFull: "Arena turnamen sudah penuh, jadi main dulu di arena latihan.",
    choosePractice: "Pilih arena latihan",
    goToPractice: "Ke arena latihan",
  },
  ready: {
    button: "Aku siap",
    detail: "Kalau semua sudah siap, permainan mulai lebih cepat.",
    done: "Kamu sudah siap, dan permainan mulai saat yang lain siap atau waktunya habis.",
    detailOnResult: "Kalau semua siap, permainan berikutnya mulai lebih cepat.",
    doneOnResult: "Kamu sudah siap untuk permainan berikutnya.",
    tag: "siap",
  },
  league: {
    rule: "Poin bulananmu adalah rata-rata poin dari hari-hari yang tank kamu ikuti sejak awal hari.",
  },
  tournament: {
    nextIn: "Turnamen berikutnya",
    botWon: "Kali ini bot yang menang, jadi tidak ada juara baru.",
    youOnList: "Tank kamu jadi juara dan masuk halaman para juara.",
    onList: (name) => `${name} jadi juara dan masuk halaman para juara.`,
  },
  champions: "Para juara",
  otherArenas: "Arena lain",
};
