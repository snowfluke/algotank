// A stale bundle can send rules it built before an ultimate was required (85-ultimates.md).
import { assignUltimate, hasStrategyBody } from "@game/engine";
import { newSeed } from "../secrets.ts";

export const ultimateRandom = (): number => newSeed() / 0x1_0000_0000;

export function assignMissingUltimate(input: unknown): unknown {
  if (!hasStrategyBody(input) || Object.hasOwn(input, "ultimate")) return input;
  return { ...input, ultimate: assignUltimate(input, ultimateRandom) };
}
