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
  verified: "Verified",
  unverified: "Not verified",
  /** A seat whose account no longer exists. */
  noAccount: "No account",
  empty: "No tank is in the monthly arena now.",
  loading: "Loading the monthly players.",
  failed: "The monthly players did not load, so try again in a moment.",
  retry: "Try again",
};

export const id: typeof en = {
  pageTitle: "Pemain bulanan",
  heading: "Pemain bulanan",
  intro: (count, day) => `Arena bulanan punya ${count} tank pada ${day}, dan tiap baris menunjukkan email pemilik tank itu.`,
  listLabel: "Tank di arena bulanan",
  columns: { tank: "Tank", place: "Peringkat", email: "Alamat email", verified: "Email", created: "Akun dibuat" },
  place: (league, rank) => (rank === null ? `Liga ${league}, belum masuk peringkat` : `Liga ${league}, peringkat ${rank}`),
  verified: "Terverifikasi",
  unverified: "Belum terverifikasi",
  noAccount: "Tanpa akun",
  empty: "Belum ada tank di arena bulanan.",
  loading: "Memuat pemain bulanan.",
  failed: "Pemain bulanan belum termuat, jadi coba lagi sebentar lagi.",
  retry: "Coba lagi",
};
