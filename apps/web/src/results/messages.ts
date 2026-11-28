// Interface text for the `results` slot of the catalog (src/i18n/catalog.ts): the
// ranking tables (live, after a round, at the end), the player's outcome after a
// round and at the end, and the celebration. `en` is the source; `id` has the same
// shape, so a missing or extra Indonesian entry fails the type check.

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const times = (n: number) => (n === 1 ? "1 time" : `${n} times`);

export const en = {
  /** "3rd", in a sentence and under the label "Place". */
  ordinal,
  table: {
    live: "Ranking",
    round: (round: number) => `Round ${round} ranking`,
    roundList: "Round ranking",
    final: "Final ranking",
    place: "Place",
    points: "Points",
    you: "You",
    bot: "Bot",
    /** Read in place of the interval before a row's points ("−213"). */
    behindAbove: (behind: number) => (behind === 0 ? "Level with the tank above" : `${behind} points behind the tank above`),
    through: "Through",
    out: "Out",
    /** The label on the cut line. */
    topGoThrough: (n: number) => `Top ${n} go through`,
    /** The button under a paged ranking that turns to the page with the cut line. */
    toCutLine: "Go to the cut line",
    finalRule: "The tank with the most points at the end wins.",
    tieAtCut: "When tanks at the cut line have the same points, the one with more hits goes through. A draw decides any tie that is left.",
    /** The big screen's line for the rows that do not fit during a round. */
    moreInRound: (n: number) => (n === 1 ? "1 more tank plays in this round." : `${n} more tanks play in this round.`),
    /** The big screen's line for the places that do not fit in the final ranking. */
    moreBelow: (n: number) => (n === 1 ? "1 more tank finished in a lower place." : `${n} more tanks finished in lower places.`),
  },
  round: {
    heading: (round: number) => `Round ${round} result`,
    finalHeading: "Final result",
    /** A game of only one round (live/roundHeading.ts, roundKind). */
    gameHeading: "Game result",
    /** `place` is the ordinal from `ordinal`. */
    through: (place: string, of: number, nextIsFinal: boolean, nextRound: number) =>
      `You finished ${place} of ${of}, so you go through to ${nextIsFinal ? "the final" : `round ${nextRound}`}.`,
    out: (place: string, of: number) => `You finished ${place} of ${of}, so your tank is out of this game.`,
    recap: (landed: number, taken: number) =>
      landed === 0
        ? `Your shots did not hit this round, and other tanks hit you ${times(taken)}.`
        : `Your shots hit ${times(landed)}, and other tanks hit you ${times(taken)}.`,
  },
  out: {
    heading: "Your tank is out",
    kind: "Every game brings new luck, so a good play style can win the next one.",
    watch: "You can keep watching here, because each round shows on this page when it starts.",
  },
  finished: {
    youWon: "You won the game!",
    winnerIs: (name: string) => `${name} won!`,
    yourPlace: (place: string, of: number) => `You finished ${place} of ${of}.`,
    podium: "Top three",
    /** The place above a name on the podium, shown without a label. */
    podiumPlace: ordinal,
  },
  /** The round history: one column per round, the final last (results/RoundHistory.tsx). */
  history: {
    heading: "Round history",
    round: (round: number) => `Round ${round}`,
    final: "Final",
    /** Read aloud for a column's picture of how many tanks played and went on. */
    count: (tanks: number, through: number) => `${tanks} tanks played, and ${through} went through.`,
    finalCount: (tanks: number) => `${tanks} tanks played the final.`,
    through: "Through",
    out: "Out",
    winner: "Winner",
    earlier: "Earlier rounds",
    later: "Later rounds",
    position: (first: number, last: number, total: number) => (first === last ? `Round ${first} of ${total}` : `Rounds ${first} to ${last} of ${total}`),
    empty: "The history shows here once the first round has finished.",
  },
  /** The page of a stored result, /r/:id. */
  page: {
    loading: "Loading the result.",
    notFound: "This result is not here, because the link is wrong or the result is older than 180 days.",
    winnerEmail: "Winner's email",
    tabs: { winner: "Winner", ranking: "Ranking", history: "Rounds" },
    parts: "Parts of the result",
    played: (date: string, rounds: number, tanks: number) => `Played on ${date} in ${rounds === 1 ? "1 round" : `${rounds} rounds`} with ${tanks} tanks.`,
    link: "Result link",
    qr: "QR code of the result link",
  },
  /** The arena link of a game that ended, when its result is kept. */
  ended: {
    title: "This arena has ended",
    body: "Its result stays here for 180 days, so open it to see who won.",
    open: "Open the result",
  },
  /** "My results": the signed-in owner's stored results. */
  mine: {
    heading: "My results",
    list: "Results, newest first",
    loading: "Loading your results.",
    failed: "Your results could not load, so check your connection and try again.",
    tryAgain: "Try again",
    empty: "Your arenas have no finished game yet, so a result shows here after your first final.",
    won: (name: string) => `${name} won`,
    details: (date: string, tanks: number) => `Played on ${date} with ${tanks} tanks.`,
  },
};

export const id: typeof en = {
  // "Peringkat 3" reads naturally, and "ke-3" looks odd as a large number under the label.
  ordinal: (n) => String(n),
  table: {
    live: "Peringkat",
    round: (round) => `Peringkat ronde ${round}`,
    roundList: "Peringkat ronde",
    final: "Peringkat akhir",
    place: "Peringkat",
    points: "Poin",
    you: "Kamu",
    bot: "Bot",
    behindAbove: (behind) => (behind === 0 ? "Sama dengan tank di atasnya" : `${behind} poin di belakang tank di atasnya`),
    through: "Lolos",
    out: "Tersingkir",
    topGoThrough: (n) => `${n} teratas lolos`,
    toCutLine: "Lihat batas lolos",
    finalRule: "Tank dengan poin terbanyak di akhir final jadi pemenang.",
    tieAtCut: "Kalau poin di batas lolos sama, tank yang tembakannya lebih sering kena yang lolos. Kalau masih sama, hasilnya diundi.",
    moreInRound: (n) => `${n} tank lain juga main di ronde ini.`,
    moreBelow: (n) => `${n} tank lain ada di peringkat bawah.`,
  },
  round: {
    heading: (round) => `Hasil ronde ${round}`,
    finalHeading: "Hasil final",
    gameHeading: "Hasil permainan",
    through: (place, of, nextIsFinal, nextRound) =>
      `Kamu di peringkat ${place} dari ${of}, jadi kamu lolos ke ${nextIsFinal ? "final" : `ronde ${nextRound}`}.`,
    out: (place, of) => `Kamu di peringkat ${place} dari ${of}, jadi tank kamu tersingkir dari permainan ini.`,
    recap: (landed, taken) =>
      landed === 0
        ? `Di ronde ini belum ada tembakanmu yang kena, dan tank lain mengenaimu ${taken} kali.`
        : `Tembakanmu kena ${landed} kali, dan tank lain mengenaimu ${taken} kali.`,
  },
  out: {
    heading: "Tank kamu tersingkir",
    kind: "Setiap permainan membawa keberuntungan baru, jadi gaya main yang pas bisa menang lain kali.",
    watch: "Kamu tetap bisa menonton di sini, karena setiap ronde muncul di halaman ini saat mulai.",
  },
  finished: {
    youWon: "Kamu menang!",
    winnerIs: (name) => `${name} menang!`,
    yourPlace: (place, of) => `Kamu di peringkat ${place} dari ${of}.`,
    podium: "Tiga teratas",
    podiumPlace: (n) => `Peringkat ${n}`,
  },
  history: {
    heading: "Riwayat ronde",
    round: (round) => `Ronde ${round}`,
    final: "Final",
    count: (tanks, through) => `${tanks} tank bermain, dan ${through} tank lolos.`,
    finalCount: (tanks) => `${tanks} tank bermain di final.`,
    through: "Lolos",
    out: "Tersingkir",
    winner: "Pemenang",
    earlier: "Ronde sebelumnya",
    later: "Ronde berikutnya",
    position: (first, last, total) => (first === last ? `Ronde ${first} dari ${total}` : `Ronde ${first} sampai ${last} dari ${total}`),
    empty: "Riwayatnya muncul di sini setelah ronde pertama selesai.",
  },
  page: {
    loading: "Memuat hasil.",
    notFound: "Hasil ini tidak ada, karena tautannya salah atau hasilnya sudah lebih dari 180 hari.",
    winnerEmail: "Email pemenang",
    tabs: { winner: "Pemenang", ranking: "Peringkat", history: "Ronde" },
    parts: "Bagian hasil",
    played: (date, rounds, tanks) => `Dimainkan pada ${date} dalam ${rounds} ronde dengan ${tanks} tank.`,
    link: "Tautan hasil",
    qr: "Kode QR tautan hasil",
  },
  ended: {
    title: "Arena ini sudah selesai",
    body: "Hasilnya tetap ada di sini selama 180 hari, jadi buka hasilnya untuk melihat siapa yang menang.",
    open: "Buka hasil",
  },
  mine: {
    heading: "Hasilku",
    list: "Hasil, yang terbaru di atas",
    loading: "Memuat hasilmu.",
    failed: "Hasilmu tidak bisa dimuat, jadi periksa koneksimu, lalu coba lagi.",
    tryAgain: "Coba lagi",
    empty: "Arenamu belum punya permainan yang selesai, jadi hasilnya muncul di sini setelah final pertamamu.",
    won: (name) => `${name} menang`,
    details: (date, tanks) => `Dimainkan pada ${date} dengan ${tanks} tank.`,
  },
};
