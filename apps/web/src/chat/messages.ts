// Interface text for arena chat (docs/specs/revamp/72-arena-chat.md, CH1b). Catalog slot: `chat`.
// The tab's name is in room/messages.ts (`room.tabs.chat`), next to the other tabs.
// The four quick lines are a list of separate strings on separate buttons, never one passage.

import { CHAT_LIMITS } from "@game/arena";

const seconds = (n: number) => (n === 1 ? "1 second" : `${n} seconds`);

export const en = {
  /** Names the pane and its list for a screen reader. */
  label: "Chat",
  list: "Messages",
  loading: "Loading the messages.",
  empty: "Nobody has written yet, so say hi.",
  /** Shown above the sender's name on a line the arena's owner wrote from the host page. */
  host: "Host",
  /** The Pager's Previous button (visible) and Next button (read aloud). */
  earlier: "Earlier messages",
  later: "Newer messages",
  /** The quick lines a child taps instead of typing; each one is sent as an ordinary message. */
  quickLabel: "Quick messages",
  quick: ["Hi!", "Ready!", "Good luck!", "Good game!"],
  inputLabel: "Message",
  placeholder: "Write a message",
  send: "Send",
  /** Read aloud with the unread dot on the Chat tab. */
  unread: "new messages",
  refusals: {
    tooFast: (s: number) => `You sent many messages quickly, so wait ${seconds(s)}.`,
    busy: (s: number) => `Many people are writing at once, so wait ${seconds(s)}.`,
    blocked: "Use other words, because this arena is for everyone.",
    off: "The host turned the chat off.",
    closed: "A round is running, so the chat opens again after it.",
    tooLong: `A message has at most ${CHAT_LIMITS.textMax} characters, so make it shorter.`,
  },
  /** The owner's switch in the settings; no sentence under it, because the label says the same (82-fit-fixes.md). */
  setting: {
    label: "Chat",
  },
};

export const id: typeof en = {
  label: "Obrolan",
  list: "Pesan",
  loading: "Memuat pesan.",
  empty: "Belum ada yang menulis, jadi sapa teman-temanmu.",
  host: "Tuan rumah",
  earlier: "Pesan sebelumnya",
  later: "Pesan berikutnya",
  quickLabel: "Pesan cepat",
  quick: ["Hai!", "Aku siap!", "Semangat!", "Seru sekali!"],
  inputLabel: "Pesan",
  placeholder: "Tulis pesan",
  send: "Kirim",
  unread: "ada pesan baru",
  refusals: {
    tooFast: (s) => `Kamu mengirim banyak pesan sekaligus, jadi tunggu ${s} detik.`,
    busy: (s) => `Banyak orang menulis bersamaan, jadi tunggu ${s} detik.`,
    blocked: "Pakai kata lain, karena arena ini untuk semua orang.",
    off: "Tuan rumah mematikan obrolan.",
    closed: "Ronde sedang berjalan, jadi obrolan dibuka lagi setelah ronde selesai.",
    tooLong: `Pesan paling panjang ${CHAT_LIMITS.textMax} karakter, jadi buat lebih pendek.`,
  },
  setting: {
    label: "Obrolan",
  },
};
