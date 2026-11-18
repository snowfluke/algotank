// The ultimate carried by a strategy (docs/specs/revamp/85-ultimates.md).
export const ULTIMATE_IDS = ["dash", "smoke", "splash", "fullTank", "mudBomb", "whirlwind", "bigUmbrella", "magnet"] as const;
export type UltimateId = (typeof ULTIMATE_IDS)[number];

export function isUltimateId(value: unknown): value is UltimateId {
  return ULTIMATE_IDS.some((id) => id === value);
}
