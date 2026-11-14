// Reads what a person typed or pasted into the join field: a code such as
// "k7m 2qx" or "K7M-2QX", or a whole link to an arena page.

import { isArenaCode } from "@game/arena";
import { arenaIdFromLink } from "../app/route.ts";

const SEPARATORS = /[\s\-_.]+/g;

export type CodeReading =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid" }
  | { readonly kind: "code"; readonly code: string };

export function readArenaCode(text: string): CodeReading {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  const fromLink = arenaIdFromLink(trimmed);
  const candidate = fromLink ?? trimmed.replace(SEPARATORS, "").toUpperCase();
  return isArenaCode(candidate) ? { kind: "code", code: candidate } : { kind: "invalid" };
}
