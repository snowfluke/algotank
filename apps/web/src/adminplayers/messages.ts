// Interface text of "/admin/players", the monthly tanks with their owners' emails for the host.
// Catalog slot: `adminPlayers`.

export const en = {
  pageTitle: "Monthly players",
  heading: "Monthly players",
  /** `count` is a formatted number; `day` a date such as "16 November 2026". */
  intro: (count: string, day: string) => `The monthly arena has ${count} tanks on ${day}, and each row shows the email of the tank's owner.`,
  listLabel: "Tanks in the monthly arena",
  columns: { tank: "Tank", place: "Place", email: "Email address", verified: "Email", created: "Account made" },
  place: (league: number, rank: number | null) => (rank === null ? `League ${league}, not ranked yet` : `League ${league}, place ${rank}`),
  /** The game master takes no place (server monthly/game-masters.ts). */
  placeGm: (league: number) => `League ${league}, game master`,
  gmOn: "Make GM",
  gmOff: "Remove GM",
  gmOnLabel: (name: string) => `Make ${name} the game master`,
  gmOffLabel: (name: string) => `Make ${name} a player again`,
  gmFailed: "The game master was not changed, so try again in a moment.",
  verified: "Verified",
  unverified: "Not verified",
  /** A seat whose account no longer exists. */
  noAccount: "No account",
  empty: "No tank is in the monthly arena now.",
  loading: "Loading the monthly players.",
  failed: "The monthly players did not load, so try again in a moment.",
  retry: "Try again",
  /** The button on each row, and its name for a screen reader, which hears many of them. */
  remove: "Remove",
  removeLabel: (name: string) => `Remove ${name}`,
  removeTitle: (name: string) => `Remove ${name} from the monthly arena?`,
  removeBody: "The tank leaves the board now, as when its owner quits. Its counted days and its name stay, so its owner can take a seat again.",
  removeConfirm: "Remove the tank",
  removeFailed: "The tank was not removed, so try again in a moment.",
};

export const id: typeof en = {
  pageTitle: "Pemain bulanan",
  heading: "Pemain bulanan",
  intro: (count, day) => `Arena bulanan punya ${count} tank pada ${day}, dan tiap baris menunjukkan email pemilik tank itu.`,
  listLabel: "Tank di arena bulanan",
  columns: { tank: "Tank", place: "Peringkat", email: "Alamat email", verified: "Email", created: "Akun dibuat" },
  place: (league, rank) => (rank === null ? `Liga ${league}, belum masuk peringkat` : `Liga ${league}, peringkat ${rank}`),
  placeGm: (league) => `Liga ${league}, GM`,
  gmOn: "Jadikan GM",
  gmOff: "Hapus GM",
  gmOnLabel: (name) => `Jadikan ${name} GM`,
  gmOffLabel: (name) => `Jadikan ${name} pemain lagi`,
  gmFailed: "GM belum berubah, jadi coba lagi sebentar lagi.",
  verified: "Terverifikasi",
  unverified: "Belum terverifikasi",
  noAccount: "Tanpa akun",
  empty: "Belum ada tank di arena bulanan.",
  loading: "Memuat pemain bulanan.",
  failed: "Pemain bulanan belum termuat, jadi coba lagi sebentar lagi.",
  retry: "Coba lagi",
  remove: "Keluarkan",
  removeLabel: (name) => `Keluarkan ${name}`,
  removeTitle: (name) => `Keluarkan ${name} dari arena bulanan?`,
  removeBody: "Tank itu keluar dari papan sekarang, sama seperti saat pemiliknya keluar sendiri. Hari yang sudah dihitung dan namanya tetap tersimpan, jadi pemiliknya bisa masuk lagi.",
  removeConfirm: "Keluarkan tank",
  removeFailed: "Tank belum dikeluarkan, jadi coba lagi sebentar lagi.",
};
