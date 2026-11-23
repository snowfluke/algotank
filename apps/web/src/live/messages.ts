// Interface text for the `live` slot of the catalog (src/i18n/catalog.ts): a
// running round on a phone and on the big screen, the viewer's own status, and the
// feed of what the viewer's tank did. `en` is the source; `id` has the same shape.

import type { UltimateId } from "@game/engine";
import { en as catalogueEn, id as catalogueId } from "../catalogue/messages.ts";

export const en = {
  heading: (round: number, isFinal: boolean) => (isFinal ? "Final" : `Round ${round}`),
  /** A game of only one round (live/roundHeading.ts, roundKind). */
  headingGame: "The game",
  /** The round heading with the rules' name, in an arena that changes the rules. */
  headingWithRules: (heading: string, rules: string) => `${heading}: ${rules}`,
  timeLeft: "Time left",
  starting: "The round is about to start.",
  findYourTank: "Find your tank with the orange ring before the first turn.",
  status: {
    place: "Place",
    points: "Points",
    water: "Water",
    waterOf: (max: number) => `of ${max}`,
    /** Next to the water number in the compact row above the board. */
    tooLittleShort: "too low to shoot",
    /** The few words next to the place in the compact row; the full sentences are above. */
    short: {
      through: "through",
      out: "below the cut",
      onLine: "on the cut line",
      allThrough: "all go through",
      leading: "leading",
      sharedLead: "shared lead",
      chasing: (behind: number) => (behind === 1 ? "1 point behind" : `${behind} points behind`),
    },
    /** `place` is the ordinal from m.results.ordinal, for example "3rd". */
    placeText: (place: string, of: number, tied: boolean) => (tied ? `You share ${place} place of ${of}` : `You are ${place} of ${of}`),
    through: (placeText: string) => `${placeText}, so right now you go through.`,
    out: (placeText: string) => `${placeText} and below the cut line right now, so every hit counts.`,
    onLine: (placeText: string) => `${placeText}, with the same points as a tank across the cut line. More hits decide who goes through.`,
    allThrough: (placeText: string) => `${placeText}, and every tank goes through this round.`,
    leading: "You lead the final, so hold on until the last turn.",
    sharedLead: "You share the lead in the final, so one more hit can win it.",
    chasing: (placeText: string, behind: number) =>
      `${placeText} in the final and ${behind === 1 ? "1 point" : `${behind} points`} behind the leader.`,
  },
  feed: {
    heading: "What your tank did",
    empty: "Your tank's moves show here from the first turn.",
    turn: (turn: number) => `Turn ${turn}`,
    because: (action: string, reason: string) => `${action}, because ${reason}.`,
    always: (action: string) => `${action}, because this rule always fits.`,
    noRule: (action: string) => `${action}, because no rule fit.`,
    plain: (action: string) => `${action}.`,
    /** An action whose step was blocked. `present` is "move away from …", `done` is "moved away from …". */
    tried: (present: string, _done: string) => `tried to ${present}`,
    // A feed line is the tank speaking, because its reason is the rule in the editor's
    // first person ("my water"). Every sentence after the first keeps that voice.
    blockedShot: "My way was blocked, so I shot instead.",
    /** A step that could not go on and a shot that would do nothing, without water or a tank in line: the tank waited (engine RoundConfig.waitWhenDry, waitWhenNoTarget). */
    blockedWait: "I could not do it, so I waited.",
    switched: (modeName: string) => `Then I switched to the “${modeName}” mode.`,
    /** A turn of a rule's sequence of steps. */
    stepOf: (rule: number, index: number, count: number) => `This was step ${index} of ${count} of rule ${rule}.`,
    /** Joins the conditions of a rule that needs all of them, or any of them. */
    and: " and ",
    or: " or ",
    hit: "My shot hit.",
    miss: "My shot missed.",
    nothing: "My shot hit nothing.",
    dry: "My water was too low, so nothing came out.",
    blocked: "An umbrella stopped my shot.",
    deflected: "Smoke deflected my shot.",
    bucketHit: "My bucket shot hit, worth 2 points.",
    dizzy: "I was dizzy, so I checked my rules from the bottom up.",
    ultimate: (id: UltimateId) => `I used ${catalogueEn.ultimates[id].name}.`,
    spin: "A pinwheel spun me round, so I checked no rule this turn.",
  },
};

export const id: typeof en = {
  heading: (round, isFinal) => (isFinal ? "Final" : `Ronde ${round}`),
  headingGame: "Permainan",
  headingWithRules: (heading, rules) => `${heading}: ${rules}`,
  timeLeft: "Sisa waktu",
  starting: "Ronde segera mulai.",
  findYourTank: "Cari tank kamu yang bercincin oranye sebelum giliran pertama.",
  status: {
    place: "Peringkat",
    points: "Poin",
    water: "Air",
    waterOf: (max) => `dari ${max}`,
    tooLittleShort: "belum bisa menembak",
    short: {
      through: "lolos",
      out: "belum lolos",
      onLine: "di batas lolos",
      allThrough: "semua lolos",
      leading: "memimpin",
      sharedLead: "memimpin bersama",
      chasing: (behind) => `tertinggal ${behind} poin`,
    },
    placeText: (place, of, tied) => (tied ? `Kamu berbagi peringkat ${place} dari ${of}` : `Kamu di peringkat ${place} dari ${of}`),
    through: (placeText) => `${placeText}, jadi saat ini kamu lolos.`,
    out: (placeText) => `${placeText}, di bawah batas lolos. Setiap tembakan yang kena bisa menaikkan peringkatmu.`,
    onLine: (placeText) => `${placeText}, dan poinmu sama dengan tank di seberang batas lolos. Yang lolos adalah tank yang tembakannya lebih sering kena.`,
    allThrough: (placeText) => `${placeText}, dan di ronde ini semua tank lolos.`,
    leading: "Kamu memimpin final, jadi bertahanlah sampai giliran terakhir.",
    sharedLead: "Kamu memimpin final bersama tank lain, jadi satu tembakan lagi bisa membuatmu menang.",
    chasing: (placeText, behind) => `${placeText} di final dan tertinggal ${behind} poin dari pemimpin.`,
  },
  feed: {
    heading: "Yang dilakukan tank kamu",
    empty: "Langkah tank kamu muncul di sini mulai giliran pertama.",
    turn: (turn) => `Giliran ${turn}`,
    because: (action, reason) => `${action}, karena ${reason}.`,
    always: (action) => `${action}, karena aturan ini selalu cocok.`,
    noRule: (action) => `${action}, karena tidak ada aturan yang cocok.`,
    plain: (action) => `${action}.`,
    tried: (_present, done) => `mencoba ${done}`,
    blockedShot: "Jalanku terhalang, jadi aku menembak.",
    blockedWait: "Aku tidak bisa melakukannya, jadi aku menunggu.",
    switched: (modeName) => `Lalu aku pindah ke mode “${modeName}”.`,
    stepOf: (rule, index, count) => `Ini langkah ${index} dari ${count} di aturan ${rule}.`,
    and: " dan ",
    or: " atau ",
    hit: "Tembakanku kena.",
    miss: "Tembakanku meleset.",
    nothing: "Tembakanku tidak mengenai apa pun.",
    dry: "Airku kurang, jadi tidak ada air yang keluar.",
    blocked: "Tembakanku ditahan payung.",
    deflected: "Kabut membelokkan tembakanku.",
    bucketHit: "Tembakan emberku kena dan bernilai 2 poin.",
    dizzy: "Aku sedang pusing, jadi aturanku kubaca dari bawah.",
    ultimate: (id) => `Aku memakai jurus ${catalogueId.ultimates[id].name}.`,
    spin: "Kincir membuatku berputar, jadi giliran ini aku tidak membaca aturan.",
  },
};
