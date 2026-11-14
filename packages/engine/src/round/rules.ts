// Constants of a round that no rule set changes. The numbers that differ
// between rounds (range, hit chance, water, how crowded the arena is) live in
// ../combat/rule-sets.ts.

export const RULES = {
  /** The arena is `aspectWidth : aspectHeight` wide to high. */
  aspectWidth: 4,
  aspectHeight: 3,
  /**
   * Smallest arena. At 8 x 6 two bots still need several moves to meet, and a
   * bot always has a free neighbour cell to move into.
   */
  minGridWidth: 8,
  minGridHeight: 6,
} as const;
