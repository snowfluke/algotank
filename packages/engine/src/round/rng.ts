// Seeded generator for one round. It uses only 32-bit integer operations, so
// the same seed gives the same sequence in every JavaScript engine.

import type { Rng } from "../types.ts";

const TWO_POW_32 = 4294967296;

/** Finalizer of MurmurHash3. It spreads the bits of one 32-bit value over all 32 bits. */
function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Folds a safe integer into 32 bits so that seeds 1 and 2^32 + 1 differ. */
function foldSeed(seed: number): number {
  const low = seed >>> 0;
  const high = Math.floor(seed / TWO_POW_32) >>> 0;
  return mix32(low ^ mix32(high + 0x9e3779b9));
}

export function createRng(seed: number): Rng {
  if (!Number.isSafeInteger(seed)) throw new Error(`seed must be a safe integer, got ${seed}`);

  // Mulberry32. A neighbouring seed starts from a far-away state because of foldSeed.
  let state = foldSeed(seed);

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
  }

  function int(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1) {
      throw new Error(`int() needs a positive integer bound, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  }

  function chance(percent: number): boolean {
    if (!(percent >= 0 && percent <= 100)) throw new Error(`chance() needs a percent from 0 to 100, got ${percent}`);
    // Always draws, so the number of draws does not depend on the percent.
    return next() * 100 < percent;
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const held = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = held;
    }
    return copy;
  }

  return { next, int, chance, shuffle };
}
