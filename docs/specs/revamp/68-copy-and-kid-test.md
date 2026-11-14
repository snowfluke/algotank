# Work packages C2 and Q2: text rework for children, and a first-timer test

Read `00-overview.md` (purpose, the text rules, the glossary) and `~/.claude/skills/bahasa-indonesia-plain/SKILL.md`. Owner's words: "Avoid staccato fragments, negation-reveal, and tricolon in in-game text. Remember, kids also play it, the UX is absolutely need to be good, description and things might need rework."

These two packages run last, after every feature is in, because every feature adds text.

## C2: every sentence, both languages

You own every `apps/web/src/**/messages.ts`, the tests that assert text, a new check (below), and the code that picks which sentence a status shows (for example `src/room/roomStatus.ts`) where a wrong sentence is chosen.

1. **Read every message in both languages against the overview's text rules** and rewrite what fails. The three named patterns are the owner's explicit ban:
   - staccato fragments (a run of short fragments, also split across a title and its subtitle);
   - negation-reveal ("not X, but Y", "no X, just Y", "bukan X, tapi Y", "tanpa X, cukup Y");
   - tricolon (three adjectives, nouns or short clauses for rhythm).
2. **Descriptions rework.** Every description of a thing a child must understand (the five home entries, the three public arenas, each play style, each upgrade, each round rule, each rule condition, action and target in its sentence form, the tour steps, the result sentences, the errors) is rewritten from the child's side: what happens, and what it means for my tank. One idea per sentence, about 15 words at most, everyday words, concrete over abstract ("your tank drives one square" over "movement is grid-based"). Numbers appear only where a player needs them.
3. **A check that keeps it that way** (`apps/web/src/i18n/copyRules.test.ts`): it walks every string of every catalog in both languages (calling message functions with sample values) and fails on: two sentences in a row of 3 words or fewer; the negation-reveal patterns in both languages; three items joined by commas and "and"/"dan" or "or"/"atau" in a string that a small allow-list does not name (real lists of choices); a sentence over 22 words; a word from a banned list (jargon such as "strategy document", "tick", "cell", "bot" for a player's tank, "preset", "fallback", and the owner's banned words). Keep the allow-list short and justified by a comment per entry.
4. **Consistency**: one word per concept in each language against the glossary; list every concept that had two.

Report: per feature how many messages changed in each language; the check's rules and its allow-list with reasons; a table of the 20 Indonesian sentences you are least sure of (English, your Indonesian, one alternative); anything that needs a component change.

## Q2: the first-timer test

A find-and-fix pass by a fresh engineer who has not seen the game, with Playwright, on a production build made into your own folder (`bunx vite build --outDir <your folder>`; never `bun run build`, which rewrites a folder another server may serve) and served by the Bun server with `STATIC_DIR` on your own port (never 8787). Run the public arenas at their real timings: leave `PUBLIC_TIME_DIVISOR` unset, because every earlier browser run shortened them and nobody has yet judged the real pace.

Play as a 10-year-old who reads Indonesian, on a 390 x 844 phone, and again as an adult who reads English on a 1000 x 600 laptop window, each from a clean browser:

1. Home: say in one sentence what the game is and what you would tap, from the screen alone.
2. Play now: get into a game, watch it, read the result. Note every moment you did not know what was happening or what to do.
3. The workshop tour from start to end by doing every step, then use the saved play style in a game.
4. Make your tank your own ("My tank"), join a friend's private arena by code from a second browser, and play.
5. The tournament arena and the monthly arena once each, and the hall of fame.

For each step record: what you understood, where you hesitated, any sentence you had to read twice (quote it), any control you could not find within two taps, anything that scrolled, anything cut off, anything slow. Then fix what is small and local (a sentence, a missing cue, an order of elements, a size) and re-run that step; report the rest with a screenshot, the steps and the file you believe is responsible.

Also run the whole no-scroll audit, `bun test` and `bun run type-check`, and report their results. For each timed phase (public lobby, round, result) state whether a 10-year-old had enough time to read what the screen asked them to read.

Known items from earlier packages; judge each as the child you play, fix it when the fix is small, and report it otherwise:

- A rule with two or three conditions reads as one sentence of more than 22 words (the Evader play style's rule 2 has 26). Decide from the screen whether a child can follow it. If not, show the conditions of such a rule as separate lines under "When" in the rule card, keeping the no-scroll layout.
- `practice.runFailed` and `common.connection.unreadable` append the server's or the engine's own English sentence. A player sees only the catalog's sentence; the raw text goes to the browser console.
- The tour callouts may cover other controls for one step. Note every step where the cover made you hesitate.
- The Indonesian tab "Bulan lalu" on the champions page stands for all past months. Check that the heading under it makes that clear.
- The whole no-scroll audit has not run since the last five string changes; your run is the final one. It must pass with the overlap rule enforced for every state.

Report: the two walkthroughs as tables (step, understood, hesitated at, fixed or open), the open problems most severe first, and 15 screenshots that best show the game as a first-timer meets it.
