# Work package P1: polish after the first full build

Read `00-overview.md` and `11-foundation-guide.md`. Every screen is built and the flows work. This package fixes the weak points the builders and the lead found. You own the whole web client and may touch the server and the engine only for the items that name them. Do not reword existing interface text, except where an item says so: a copy pass follows you. You may add new message keys in both languages.

## Items

1. **Header on a phone.** At 390 px the header wraps to two rows. Make it one row: below 480 px the language switch shows "EN" and "ID" (full names stay as accessible names), and the wordmark may shrink to the tank glyph. Check every page.
2. **Legend.** "What the board shows" is closed by default on a phone and open on wider screens, until the viewer changes it. Store the choice through `app/preferences.ts`.
3. **Play style cards.** Eight cards with long text make a page about 2,900 px tall on a phone. Use two columns from 640 px. Give `ChoiceCard` a slot for extra content and remove the copy of its look in `prep/`. Leave the summaries' wording to the copy pass.
4. **Rule card toolbar.** Move up, move down, copy and delete show a text label next to the icon from 480 px, and stay icon buttons with accessible names below that.
5. **Board at small sizes.** When a square is too small for a readable gauge (under about 14 CSS px), draw no gauge on other tanks and keep one on the viewer's tank. The countdown panel never covers the viewer's tank and scales down on a small board.
6. **`board/Scoreboard.tsx`.** Its own-row mark is a thick coloured stripe on one side, which this design bans. Mark the row as `standings/StandingsTable.tsx` does (the "you" ring, a tinted row, the word "You"), and give the cut line visible words. If `Scoreboard` and `LiveRanking` now do the same job, keep one.
7. **One vocabulary.** Play-style names, round-rule names and action phrases are copied in `practice/messages.ts`; "Rule details" in the test match builds English sentences from `editor/text.ts`. Use `m.vocabulary` and `vocabulary/sentence.ts` everywhere and delete the copies and `editor/text.ts`. Export literal id unions for conditions, actions, target choices, presets and rule sets from the engine (types only, no behaviour change), and type the vocabulary catalog with them, so a new engine id without text fails the type check.
8. **"What your tank did".** Lines are in the past tense and read as what happened, for example "Turn 3: moved away from the nearest tank, because no rule fit." When a move turned into a shot (a blocked step), say that in plain words. Wording of the fixed parts goes into the catalog in both languages.
9. **Shared `Switch`.** Move `room/BotsSwitch.tsx`'s switch into `ui/Switch.tsx` and use it there.
10. **Presenter page at the end.** One primary action ("Play again"); "Close arena" moves into More options.
11. **Save failure sentence** follows a language switch (store the reason, not the sentence).
12. **Server layering.** `store.ts` throws `HttpError(404)` for a removed record. Throw a typed `ArenaGoneError` there and translate it to 404 in `server.ts`.
13. **Recap after a reload.** A page opened during a break has no round data, so the hits recap is missing. `RoundSummary.standings` carries `hitsLanded` and `hitsTaken` if the engine's `Standing` has them; use that. If it does not, add them to `Standing` in the engine's result (no behaviour change) and to the stored form's check.
14. **Test match result place.** The sentence uses the engine's standing (which breaks ties), not the shared scoreboard place.
15. **Leftovers.** Remove code nothing uses (for example `step` in `practice/replay.ts`, `tankText` in `water/water.ts`, `editor/Problems.tsx` and `editor/ui.ts` if unused, old types such as the web's own `ArenaKind` in `app/route.ts` if `@game/arena` has it). Grep for `ponytail:` and clear the ones that this list makes obsolete. The preview pages `/kit?show=prep` and `/kit?show=board` stay.
16. **Developer arena.** Look at it once in a browser (a presenter arena with "developers") and fix what is broken.

## Check

`bun test`, `bun run type-check` and `bun run build` are clean. Look at each changed screen once at 390x844 and 1280x800 (API server on port 8946 with a temporary `DATA_DIR`, client with `API_PORT=8946 bunx vite --port 5946 --strictPort`; scripts in `<scratchpad>/revamp/w2/` show how to drive the flows). Scripts and screenshots go to `<scratchpad>/revamp/p1/`.

## Report

The common report, with one line per item: done, or what remains and why.
