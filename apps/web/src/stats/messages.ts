// The statistics card (stats/StatsCard.tsx) and the account's totals on "My tank".

const turns = (n: number) => (n === 1 ? "1 turn" : `${n} turns`);

export const en = {
  /** The room's tab and switch for the card after a round; "My tank" was cut off in a row of five tabs. */
  tab: "Stats",
  /** The heading of the card after a round. */
  round: (n: number) => `Round ${n}`,
  /** The heading of the card at the end of a game: its numbers are the whole game's. */
  game: "This game",
  today: "Today",
  shots: "Shots",
  hits: "On target",
  timesHit: "Got hit",
  /** Under the hits: the share of the shots that hit. */
  hitRate: (percent: number) => `${percent}% of shots`,
  moved: (squares: number, turnCount: number) => `Your tank moved ${squares === 1 ? "1 square" : `${squares} squares`} in ${turns(turnCount)}.`,
  /** The rules part. After a game of several rounds, the rows are the last round's. */
  rulesHeading: "Turns of each rule",
  rulesHeadingLastRound: "Turns of each rule in the last round",
  rule: (n: number) => `Rule ${n}`,
  ruleInMode: (n: number, mode: string) => `Rule ${n} in ${mode}`,
  turns,
  /** A row read aloud: "Rule 2 ran for 31 turns." */
  ran: (rule: string, n: number) => `${rule} ran for ${turns(n)}.`,
  /** One sentence for the rules that never ran, in modes the tank was in. */
  neverRanOne: (rule: string) => `${rule} never ran, so look at its condition.`,
  neverRanMany: (rules: string) => `${rules} never ran, so look at their conditions.`,
  neverRanCount: (n: number) => `${n} rules never ran, so look at their conditions.`,
  /** The switch between a pane's summary and the card: the Try it result, the monthly "Your tank". */
  parts: { label: "What the pane shows", summary: "Summary", stats: "Statistics" },
  /** The "My tank" page: the account's totals. */
  account: {
    switchLabel: "What the page shows",
    tank: "Tank",
    stats: "Statistics",
    heading: "Your games",
    games: "Games",
    wins: "Wins",
    rounds: "Rounds",
    shots: "Shots",
    hits: "On target",
    monthsHeading: "Rounds each month",
    empty: "Your numbers show here after you play a round while signed in.",
    loading: "Your numbers are loading.",
    failed: "Your numbers could not be loaded, so try again in a moment.",
  },
};

export const id: typeof en = {
  tab: "Statistik",
  round: (n) => `Ronde ${n}`,
  game: "Permainan ini",
  today: "Hari ini",
  shots: "Tembakan",
  hits: "Tepat sasaran",
  timesHit: "Ditembak",
  hitRate: (percent) => `${percent}% dari tembakan`,
  moved: (squares, turnCount) => `Tank kamu bergerak ${squares} petak dalam ${turnCount} giliran.`,
  rulesHeading: "Giliran tiap aturan",
  rulesHeadingLastRound: "Giliran tiap aturan di ronde terakhir",
  rule: (n) => `Aturan ${n}`,
  ruleInMode: (n, mode) => `Aturan ${n} di ${mode}`,
  turns: (n) => `${n} giliran`,
  ran: (rule, n) => `${rule} jalan ${n} giliran.`,
  neverRanOne: (rule) => `${rule} tidak pernah jalan, jadi coba periksa syaratnya.`,
  neverRanMany: (rules) => `${rules} tidak pernah jalan, jadi coba periksa syaratnya.`,
  neverRanCount: (n) => `${n} aturan tidak pernah jalan, jadi coba periksa syaratnya.`,
  parts: { label: "Isi panel", summary: "Ringkasan", stats: "Statistik" },
  account: {
    switchLabel: "Isi halaman",
    tank: "Tank",
    stats: "Statistik",
    heading: "Permainan kamu",
    games: "Permainan",
    wins: "Menang",
    rounds: "Ronde",
    shots: "Tembakan",
    hits: "Tepat sasaran",
    monthsHeading: "Ronde tiap bulan",
    empty: "Angka kamu muncul di sini setelah kamu main satu ronde dengan akun.",
    loading: "Angka kamu sedang dimuat.",
    failed: "Angka kamu belum bisa dimuat, jadi coba lagi sebentar lagi.",
  },
};
