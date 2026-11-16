// Interface text for "/champions", the hall of fame: this month's ranking, the
// champions of past months, and the recent tournament champions. Catalog slot: `champions`.

import { en as publicEn, id as publicId } from "../publicplay/messages.ts";

const points = (n: number) => (n === 1 ? "1 point" : `${n} points`);

export const en = {
  heading: "Champions",
  /** The parts: tabs on a phone, columns on a laptop. */
  parts: {
    label: "Parts of the champions page",
    month: "This month",
    months: "Past months",
    tournaments: "Tournaments",
  },
  /** `month` is the month's name, such as "November 2026". */
  monthHeading: (month: string) => `Ranking of ${month}`,
  /** The monthly arena's rule, worded once in publicplay/messages.ts. */
  rule: publicEn.league.rule,
  monthEmpty: "No tank plays in the monthly arena this month yet.",
  monthsHeading: "Champions of past months",
  /** A past month's line under its name. */
  champion: (name: string, score: number) => `${name} became champion with ${points(score)}.`,
  monthTop: "Top three",
  monthsEmpty: "No month has ended yet, so there is no champion yet.",
  tournamentsHeading: "Recent tournament champions",
  /** `date` is a date such as "12 November 2026". */
  won: (name: string, date: string, tanks: number) => `${name} beat ${tanks - 1} other tanks on ${date}.`,
  tournamentsEmpty: "Nobody has won a tournament yet, so the first winner could be you.",
  loading: "Loading the champions.",
  retry: "Try again",
  /** A closed month whose rules are open (champions/MonthRules.tsx). `month` is "December 2026". */
  monthRules: {
    open: "Every tank's rules",
    heading: (month: string) => `Rules of ${month}`,
    note: (month: string) => `These are the rules each tank had when ${month} ended, so a tank that left earlier is not in the list.`,
    loading: "The tanks are loading.",
  },
};

export const id: typeof en = {
  heading: "Para juara",
  parts: {
    label: "Bagian halaman para juara",
    month: "Bulan ini",
    months: "Bulan lalu",
    tournaments: "Turnamen",
  },
  monthHeading: (month) => `Peringkat ${month}`,
  rule: publicId.league.rule,
  monthEmpty: "Belum ada tank yang main di arena bulanan bulan ini.",
  monthsHeading: "Juara bulan-bulan lalu",
  champion: (name, score) => `${name} jadi juara dengan ${score} poin.`,
  monthTop: "Tiga teratas",
  monthsEmpty: "Belum ada bulan yang selesai, jadi belum ada juara.",
  tournamentsHeading: "Juara turnamen terbaru",
  won: (name, date, tanks) => `${name} mengalahkan ${tanks - 1} tank lain pada ${date}.`,
  tournamentsEmpty: "Belum ada yang memenangkan turnamen, jadi pemenang pertama bisa kamu.",
  loading: "Memuat para juara.",
  retry: "Coba lagi",
  monthRules: {
    open: "Aturan semua tank",
    heading: (month) => `Aturan ${month}`,
    note: (month) => `Ini aturan setiap tank saat ${month} berakhir, jadi tank yang keluar lebih awal tidak ada di daftar.`,
    loading: "Daftar tank sedang dimuat.",
  },
};
