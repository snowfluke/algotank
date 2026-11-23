// The test match's options, kept on this device so the next visit starts with the last
// ones (owner, 2026-11-23: "the test option didn't save the last time it set"). They are
// a per-viewer convenience, so browser storage holds them; a value that does not read
// back as a valid choice gives the default.

import { isArenaLayoutId, isRuleSetId, PRESET_IDS, type PresetId } from "@game/engine";
import type { ConditionChoice } from "../rules/ConditionChoices.tsx";
import { browserStore, readTestChoicesText, saveTestChoicesText } from "../session/storage.ts";
import { MATCH_LENGTH_IDS, OPPONENTS_DEFAULT, OPPONENTS_MAX, OPPONENTS_MIN, type MatchLength, type OpponentMix } from "./run.ts";

export interface TestChoices {
  readonly opponents: number;
  readonly mix: OpponentMix;
  readonly length: MatchLength;
  /**
   * A single condition, a mixed arena, or a draw for each match ("random"). Null until the player picks one, so the
   * choice follows the set announced for the next round.
   */
  readonly ruleSetId: ConditionChoice | null;
}

export const DEFAULT_TEST_CHOICES: TestChoices = { opponents: OPPONENTS_DEFAULT, mix: { kind: "eachOnce" }, length: "normal", ruleSetId: null };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The kept choices, or null when the text is not a valid set of them. */
export function parseTestChoices(raw: string | null): TestChoices | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { opponents, mix, length, ruleSetId } = value;
  if (typeof opponents !== "number" || !Number.isInteger(opponents) || opponents < OPPONENTS_MIN || opponents > OPPONENTS_MAX) return null;
  if (typeof length !== "string" || !(MATCH_LENGTH_IDS as readonly string[]).includes(length)) return null;
  const rules = ruleSetId === null || ruleSetId === "random" || (typeof ruleSetId === "string" && (isRuleSetId(ruleSetId) || isArenaLayoutId(ruleSetId))) ? (ruleSetId as ConditionChoice | null) : undefined;
  if (rules === undefined) return null;
  if (!isRecord(mix)) return null;
  const parsedMix: OpponentMix | null =
    mix["kind"] === "eachOnce" ? { kind: "eachOnce" }
    : mix["kind"] === "only" && typeof mix["presetId"] === "string" && (PRESET_IDS as readonly string[]).includes(mix["presetId"]) ? { kind: "only", presetId: mix["presetId"] as PresetId }
    : null;
  if (parsedMix === null) return null;
  return { opponents, mix: parsedMix, length: length as MatchLength, ruleSetId: rules };
}

export function readTestChoices(): TestChoices {
  return parseTestChoices(readTestChoicesText(browserStore())) ?? DEFAULT_TEST_CHOICES;
}

export function saveTestChoices(choices: TestChoices): void {
  saveTestChoicesText(browserStore(), JSON.stringify(choices));
}
