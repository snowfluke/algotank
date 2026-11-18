import type { StrategyInput } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The outer shape of a draft. parseStrategy reports any issues within its modes and build. */
export function hasStrategyBody(value: unknown): value is Omit<StrategyInput, "ultimate"> {
  return isRecord(value) && Array.isArray(value["modes"]) && isRecord(value["build"]);
}

/** Structural equality of plain data. Key order does not matter, which JSON.stringify would get wrong. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}
