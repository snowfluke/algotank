// Interface text of the guidance for first-timers (docs/specs/revamp/65-guidance.md):
// the coach marks' controls, every tour step, the home page's cue, and the workshop's
// "first play style" checklist. Catalog slot: `guide`.
//
// A step is one sentence of at most 15 words that teaches the idea, not the control.
// `where` is the pill shown while the step's target is not on the screen: where to go.
// tours.test.ts counts the words and checks the reading time of the timed tours.

import { BUILD_BUDGET } from "@game/engine";

export interface StepText {
  readonly text: string;
  readonly where: string;
}

const stepTexts = {
  workshopNew: {
    text: "A play style tells your tank what to do, so tap New play style.",
    where: "Go back to your play styles.",
  },
  workshopStart: {
    text: "Pick a play style to start from, and then you can change it.",
    where: "Tap New play style.",
  },
  workshopAlgorithm: {
    text: "This is your algorithm: the tank does the first rule that fits, so tap one.",
    where: "Open the Rules tab.",
  },
  workshopWhenDo: {
    text: "“When” is the test, and “Do” is what the tank does if it is true.",
    where: "Tap a rule to open it.",
  },
  workshopChange: {
    text: "Change one thing in this rule, and your tank will act differently.",
    where: "Tap a rule to open it.",
  },
  workshopUpgrades: {
    text: `Your tank has ${BUILD_BUDGET} upgrade points, and each upgrade has sockets to put them in.`,
    where: "Open the Upgrades tab.",
  },
  workshopRun: {
    text: "Run a test match to watch your tank follow its rules.",
    // True on every tab and in the test options too, which also sit on the Try it tab.
    where: "Tap Run a test match on the Try it tab.",
  },
  workshopResult: {
    text: "This shows what your tank did most, and changing a rule changes it.",
    where: "Tap See the result.",
  },
  workshopName: {
    text: "Give your play style a name, so you can find it later.",
    where: "Go back until the name shows at the top.",
  },
  workshopSaved: {
    text: "It is saved, and Mine on the Play style tab loads it in any arena.",
    where: "Go back until the name shows at the top.",
  },
  lobbyTank: {
    text: "This is your tank, and Change my tank on the Players tab changes its look.",
    where: "",
  },
  lobbyPlays: {
    text: "Nobody steers in a round, so your tank plays by its play style.",
    where: "Open the Tank tab.",
  },
  lobbyStyleFirst: {
    text: "Pick a play style here, or build your own in the workshop.",
    where: "Open Play style on the Tank tab.",
  },
  lobbyStyleBetter: {
    text: "To do better, pick another play style or build your own in the workshop.",
    where: "Open Play style on the Tank tab.",
  },
  lobbyStartPublic: {
    text: "The game starts when the clock ends, or sooner when everyone is ready.",
    where: "",
  },
  lobbyStartOwner: {
    text: "The game starts when you tap Start the game.",
    where: "",
  },
  lobbyStartGuest: {
    text: "The game starts when the host starts it.",
    where: "",
  },
  roundHit: {
    text: "A hit gives you 1 point and takes 1 point from the tank you hit.",
    where: "Open the Arena tab.",
  },
  roundWater: {
    text: "Each shot uses water, and the water fills up again over time.",
    where: "Open the Arena tab.",
  },
  roundRanking: {
    text: "The ranking shows which tank leads right now.",
    where: "",
  },
  resultPlace: {
    text: "Here you see your place, and the lines under it say why.",
    where: "Open the Result tab.",
  },
  resultBetter: {
    text: "To do better, change your play style in the Tank tab or the workshop.",
    where: "",
  },
  homeCue: {
    text: "New here? Start in the workshop, or jump into a game with Play now.",
    where: "",
  },
} satisfies Record<string, StepText>;

export type StepKey = keyof typeof stepTexts;

export const en = {
  counter: (n: number, of: number) => `${n} of ${of}`,
  next: "Next",
  finish: "Finish the tour",
  skip: "Skip the tour",
  showAround: "Show me around",
  calloutLabel: "Tour",
  steps: stepTexts as Record<StepKey, StepText>,
  checklist: {
    title: "Your first play style",
    open: (done: number, of: number) => `Your first play style, ${done} of ${of} done`,
    count: (done: number, of: number) => `${done} of ${of}`,
    items: {
      start: "Pick a start",
      read: "Read a rule",
      change: "Change a rule",
      test: "Run a test match",
      name: "Name it",
    },
    done: "Done",
    notYet: "Not done yet",
  },
  finished: {
    title: "Your first play style is ready",
    body: "Your tank can play it in any arena now.",
    playNow: "Play now with it",
    another: "Build another",
  },
};

export const id: typeof en = {
  counter: (n, of) => `${n} dari ${of}`,
  next: "Lanjut",
  finish: "Selesai",
  skip: "Lewati tur",
  showAround: "Tunjukkan caranya",
  calloutLabel: "Tur",
  steps: {
    workshopNew: {
      text: "Gaya main memberi tahu tank apa yang harus dilakukan, jadi ketuk Gaya main baru.",
      where: "Kembali ke daftar gaya main kamu.",
    },
    workshopStart: {
      text: "Pilih gaya main sebagai awal, lalu kamu bisa mengubahnya.",
      where: "Ketuk Gaya main baru.",
    },
    workshopAlgorithm: {
      text: "Ini algoritma kamu: tank menjalankan aturan pertama yang cocok, jadi ketuk satu.",
      where: "Buka tab Aturan.",
    },
    workshopWhenDo: {
      text: "“Kalau” adalah syaratnya, dan “Lakukan” adalah yang tank kerjakan kalau syarat itu benar.",
      where: "Ketuk satu aturan untuk membukanya.",
    },
    workshopChange: {
      text: "Ubah satu hal di aturan ini, dan tank kamu akan bertindak lain.",
      where: "Ketuk satu aturan untuk membukanya.",
    },
    workshopUpgrades: {
      text: `Tank kamu punya ${BUILD_BUDGET} poin peningkatan, dan tiap peningkatan punya lubang untuk memasangnya.`,
      where: "Buka tab Peningkatan.",
    },
    workshopRun: {
      text: "Mulai uji coba untuk melihat tank kamu mengikuti aturannya.",
      where: "Ketuk Mulai uji coba di tab Coba.",
    },
    workshopResult: {
      text: "Ini yang paling sering dilakukan tank kamu, dan bisa berubah kalau aturannya kamu ubah.",
      where: "Ketuk Lihat hasil.",
    },
    workshopName: {
      text: "Beri nama gaya main kamu supaya mudah ditemukan nanti.",
      where: "Kembali dulu sampai nama terlihat di atas.",
    },
    workshopSaved: {
      text: "Gaya main ini tersimpan, dan kamu bisa memakainya di arena mana pun lewat Buatanku.",
      where: "Kembali dulu sampai nama terlihat di atas.",
    },
    lobbyTank: {
      text: "Ini tank kamu, dan tombol Ubah tank kamu di tab Pemain bisa mengganti tampilannya.",
      where: "",
    },
    lobbyPlays: {
      text: "Tidak ada yang menyetir saat ronde, jadi tank kamu bermain sesuai gaya mainnya.",
      where: "Buka tab Tank.",
    },
    lobbyStyleFirst: {
      text: "Pilih gaya main di sini, atau susun sendiri di bengkel.",
      where: "Buka Gaya main di tab Tank.",
    },
    lobbyStyleBetter: {
      text: "Supaya lebih jago, pilih gaya main lain atau susun sendiri di bengkel.",
      where: "Buka Gaya main di tab Tank.",
    },
    lobbyStartPublic: {
      text: "Permainan mulai saat waktu habis, atau lebih cepat kalau semua sudah siap.",
      where: "",
    },
    lobbyStartOwner: {
      text: "Permainan mulai saat kamu mengetuk Mulai permainan.",
      where: "",
    },
    lobbyStartGuest: {
      text: "Permainan mulai saat tuan rumah memulainya.",
      where: "",
    },
    roundHit: {
      text: "Setiap tembakan yang kena memberimu 1 poin dan mengambil 1 poin dari tank itu.",
      where: "Buka tab Arena.",
    },
    roundWater: {
      text: "Setiap tembakan memakai air, dan airnya terisi lagi pelan-pelan.",
      where: "Buka tab Arena.",
    },
    roundRanking: {
      text: "Peringkat menunjukkan tank mana yang sedang memimpin.",
      where: "",
    },
    resultPlace: {
      text: "Di sini ada peringkatmu, dan kalimat di bawahnya menjelaskan alasannya.",
      where: "Buka tab Hasil.",
    },
    resultBetter: {
      text: "Supaya lebih jago, ganti gaya main di tab Tank atau di bengkel.",
      where: "",
    },
    homeCue: {
      text: "Baru di sini? Mulai dari bengkel, atau langsung pilih Main sekarang.",
      where: "",
    },
  },
  checklist: {
    title: "Gaya main pertamamu",
    open: (done, of) => `Gaya main pertamamu, ${done} dari ${of} selesai`,
    count: (done, of) => `${done} dari ${of}`,
    items: {
      start: "Pilih titik awal",
      read: "Baca satu aturan",
      change: "Ubah satu aturan",
      test: "Jalankan uji coba",
      name: "Beri nama",
    },
    done: "Selesai",
    notYet: "Belum selesai",
  },
  finished: {
    title: "Gaya main pertamamu sudah siap",
    body: "Tank kamu bisa memakainya di arena mana pun sekarang.",
    playNow: "Main sekarang pakai gaya ini",
    another: "Buat yang lain",
  },
};
