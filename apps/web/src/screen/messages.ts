// Interface text for the `screen` slot of the catalog (src/i18n/catalog.ts): the
// big screen for a room, in each phase. `en` is the source; `id` has the same shape.

const seconds = (n: number) => (n === 1 ? "1 second" : `${n} seconds`);

export const en = {
  loading: "The screen is loading the arena.",
  game: (n: number) => `Game ${n}`,
  lobby: {
    heading: (name: string) => `Join ${name}`,
    players: (n: number) => (n === 1 ? "1 player has joined" : `${n} players have joined`),
    nobody: "The players who join show up here.",
    startsIn: (s: number) => `The game starts in ${seconds(s)}.`,
    waiting: "The game starts when the host starts the first round.",
    soon: "The game starts in a moment.",
    more: (n: number) => (n === 1 ? "1 more player has joined." : `${n} more players have joined.`),
  },
  rules: {
    known: (name: string, summary: string) => `The next round uses the ${name} rules. ${summary}`,
    hidden: "The rules of the next round stay secret until it starts.",
  },
  break: {
    heading: (round: number) => `Round ${round} results`,
    summary: (through: number, out: number, nextIsFinal: boolean) =>
      `${through === 1 ? "1 tank goes" : `${through} tanks go`} through to ${nextIsFinal ? "the final" : "the next round"}, and ${out === 1 ? "1 tank is" : `${out} tanks are`} out.`,
    through: "Through",
    out: "Out",
    nextIn: (s: number) => `The next round starts in ${seconds(s)}.`,
    waiting: "The next round starts when the host starts it.",
    soon: "The next round starts in a moment.",
    moreThrough: (n: number) => (n === 1 ? "1 more tank goes through." : `${n} more tanks go through.`),
    moreOut: (n: number) => (n === 1 ? "1 more tank is out." : `${n} more tanks are out.`),
  },
  finished: {
    heading: (name: string) => `${name} wins!`,
    resetIn: (s: number) => `A new game starts in ${s === 1 ? "1 second" : `${s} seconds`}.`,
    waiting: "The host can start a new game with the same players.",
    soon: "A new game starts in a moment.",
  },
};

export const id: typeof en = {
  loading: "Layar sedang memuat arena.",
  game: (n) => `Permainan ${n}`,
  lobby: {
    heading: (name) => `Gabung ke ${name}`,
    players: (n) => `${n} pemain sudah gabung`,
    nobody: "Pemain yang gabung akan muncul di sini.",
    startsIn: (s) => `Permainan mulai dalam ${s} detik.`,
    waiting: "Permainan mulai saat tuan rumah memulai ronde pertama.",
    soon: "Permainan akan segera mulai.",
    more: (n) => `${n} pemain lain juga sudah gabung.`,
  },
  rules: {
    known: (name, summary) => `Ronde berikutnya memakai aturan ${name}. ${summary}`,
    hidden: "Aturan ronde berikutnya masih rahasia sampai ronde mulai.",
  },
  break: {
    heading: (round) => `Hasil ronde ${round}`,
    summary: (through, out, nextIsFinal) => `${through} tank lolos ke ${nextIsFinal ? "final" : "ronde berikutnya"}, dan ${out} tank tersingkir.`,
    through: "Lolos",
    out: "Tersingkir",
    nextIn: (s) => `Ronde berikutnya mulai dalam ${s} detik.`,
    waiting: "Ronde berikutnya mulai saat tuan rumah memulainya.",
    soon: "Ronde berikutnya segera mulai.",
    moreThrough: (n) => `${n} tank lain juga lolos.`,
    moreOut: (n) => `${n} tank lain juga tersingkir.`,
  },
  finished: {
    heading: (name) => `${name} menang!`,
    resetIn: (s) => `Permainan baru mulai dalam ${s} detik.`,
    waiting: "Tuan rumah bisa memulai permainan baru dengan pemain yang sama.",
    soon: "Permainan baru segera mulai.",
  },
};
