// Two-word names the game makes, such as "Brave Otter". A join without a name gets
// one, in every arena kind, and a refused name (name-filter.ts) comes back with one as
// the suggestion, so a child can play without typing.

import { randomInt } from "node:crypto";
import { parsePlayerName } from "@game/arena";

const ADJECTIVES: readonly string[] = [
  "Brave", "Happy", "Quick", "Clever", "Sunny", "Lucky", "Jolly", "Calm",
  "Bold", "Bright", "Gentle", "Swift", "Merry", "Plucky", "Cosy", "Sparkly",
  "Cheery", "Kind", "Proud", "Silly", "Snappy", "Zippy", "Fluffy", "Mighty",
];

const ANIMALS: readonly string[] = [
  "Otter", "Duck", "Frog", "Seal", "Turtle", "Dolphin", "Penguin", "Crab",
  "Whale", "Beaver", "Heron", "Puffin", "Goose", "Newt", "Swan", "Walrus",
  "Panda", "Koala", "Gecko", "Hamster", "Lobster", "Pelican", "Salmon", "Octopus",
];

/**
 * Every name the game can make: 24 x 24 = 576. A presenter arena holds 512 humans, so
 * at least 64 stay free in a full arena, and bots join only arenas under 8 players.
 */
export const GAME_NAMES: readonly string[] = ADJECTIVES.flatMap((adjective) => ANIMALS.map((animal) => `${adjective} ${animal}`));

// Checked at load, so a word added to the lists above that breaks the name rule stops the start, not a join.
for (const name of GAME_NAMES) {
  if (parsePlayerName(name) !== name) throw new Error(`The game name "${name}" breaks the player name rule.`);
}

/** A game name that none of `takenNames` equals, ignoring case. */
export function makeGameName(takenNames: Iterable<string>): string {
  const taken = new Set([...takenNames].map((name) => name.toLowerCase()));
  const free = GAME_NAMES.filter((name) => !taken.has(name.toLowerCase()));
  if (free.length === 0) throw new Error("Every game name is taken.");
  const name = free[randomInt(free.length)];
  if (name === undefined) throw new Error("randomInt gave an index outside the list.");
  return name;
}
