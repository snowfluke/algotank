import { describe, expect, test } from "bun:test";
import { FIXTURE_PATH, FIXTURE_SEEDS, fixtureDigest, type RoundDigest } from "../../scripts/large-round.ts";

// The digests were recorded before the speed work of docs/specs/revamp/63-large-arenas.md
// (scripts/large-round.ts record). A faster engine must play the same rounds: the same
// decisions, order, throws and snapshots on every tick, and the same standings.
const recorded = (await Bun.file(FIXTURE_PATH).json()) as RoundDigest[];

describe("a 64-player round plays exactly as recorded", () => {
  test("the fixture holds 20 seeds", () => {
    expect(recorded.map((d) => d.seed)).toEqual([...FIXTURE_SEEDS]);
  });
  FIXTURE_SEEDS.forEach((seed, index) => {
    test(`seed ${seed}`, () => {
      expect(fixtureDigest(seed, index)).toEqual(recorded[index] as RoundDigest);
    });
  });
});
