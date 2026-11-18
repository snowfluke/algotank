// Interface text for "/monthly", the monthly arena: a league that always runs, watched by
// anyone and joined with an account (docs/specs/revamp/77-monthly-league.md, section 6).
// Catalog slot: `monthly`. The monthly points rule is worded once in publicplay/messages.ts.

const points = (n: number) => (n === 1 ? "1 point" : `${n} points`);

export const en = {
  /** "League 2": the switch, the list and the headings. */
  league: (n: number) => `League ${n}`,
  /** Beside the page's title: the league shown and its seated tanks (bots are not counted). */
  leaguePlayers: (n: number, players: number) => `League ${n} · ${players === 1 ? "1 player" : `${players} players`}`,
  /** The league switch's name for a screen reader. */
  leagues: "Leagues",
  /** Read after the own league's name in the switch. */
  ownLeague: "your tank plays here",
  /** The own league in the list of 6 or more leagues. */
  ownLeagueChoice: (n: number) => `League ${n}, your tank`,
  /** `clock` is "05:12:44". */
  endsIn: (clock: string) => `Today's round ends in ${clock}`,
  /** The phone's line, beside the arena condition: the time left in today's round. */
  endsInShort: (clock: string) => `${clock} left`,
  dayClosing: "Today's round is ending, and the new round starts in a moment.",
  dayClosingShort: "Round ending",
  /** The accessible name of the board. */
  board: (league: number) => `The board of League ${league}`,
  connecting: "The page is connecting to the monthly arena.",
  reconnecting: "The connection dropped, so the page is connecting again.",
  failed: "The page cannot show this league right now, so try again.",
  retry: "Try again",
  /** The one action of a visitor without a tank in the league. */
  join: "Join the monthly arena",
  /** Over the empty board. */
  empty: {
    title: "No tank plays in this league yet.",
    body: "Your tank can be the first one on this board.",
  },
  /** The phone's tabs. */
  tabs: { label: "Parts of the monthly arena", arena: "Arena", ranking: "Ranking", mine: "Your tank", activity: "Activity" },
  activity: {
    joined: (name: string) => `${name} joined the arena.`,
    left: (name: string) => `${name} left the arena.`,
    changedRules: (name: string) => `${name} changed its rules.`,
    changedLook: (name: string) => `${name} changed its look.`,
    justNow: "Just now",
  },
  /** The ranking's switch. */
  ranking: { label: "Ranking", today: "Today", month: "This month" },
  /** After the name of a tank that quit the arena today; its points of today stay in the ranking. */
  left: "Left",
  todayEmpty: "No tank plays in this league today yet.",
  monthEmpty: "No tank plays in this league this month yet.",
  /** The line before the tanks with fewer counted days than a place needs. */
  /** The cut line above the tanks without a place: one short line, because the line truncates. The reason is in the info list. */
  notRanked: (days: number) => (days === 1 ? "Not ranked yet" : `Fewer than ${days} days, not ranked yet`),
  /** "Go to" the not-ranked line on its page. */
  toNotRanked: "Not ranked yet",
  yesterdayWinner: (name: string, score: number) => `${name} won yesterday's round with ${points(score)}.`,
  /** `date` is "12 November 2026". */
  dayWinner: (date: string, name: string, score: number) => `${name} won the round of ${date} with ${points(score)}.`,
  /** Over the board for a few seconds after midnight. */
  dayDone: (date: string) => `The round of ${date} has ended.`,
  newDay: "A new round has started, and every tank starts again at 0 points.",
  /** Over the board for a moment after the board grows. */
  reshuffled: "Reshuffled",
  /** Over the board's corner: the round rules the league drew for this round (server league-day.ts newRound). */
  condition: (name: string) => `Arena condition: ${name}`,
  /** The phone's line, after the time left. */
  conditionShort: (name: string) => `Condition: ${name}`,
  /** The board's switch on a phone, beside the owner's place: "Whole arena" did not fit that line. */
  wholeArena: "All",
  /** The badge before the game master's name (the organizer's tank, which takes no place). */
  gm: { text: "GM", title: "Game master: the organizer's tank, which takes no place" },
  /**
   * A tank's sheet (TankSheet.tsx), opened from a ranking row. `month` is "December 2026", the
   * first month whose close opens the rules (FIRST_PUBLISHED_RULES_MONTH), so the line stays true later.
   */
  sheet: {
    open: (name: string) => `Show the tank ${name}`,
    /** The GM's row: its rules are open, so the row says so instead of a bare chevron. */
    openRules: (name: string) => `Show the rules of ${name}`,
    rulesCue: "See rules",
    rules: "Rules",
    upgrades: (list: string) => `Upgrades: ${list}.`,
    gm: "This is the organizer's tank, so everyone can read its rules.",
    rulesLater: (month: string) => `Everyone can read this tank's rules after each month ends, starting with ${month}.`,
    monthRules: (month: string) => `These are the rules the tank had when ${month} ended.`,
    lastDay: (day: string) => `On ${day}`,
    turns: "Turns",
    moved: "Squares moved",
    noLastDay: "This tank has no finished day yet, so its numbers show after the next midnight.",
    loading: "The tank is loading.",
  },
  /** In the arena condition's note (ArenaCondition.tsx), after what the condition changes. */
  conditionChanges: "The arena draws a condition when a round starts.",
  own: {
    heading: "Your tank",
    freshStart: "Your tank went through a tunnel and came out on another square with full water.",
    /** `place` is today's place in the league. */
    today: (place: number, score: number) => `Your tank is in place ${place} today with ${points(score)}.`,
    /** The phone's line beside the board's switch; the badge and its colour say it is the viewer's tank. */
    todayShort: (place: number, score: number) => `#${place} · ${points(score)}`,
    /** The game master's own line and pane: it has points but no place. */
    todayGmShort: (score: number) => `GM · ${points(score)}`,
    todayGm: (score: number) => `Your tank is the game master, with ${points(score)} today and no place in the ranking.`,
    counts: "Today counts for your monthly points.",
    notCounted: "Today does not count yet, because your tank joined after the round started.",
    /** People thought they had to keep the page open; the tank plays without it. */
    playsAlone: "Your tank plays every round by itself, so you can close this page and come back any time.",
    /** Counted days so far against the days a place needs, such as "5 of 7". */
    daysNeeded: (days: number, need: number) =>
      need === 1 ? "Your tank gets a place after its first full day, from midnight to midnight." : `Your tank has ${days} of the ${need} days it needs for a place.`,
    /** One sentence for the place and the counted days, so the own pane keeps room for the turn feed. */
    monthPlace: (place: number, score: number, days: number) =>
      `Your tank is in place ${place} this month with ${points(score)} from ${days === 1 ? "1 counted day" : `${days} counted days`}.`,
    otherLeague: (league: number) => `Your tank plays in League ${league}.`,
    show: (league: number) => `Show League ${league}`,
  },
  quit: {
    open: "Leave the monthly arena",
    title: "Leave the monthly arena?",
    /** Today counts for the tank: its points now stay. */
    // The last sentence of each body: leaving is not how to stop watching.
    bodyCounted: (score: number) =>
      `Your tank leaves the board now, and all your points stay saved, including today's ${points(score)}. If you join again today, your tank goes on from those points. Your name stays the same. To stop watching only, close this page, and your tank keeps playing.`,
    bodyNotCounted:
      "Your tank leaves the board now. Points from earlier days stay saved, and your name stays the same. You can join again later. To stop watching only, close this page, and your tank keeps playing.",
    confirm: "Leave the arena",
  },
  /** A seated owner's tank editor; the seated tank takes the new look at once (no quit). */
  changeLook: "Change look",
  changeLookFailed: "Your tank's new look was not saved, so try Change look again.",
  /** The rules step for the seated tank (flow.ts, changingRules): the new rules play at once in its own seat. */
  changeRules: {
    open: "Change rules",
    title: "Change your tank's rules",
    submit: "Save rules",
    done: "Your tank plays its new rules now, and its points stay.",
  },
  /** The help button at the top of the page and the dialog it opens (MonthlyAbout.tsx). */
  about: {
    open: "How the monthly arena works",
    heading: "How the monthly arena works",
    round: "Each round lasts one day, and every tank in a league plays it by itself.",
    playsAlone: "Your tank plays every day until you leave the arena, so you can close this page and come back any time.",
    /** The server's RESHUFFLE_TURNS: said without a number, so the text cannot drift from it. */
    reshuffle: "Every few minutes, each tank takes its turn through a tunnel and keeps its points.",
    /** Names the board legend's button (board/messages.ts, legend.button), which lists the items. */
    items: "Items appear on the board, and Help says what each one does.",
    /** `days` is MONTHLY_RANKED_DAYS. The monthly points rule comes from publicplay/messages.ts. */
    rankedDays: (days: number) =>
      days === 1 ? "A tank gets a place in the month's ranking after one full day." : `A tank needs ${days} counted days for a place in the month's ranking.`,
    /** The champion and the name rule are left out: the dialog must fit a 360 x 640 phone, and the champions page and the join step say them. */
    leagues: "When the month ends, the lower half of each league changes places with the upper half of the league below.",
  },
  /** The month close's notice, shown once. `month` is "October 2026". */
  move: {
    up: (league: number) => `Your tank moved up to League ${league}.`,
    down: (league: number) => `Your tank moved down to League ${league}.`,
    stayed: (league: number) => `Your tank stays in League ${league}.`,
    body: (month: string) => `${month} has ended, so every league was put together again.`,
    /** The closed month's rules are open now: they are on the champions page. */
    rulesOpen: (month: string) => `Everyone can now read the rules each tank had when ${month} ended, on the Champions page.`,
    /** Before the first published month: the announcement. */
    rulesSoon: (month: string) => `From now on, everyone can read every tank's rules after a month ends, starting with ${month}.`,
    ok: "OK",
  },
  joinSteps: {
    nameTitle: "Your tank's name",
    nameHint: "This name stays with your tank until the month ends.",
    nameFixed: (name: string) => `Your tank's name this month is ${name}, and you can change it next month.`,
    next: "Next",
    tankTitle: "Get your tank ready",
    submit: "Put in my tank",
    nameTaken: "Another tank in the monthly arena has this name, so type another name.",
    seatTaken: "Your account already has a tank in the monthly arena, so the page shows it now.",
    /** The toast after the tank joined. */
    joined: "Your tank is in the monthly arena now and plays every round by itself, so you can close this page.",
    /** Beside the submit of the rules step, for joining and for "Change rules": where a player agrees to it. */
    rulesOpen: (month: string) => `Everyone can read your tank's rules after each month ends, starting with ${month}.`,
  },
};

export const id: typeof en = {
  league: (n) => `Liga ${n}`,
  leaguePlayers: (n, players) => `Liga ${n} · ${players} peserta`,
  leagues: "Liga",
  ownLeague: "tank kamu main di sini",
  ownLeagueChoice: (n) => `Liga ${n}, tank kamu`,
  endsIn: (clock) => `Ronde hari ini berakhir dalam ${clock}`,
  endsInShort: (clock) => `Sisa ${clock}`,
  dayClosing: "Ronde hari ini sedang ditutup, dan ronde baru mulai sebentar lagi.",
  dayClosingShort: "Ronde ditutup",
  board: (league) => `Papan Liga ${league}`,
  connecting: "Halaman sedang tersambung ke arena bulanan.",
  reconnecting: "Sambungan terputus, jadi halaman sedang menyambung lagi.",
  failed: "Halaman belum bisa menampilkan liga ini, jadi coba lagi.",
  retry: "Coba lagi",
  join: "Ikut arena bulanan",
  empty: {
    title: "Belum ada tank yang main di liga ini.",
    body: "Tank kamu bisa jadi tank pertama di papan ini.",
  },
  tabs: { label: "Bagian arena bulanan", arena: "Arena", ranking: "Peringkat", mine: "Tank kamu", activity: "Aktivitas" },
  activity: {
    joined: (name) => `${name} masuk ke arena.`,
    left: (name) => `${name} keluar dari arena.`,
    changedRules: (name) => `${name} mengganti aturannya.`,
    changedLook: (name) => `${name} mengganti tampilannya.`,
    justNow: "Baru saja",
  },
  ranking: { label: "Peringkat", today: "Hari ini", month: "Bulan ini" },
  left: "Keluar",
  todayEmpty: "Belum ada tank yang main di liga ini hari ini.",
  monthEmpty: "Belum ada tank yang main di liga ini bulan ini.",
  notRanked: (days) => (days === 1 ? "Belum masuk peringkat" : `Kurang dari ${days} hari, belum masuk peringkat`),
  toNotRanked: "Belum masuk peringkat",
  yesterdayWinner: (name, score) => `${name} juara ronde kemarin dengan ${score} poin.`,
  dayWinner: (date, name, score) => `${name} juara ronde ${date} dengan ${score} poin.`,
  dayDone: (date) => `Ronde ${date} sudah selesai.`,
  newDay: "Ronde baru sudah mulai, dan semua tank mulai lagi dari 0 poin.",
  reshuffled: "Diacak ulang",
  condition: (name) => `Kondisi arena: ${name}`,
  conditionShort: (name) => `Kondisi: ${name}`,
  wholeArena: "Semua",
  gm: { text: "GM", title: "Game master: tank penyelenggara, yang tidak masuk peringkat" },
  sheet: {
    open: (name) => `Lihat tank ${name}`,
    openRules: (name) => `Lihat aturan ${name}`,
    rulesCue: "Lihat aturan",
    rules: "Aturan",
    upgrades: (list) => `Peningkatan: ${list}.`,
    gm: "Ini tank penyelenggara, jadi semua orang boleh membaca aturannya.",
    rulesLater: (month) => `Semua orang bisa membaca aturan tank ini setiap kali bulan selesai, dimulai dari ${month}.`,
    monthRules: (month) => `Ini aturan tank saat ${month} berakhir.`,
    lastDay: (day) => `Pada ${day}`,
    turns: "Giliran",
    moved: "Petak ditempuh",
    noLastDay: "Tank ini belum menyelesaikan satu hari, jadi angkanya muncul setelah tengah malam berikutnya.",
    loading: "Tank sedang dimuat.",
  },
  conditionChanges: "Kondisi arena diundi setiap ronde dimulai.",
  own: {
    heading: "Tank kamu",
    freshStart: "Tank kamu masuk terowongan dan keluar di petak lain dengan air penuh.",
    today: (place, score) => `Tank kamu di peringkat ${place} hari ini dengan ${score} poin.`,
    todayShort: (place, score) => `#${place} · ${score} poin`,
    todayGmShort: (score) => `GM · ${score} poin`,
    todayGm: (score) => `Tank kamu adalah GM dengan ${score} poin hari ini, dan tidak masuk peringkat.`,
    counts: "Hari ini masuk hitungan poin bulananmu.",
    notCounted: "Hari ini belum dihitung karena tank kamu masuk setelah ronde dimulai.",
    playsAlone: "Tank kamu main sendiri di setiap ronde, jadi kamu boleh menutup halaman ini dan kembali kapan saja.",
    daysNeeded: (days, need) =>
      need === 1
        ? "Tank kamu masuk peringkat setelah main sehari penuh, dari tengah malam sampai tengah malam."
        : `Tank kamu sudah main ${days} dari ${need} hari yang dibutuhkan untuk masuk peringkat.`,
    monthPlace: (place, score, days) => `Tank kamu di peringkat ${place} bulan ini dengan ${score} poin dari ${days} hari yang dihitung.`,
    otherLeague: (league) => `Tank kamu main di Liga ${league}.`,
    show: (league) => `Lihat Liga ${league}`,
  },
  quit: {
    open: "Keluar dari arena bulanan",
    title: "Keluar dari arena bulanan?",
    bodyCounted: (score) =>
      `Tank kamu keluar dari papan sekarang, dan semua poinmu tetap tersimpan, termasuk ${score} poin hari ini. Kalau kamu masuk lagi hari ini, tank kamu melanjutkan dari poin itu. Namamu tetap sama. Kalau hanya ingin berhenti menonton, tutup saja halaman ini, dan tank kamu tetap main.`,
    bodyNotCounted:
      "Tank kamu keluar dari papan sekarang. Poin dari hari-hari sebelumnya tetap tersimpan, dan namamu tetap sama. Kamu bisa masuk lagi nanti. Kalau hanya ingin berhenti menonton, tutup saja halaman ini, dan tank kamu tetap main.",
    confirm: "Keluar dari arena",
  },
  // "tampilan", not "penampilan": the word fits the phone's bottom bar (2026-11-16).
  changeLook: "Ubah tampilan",
  changeLookFailed: "Tampilan baru tank kamu belum tersimpan, jadi coba Ubah tampilan lagi.",
  changeRules: {
    open: "Ubah aturan",
    title: "Ubah aturan tank kamu",
    submit: "Simpan aturan",
    done: "Tank kamu sekarang main dengan aturan baru, dan poinnya tetap.",
  },
  about: {
    open: "Cara kerja arena bulanan",
    heading: "Cara kerja arena bulanan",
    round: "Satu ronde berlangsung sehari, dan setiap tank memainkannya sendiri.",
    playsAlone: "Tank kamu main setiap hari sampai kamu keluar dari arena, jadi kamu boleh menutup halaman ini dan kembali kapan saja.",
    reshuffle: "Setiap beberapa menit, tiap tank bergiliran masuk terowongan dan tetap membawa poinnya.",
    items: "Item muncul di arena, dan tombol Bantuan menjelaskan gunanya.",
    rankedDays: (days) => (days === 1 ? "Tank masuk peringkat bulan ini setelah main sehari penuh." : `Tank butuh ${days} hari yang dihitung untuk masuk peringkat bulan ini.`),
    leagues: "Di akhir bulan, separuh bawah tiap liga bertukar tempat dengan separuh atas liga di bawahnya.",
  },
  move: {
    up: (league) => `Tank kamu naik ke Liga ${league}.`,
    down: (league) => `Tank kamu turun ke Liga ${league}.`,
    stayed: (league) => `Tank kamu tetap di Liga ${league}.`,
    body: (month) => `Bulan ${month} sudah selesai, jadi semua liga disusun lagi.`,
    rulesOpen: (month) => `Aturan setiap tank saat ${month} berakhir sekarang bisa dibaca semua orang di halaman Para juara.`,
    rulesSoon: (month) => `Mulai sekarang, semua orang bisa membaca aturan setiap tank setelah bulan berakhir, dimulai dari ${month}.`,
    ok: "Oke",
  },
  joinSteps: {
    nameTitle: "Nama tank kamu",
    nameHint: "Nama ini tetap dipakai tank kamu sampai bulan ini selesai.",
    nameFixed: (name) => `Nama tank kamu bulan ini ${name}, dan kamu bisa menggantinya bulan depan.`,
    next: "Lanjut",
    tankTitle: "Siapkan tank kamu",
    submit: "Masukkan tank",
    nameTaken: "Nama ini sudah dipakai tank lain di arena bulanan, jadi ketik nama lain.",
    seatTaken: "Akun kamu sudah punya tank di arena bulanan, jadi halaman ini menampilkannya sekarang.",
    joined: "Tank kamu sudah masuk arena bulanan dan main sendiri di setiap ronde, jadi kamu boleh menutup halaman ini.",
    rulesOpen: (month) => `Semua orang bisa membaca aturan tank kamu setiap kali bulan selesai, dimulai dari ${month}.`,
  },
};
