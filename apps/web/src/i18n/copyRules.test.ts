/// <reference types="bun" />
// The owner's text rules (docs/specs/revamp/00-overview.md, "Rules for every work
// package"; 68-copy-and-kid-test.md, C2), checked on every string of both catalogs.
// Children read this text, so the check fails on:
//   1. staccato: two sentences in a row of 3 words or fewer, also across a title and
//      the body shown under it;
//   2. negation-reveal: "not X, but Y", "no X, just Y", "bukan X, tapi Y", "X, bukan Y",
//      "tanpa X, cukup Y";
//   3. tricolon: three short items joined by commas and "and"/"or"/"dan"/"atau",
//      outside the allow-list of real lists;
//   4. a sentence over 22 words;
//   5. a banned word: jargon the glossary replaces, and the owner's banned words.
// A message function is called with sample values, so its sentences are checked too.

import { describe, expect, test } from "bun:test";
import { CATALOGS } from "./catalog.ts";
import { LANGUAGES, type Language } from "./language.ts";

interface Found {
  readonly path: string;
  readonly text: string;
}

/** One object with every field a message function reads from its parameter object. */
const SAMPLE_OBJECTS = [
  { min: 1, max: 9, actual: 12, cost: 3, budget: 10, part: "rule", waterPerThrow: 3, waterCapacity: 9, waterRefillPerTick: 1, range: 3, fromDistance: 2, perLevel: 6 },
  { min: 1, max: 9, actual: null, cost: 1, budget: 1, part: "mode" },
];

/** Arguments a generic call cannot guess: a list of conditions, or a value one branch tests for. */
const SPECIAL_ARGS: Readonly<Record<string, readonly (readonly unknown[])[]>> = {
  "vocabulary.rule.sentence": [
    [["my water is at least 3"], "all", "shoot"],
    [["my water is at least 3", "the nearest tank is at most 2 squares away"], "all", "shoot"],
    [["my water is at least 3", "the nearest tank is at most 2 squares away"], "any", "shoot"],
  ],
  // The second value is a whole rule sentence.
  "practice.rule": [[2, "When my water is at least 3, shoot."]],
  "vocabulary.rule.moreConditions": [
    [1, "all"],
    [3, "all"],
    [1, "any"],
    [3, "any"],
  ],
};

/** A value a sample call printed because it did not fit the parameter. */
const BROKEN_SAMPLE = /undefined|NaN|\[object|null/;

function sampleCalls(path: string, fn: (...args: unknown[]) => unknown): string[] {
  const special = SPECIAL_ARGS[path];
  const argLists: (readonly unknown[])[] =
    special !== undefined
      ? [...special]
      : [0, 1, 2, 7, -11, "Ana", null, ...SAMPLE_OBJECTS].map((value) => Array.from({ length: Math.max(fn.length, 1) }, () => value));
  const texts = new Set<string>();
  for (const args of argLists) {
    let out: unknown;
    try {
      out = fn(...args);
    } catch {
      continue;
    }
    if (typeof out === "string" && !BROKEN_SAMPLE.test(out)) texts.add(out);
  }
  return [...texts];
}

function collect(value: unknown, path: string, out: Found[], unsampled: string[]): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
  } else if (typeof value === "function") {
    const texts = sampleCalls(path, value as (...args: unknown[]) => unknown);
    if (texts.length === 0) unsampled.push(path);
    for (const text of texts) out.push({ path, text });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}.${index}`, out, unsampled));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) collect(item, path === "" ? key : `${path}.${key}`, out, unsampled);
  }
}

/** Keys whose text shows right above another key's text in the same object, so the two read as one passage. */
const SHOWN_TOGETHER: readonly (readonly [string, string])[] = [
  ["title", "body"],
  ["heading", "intro"],
  ["heading", "body"],
  ["emptyTitle", "emptyBody"],
];

/** A component's name as code spells it ("EmptyState"), a heading in the component gallery. */
const CODE_NAME = /^[A-Z][a-z]+[A-Z]\w*$/;

/** Pairs such as `lobby` and `lobbyBody`, and the fixed pairs above, from one object. */
function pairs(value: unknown, path: string, out: Found[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    const body = record[`${key}Body`];
    if (typeof item === "string" && typeof body === "string" && !CODE_NAME.test(item)) out.push({ path: `${path}.${key}+${key}Body`, text: joinShown(item, body) });
    pairs(item, path === "" ? key : `${path}.${key}`, out);
  }
  for (const [top, below] of SHOWN_TOGETHER) {
    const a = record[top];
    const b = record[below];
    if (typeof a === "string" && typeof b === "string") out.push({ path: `${path}.${top}+${below}`, text: joinShown(a, b) });
  }
}

/** A title without its own end mark still reads as a sentence of its own above the body. */
function joinShown(top: string, below: string): string {
  return /[.!?:]$/.test(top) ? `${top} ${below}` : `${top}. ${below}`;
}

const SENTENCE_BREAK = /(?<=[.!?…])\s+/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const PARAM_MARK = /\{\w+\}/g;

function sentences(text: string): string[] {
  return text
    .replace(PARAM_MARK, "3")
    .split(SENTENCE_BREAK)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter((word) => HAS_LETTER_OR_DIGIT.test(word)).length;
}

function staccato(text: string): string | null {
  const parts = sentences(text);
  for (let i = 1; i < parts.length; i++) {
    const before = parts[i - 1] ?? "";
    const after = parts[i] ?? "";
    if (wordCount(before) <= 3 && wordCount(after) <= 3) return `${before} ${after}`;
  }
  return null;
}

/** "not X, but Y", "not X, it is Y", "no X, just Y", "X, not Y", and a short "Not X." before the reveal. */
const NEGATION_REVEAL: Readonly<Record<Language, readonly RegExp[]>> = {
  en: [/\bnot\b[^.!?]*,\s*(but|just|it is|it's|only)\b/i, /\bno\b[^.!?]*,\s*just\b/i, /,\s*not\s+(a|an|the|just)\b/i, /(^|[.!?]\s+)(not|no)\b(\s+[^\s.!?]+){0,2}[.!?]\s+\S/i],
  id: [/\bbukan\b[^.!?]*,?\s*(tapi|tetapi|melainkan|cukup)\b/i, /,\s*bukan\b/i, /\btanpa\b[^.!?]*,\s*(cukup|hanya|tinggal)\b/i, /(^|[.!?]\s+)(bukan|tanpa)\b(\s+[^\s.!?]+){0,2}[.!?]\s+\S/i],
};

/**
 * Three items of one to three words, joined by commas and "and"/"or". The second item
 * must not start with a joining word, so "…, so check it and try again" is one idea.
 */
const TRICOLON = /(?:^|[\s“"(])[\p{L}\p{N}'’-]+(?: [\p{L}\p{N}'’-]+){0,2}, (?!(?:so|and|or|then|but|because|when|after|jadi|lalu|dan|atau|tapi|karena|kalau|saat|setelah|supaya)\b)[\p{L}\p{N}'’-]+(?: [\p{L}\p{N}'’-]+){0,2},? (?:and|or|dan|atau) [\p{L}\p{N}'’-]+(?: [\p{L}\p{N}'’-]+){0,2}(?=[.,!?”"]|$)/u;

/**
 * Real lists of three things, where each item is needed. Keep this list short: each
 * entry says why the three items are a list the player uses, not a rhythm.
 */
const TRICOLON_ALLOWED: Readonly<Record<string, string>> = {
  // The four parts of a tank's look, each a choice on the My tank page.
  "kit.tanksIntro": "a real list of the parts a player picks",
};

const MAX_WORDS = 22;

/**
 * Jargon the glossary replaces ("tick" is a turn, "cell" a square, "preset" a play style,
 * "fallback" is "If no rule fits", "score" is points), a bot word for a player's own tank,
 * and the owner's banned words.
 */
const BANNED: Readonly<Record<Language, readonly RegExp[]>> = {
  en: [
    /\bstrateg(y|ies)\b/i,
    /\bticks?\b/i,
    /\bcells?\b/i,
    /\bpresets?\b/i,
    /\bfallback\b/i,
    /\bscores?\b/i,
    /\byour bot\b/i,
    /\b(resident|deferred|cascade|posture|calculus|load-bearing|epistemic|non-trivial|parsimony|orchestrate|leverage|holistic)\b/i,
  ],
  id: [/\bstrategi(mu|ku|nya)?\b/i, /\bsel\b/i, /\bpreset\b/i, /\bfallback\b/i, /\bskor(mu|ku|nya)?\b/i, /\bbot (kamu|mu)\b/i, /\bbot(mu|ku)\b/i],
};

/**
 * Objects whose strings the code combines on one screen in more ways than a fixed pair:
 * the arena room's status is a title and a body that room/roomStatus.ts picks per phase,
 * so every title is checked above every body. `bodies` names the keys used as a body.
 */
const COMBINED: readonly { readonly path: string; readonly bodies: readonly string[] }[] = [
  {
    path: "room.status",
    bodies: ["lobbyOwner", "lobbyWait", "startsIn", "startsSoon", "breakOwner", "breakWait", "nextRoundIn", "finishedOwner", "finishedWait", "nextGameIn"],
  },
];

function combined(catalog: unknown, path: string, bodies: readonly string[]): Found[] {
  const node = path.split(".").reduce<unknown>((at, key) => (typeof at === "object" && at !== null ? (at as Record<string, unknown>)[key] : undefined), catalog);
  const texts: Found[] = [];
  collect(node, path, texts, []);
  const isBody = (found: Found) => {
    const key = found.path.slice(path.length + 1);
    return key.endsWith("Body") || bodies.includes(key);
  };
  return texts
    .filter((top) => !isBody(top))
    .flatMap((top) => texts.filter(isBody).map((below) => ({ path: `${top.path}+${below.path}`, text: joinShown(top.text, below.text) })));
}

function catalogTexts(language: Language): { readonly texts: Found[]; readonly shown: Found[]; readonly unsampled: string[] } {
  const texts: Found[] = [];
  const shown: Found[] = [];
  const unsampled: string[] = [];
  collect(CATALOGS[language], "", texts, unsampled);
  pairs(CATALOGS[language], "", shown);
  for (const { path, bodies } of COMBINED) shown.push(...combined(CATALOGS[language], path, bodies));
  return { texts, shown, unsampled };
}

for (const language of LANGUAGES) {
  const { texts, shown, unsampled } = catalogTexts(language);

  describe(`text rules, ${language}`, () => {
    test("every message function gives a sentence for some sample value", () => {
      expect(unsampled).toEqual([]);
    });

    test("no two short fragments in a row, in one string or across a title and its body", () => {
      const found = [...texts, ...shown].flatMap(({ path, text }) => {
        const hit = staccato(text);
        return hit === null ? [] : [`${path}: ${hit}`];
      });
      expect(found).toEqual([]);
    });

    test("no negation-reveal", () => {
      const found = [...texts, ...shown].filter(({ text }) => NEGATION_REVEAL[language].some((pattern) => pattern.test(text))).map(({ path, text }) => `${path}: ${text}`);
      expect(found).toEqual([]);
    });

    test("no three short items for rhythm, outside the allow-list", () => {
      const found = texts.filter(({ path, text }) => !Object.hasOwn(TRICOLON_ALLOWED, path) && TRICOLON.test(text)).map(({ path, text }) => `${path}: ${text}`);
      expect(found).toEqual([]);
    });

    test(`no sentence over ${MAX_WORDS} words`, () => {
      const found = texts.flatMap(({ path, text }) => sentences(text).filter((s) => wordCount(s) > MAX_WORDS).map((s) => `${path} (${wordCount(s)}): ${s}`));
      expect([...new Set(found)]).toEqual([]);
    });

    test("no banned word", () => {
      const found = texts.filter(({ text }) => BANNED[language].some((pattern) => pattern.test(text))).map(({ path, text }) => `${path}: ${text}`);
      expect([...new Set(found)]).toEqual([]);
    });
  });
}

describe("the check itself", () => {
  test("catches each pattern it names", () => {
    expect(staccato("Fast. Simple. Fun.")).not.toBeNull();
    expect(staccato("Kamu sudah masuk. Tank menunggu.")).not.toBeNull();
    expect(staccato("Kamu sudah masuk, dan tank kamu menunggu ronde 1.")).toBeNull();
    expect(NEGATION_REVEAL.en.some((p) => p.test("It is not about speed, it is about plans."))).toBe(true);
    expect(NEGATION_REVEAL.en.some((p) => p.test("Not a race. A puzzle."))).toBe(true);
    expect(NEGATION_REVEAL.id.some((p) => p.test("Bukan soal cepat, tapi soal rencana."))).toBe(true);
    expect(NEGATION_REVEAL.id.some((p) => p.test("Tanpa akun, cukup ketik kode."))).toBe(true);
    expect(TRICOLON.test("Pick, tune and win.")).toBe(true);
    expect(TRICOLON.test("Permainannya cepat, seru, dan mudah.")).toBe(true);
    expect(TRICOLON.test("Check your tank and its name, and then press Join.")).toBe(false);
    expect(wordCount("A hit moves 1 point from the tank that was hit to the shooter.")).toBe(14);
  });
});
