import { describe, expect, test } from "bun:test";
import { RULE_SET_IDS, createRound, parseStrategy, standings, stepRound } from "../index.ts";
import type { RuleSetId, StrategyInput } from "../index.ts";
import RECORDED_STRATEGIES from "./play-styles-replay.strategies.json";
import { RECORDED_STYLES, canonical } from "../../scripts/large-round.ts";

// Recorded on 2026-11-13 before the sequence action (docs/specs/revamp/76-email-and-sequences.md, S3)
// touched the turn loop. A stored strategy with one action per rule must play exactly as before:
// the same decisions, order, throws and snapshots on every turn (no new key in any of them), and
// the same standings. Rows of standings are [tank, points, hits landed, hits taken].
const RECORDED = [
  {
    seed: 11,
    ruleSetId: "standard",
    ticksSha256: "0d1c30e1f4f233687c76a1c8303d952602e502a8f4b80d333e597d899c6f58bd",
    standings: [
      ["leader-chaser", 9, 16, 7],
      ["ambusher", 4, 21, 17],
      ["picker", 4, 21, 17],
      ["backstabber", 0, 19, 19],
      ["evader", -2, 13, 15],
      ["dry-hunter", -4, 21, 25],
      ["random-walker", -5, 7, 12],
      ["charger", -6, 19, 25],
    ],
  },
  {
    seed: 2026,
    ruleSetId: "dry-spell",
    ticksSha256: "ce2f314e680070725beb5fedfe63846d04d7c8e1f1c28145f7b8e2bb6d8e917b",
    standings: [
      ["ambusher", 4, 8, 4],
      ["random-walker", 3, 4, 1],
      ["evader", 2, 11, 9],
      ["backstabber", 0, 7, 7],
      ["dry-hunter", -1, 13, 14],
      ["picker", -1, 9, 10],
      ["leader-chaser", -3, 8, 11],
      ["charger", -4, 14, 18],
    ],
  },
  {
    seed: 90210,
    ruleSetId: "open-field",
    ticksSha256: "fb66a5956cbac36b47abd67b2f228ee4c7d2b719abd4d6df9a6805b37c8a30a3",
    standings: [
      ["evader", 7, 16, 9],
      ["picker", 6, 20, 14],
      ["ambusher", 4, 17, 13],
      ["leader-chaser", 4, 14, 10],
      ["dry-hunter", -1, 16, 17],
      ["random-walker", -2, 1, 3],
      ["backstabber", -3, 14, 17],
      ["charger", -15, 18, 33],
    ],
  },
] as const;

// The play styles as they were at the recording (the presets were retuned on 2026-11-16), so this
// test checks the turn loop and not the presets.
const recordedPlayers = RECORDED_STYLES.map((id) => {
  const parsed = parseStrategy(RECORDED_STRATEGIES[id] as StrategyInput);
  if (!parsed.ok) throw new Error(`the recorded play style ${id} is not a valid strategy: ${parsed.errors.join("; ")}`);
  return { id, strategy: parsed.strategy };
});

function replay(seed: number, index: number) {
  const ruleSetId = RULE_SET_IDS[(index * 2) % RULE_SET_IDS.length] as RuleSetId;
  const state = createRound({ seed, ticksTotal: 90, survivorsAfterRound: 4, ruleSetId, players: recordedPlayers, items: false });
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(canonical(state.snapshot));
  while (!state.isOver) hasher.update(canonical(stepRound(state)));
  return {
    seed,
    ruleSetId,
    ticksSha256: hasher.digest("hex"),
    standings: standings(state).map((s) => [s.botId, s.score, s.hitsLanded, s.hitsTaken]),
  };
}

describe("a round of the eight play styles plays exactly as before the sequence action", () => {
  RECORDED.forEach((recorded, index) => {
    test(`seed ${recorded.seed}`, () => {
      expect(replay(recorded.seed, index)).toEqual(recorded as unknown as ReturnType<typeof replay>);
    });
  });
});
