// Interface text of the test match (catalog slot `practice`). `en` is the source;
// `id` has the same shape, so a missing or extra Indonesian entry fails the type check.
// Play-style names, round-rule names and action phrases come from m.vocabulary.


/** English ordinal: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export const en = {
  heading: "Test match",
  intro: "Your tank plays one round against bots here, so you can watch what it does.",
  run: "Run a test match",
  /** A toast in the arena room when the real round starts while a test match is shown. */
  closedByRound: "The real round has started, so your test match closed.",
  runAgain: "Run another test match",
  cannotRun: "Your tank's rules need a fix before a test match can run.",
  runFailed: "The test match could not run, so try again.",
  options: "Test options",
  botCount: "Number of bots",
  botStyles: "Bot play styles",
  mixOfStyles: "A mix of play styles",
  onlyStyle: (name: string) => `Only ${name}`,
  roundRules: "Round rules",
  length: "Round length",
  lengths: { short: "Short", normal: "Normal", long: "Long" },
  play: "Play",
  playAgain: "Play again",
  pause: "Pause",
  speed: "Speed",
  speeds: { slow: "Slow", normal: "Normal", fast: "Fast", fastest: "Fastest" },
  turn: "Turn",
  turnOf: (turn: number, turns: number) => `Turn ${turn} of ${turns}`,
  result: (rank: number, players: number) => `Your tank finished ${ordinal(rank)} of ${players} in this test.`,
  /** A score below zero is explained in the same sentence. It says points, not hits, because a bucket's hit moves 2 points (84-items.md). */
  points: (points: number) =>
    points < 0
      ? `Other tanks took more points from it than it took from them, so it ended ${plural(-points, "point", "points")} below zero.`
      : `It ended with ${plural(points, "point", "points")}.`,
  didMost: "What your tank did most",
  mostOften: (phrase: string, turns: number, total: number) => `Your tank most often ${phrase}, in ${turns} of ${total} turns.`,
  shots: (shots: number, hits: number) =>
    shots === 0 ? "It never shot at another tank." : `It shot at a tank ${plural(shots, "time", "times")} and hit ${plural(hits, "time", "times")}.`,
  timesHit: (n: number) => (n === 0 ? "Nobody hit it." : `Other tanks hit it ${plural(n, "time", "times")}.`),
  dryShots: (n: number) => `It tried to shoot ${plural(n, "time", "times")} with too little water.`,
  tips: {
    noShots: "Try a play style or a rule that shoots when a tank stands in front of yours.",
    oftenDry: "Your tank often shot with too little water, so let it wait until the water gauge reaches the mark.",
    hitMoreThanHitting: "Your tank was hit more often than it hit, so Dodge or a play style that moves away can help.",
    manyMisses: "Many shots missed, so Aim helps, and so does shooting from closer.",
  },
  luck: "Each test match has some luck in it, so the same tank can finish higher or lower next time.",
  details: "Rule details",
  mode: "Mode",
  ruleThatRan: "Rule that ran",
  move: "Move",
  waterBefore: "Water before the move",
  nextMode: "Next mode",
  rule: (n: number, sentence: string) => `Rule ${n}. ${sentence}`,
  /** A turn of a rule's steps in order (S3): the term and its value in the turn's rows. */
  step: "Step",
  stepOf: (index: number, count: number) => `${index} of ${count}`,
  /** The line over the replay's step row while the tank runs a rule's steps. */
  runningStep: (rule: number, index: number, count: number) => `Rule ${rule} is doing step ${index} of ${count}.`,
  /** The same line on a turn when the tank reads its rules. */
  readingRules: "Your tank is checking its rules from the top.",
  moves: { F: "Forward", L: "Turn left", R: "Turn right", L45: "Turn slightly left", R45: "Turn slightly right", T: "Shoot", W: "Wait" },
  dryMove: (move: string) => `${move}, too little water`,
  waterOf: (water: number, max: number) => `${water} of ${max} water`,
  pointsAtEnd: "Points at the end",
  thisTurnOf: (turn: number) => (turn === 0 ? "Your tank at the start" : `Your tank on turn ${turn}`),
  showResult: "See the result",
  resultTitle: "Test match result",
  /** The round rules' first choice: a new draw for each match (rules/ConditionChoices.tsx). */
  random: { name: "Random", note: "Each test match draws a condition, as the monthly arena does." },
  none: "None",
};

export const id: typeof en = {
  heading: "Uji coba",
  intro: "Di sini tank kamu main satu ronde melawan bot, jadi kamu bisa melihat caranya bermain.",
  run: "Mulai uji coba",
  closedByRound: "Ronde sungguhan sudah mulai, jadi uji cobamu ditutup.",
  runAgain: "Uji coba lagi",
  cannotRun: "Aturan tank kamu perlu diperbaiki dulu sebelum uji coba bisa jalan.",
  runFailed: "Uji coba belum bisa jalan, jadi coba lagi.",
  options: "Pilihan uji coba",
  botCount: "Jumlah bot",
  botStyles: "Gaya main bot",
  mixOfStyles: "Campuran gaya main",
  onlyStyle: (name) => `Hanya ${name}`,
  roundRules: "Aturan ronde",
  length: "Lama ronde",
  lengths: { short: "Singkat", normal: "Sedang", long: "Lama" },
  play: "Putar",
  playAgain: "Putar lagi",
  pause: "Jeda",
  speed: "Kecepatan",
  speeds: { slow: "Lambat", normal: "Biasa", fast: "Cepat", fastest: "Paling cepat" },
  turn: "Giliran",
  turnOf: (turn, turns) => `Giliran ${turn} dari ${turns}`,
  result: (rank, players) => `Tank kamu dapat peringkat ${rank} dari ${players} tank dalam uji coba ini.`,
  points: (points) =>
    points < 0
      ? `Tank lain mengambil lebih banyak poin dari tank kamu daripada yang diambilnya, jadi poinnya minus ${-points}.`
      : `Tank kamu selesai dengan ${points} poin.`,
  didMost: "Yang paling sering dilakukan tank kamu",
  mostOften: (phrase, turns, total) => `Tank kamu paling sering ${phrase}, yaitu ${turns} dari ${total} giliran.`,
  shots: (shots, hits) =>
    shots === 0 ? "Tank kamu tidak pernah menembak tank lain." : `Tank kamu menembak tank lain ${shots} kali dan kena ${hits} kali.`,
  timesHit: (n) => (n === 0 ? "Tidak ada tank yang berhasil mengenainya." : `Tank lain mengenainya ${n} kali.`),
  dryShots: (n) => `Tank kamu ${n} kali mencoba menembak saat airnya kurang.`,
  tips: {
    noShots: "Coba gaya main atau aturan yang menembak saat ada tank di depan tank kamu.",
    oftenDry: "Tank kamu sering menembak saat airnya kurang, jadi biarkan tank menunggu sampai takaran air mencapai garis.",
    hitMoreThanHitting: "Tank kamu lebih sering kena tembak daripada mengenai tank lain, jadi coba Hindaran atau gaya main yang suka menjauh.",
    manyMisses: "Banyak tembakan meleset, jadi coba Bidikan atau tembak dari jarak lebih dekat.",
  },
  luck: "Setiap uji coba ada unsur untungnya, jadi tank yang sama bisa dapat peringkat lain di uji coba berikutnya.",
  details: "Rincian aturan",
  mode: "Mode",
  ruleThatRan: "Aturan yang jalan",
  move: "Gerakan",
  waterBefore: "Air sebelum bergerak",
  nextMode: "Mode berikutnya",
  rule: (n, sentence) => `Aturan ${n}. ${sentence}`,
  step: "Langkah",
  stepOf: (index, count) => `${index} dari ${count}`,
  runningStep: (rule, index, count) => `Aturan ${rule} sedang menjalankan langkah ${index} dari ${count}.`,
  readingRules: "Tank kamu sedang memeriksa aturannya dari atas.",
  moves: { F: "Maju", L: "Belok kiri", R: "Belok kanan", L45: "Belok sedikit ke kiri", R45: "Belok sedikit ke kanan", T: "Tembak", W: "Tunggu" },
  dryMove: (move) => `${move}, air kurang`,
  waterOf: (water, max) => `air ${water} dari ${max}`,
  pointsAtEnd: "Poin di akhir",
  thisTurnOf: (turn) => (turn === 0 ? "Tank kamu di awal" : `Tank kamu di giliran ${turn}`),
  showResult: "Lihat hasil",
  resultTitle: "Hasil uji coba",
  random: { name: "Acak", note: "Setiap uji coba mengundi satu kondisi, seperti arena bulanan." },
  none: "Tidak ada",
};
