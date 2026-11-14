// The two-character label drawn on each bot. It is derived from the whole name
// list, because "Player 1" and "Player 2" would both start with "PL" and a
// viewer could not tell the bots apart. Pure, so the rules are tested without
// rendering, and the board computes it once per player list.

import type { BotId } from "@game/engine";

const WHITESPACE = /\s+/u;
/** The last one or two digits of a name such as "Player 46". */
const TRAILING_DIGITS = /\d{1,2}$/u;

/**
 * Labels to try for one name, best first: the initials of the first two words,
 * the last digits of the name, then the first character with each later character.
 * The first character always stays, so a label still starts like the name.
 */
function candidates(name: string): string[] {
  const words = name.trim().split(WHITESPACE).filter((w) => w !== "");
  const chars = Array.from(words.join(""));
  const first = chars[0];
  if (first === undefined) return [];
  const list: string[] = [];
  const second = words[1];
  if (second !== undefined) list.push(first + (Array.from(second)[0] ?? ""));
  // A name that ends in a number is told apart best by that number: "Player 4" and "Player 46".
  const digits = TRAILING_DIGITS.exec(name.trim())?.[0];
  if (digits !== undefined) list.push(digits);
  for (const next of chars.slice(1)) list.push(first + next);
  if (list.length === 0) list.push(first);
  return list.map((label) => label.toUpperCase());
}

/**
 * One label per bot, unique within the list. A bot takes the first of its
 * candidates that nobody before it has taken. A bot with none left gets the
 * lowest free number, so the result never repeats a label.
 */
export function botLabels(names: Readonly<Record<BotId, string>>): ReadonlyMap<BotId, string> {
  const taken = new Set<string>();
  const labels = new Map<BotId, string>();
  const unlabelled: BotId[] = [];
  for (const [id, name] of Object.entries(names)) {
    const label = candidates(name).find((c) => !taken.has(c));
    if (label === undefined) {
      unlabelled.push(id);
    } else {
      taken.add(label);
      labels.set(id, label);
    }
  }
  let next = 1;
  for (const id of unlabelled) {
    while (taken.has(String(next))) next += 1;
    taken.add(String(next));
    labels.set(id, String(next));
  }
  return labels;
}
