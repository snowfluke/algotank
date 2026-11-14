// Shared by the scripts in this folder: the size of a final and the field of
// presets that Table 1 of simulate.ts and probes.ts both play.

import type { Preset } from "../src/index.ts";

export const FINAL_SIZE = 8;

/**
 * The presets on the 8 seats of a final. When there are fewer than 8 presets the
 * extra seats are copies, and when there are more, a window of 8 plays. The window
 * and the seats rotate with the seed, so every preset gets every seat id equally often.
 */
export function mixedField(seed: number, presets: readonly Preset[]): Preset[] {
  return Array.from({ length: FINAL_SIZE }, (_, seat) => {
    const preset = presets[(seed + seat) % presets.length];
    if (preset === undefined) throw new Error("no presets");
    return preset;
  });
}
