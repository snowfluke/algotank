import { describe, expect, test } from "bun:test";
import { createRng } from "./rng.ts";

function draw(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe("createRng", () => {
  test("the same seed gives the same sequence", () => {
    expect(draw(42, 50)).toEqual(draw(42, 50));
  });

  test("different seeds give different sequences, also for neighbouring seeds", () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
    expect(draw(0, 5)).not.toEqual(draw(1, 5));
    expect(draw(1, 5)).not.toEqual(draw(2 ** 32 + 1, 5));
  });

  // Pinned values: if the algorithm changes, stored replays change too. Update
  // them on purpose, never to make a failing run pass.
  test("the sequence for seed 12345 stays the same", () => {
    const rng = createRng(12345);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([0.806650506798178, 0.6629149119835347, 0.7144323736429214]);
    expect(rng.int(100)).toBe(91);
    expect(rng.chance(50)).toBe(false);
    expect(rng.shuffle([1, 2, 3, 4, 5, 6])).toEqual([4, 2, 3, 5, 1, 6]);
  });

  test("next stays in [0, 1) and averages near one half", () => {
    const values = draw(7, 10_000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  test("int covers 0 to max - 1 and never reaches max", () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(5));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(createRng(3).int(1)).toBe(0);
  });

  test("chance(0) never and chance(100) always succeeds", () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(100)).toBe(true);
    }
  });

  test("chance(30) succeeds about 30% of the time", () => {
    const rng = createRng(11);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(30)) hits++;
    expect(hits).toBeGreaterThan(2_800);
    expect(hits).toBeLessThan(3_200);
  });

  test("shuffle returns a permutation, keeps the input, and is deterministic", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const shuffled = createRng(5).shuffle(input);
    expect(input).toEqual(copy);
    expect([...shuffled].sort()).toEqual(copy);
    expect(createRng(5).shuffle(input)).toEqual(shuffled);
    expect(createRng(5).shuffle([])).toEqual([]);
  });

  test("rejects a seed or bound that would give a silent wrong draw", () => {
    expect(() => createRng(1.5)).toThrow();
    expect(() => createRng(Number.NaN)).toThrow();
    expect(() => createRng(1).int(0)).toThrow();
    expect(() => createRng(1).int(2.5)).toThrow();
    expect(() => createRng(1).chance(101)).toThrow();
    expect(() => createRng(1).chance(Number.NaN)).toThrow();
  });
});
