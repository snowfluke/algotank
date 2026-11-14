// The block list for players' names. Children play, so the server refuses a typed name
// that holds a rude, sexual or hateful word in English or Indonesian, and answers with a
// name from the game instead (game-names.ts). The words are data in this file; the
// browser never sees them. Written from common knowledge on 2026-11-12, not copied from
// a published list.
//
// Matching rule. The name has already passed parsePlayerName, so it holds only the
// letters A to Z, digits and single spaces. Case does not count. Three readings of the
// name are checked, because a digit can stand for a letter or only break a word:
//   1. every digit read as a space ("ass2" is "ass"),
//   2. look-alike digits read as letters (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, 8 b, 9 g), other digits as spaces,
//   3. the same with 1 read as l ("s1ut" is "slut").
// In each reading:
//   - WHOLE_WORDS match a whole word of the name. They do not match inside a longer word,
//     so "Classic Bass", "Grape Juice" and "Pantai Indah" pass. Plurals are listed as words.
//   - CONTAINED words match anywhere inside a word of the name ("SuperFuckers"). Only words
//     that do not occur inside ordinary words or names are here; a word that does ("shit"
//     in "Matsushita", "cunt" in "Scunthorpe", "fuk" in "Fukuoka", "peju" in "Pejuang") is a
//     whole word. Known false hit: "snigger".
//   - A word split by spaces is read joined only when the split shows: CONTAINED words are
//     looked for in the joined letters when the name has a word of one or two letters
//     ("f uck"), and WHOLE_WORDS match the joined letters when every word has one or two
//     letters ("a s s"). Two ordinary words are never joined, so "Bang Satria" and
//     "Meme King" pass.
//   - For a word without a doubled letter, a run of one letter in the name counts as one
//     letter, so "fuuuck" matches "fuck". A word with a doubled letter ("ass") is matched
//     as written, so the short word "as" stays allowed.
//
// Named limit: a block list never catches everything (new spellings, other languages,
// words split by a real word). The owner of a private or presenter arena can remove a
// player in the lobby (DELETE /api/arenas/:id/players/:playerId).
//
// Sentences (arena chat, hasBlockedWordInText) use the same two lists with a stricter way of
// joining, because a chat line is a sentence: short words such as "di", "ke", "to" and "at"
// are everywhere, so joining a whole line when it has one ("bang satu aja ya") makes runs no
// word holds. The text is cut into tokens at white space; a token's trailing punctuation is
// dropped; inside a token @ $ ! read as a s i, a * is dropped ("f*ck"), and every other
// character that is not a letter or digit cuts it into words. A word of w and k that starts
// with w is laughter ("wkwk", "wkkkk") and is skipped, although it holds "kkk". Then, in each of the three readings above:
//   - WHOLE_WORDS match a whole word and CONTAINED words match inside a word, as for names,
//     with the same collapsing of repeated letters ("fuuuck", "anjiiing").
//   - Only a run of two or more one-letter words is read joined ("f u c k", "a.s.s").
//   - Digits read as letters only in a token that also holds a letter ("k0nt0l", "4ss"); a token
//     without one is a number, so "skor 455" and "0812-455-1234" pass.
// Case, accents ("fück"), full-width letters and invisible format characters do not count (NFKC,
// then the marks and the format characters are removed).
// Known misses beside the named limit: a word split into two-letter parts ("f uck"), letters of
// other alphabets that look Latin. Known false hits: an ordinary word on the list (Indonesian
// "babi" is pig, "monyet" is monkey) and "tai chi", "tit-mouse", "homo sapiens", "cum laude".

import { parsePlayerName } from "@game/arena";
import { makeGameName } from "./game-names.ts";

const CONTAINED: readonly string[] = [
  // English
  "fuck", "fck", "motherf", "bitch", "biatch", "asshole", "arsehole", "bullshit", "shithead", "dickhead",
  "nigger", "nigga", "faggot", "whore", "slut", "dildo", "wanker", "porno", "pornhub", "blowjob", "handjob",
  "rimjob", "jizz", "cumshot", "hentai", "orgasm", "vagina", "clitoris", "masturb", "pedophil", "paedophil",
  "molest", "incest", "bestiality", "hitler", "kkk", "retard", "tranny", "bollock",
  // Indonesian (and the common Javanese and Malay forms)
  "kontol", "memek", "ngentot", "ngewe", "jancok", "jancuk", "dancok", "bangsat", "bajingan", "kampret",
  "goblok", "goblog", "tolol", "pukimak", "pepek", "jembut", "lonte", "pelacur", "bencong", "bokep",
  "colmek", "kimak", "ngaceng",
];

const WHOLE_WORDS: readonly string[] = [
  // English
  "ass", "arse", "shit", "shitty", "piss", "pissed", "dick", "cock", "cunt", "pussy", "twat", "fuk",
  "penis", "boob", "boobs", "dicks", "cocks", "cunts", "shits", "asses", "tit", "tits", "titty", "titties", "anal", "anus", "rape", "rapist", "porn",
  "sex", "sexy", "nude", "naked", "horny", "milf", "cum", "wank", "boner", "fag", "homo", "dyke", "spic",
  "chink", "kike", "gook", "coon", "wog", "paki", "nazi", "nazis", "suicide", "pedo", "paedo", "perv",
  "pervert", "scum", "bastard", "prick", "slag", "skank", "thot", "idiot", "stupid", "moron", "crotch",
  "nutsack", "sperm", "bdsm", "kinky", "xxx", "cocaine", "heroin",
  // Indonesian
  "anjing", "anjir", "anjay", "njing", "asu", "babi", "monyet", "bego", "bodoh", "dungu", "sinting",
  "tai", "taik", "tahi", "brengsek", "keparat", "bacot", "cocot", "toket", "tetek", "titit", "peler",
  "coli", "sange", "horni", "perek", "sundal", "germo", "jablay", "banci", "puki", "ngocok", "mesum",
  "cabul", "bugil", "telanjang", "seks", "bispak", "kafir", "mampus", "modar", "pecun", "lacur", "cuk",
  "entot", "itil", "peju", "pantek",
];

const DIGIT_AS_LETTER: Readonly<Record<string, string>> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g" };
const DIGITS = /[0-9]/g;
const REPEATED_LETTER = /([a-z])\1+/g;
const DOUBLED_LETTER = /([a-z])\1/;
const LOWER_LETTERS = /^[a-z]+$/;
const LETTER = /[a-z]/;

const collapse = (text: string): string => text.replace(REPEATED_LETTER, "$1");
const hasDoubledLetter = (word: string): boolean => DOUBLED_LETTER.test(word);

const containedPlain = CONTAINED;
const containedCollapsible = CONTAINED.filter((word) => !hasDoubledLetter(word));
const wholePlain: ReadonlySet<string> = new Set(WHOLE_WORDS);
const wholeCollapsible: ReadonlySet<string> = new Set(WHOLE_WORDS.filter((word) => !hasDoubledLetter(word)));

/** The three readings of the name described at the top of this file. */
function readings(name: string): readonly string[] {
  const lower = name.toLowerCase();
  const asLetters = (one: string) => lower.replace(DIGITS, (digit) => (digit === "1" ? one : (DIGIT_AS_LETTER[digit] ?? " ")));
  return [lower.replace(DIGITS, " "), asLetters("i"), asLetters("l")];
}

function containsWord(text: string): boolean {
  if (containedPlain.some((word) => text.includes(word))) return true;
  const collapsed = collapse(text);
  return containedCollapsible.some((word) => collapsed.includes(word));
}

function isWholeWord(word: string): boolean {
  return wholePlain.has(word) || wholeCollapsible.has(collapse(word));
}

/** A word of one or two letters, as in "f uck" or "a s s". A word of digits only does not count. */
const isShortWord = (word: string): boolean => word.length <= 2 && LETTER.test(word);

function readingIsBlocked(reading: string, spacedOut: { readonly some: boolean; readonly all: boolean }): boolean {
  const words = reading.split(" ").filter((word) => word !== "");
  if (words.some((word) => containsWord(word) || isWholeWord(word))) return true;
  // The joined letters are read only when short words show that a word was split on purpose,
  // because joining two ordinary words makes runs that neither holds ("Bang Satria").
  const joined = words.join("");
  if (spacedOut.some && containsWord(joined)) return true;
  return spacedOut.all && isWholeWord(joined);
}

/** True when the name holds a blocked word. Pass a name that parsePlayerName returned. */
export function hasBlockedWord(name: string): boolean {
  const written = name.toLowerCase().split(" ");
  const spacedOut = { some: written.some(isShortWord), all: written.length > 1 && written.every(isShortWord) };
  return readings(name).some((reading) => readingIsBlocked(reading, spacedOut));
}

const TRAILING_PUNCTUATION = /[^\p{L}\p{N}@$*]+$/u;
const MARKS = /\p{M}/gu;
// Invisible format characters (zero-width space and joiner, soft hyphen) would cut a word for the filter while the screen shows it whole.
const INVISIBLE = /\p{Cf}/gu;
const WHITE_SPACE = /\s+/;
const LATIN_LETTER = /[a-z]/;
/** Inside a token: look-alike symbols read as letters, and a star that hides a letter is dropped ("f*ck" reads "fck"). */
const SYMBOL_READING: Readonly<Record<string, string>> = { "@": "a", $: "s", "!": "i", "*": "" };
/** Indonesian laughter ("wkwk", "wkkkk") holds the contained word "kkk". */
const LAUGHTER = /^w[wk]+$/;
const NOT_A_LOWER_LETTER = /[^a-z]+/;

/** Lower-case Latin letters without accents, so "Fück" and full-width letters read as "fuck". */
function plainLetters(text: string): string {
  return text.normalize("NFKC").toLowerCase().normalize("NFD").replace(MARKS, "").replace(INVISIBLE, "");
}

/**
 * The words of one token in one reading. `one` is the letter a 1 stands for (i or l), or null for
 * the reading that cuts at every digit.
 */
function wordsOfToken(token: string, one: "i" | "l" | null): readonly string[] {
  // A token without a letter is a number ("8 besar", "skor 4-5-5", "0812-455"), so its digits never read as letters.
  const asLetters = one !== null && LATIN_LETTER.test(token);
  let read = "";
  for (const character of token) {
    if (character >= "0" && character <= "9") read += asLetters ? (character === "1" ? one : (DIGIT_AS_LETTER[character] ?? " ")) : " ";
    else read += SYMBOL_READING[character] ?? character;
  }
  return read.split(NOT_A_LOWER_LETTER).filter((word) => word !== "" && !LAUGHTER.test(word));
}

/** True when the words, in order, hold a blocked word: one word alone, or a run of one-letter words read together. */
function wordsAreBlocked(words: readonly string[]): boolean {
  if (words.some((word) => containsWord(word) || isWholeWord(word))) return true;
  let run = "";
  for (const word of [...words, ""]) {
    if (word.length === 1) {
      run += word;
      continue;
    }
    if (run.length >= 2 && (containsWord(run) || isWholeWord(run))) return true;
    run = "";
  }
  return false;
}

/**
 * True when a chat line holds a blocked word (the sentence rule at the top of this file). Pass
 * the text that parseChatText returned.
 */
export function hasBlockedWordInText(text: string): boolean {
  const tokens = plainLetters(text)
    .split(WHITE_SPACE)
    .map((token) => token.replace(TRAILING_PUNCTUATION, ""))
    .filter((token) => token !== "");
  return ([null, "i", "l"] as const).some((one) => wordsAreBlocked(tokens.flatMap((token) => wordsOfToken(token, one))));
}

/** The number of words on the list, for the decision log and the report. */
export const BLOCK_LIST_SIZE = new Set([...CONTAINED, ...WHOLE_WORDS]).size;

// Without this, a word added in capitals or with a space would never match.
for (const word of [...CONTAINED, ...WHOLE_WORDS]) {
  if (!LOWER_LETTERS.test(word)) throw new Error(`The block list word "${word}" must be lower-case letters only.`);
}

export type TypedNameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly code: "name_invalid" }
  /** `suggestion` is a game name that none of the taken names equals. */
  | { readonly ok: false; readonly code: "name_blocked"; readonly suggestion: string };

/**
 * The one check of a name a player typed, for a join and for the account's "My tank":
 * the name rule (parsePlayerName) first, then the block list. "Name taken" stays in the
 * arena reducer, because only the arena knows who holds a name.
 */
export function checkTypedName(raw: unknown, takenNames: Iterable<string>): TypedNameCheck {
  const name = parsePlayerName(raw);
  if (name === null) return { ok: false, code: "name_invalid" };
  if (hasBlockedWord(name)) return { ok: false, code: "name_blocked", suggestion: makeGameName(takenNames) };
  return { ok: true, name };
}
