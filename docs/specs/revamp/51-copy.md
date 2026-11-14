# Work package P2: the copy pass, English and Indonesian

Read `00-overview.md` (audience, glossary, UX-copy rules) and `~/.claude/skills/bahasa-indonesia-plain/SKILL.md` in full. Every interface text lives in a `messages.ts` file per feature folder under `apps/web/src/` (`en` is the source, `id` is typed against it). This package makes all of it read well for a 10-year-old and a first-time player, in both languages. The owner is Indonesian and will read every Indonesian sentence.

## You own

Every `apps/web/src/**/messages.ts`, and tests that assert their text. No component code, except where a text change forces a tiny edit (say which).

## Do

1. **Read every message in both languages**, feature by feature, and rewrite what fails these checks:
   - English: plain words, short sentences, the glossary's words only, no jargon, no blame, one idea per sentence, a subtitle is a full sentence, a label is a noun phrase, buttons name their action.
   - Indonesian: its own natural text, not a word-for-word translation. "kamu" throughout. Sentence case. Everyday words. The glossary's words only. Apply the skill's RASA check (rhythm, accuracy, meaning, natural voice) to every sentence, reading it aloud in your head as a child would.
2. **Play styles (`vocabulary/messages.ts`)**: each summary is one sentence of at most 12 words in English, and equally short in Indonesian, that a child understands and that is true of the rules (the long versions were written from the rules, so keep their facts). Names stay friendly and consistent in both languages. Traits stay at most two short phrases.
3. **Sentence parts for rules**: check that composed rule sentences read naturally in Indonesian for these cases, and fix the parts: the "is not true" form, the point-lead conditions, the cut-line conditions, the "fewest neighbours" target, the wall conditions, and the chance sentence. The builder flagged these as stiff: "Kalau tidak benar bahwa …", "keunggulan poin {tank} atasku paling sedikit -3 poin", "keunggulanku dari batas lolos …", "tank yang paling sedikit punya tetangga", "jumlah sisiku yang menempel ke dinding …", "Lakukan ini pada 70% kesempatan."
4. **Consistency across features**: one word per concept in each language (check against the glossary and list any concept that had two words). Known cases: "Keluar" is used for both signing out and leaving an arena; ordinal places such as "ke-1" as a large number; "the line" versus "the cut line".
5. **Tone**: warm and playful where a moment is happy (a win, joining, a hit), calm and kind where it is not (out of the game, an error, a lost connection). No exclamation marks except in a celebration, and never more than one.
6. **Errors and waiting states**: each says what happened and what to do next, without blame.

## Check

`bun test` and `bun run type-check` are clean (tests that assert text are updated with it; the sentence test in `vocabulary/` must still pass for every preset in both languages). No browser run is needed; a full browser test follows you.

## Report

- Per feature: how many messages you changed in each language.
- The glossary conflicts you found and how you settled each.
- A table for the owner: the 15 Indonesian sentences you are least sure of, each with the English, your Indonesian, and one alternative.
- Anything that needs a component change you did not make.
