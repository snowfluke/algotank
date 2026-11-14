// Interface text for creating a private or a presenter arena. Catalog slot: `create`.

import { ARENA_LIMITS } from "@game/arena";

/** "1.5 minutes" or "1,5 menit": a round length in minutes, with the language's decimal mark. */
function minutesText(seconds: number, language: "en" | "id"): string {
  const minutes = seconds / 60;
  const number = language === "id" ? String(minutes).replace(".", ",") : String(minutes);
  if (language === "id") return `${number} menit`;
  return minutes === 1 ? "1 minute" : `${number} minutes`;
}

export const en = {
  heading: { private: "Create a private arena", presenter: "Create a presenter arena" },
  intro: {
    private: "Name your arena, and then you share the code with your friends and start each round yourself.",
    presenter: "Name your arena, then show the big screen while up to 512 players join by QR code.",
  },
  signInIntro: "Creating an arena needs an account, so sign in and the form appears on this page.",
  checkingAccount: "Checking whether you are signed in.",
  accountUnreachable: "The page cannot reach the server to check your sign-in, so check your connection and try again.",
  tryAgain: "Try again",
  defaultName: { private: "Our water fight", presenter: "The big water fight" },
  name: "Arena name",
  nameEmpty: "Give your arena a name first.",
  nameTooLong: `An arena name has at most ${ARENA_LIMITS.arenaNameMax} characters, so make it shorter.`,
  speed: "Game speed",
  speeds: { relaxed: "Relaxed", normal: "Normal", fast: "Fast" },
  /** The parts of the line under "More options" on the form, joined as a list. */
  short: {
    speeds: { relaxed: "relaxed speed", normal: "normal speed", fast: "fast speed" },
    length: (seconds: number) => `rounds of ${minutesText(seconds, "en")}`,
    ruleSetModes: { standard: "the same rules every round", announced: "new rules shown before each round", surprise: "surprise rules each round" },
  },
  summary: (list: string) => `${list.charAt(0).toUpperCase()}${list.slice(1)}.`,
  optionsDone: "Done",
  length: "Round length",
  lengthLabel: (seconds: number) => minutesText(seconds, "en"),
  ruleSetMode: "Round rules",
  ruleSetModes: {
    standard: { title: "The same every round", description: "Every round plays with the standard rules." },
    announced: { title: "New rules each round, shown before", description: "Players see the next round's rules while they prepare." },
    surprise: { title: "New rules each round, a surprise", description: "Players see the rules only when the round starts." },
  },
  whoCanJoin: "Who can join",
  joinPolicies: {
    anyone: { title: "Anyone, without an account", description: "Players join with the code and a tank name." },
    account: { title: "Players with an account", description: "Each player signs in to play one tank, and you can see each player's email." },
    verified: { title: "Players with a verified email", description: "Players sign in as above, and their email must be verified before they join." },
  },
  verifiedNeedsMail: "This server cannot send email, so it cannot check that a player's email is verified.",
  submit: { private: "Create arena", presenter: "Create arena" },
  limit: {
    title: (name: string) => `You already have an open arena, ${name}.`,
    body: "An account can have one open arena, so open that one or close it to create this one.",
    open: "Open it",
    close: "Close it and create",
    dialogTitle: (name: string) => `Close ${name}?`,
    dialogBody: "Everyone in that arena leaves the game, and the arena cannot come back.",
    dialogConfirm: "Close and create",
  },
};

export const id: typeof en = {
  heading: { private: "Buat arena pribadi", presenter: "Buat arena presenter" },
  intro: {
    private: "Beri nama arenamu, lalu bagikan kodenya ke teman-temanmu dan mulai setiap ronde sendiri.",
    presenter: "Beri nama arenamu, lalu tampilkan layar besar supaya sampai 512 pemain bisa gabung lewat kode QR.",
  },
  signInIntro: "Kamu perlu akun untuk membuat arena, jadi masuk dulu, lalu formulirnya muncul di halaman ini.",
  checkingAccount: "Memeriksa apakah kamu sudah masuk.",
  accountUnreachable: "Halaman ini tidak bisa terhubung ke server untuk memeriksa akunmu, jadi periksa koneksimu, lalu coba lagi.",
  tryAgain: "Coba lagi",
  defaultName: { private: "Perang air kita", presenter: "Perang air besar" },
  name: "Nama arena",
  nameEmpty: "Beri nama arenamu dulu.",
  nameTooLong: `Nama arena maksimal ${ARENA_LIMITS.arenaNameMax} karakter, jadi buat lebih pendek, ya.`,
  speed: "Kecepatan permainan",
  speeds: { relaxed: "Santai", normal: "Biasa", fast: "Cepat" },
  short: {
    speeds: { relaxed: "kecepatan santai", normal: "kecepatan biasa", fast: "kecepatan cepat" },
    length: (seconds) => `ronde ${minutesText(seconds, "id")}`,
    ruleSetModes: { standard: "aturan sama tiap ronde", announced: "aturan baru diumumkan sebelum tiap ronde", surprise: "aturan kejutan tiap ronde" },
  },
  summary: (list) => `${list.charAt(0).toUpperCase()}${list.slice(1)}.`,
  optionsDone: "Selesai",
  length: "Lama ronde",
  lengthLabel: (seconds) => minutesText(seconds, "id"),
  ruleSetMode: "Aturan ronde",
  ruleSetModes: {
    standard: { title: "Sama di setiap ronde", description: "Semua ronde memakai aturan standar." },
    announced: { title: "Baru tiap ronde, diumumkan dulu", description: "Pemain melihat aturan ronde berikutnya saat bersiap." },
    surprise: { title: "Baru tiap ronde, jadi kejutan", description: "Pemain baru melihat aturannya saat ronde mulai." },
  },
  whoCanJoin: "Siapa yang boleh gabung",
  joinPolicies: {
    anyone: { title: "Siapa saja, tanpa akun", description: "Pemain gabung dengan kode dan nama tank." },
    account: { title: "Pemain yang punya akun", description: "Setiap pemain masuk akun untuk main dengan satu tank, dan kamu bisa melihat email setiap pemain." },
    verified: { title: "Pemain dengan email terverifikasi", description: "Pemain masuk akun seperti di atas, dan email-nya harus sudah terverifikasi sebelum gabung." },
  },
  verifiedNeedsMail: "Server ini tidak bisa mengirim email, jadi tidak bisa memeriksa apakah email pemain sudah terverifikasi.",
  submit: { private: "Buat arena", presenter: "Buat arena" },
  limit: {
    title: (name) => `Kamu masih punya arena yang terbuka, yaitu ${name}.`,
    body: "Satu akun hanya bisa punya satu arena terbuka, jadi buka arena itu atau tutup supaya bisa membuat yang ini.",
    open: "Buka arena itu",
    close: "Tutup dan buat baru",
    dialogTitle: (name) => `Tutup ${name}?`,
    dialogBody: "Semua pemain di arena itu berhenti bermain, dan arenanya tidak bisa dibuka lagi.",
    dialogConfirm: "Tutup dan buat baru",
  },
};
