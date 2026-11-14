// Size limits of a strategy. parseStrategy enforces them and the editor reads
// them to stop a player before the server rejects the strategy.

export const LIMITS = {
  minModes: 1,
  maxModes: 6,
  maxRulesPerMode: 20,
  minConditionsPerRule: 1,
  maxConditionsPerRule: 4,
  /** A sequence of one step is one action, so a sequence has at least 2. */
  minStepsPerSequence: 2,
  maxStepsPerSequence: 4,
  maxNameLength: 30,
  /** Ids are made by the editor, so a long one is a sign of a hostile client. */
  maxIdLength: 40,
  minChance: 1,
  maxChance: 100,
} as const;
