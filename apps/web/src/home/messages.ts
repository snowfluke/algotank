// Interface text for the entry pages: home and join with a code. Catalog slot:
// `home`. Play now's text is in publicplay/messages.ts with the three public arenas.

export const en = {
  tagline: "Build the best algorithm to drive your tank and win the battle!",
  /** `arena` is the room's name, or its kind's name for a public arena. */
  backToRoom: (arena: string) => `Back to ${arena}`,
  sceneLabel: "Your tank hits a red tank on a sandy arena, dashes at it with its ultimate, and then rain changes the arena.",
  choicesHeading: "Ways to play",
  playNow: {
    title: "Play now",
    body: "Jump into a public arena to practise against your friends and bots.",
  },
  watchMonthly: {
    title: "Watch the monthly arena",
    body: "See the tanks of the monthly arena play live.",
    /** The tile's live line in the compact form, one line under the title; the compact form shows no line when no tank plays. */
    playingNow: (tanks: number) => (tanks === 1 ? "1 tank playing now" : `${tanks} tanks playing now`),
  },
  joinCode: {
    title: "Join with a code",
    body: "Type the code or open the link a friend shared with you.",
  },
  createPrivate: {
    title: "Create a private arena",
    body: "Play with your friends, and you start each round yourself.",
  },
  createPresenter: {
    title: "Create a presenter arena",
    body: "Show the game on a big screen while up to 512 players join by QR code.",
  },
  workshop: {
    title: "Tank workshop",
    body: "Build your own play style, then use it in any arena.",
  },
  signInNeeded: "Sign-in needed",
  join: {
    heading: "Join with a code",
    intro: "Type the 6-character code from your friend or the big screen to go straight to the arena.",
    label: "Arena code",
    submit: "Join",
    checking: "Checking the code",
    empty: "Type the code first, and then press Join.",
    invalid: "A code has 6 letters and numbers, so check it and try again.",
    notFound: (code: string) => `No arena has the code ${code}, so check the code with the person who shared it.`,
    network: "The page cannot reach the server, so check your connection and try again.",
    other: "Something went wrong on the server, so try again in a moment.",
  },
};

export const id: typeof en = {
  tagline: "Buat algoritma terbaik untuk menggerakkan tankmu dan menangkan pertempuran!",
  backToRoom: (arena) => `Kembali ke ${arena}`,
  sceneLabel: "Tank kamu menembak tank merah di arena berpasir, menabraknya dengan jurus pamungkas, lalu hujan mengubah arena.",
  choicesHeading: "Cara bermain",
  playNow: {
    title: "Main sekarang",
    body: "Masuk ke arena umum untuk berlatih melawan temanmu dan bot.",
  },
  watchMonthly: {
    title: "Tonton arena bulanan",
    body: "Lihat tank-tank arena bulanan bertanding langsung.",
    playingNow: (tanks) => `${tanks} tank main sekarang`,
  },
  joinCode: {
    title: "Gabung pakai kode",
    body: "Ketik kode atau buka tautan yang dibagikan temanmu.",
  },
  createPrivate: {
    title: "Buat arena pribadi",
    body: "Main bareng teman-temanmu, dan kamu sendiri yang memulai setiap ronde.",
  },
  createPresenter: {
    title: "Buat arena presenter",
    body: "Tampilkan permainan di layar besar, dan sampai 512 pemain bisa gabung lewat kode QR.",
  },
  workshop: {
    title: "Bengkel tank",
    body: "Susun gaya main kamu sendiri, lalu pakai di arena mana pun.",
  },
  signInNeeded: "Perlu masuk akun",
  join: {
    heading: "Gabung pakai kode",
    intro: "Ketik kode 6 karakter dari temanmu atau dari layar besar, lalu kamu langsung masuk ke arena.",
    label: "Kode arena",
    submit: "Gabung",
    checking: "Memeriksa kode",
    empty: "Ketik kodenya dulu, lalu tekan Gabung.",
    invalid: "Kode berisi 6 huruf dan angka, jadi periksa lagi kodenya, lalu coba lagi.",
    notFound: (code) => `Tidak ada arena dengan kode ${code}, jadi tanyakan lagi kodenya ke orang yang membagikannya.`,
    network: "Halaman ini tidak bisa terhubung ke server, jadi periksa koneksimu, lalu coba lagi.",
    other: "Ada masalah di server, jadi tunggu sebentar, lalu coba lagi.",
  },
};
