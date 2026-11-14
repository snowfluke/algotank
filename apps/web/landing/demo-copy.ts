// The text that the demo's script writes while the round plays. It lives apart from
// copy.ts because it ships to the browser, and copy.ts pulls in the game's catalogs.

export type LandingLanguage = "id" | "en";

export interface DemoCopy {
  readonly moveUp: string;
  readonly moveDown: string;
  readonly turn: (turn: number, total: number) => string;
  readonly points: (points: number) => string;
  readonly finished: (rank: number, total: number) => string;
  readonly playAgain: string;
  readonly playRound: string;
  readonly failed: string;
}

function ordinalEn(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffixes: Readonly<Record<number, string>> = { 1: "st", 2: "nd", 3: "rd" };
  return `${n}${suffixes[n % 10] ?? "th"}`;
}

export const DEMO_COPY: Readonly<Record<LandingLanguage, DemoCopy>> = {
  en: {
    moveUp: "Move this rule up",
    moveDown: "Move this rule down",
    turn: (turn, total) => `Turn ${turn} of ${total}`,
    points: (points) => (points === 1 ? "1 point" : `${points} points`),
    finished: (rank, total) => `Your tank finished ${ordinalEn(rank)} of ${total}.`,
    playAgain: "Play the round again",
    playRound: "Play the round",
    failed: "The demo round did not load, and you can still play the game.",
  },
  id: {
    moveUp: "Pindahkan aturan ini ke atas",
    moveDown: "Pindahkan aturan ini ke bawah",
    turn: (turn, total) => `Giliran ${turn} dari ${total}`,
    points: (points) => `${points} poin`,
    finished: (rank, total) => `Tankmu finis di posisi ke-${rank} dari ${total}.`,
    playAgain: "Putar ronde lagi",
    playRound: "Putar ronde",
    failed: "Ronde contoh tidak bisa dimuat, dan kamu tetap bisa main.",
  },
};
