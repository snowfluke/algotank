// The landing page's text in Indonesian and English. Text the game already shows
// (arena names, "Play now", the rule words) comes from the game's own catalogs, so a
// change there changes the landing page too. Text written here follows the same rules
// as the game's copy: plain headings and subtitles that are whole sentences.

import * as home from "../src/home/messages.ts";
import * as publicplay from "../src/publicplay/messages.ts";
import * as vocabulary from "../src/vocabulary/messages.ts";
import type { VocabularyText } from "../src/vocabulary/messages.ts";
import { DEMO_COPY, type DemoCopy, type LandingLanguage } from "./demo-copy.ts";

export type { LandingLanguage };

export interface ArenaRow {
  readonly name: string;
  readonly text: string;
}

export interface LandingCopy {
  readonly language: LandingLanguage;
  readonly title: string;
  readonly description: string;
  readonly vocabulary: VocabularyText;
  readonly header: { readonly home: string; readonly otherLanguage: string; readonly playNow: string };
  readonly hero: {
    readonly heading: string;
    readonly sentence: string;
    readonly rulesLabel: string;
    readonly boardLabel: string;
    readonly yourTank: string;
    readonly noScript: string;
  };
  readonly demo: DemoCopy;
  readonly actions: { readonly playNow: string; readonly joinCode: string };
  readonly round: { readonly heading: string; readonly steps: readonly string[] };
  readonly arenas: {
    readonly heading: string;
    readonly sentence: string;
    readonly practice: ArenaRow;
    readonly tournament: ArenaRow;
    readonly monthly: ArenaRow;
    readonly private: ArenaRow;
    readonly presenter: ArenaRow;
  };
  readonly organisers: {
    readonly heading: string;
    readonly sentence: string;
    readonly points: readonly string[];
    readonly create: string;
    readonly signInNeeded: string;
    readonly screenshotAlt: string;
  };
}

const en: LandingCopy = {
  language: "en",
  title: "AlgoTank: build rules for a toy tank",
  description: "AlgoTank is a water fight game in the browser where you build rules for a toy tank and watch it play by itself.",
  vocabulary: vocabulary.en,
  header: { home: "AlgoTank home", otherLanguage: "Bahasa Indonesia", playNow: home.en.playNow.title },
  hero: {
    heading: "Build the rules, then watch your tank play",
    sentence: "Your tank does the first rule from the top that fits, so move a rule up or down and the round plays again.",
    rulesLabel: "Your tank's rules",
    boardLabel: "A round of the game: your tank and 7 bots shoot water at each other on a grid.",
    yourTank: "Your tank has the orange ring.",
    noScript: "Turn on JavaScript to play the demo round.",
  },
  demo: DEMO_COPY.en,
  actions: { playNow: home.en.playNow.title, joinCode: home.en.joinCode.title },
  round: {
    heading: "How a game works",
    steps: [
      "Pick a play style for your tank, or build your own rules in the tank workshop.",
      "Spend your upgrade points on Range, Aim and Dodge.",
      "Watch the round, because nobody steers. A hit moves 1 point from the tank that was hit to the shooter, and a shot uses water that refills over time.",
      "With more than 8 tanks, each round keeps the top half until 8 remain, and one final decides the winner.",
    ],
  },
  arenas: {
    heading: "Arenas",
    sentence: "Each arena runs another kind of game, and the practice arena needs no account.",
    practice: { name: publicplay.en.names.practice, text: publicplay.en.about.practice },
    tournament: { name: publicplay.en.names.tournament, text: publicplay.en.about.tournament },
    monthly: { name: publicplay.en.names.monthly, text: publicplay.en.about.monthly },
    private: { name: "Private arena", text: home.en.createPrivate.body },
    presenter: { name: "Presenter arena", text: home.en.createPresenter.body },
  },
  organisers: {
    heading: "Run a game for a class or an event",
    sentence: "A presenter arena shows the game on a big screen while up to 512 players join by QR code on their phones.",
    points: [
      "You decide when each round starts, and you do not play yourself.",
      "You can let in only players who signed in.",
      "The result and its round history stay online for 180 days.",
    ],
    create: home.en.createPresenter.title,
    signInNeeded: home.en.signInNeeded,
    screenshotAlt: "A stored tournament result: Ana won, with the final ranking and each round's ranking from round 1 to the final.",
  },
};

const id: LandingCopy = {
  language: "id",
  title: "AlgoTank: susun aturan untuk tank mainan",
  description: "AlgoTank adalah permainan perang air di browser: kamu menyusun aturan untuk tank mainan, lalu menonton tank itu bermain sendiri.",
  vocabulary: vocabulary.id,
  header: { home: "Beranda AlgoTank", otherLanguage: "English", playNow: home.id.playNow.title },
  hero: {
    heading: "Susun aturannya, lalu tonton tankmu bermain",
    sentence: "Tankmu menjalankan aturan pertama dari atas yang cocok, jadi pindahkan aturan ke atas atau ke bawah, lalu rondenya diputar lagi.",
    rulesLabel: "Aturan tankmu",
    boardLabel: "Satu ronde permainan: tankmu dan 7 bot saling menembakkan air di atas petak.",
    yourTank: "Tankmu memakai cincin oranye.",
    noScript: "Nyalakan JavaScript untuk memutar ronde contoh.",
  },
  demo: DEMO_COPY.id,
  actions: { playNow: home.id.playNow.title, joinCode: home.id.joinCode.title },
  round: {
    heading: "Cara permainan berjalan",
    steps: [
      "Pilih gaya main untuk tankmu, atau susun aturanmu sendiri di bengkel tank.",
      "Bagikan poin upgrade ke Jangkauan, Bidikan, dan Hindaran.",
      "Tonton rondenya, karena tidak ada yang menyetir. Tembakan yang kena memindahkan 1 poin dari tank yang kena ke penembaknya, dan setiap tembakan memakai air yang terisi lagi seiring waktu.",
      "Kalau ada lebih dari 8 tank, setiap ronde meloloskan separuh teratas sampai tersisa 8, lalu satu final menentukan pemenangnya.",
    ],
  },
  arenas: {
    heading: "Arena",
    sentence: "Setiap arena menjalankan jenis permainan yang berbeda, dan arena latihan tidak perlu akun.",
    practice: { name: publicplay.id.names.practice, text: publicplay.id.about.practice },
    tournament: { name: publicplay.id.names.tournament, text: publicplay.id.about.tournament },
    monthly: { name: publicplay.id.names.monthly, text: publicplay.id.about.monthly },
    private: { name: "Arena pribadi", text: home.id.createPrivate.body },
    presenter: { name: "Arena presenter", text: home.id.createPresenter.body },
  },
  organisers: {
    heading: "Jalankan permainan untuk kelas atau acara",
    sentence: "Arena presenter menampilkan permainan di layar besar, sementara sampai 512 pemain gabung lewat kode QR di ponsel mereka.",
    points: [
      "Kamu yang menentukan kapan setiap ronde mulai, dan kamu sendiri tidak ikut bermain.",
      "Kamu bisa hanya menerima pemain yang sudah masuk akun.",
      "Hasil dan riwayat rondenya tersimpan selama 180 hari.",
    ],
    create: home.id.createPresenter.title,
    signInNeeded: home.id.signInNeeded,
    screenshotAlt: "Hasil turnamen yang tersimpan: Ana menang, dengan peringkat akhir dan peringkat setiap ronde dari ronde 1 sampai final.",
  },
};

export const LANDING_COPY: Readonly<Record<LandingLanguage, LandingCopy>> = { id, en };
