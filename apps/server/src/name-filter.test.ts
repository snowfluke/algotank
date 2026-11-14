// The block list for players' names (name-filter.ts) and the names the game makes
// (game-names.ts), which must always pass it.

import { describe, expect, test } from "bun:test";
import { parsePlayerName } from "@game/arena";
import { GAME_NAMES, makeGameName } from "./game-names.ts";
import { BLOCK_LIST_SIZE, checkTypedName, hasBlockedWord, hasBlockedWordInText } from "./name-filter.ts";

describe("hasBlockedWord", () => {
  test.each([
    ["a whole word", "Fuck"],
    ["a word in any case inside a longer word", "SuperFUCKer"],
    ["a word spread over words", "F U C K"],
    ["a word split once", "fu ck"],
    ["a short word spelt out", "a s s"],
    ["a word with a repeated letter", "fuuuck"],
    ["a word with 1 for i", "Big Sh1t"],
    ["a word with 1 for l", "s1ut"],
    ["a word with 4 for a and 5 for s", "B4ng5at"],
    ["a word with 0 for o", "G0bl0k"],
    ["a word broken by a digit", "ass2"],
    ["a plural", "Boobs"],
    ["an Indonesian word", "Anjing"],
    ["an Indonesian word inside a name", "Raja Kontol 99"],
  ])("blocks %s (%p)", (_label, name) => {
    expect(hasBlockedWord(name)).toBe(true);
  });

  // Each holds a blocked word as a run of letters: ass, rape, cock, cunt, shit, tai, dick, nazi, fuk, peju.
  test.each(["Classic Bass", "Grape Juice", "Peacock Pilot", "Scunthorpe", "Matsushita", "Pantai Indah", "Dickens Fan", "Nazira", "Fukuoka", "Pejuang 45"])(
    "allows the innocent name %p that holds a blocked run",
    (name) => {
      expect(hasBlockedWord(name)).toBe(false);
    },
  );

  // Two ordinary words joined hold a blocked run across the gap; a plural rule would turn "Asus" into a word.
  test.each(["Meme King", "Bang Satria", "Rabbit Champ", "Prince Star", "Mother Fox", "Melon Tea", "Ana L", "Anna L", "Asus", "Bang Satria 1"])(
    "allows the innocent name %p whose joined words hold a blocked run",
    (name) => {
      expect(hasBlockedWord(name)).toBe(false);
    },
  );

  test("allows the short word that a doubled-letter word would collapse to", () => {
    expect(hasBlockedWord("As Fast As Me")).toBe(false);
  });

  test("the list holds a few hundred words at most", () => {
    expect(BLOCK_LIST_SIZE).toBeGreaterThan(100);
    expect(BLOCK_LIST_SIZE).toBeLessThanOrEqual(300);
  });
});

describe("game names", () => {
  test("there are more than a full presenter arena needs, and each passes the name rule and the block list", () => {
    expect(GAME_NAMES.length).toBeGreaterThan(512);
    expect(new Set(GAME_NAMES.map((n) => n.toLowerCase())).size).toBe(GAME_NAMES.length);
    for (const name of GAME_NAMES) {
      expect(parsePlayerName(name)).toBe(name);
      expect(hasBlockedWord(name)).toBe(false);
    }
  });

  test("makeGameName never gives a taken name, ignoring case, and still finds one with 512 taken", () => {
    const taken = GAME_NAMES.slice(0, 512).map((n) => n.toUpperCase());
    for (let i = 0; i < 50; i++) expect(GAME_NAMES.slice(512)).toContain(makeGameName(taken));
    expect(() => makeGameName(GAME_NAMES)).toThrow(/taken/);
  });
});

describe("checkTypedName", () => {
  test("gives the parsed name, name_invalid, or name_blocked with a free suggestion", () => {
    expect(checkTypedName("  Ayu  Putri ", [])).toEqual({ ok: true, name: "Ayu Putri" });
    expect(checkTypedName("Bo", [])).toEqual({ ok: false, code: "name_invalid" });
    const blocked = checkTypedName("Bangsat", ["Brave Otter"]);
    if (blocked.ok || blocked.code !== "name_blocked") throw new Error("expected name_blocked");
    expect(blocked.suggestion).not.toBe("Brave Otter");
    expect(GAME_NAMES).toContain(blocked.suggestion);
  });
});

// Chat lines (arena chat). Each list must stay green together: a change that blocks more must not
// refuse an ordinary line, and one that blocks less must not let these words through.
describe("hasBlockedWordInText", () => {
  // Many hold a blocked run inside a word (tai, asu, ass, peju) or, joined, across words.
  const ORDINARY_INDONESIAN = [
    "santai dulu", "pasukan siap", "ayo mulai", "bang satu aja ya", "skor 455", "wkwkwk", "wkkkk",
    "ke kantor dulu", "pantai indah banget", "titik kumpul di depan", "asumsi aku benar", "kita main lagi yuk",
    "siapa yang menang tadi", "aku pakai gaya pemburu", "tankku warnanya biru", "jam 5 sore ya", "8 besar nih",
    "1 lawan 1 dong", "semangat semuanya!", "kontrol tanknya susah", "makan siang dulu", "cukup sekian",
    "pejuang air siap", "masih nunggu tuan rumah", "di sini aja", "kamu di mana?", "mantap jiwa",
    "seru banget tadi", "aku kalah lagi hehe", "tunggu sebentar ya", "nanti kita tanding lagi", "air tankku habis",
    "tembakanku meleset", "ronde berikutnya kapan?", "halo semua", "selamat pagi", "terima kasih banyak",
    "boleh ganti warna?", "aku suka bintang", "petak hijau itu apa?", "ayo cepat mulai dong kak", "bisa jadi bisa jadi",
    "kamu pasti bisa", "skor 4-5-5", "nomorku 0812-455-1234",
  ];
  const ORDINARY_ENGLISH = [
    "class starts at eight", "pass the ball", "analysis", "good game everyone", "ready when you are",
    "let's go team blue", "assassin tank incoming", "who wants a rematch", "my tank is orange", "nice shot!",
    "I am so ready", "wait for the host", "classic move", "bass drop", "grape juice break", "Scunthorpe united",
    "peacock colours", "that was close", "can we play again?", "my water ran out", "glass of water",
    "I passed the test", "the cocktail party", "Dickens wrote books", "therapist appointment", "spicy noodles",
    "documents ready", "Sussex is far", "pakistan vs india", "raccoon tank", "shiitake mushrooms", "titmouse bird",
    "skills to pay the bills", "a b c d e", "I a m here", "GG WP", "lol that was fun", "hahaha", "5 4 3 2 1 go",
    "round 2 starts soon", "u r good", "brb 2 min", "who is it", "assume nothing", "basement party", "score 455-300",
  ];
  const REFUSED = [
    "fuck you", "what the fuuuuck", "FUCK", "fück off", "f u c k", "f*ck", "a.s.s", "a s s h o l e", "4ss", "@ss",
    "sh!t happens", "$hit", "b!tch", "dick", "go to hell asshole", "you are stupid", "k0nt0l", "B4ngsat",
    "bangsat!!!", "anjiiiing", "dasar goblok", "kamu tolol ya", "ngentot", "babi lu", "kampret", "tai lu", "titit",
    "fu\u200Bck", "w a n k",
  ];

  test("the lists are as long as the spec asks", () => {
    expect(ORDINARY_INDONESIAN.length).toBeGreaterThanOrEqual(40);
    expect(ORDINARY_ENGLISH.length).toBeGreaterThanOrEqual(40);
  });

  test.each([...ORDINARY_INDONESIAN, ...ORDINARY_ENGLISH])("allows the ordinary line %p", (line) => {
    expect(hasBlockedWordInText(line)).toBe(false);
  });

  // Digits for letters (k0nt0l, B4ngsat, 4ss), repeated letters (fuuuuck, anjiiiing), spaced and dotted letters, symbols.
  test.each(REFUSED)("refuses %p", (line) => {
    expect(hasBlockedWordInText(line)).toBe(true);
  });

  test("a line the name rule refuses passes when it is a sentence", () => {
    // The name rule joins every word once one is short; "bangsatuaja" holds "bangsat".
    expect(hasBlockedWord("bang satu aja ya")).toBe(true);
    expect(hasBlockedWordInText("bang satu aja ya")).toBe(false);
  });
});
