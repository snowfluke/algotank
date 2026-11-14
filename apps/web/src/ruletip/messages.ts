// Interface text for the rule tip after a practice game (RuleTip.tsx and the next lobby's status
// line). Catalog slot: `ruleTip`. The result lasts 20 s and already says who won and the player's
// place, so the result's sentences have 5 words at most (publicplay/phaseText.test.tsx counts them);
// the full sentences go to the lobby's status line, where the rules are on screen for 30 s.

export const en = {
  /** On the result: it names the next step and promises nothing. */
  encourage: "Try changing one rule.",
  openRules: "Change my rules",
  /** On the result, for a rule list whose first rule shoots and that has no water rule (ruleTip.ts). */
  waterShort: "Rule 1 shoots without water.",
  addWater: "Add a water rule",
  added: "Saved for the next game.",
  /** The next lobby's status line, while the water tip still applies. Rules are named by number, like the stats card. */
  water: "Rule 1 shoots even with too little water, so add a rule above it that steps out of the line of fire.",
  /** The next lobby's status line otherwise. */
  lobby: "Change one rule now and see whether your place changes in this game.",
};

export const id: typeof en = {
  encourage: "Coba ubah satu aturan.",
  openRules: "Ubah aturanku",
  waterShort: "Aturan 1 menembak tanpa air.",
  addWater: "Tambah aturan air",
  added: "Tersimpan untuk permainan berikutnya.",
  water: "Aturan 1 menembak walaupun air tankmu tinggal sedikit, jadi tambahkan aturan di atasnya untuk menyingkir dari garis tembak.",
  lobby: "Ubah satu aturan sekarang, lalu lihat apakah peringkatmu berubah di permainan ini.",
};
