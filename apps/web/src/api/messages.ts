// Error sentences for every code the server or the client can produce. Catalog
// slot: `errors`. api/errorSentences.ts picks one; this file only holds the text.
// Each sentence names the problem and the way out, and never blames the player.

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PLAYER_NAME_MAX, PLAYER_NAME_MIN } from "@game/arena";

export const en = {
  codes: {
    // Arena state machine
    wrong_phase: "The game is not at a point where this works, so wait a moment and try again.",
    arena_full: "This arena is full, so no more players can join it.",
    name_taken: "Another player already uses this name, so pick a different one.",
    name_invalid: `A name has ${PLAYER_NAME_MIN} to ${PLAYER_NAME_MAX} letters or digits, with one space between words, so change it.`,
    unknown_player: "The arena no longer lists your tank, so join again.",
    player_eliminated: "Your tank is out of this game, so you can change it again when the next game starts.",
    not_enough_players: "At least 2 tanks must be in the arena before a round can start.",
    standings_mismatch: "The server could not add up the round, so start the round again.",
    rule_set_mismatch: "The server mixed up the round rules, so start the round again.",
    look_invalid: "This page sent a tank look the game does not know, so reload the page and try again.",
    // Arena routes
    not_owner: "Only the host of this arena can do that.",
    arena_limit: "You already have an open arena, so open it or close it before you make a new one.",
    no_public_seat: "Every public arena is full right now, so try again in a minute.",
    name_blocked: "The game cannot use this name, so it put one of its own names in the box for you.",
    monthly_seat_taken: "Your account already has a tank in the monthly arena, so you can watch it there.",
    no_monthly_seat: "Your account has no tank in the monthly arena, so there is nothing to leave.",
    monthly_name_fixed: "Your name is set for this month, and you can change it next month.",
    banned: "The host has asked you not to join this arena again, so you can play in another arena.",
    email_not_verified: "This arena is for players with a verified email, so verify your email first.",
    ban_unavailable: "Only an arena for signed-in players can keep a player out.",
    not_banned: "This player may already join again.",
    tank_count_invalid: "This arena cannot have that many tanks, so choose another number.",
    tank_count_below_players: "More people are already in the arena, so choose a bigger number of tanks.",
    // Sign-in
    email_invalid: "This does not look like an email address, so check it and try again.",
    password_too_short: `A password needs at least ${PASSWORD_MIN_LENGTH} characters, so make it longer.`,
    password_too_long: `A password can have at most ${PASSWORD_MAX_LENGTH} characters, so make it shorter.`,
    password_is_email: "The password cannot be the same as the email address, so pick another one.",
    email_taken: "An account with this email already exists, so sign in instead.",
    invalid_credentials: "The email or the password is not right, so check both and try again.",
    not_signed_in: "You are not signed in any more, so sign in and try again.",
    bad_origin: "The server did not accept this page's request, so reload the page and try again.",
    // Email codes
    mail_off: "This server cannot send email, so ask the person who runs it for help.",
    mail_failed: "The email could not be sent, so wait a minute and ask for a new code.",
    already_verified: "Your email is already verified, so you do not need a code.",
    code_wrong: "This code is not right, so check the email and type the code again.",
    code_expired: "This code does not work any more, so ask for a new code.",
    code_invalid: "This code is not right or does not work any more, so check it or ask for a new code.",
    // Client
    network_error: "The page cannot reach the server, so check your connection and try again.",
    bad_response: "The server sent an answer this page cannot read, so reload the page and try again.",
  },
  /** The monthly tank's hourly limit on new rules (MONTHLY_RULE_CHANGES_PER_HOUR); `times` is that limit. */
  rulesRateLimited: (times: number, minutes: number) =>
    `Your tank can get new rules ${times} times an hour, so wait ${minutes === 1 ? "1 minute" : `${minutes} minutes`} and save them again.`,
  rateLimited: (seconds: number) =>
    seconds <= 60
      ? `There were too many tries from this network, so wait ${seconds === 1 ? "1 second" : `${seconds} seconds`} and try again.`
      : `There were too many tries from this network, so wait ${Math.ceil(seconds / 60)} minutes and try again.`,
  byAction: {
    join: {
      wrong_phase: "This game has already started, so you can watch it on the big screen.",
    },
    saveStrategy: {
      wrong_phase: "A round is running, so your change saves when the round ends.",
    },
    startRound: {
      wrong_phase: "A round is already running, so there is nothing to start now.",
    },
    leave: {
      wrong_phase: "You can leave only before the game starts, so stay until this game ends.",
    },
    look: {
      wrong_phase: "A round is running, so your tank gets its new look after the round.",
    },
    remove: {
      wrong_phase: "The game has started, so players can only be removed before a game starts.",
    },
    settings: {
      wrong_phase: "The game has started, so the bots stay as they are until the next game.",
    },
    ready: {
      wrong_phase: "The game is already starting, so you do not need to tap “I'm ready” now.",
    },
  },
  refused: {
    create: "You are not signed in any more, so sign in and try again.",
    loadArena: "The server did not show this arena, so check the link with the person who shared it.",
    join: "The arena did not accept this join, so reload the page and try again.",
    loadStrategy: "The arena no longer knows your tank, so join again.",
    saveStrategy: "The arena no longer knows your tank, so join again.",
    startRound: "Only the host of this arena can start a round.",
    reset: "Only the host of this arena can start a new game.",
    settings: "Only the host of this arena can change the bots.",
    close: "Only the host of this arena can close it.",
    seat: "The server did not give you a seat, so reload the page and try again.",
    leave: "The arena no longer knows your tank, so you have already left.",
    look: "The arena no longer knows your tank, so join again.",
    remove: "Only the host of this arena can remove a player.",
    ready: "The arena no longer knows your tank, so join again.",
    loadChampions: "The server did not show the champions, so reload the page and try again.",
    loadTank: "The server did not show this tank, so close it and try again.",
    renameTank: "The name was not saved, so reload the page and try again.",
    chat: "The arena no longer knows your tank, so join again.",
    chatSetting: "Only the host of this arena can turn the chat on or off.",
    signIn: "The server did not accept this sign-in, so reload the page and try again.",
    register: "The server did not accept this sign-up, so reload the page and try again.",
    signOut: "The server did not sign you out, so reload the page and try again.",
    verifyEmail: "You are not signed in any more, so sign in and try again.",
    sendCode: "You are not signed in any more, so sign in and try again.",
    resetPassword: "The server did not accept this request, so reload the page and try again.",
  },
  notFound: "This arena does not exist any more, so check the code with the person who shared it.",
  invalid: "The server did not accept what this page sent, so check the parts listed below and try again.",
  generic: "Something went wrong on the server, so try again in a moment.",
};

export type ErrorText = typeof en;

export const id: typeof en = {
  codes: {
    wrong_phase: "Ini belum bisa dilakukan sekarang, jadi tunggu sebentar, lalu coba lagi.",
    arena_full: "Arena ini sudah penuh, jadi tidak ada pemain lain yang bisa gabung.",
    name_taken: "Nama ini sudah dipakai pemain lain, jadi pilih nama lain, ya.",
    name_invalid: `Nama berisi ${PLAYER_NAME_MIN} sampai ${PLAYER_NAME_MAX} huruf atau angka dengan satu spasi di antara kata, jadi ubah namanya.`,
    unknown_player: "Tank kamu sudah tidak ada di arena ini, jadi gabung lagi, ya.",
    player_eliminated: "Tank kamu tersingkir dari permainan ini, jadi kamu bisa mengubahnya lagi saat permainan berikutnya mulai.",
    not_enough_players: "Ronde baru bisa mulai kalau ada minimal 2 tank di arena.",
    standings_mismatch: "Server gagal menghitung hasil ronde, jadi mulai ronde ini sekali lagi.",
    rule_set_mismatch: "Server salah mencocokkan aturan ronde, jadi mulai ronde ini sekali lagi.",
    look_invalid: "Halaman ini mengirim tampilan tank yang tidak dikenal permainan, jadi muat ulang halaman, lalu coba lagi.",
    not_owner: "Hanya tuan rumah arena ini yang bisa melakukannya.",
    arena_limit: "Kamu masih punya arena yang terbuka, jadi buka arena itu atau tutup dulu sebelum membuat yang baru.",
    no_public_seat: "Semua arena umum sedang penuh, jadi coba lagi semenit lagi.",
    name_blocked: "Permainan tidak bisa memakai nama ini, jadi kotaknya sudah diisi dengan nama dari permainan.",
    monthly_seat_taken: "Akun kamu sudah punya tank di arena bulanan, jadi kamu bisa menontonnya di sana.",
    no_monthly_seat: "Akun kamu belum punya tank di arena bulanan, jadi tidak ada tank yang perlu dikeluarkan.",
    monthly_name_fixed: "Namamu sudah tetap untuk bulan ini, dan bisa diganti bulan depan.",
    banned: "Tuan rumah meminta kamu tidak bergabung lagi ke arena ini, jadi kamu bisa main di arena lain.",
    email_not_verified: "Arena ini untuk pemain dengan email terverifikasi, jadi verifikasi email kamu dulu.",
    ban_unavailable: "Hanya arena untuk pemain yang masuk akun yang bisa menahan pemain agar tidak bergabung lagi.",
    not_banned: "Pemain ini sudah boleh bergabung lagi.",
    tank_count_invalid: "Arena ini tidak bisa punya tank sebanyak itu, jadi pilih angka lain.",
    tank_count_below_players: "Orang di arena sudah lebih banyak dari itu, jadi pilih jumlah tank yang lebih besar.",
    email_invalid: "Alamat email ini sepertinya belum benar, jadi periksa lagi, lalu coba sekali lagi.",
    password_too_short: `Kata sandi perlu minimal ${PASSWORD_MIN_LENGTH} karakter, jadi buat lebih panjang, ya.`,
    password_too_long: `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter, jadi buat lebih pendek, ya.`,
    password_is_email: "Kata sandi tidak boleh sama dengan alamat email, jadi pilih kata sandi lain.",
    email_taken: "Sudah ada akun dengan email ini, jadi masuk saja pakai email itu.",
    invalid_credentials: "Email atau kata sandinya belum cocok, jadi periksa lalu coba lagi.",
    not_signed_in: "Kamu perlu masuk lagi ke akunmu, lalu coba sekali lagi.",
    bad_origin: "Server menolak permintaan dari halaman ini, jadi muat ulang halaman, lalu coba lagi.",
    mail_off: "Server ini tidak bisa mengirim email, jadi minta bantuan pengelola server ini.",
    mail_failed: "Emailnya gagal terkirim, jadi tunggu semenit, lalu minta kode baru.",
    already_verified: "Email kamu sudah terverifikasi, jadi kamu tidak perlu kode lagi.",
    code_wrong: "Kodenya belum cocok, jadi periksa emailmu, lalu ketik kodenya lagi.",
    code_expired: "Kode ini sudah tidak berlaku, jadi minta kode baru, ya.",
    code_invalid: "Kodenya belum cocok atau sudah tidak berlaku, jadi periksa lagi atau minta kode baru.",
    network_error: "Halaman ini tidak bisa terhubung ke server, jadi periksa koneksimu, lalu coba lagi.",
    bad_response: "Server mengirim jawaban yang tidak bisa dibaca halaman ini, jadi muat ulang halaman, lalu coba lagi.",
  },
  rulesRateLimited: (times, minutes) => `Tank kamu bisa ganti aturan ${times} kali per jam, jadi tunggu ${minutes} menit, lalu simpan lagi.`,
  rateLimited: (seconds) =>
    seconds <= 60
      ? `Terlalu banyak percobaan dari jaringan ini, jadi tunggu ${seconds} detik, lalu coba lagi.`
      : `Terlalu banyak percobaan dari jaringan ini, jadi tunggu ${Math.ceil(seconds / 60)} menit, lalu coba lagi.`,
  byAction: {
    join: {
      wrong_phase: "Permainan ini sudah mulai, jadi kamu bisa menontonnya di layar besar.",
    },
    saveStrategy: {
      wrong_phase: "Ronde sedang berjalan, jadi perubahanmu tersimpan setelah ronde selesai.",
    },
    startRound: {
      wrong_phase: "Ronde sudah berjalan, jadi belum ada yang bisa dimulai sekarang.",
    },
    leave: {
      wrong_phase: "Kamu hanya bisa meninggalkan arena sebelum permainan mulai, jadi tetap di sini sampai permainan ini selesai.",
    },
    look: {
      wrong_phase: "Ronde sedang berjalan, jadi tampilan baru tank kamu dipakai setelah ronde selesai.",
    },
    remove: {
      wrong_phase: "Permainan sudah mulai, jadi pemain hanya bisa dikeluarkan sebelum permainan mulai.",
    },
    settings: {
      wrong_phase: "Permainan sudah mulai, jadi bot tetap seperti ini sampai permainan berikutnya.",
    },
    ready: {
      wrong_phase: "Permainan sudah mulai, jadi kamu tidak perlu menekan “Aku siap” sekarang.",
    },
  },
  refused: {
    create: "Kamu perlu masuk lagi ke akunmu, lalu coba sekali lagi.",
    loadArena: "Server tidak menampilkan arena ini, jadi tanyakan lagi tautannya ke orang yang membagikannya.",
    join: "Arena ini menolak permintaan gabung, jadi muat ulang halaman, lalu coba lagi.",
    loadStrategy: "Arena ini sudah tidak mengenali tank kamu, jadi gabung lagi, ya.",
    saveStrategy: "Arena ini sudah tidak mengenali tank kamu, jadi gabung lagi, ya.",
    startRound: "Hanya tuan rumah arena ini yang bisa memulai ronde.",
    reset: "Hanya tuan rumah arena ini yang bisa memulai permainan baru.",
    settings: "Hanya tuan rumah arena ini yang bisa mengatur bot.",
    close: "Hanya tuan rumah arena ini yang bisa menutupnya.",
    seat: "Server belum memberi kamu tempat, jadi muat ulang halaman, lalu coba lagi.",
    leave: "Arena ini sudah tidak mengenali tank kamu, jadi kamu sudah meninggalkan arena ini.",
    look: "Arena ini sudah tidak mengenali tank kamu, jadi gabung lagi, ya.",
    remove: "Hanya tuan rumah arena ini yang bisa mengeluarkan pemain.",
    ready: "Arena ini sudah tidak mengenali tank kamu, jadi gabung lagi, ya.",
    loadChampions: "Server belum menampilkan para juara, jadi muat ulang halaman, lalu coba lagi.",
    loadTank: "Server belum menampilkan tank ini, jadi tutup, lalu coba lagi.",
    renameTank: "Nama belum tersimpan, jadi muat ulang halaman, lalu coba lagi.",
    chat: "Arena ini sudah tidak mengenali tank kamu, jadi gabung lagi, ya.",
    chatSetting: "Hanya tuan rumah arena ini yang bisa menyalakan atau mematikan obrolan.",
    signIn: "Server menolak permintaan masuk ini, jadi muat ulang halaman, lalu coba lagi.",
    register: "Server menolak pendaftaran ini, jadi muat ulang halaman, lalu coba lagi.",
    signOut: "Server belum mengeluarkan kamu dari akun, jadi muat ulang halaman, lalu coba lagi.",
    verifyEmail: "Kamu perlu masuk lagi ke akunmu, lalu coba sekali lagi.",
    sendCode: "Kamu perlu masuk lagi ke akunmu, lalu coba sekali lagi.",
    resetPassword: "Server menolak permintaan ini, jadi muat ulang halaman, lalu coba lagi.",
  },
  notFound: "Arena ini sudah tidak ada, jadi tanyakan lagi kodenya ke orang yang membagikannya.",
  invalid: "Server tidak menerima isian dari halaman ini, jadi periksa bagian yang tertulis di bawah, lalu coba lagi.",
  generic: "Ada masalah di server, jadi tunggu sebentar, lalu coba lagi.",
};
