# Work package G1: guidance for first-timers, with the workshop at the centre

Read `00-overview.md`, `11-foundation-guide.md` (section 11) and `60-no-scroll.md`. Owner's words: the game should "focus for non-tech people play/kids targeting them so they learn algorithm", and "It's nice if the first timer have highlight steps in the UIs, especially in workshop, i think need to put accent on it as well as visual cue."

## What changes in the product

The purpose of the game is now stated: a child or beginner learns what an algorithm is by building one for a tank. A play style is an algorithm: a list of rules the tank checks from top to bottom each turn, doing the first one that fits. The workshop is where that learning happens, so it becomes the second main entry of the home page, and first-timers are led through it step by step.

## 1. A guide colour (accent)

One new colour family, used only for guidance: `--color-guide` (a warm sunny yellow that differs clearly from the orange of "you"; with 12 hull colours it cannot differ from every tank, so guidance is also told by its form: the thick pulsing ring, the callout and the step counter appear nowhere else), `--color-guide-ink` (text on it, 4.5:1 or better) and `--color-guide-soft` (a tint). It marks: the highlight ring of the current step, the step counter, the callout, the "first play style" checklist, and the workshop tile on the home page. Nothing else uses it, so a player learns that yellow means "look here next".

## 2. The coach marks (`src/ui/Coach*.tsx`, `src/guide/`)

- `CoachMark`: points at one element on the screen (found by a `data-coach="<id>"` attribute). It draws a thick guide-coloured ring around the element that pulses slowly, dims the rest of the screen lightly, and shows a small callout next to the element with: a step counter ("2 of 5") in the guide colour, one sentence of at most 15 words, and the controls. The callout places itself where there is room (above, below or beside), never off the screen, never over the element, and it fits every supported size without a scroll. Under `prefers-reduced-motion` the ring does not pulse.
- Two kinds of step: a "look" step has a Next button; a "do" step has no Next and moves on when the player does the thing (taps the highlighted control, changes a value, finishes a test match). In a "do" step the highlighted element stays fully usable and everything else stays usable too: the guide never traps the player.
- "Skip the tour" is always there. Escape skips. A tour that was finished or skipped does not come back by itself; the help button of each screen offers "Show me around" to replay it.
- A tour waits when its target is not on the screen (another tab, a dialog open) and shows a small guide-coloured pill that says where to go ("Open the Rules tab"), instead of pointing at nothing.
- State machine of one tour, shown as a table in the code's header and tested: not started, running (step n), waiting (target absent), paused (the game left the phase the tour belongs to; the tour resumes at the same step the next time that phase comes), finished, skipped. Stored through `app/preferences.ts` per tour id.
- Accessibility: the callout is a non-modal region with `aria-live="polite"`, reachable by keyboard right after the highlighted element; the ring is decoration (`aria-hidden`); every step's sentence is real text.
- The no-scroll audit starts every state with all tours marked finished, and has extra states that show each tour's steps at 360 x 640 and 1000 x 600 in both languages. A callout that is cut off or covers its target fails.

## 2b. A tour never fights the clock

Public arenas run on a server clock: the practice lobby lasts 30 s (3 s after "I'm ready"), a practice round 54 s, its result 12 s. The owner's complaint is "the pace is too fast", so a tour must fit the time a phase really has.

- A tour never delays, pauses or blocks the game, and the game never waits for a tour.
- Reading time of one step is 4 s plus 0.5 s per word. In a timed phase, the steps a tour shows must add up to at most the phase's real length minus 5 s. Write this sum as a table in the tours' data file and test it against the real numbers (import nothing from the server; state the numbers with their source, `apps/server/src/public-kinds.ts`).
- In a timed phase a "look" step also moves on by itself when its reading time is over, so a child who only watches still sees every step.
- When the phase changes under a running tour, the tour goes to "paused" and continues at the same step the next time that phase comes. In the practice arena the next lobby comes about 70 s later.
- A first-timer is the device for which `hasFinishedGame()` in `src/publicplay/firstGame.ts` is false. Use that one flag; do not add a second definition.
- In an untimed place (the workshop, a private lobby where the host starts) the steps wait for the player.

## 3. The tours

Write each step as one short sentence a 10-year-old understands, in both languages (read `~/.claude/skills/bahasa-indonesia-plain/SKILL.md`; "kamu"). Teach the idea, not the control: say what the thing means for the tank.

| Tour | Starts | Steps (kind) |
|------|--------|--------------|
| Workshop: your first play style | First visit to the workshop | 1 do: "New play style". 2 do: pick a style to start from. 3 look: "This is your algorithm: the tank reads the rules from the top and does the first one that fits." (the rules list). 4 do: open a rule. 5 look: "When" is the test, "Do" is what the tank does if the test is true. 6 do: change one thing in the rule. 7 do: go to "Try it" and run a test match. 8 look: what your tank did most, and that changing a rule changes this. 9 do: give it a name. 10 look: it is saved; "Mine" in any arena loads it. |
| Arena lobby | First time in a lobby | 1 look: your tank, and "Change my tank" makes it yours. 2 look: the tank plays by itself by its play style. 3 do or look: the play style choice. 4 look: when the game starts (countdown and "I'm ready", or the host). In a 30 s public lobby steps 1 and 2 fit (about 20 s); steps 3 and 4 come in the next lobby. |
| First round | First running round as a player | 1 look: a hit gives you 1 point and takes 1 from the other tank. 2 look: a shot uses water, and water refills. 3 look: the Ranking tab shows who leads. (The status line already says to find the tank with the orange ring, so the tour does not repeat it.) Three steps of about 10 s fit a 54 s round. Steps must not cover the board for more than a moment: keep the callouts small and at the edge. |
| After the first game | First result in an arena without a result clock (private, presenter). A practice result lasts 12 s, which holds no step (12 s minus 5 s leaves room for 6 words), and the result screen already states the place and the reason. In a public arena the "do better" sentence becomes the wording of lobby step 3 in the next lobby. | 1 look: your place and why. 2 do or look: "Want to do better? Change your play style in the Tank tab, or build your own in the workshop." The public arenas package (`67-public-arenas.md`) shows a first-timer the other two arenas after the first result; keep the first result to one next step at a time, so show that offer after this tour ends, or move it to the chooser when the result gets crowded. |

"How the game works" stays behind the help button and no longer opens by itself in the lobby: the lobby tour replaces it.

## 4. The workshop's checklist

While the first play style is not finished, the workshop shows a small "Your first play style" checklist in the guide colour with five lines that tick off as the player goes: pick a start, read a rule, change a rule, run a test match, name it. It is the tour's progress made visible, it survives leaving and coming back, and finishing it shows a short happy moment (the `win` sound is too much; use the round-start sound) and two next steps: "Play now with it" and "Build another". It must fit the no-scroll layout: on a phone it is one collapsed line with the count ("2 of 5") that opens as a sheet.

## 5. The home page

- Two main tiles: "Play now" (blue, as now) and "Tank workshop" (guide colour), then "Join with a code", "Create a private arena" and "Create a presenter arena" as the smaller rows. Still no scroll at every supported size.
- The sentence under the name says what a player gets out of it, the owner's wording of 2026-11-12: "Build the best algorithm to drive your tank and win the battle!" / "Buat algoritma terbaik untuk menggerakkan tankmu dan menangkan pertempuran!"
- A first-time visitor sees one gentle cue on the home page (a ring on the workshop tile with "New here? Start in the workshop, or jump into a game with Play now."), not a multi-step tour.

## 5b. An overlap rule for the audit

The no-scroll audit passes a screen on which one control covers another (found in the tank identity package by eye). Add a rule to `apps/web/scripts/no-scroll-audit.mjs`: for every visible, enabled button, link and input inside the viewport, the element at its centre point (`document.elementFromPoint`) is the control itself, one of its descendants, or its label. A coach mark's dim layer and ring must let the highlighted control pass this rule, and a control under an open sheet or dialog is exempt because the sheet is modal. Run the rule in report-only mode first and read the count. Fix at most the 15 failures that are smallest and most local, list the rest with the state name and the size, and then make the rule fail the audit for the states that pass. The tours are the main work of this package; the rule must not use up their time. A toast must sit above the bottom bar and the tabs (today it covers them in a public lobby).

## 6. Words that teach

In the workshop and the rule editor, use the word "algorithm" ("algoritma") once where the rules list is introduced, with its plain meaning in the same sentence. Do not use it elsewhere. Keep "rule", "when" and "do" as the working words.

## You own

`apps/web/src/ui/Coach*.tsx`, a new `apps/web/src/guide/` (tours as data, the tour state machine, messages), the guide colour in `index.css`, `src/home/`, `src/workshop/`, `src/room/HowItWorks.tsx` and the places in `src/room/`, `src/prep/`, `src/live/`, `src/practice/` and `src/results/` where a `data-coach` attribute or a tour start is needed (attributes and starts only; no redesign of those screens), `app/preferences.ts`, the audit script (tour states and the overlap rule), and `11-foundation-guide.md` (a section for the coach marks and the guide colour).

## Check

`bun test` and `bun run type-check` clean. Build to your own folder (never `bun run build`), serve it on your own port and run the no-scroll audit: every existing state still passes, and the tour states pass. Then one browser run as a first-time visitor on a phone (390 x 844) and on a 1000 x 600 laptop window, in Indonesian and in English: the home cue, the whole workshop tour by doing each step, then Play now (a first-timer lands in the practice arena) with the saved play style through the lobby tour, the first round tour and the result. Read the screenshots of every step: is the ring unmistakable, is the callout readable and out of the way, and would a 10-year-old know what to do next?

## Report

The common report, plus: each tour's steps as written in both languages, the guide colour values with their contrast, the audit result, and the screenshots of each step you read with what they showed.

## Amended 2026-11-13 (W2, P4a, P4b)

- The practice result is 20 s, not 12 s (`guide/tours.ts`, `PUBLIC_PHASE_SECONDS`).
- The workshop tour starts on Rules, has an upgrades step that points at the token tray, and its callout shows no step counter (the checklist line carries the progress).
- The round tour keeps the player's own tank and its "You" label clear (`KEEP_CLEAR` in `ui/CoachMark.tsx` and rule (e) of the audit).
- The first-result offer of the other two arenas is gone; the chooser on `/play` shows them after the first finished game.
