# Work package R1: remove the developer mode

Read `00-overview.md` first. Owner's decision, verbatim: "i think i want to ditch the JSON/microservice stuff and focus for non-tech people play/kids targeting them so they learn algorithm."

The game has one way to prepare a tank: the rule editor in the page. Everything that exists only so a programmer can send a strategy document from their own code goes away.

## Remove

| Where | What |
|-------|------|
| Arena contract (`packages/arena`) | `InputMode`, `INPUT_MODES`, `isInputMode`, `ArenaSettings.inputMode`, `VocabularyResponse`, and their mentions in comments and the route list |
| Server (`apps/server`) | `GET /api/vocabulary`, `POST /api/strategies/validate`, `vocabulary.ts`, their tests, and the README rows |
| Web (`apps/web`) | The folder `src/developer/`, the `developer` message slot, the "who plays" choice on the create page, the developer branch of the room page, `src/rules/` files that only the developer reference used, the stored document draft (`session/storage.ts`), the developer states of the no-scroll audit and its "named exception" for a scrolling reference (after this package no part of the interface may scroll inside itself; update `60-no-scroll.md`'s exception sentence and the audit rule) |
| Texts | Every sentence, in both languages, that mentions developers, JSON, a document, a token to copy, or code |
| Docs | README (routes, feature folders, known limits). In `docs/decisions/2026-11-11-water-fight-game.md`, add one dated line to each older entry about the technical arena (Q5, the Q9 default, "Build order", the open point "Per-tick code for developers", the revamp table's rows about the developer arena) that says the owner removed the developer mode on 2026-11-12 and why, in his words. Do not delete the old entries. |

## Keep

- `GET` and `PUT /api/arenas/:id/players/me/strategy`: the page itself uses them.
- The play style routes of the workshop.
- The engine's validator, and the English labels in the engine tables (they serve error messages, tests and the simulation scripts). Name the labels as debt in the engine's vocabulary file: the interface no longer reads them.

## Stored arenas

Arena files written before this change hold `inputMode`. The stored form becomes version 3 without it. The loader reads a version 2 file by dropping that one field (one explicit migration function with a test) and writes version 3 from then on. A version 1 file still stops the start as today.

## Check

`bun test`, `bun run type-check`, `bun run build` clean. `grep -ri "inputMode\|developer\|vocabulary\b" apps packages --include=*.ts --include=*.tsx` shows only what "Keep" names (say what is left and why). Serve the build and run the no-scroll audit for `create-presenter`, `room` and `presenter`; create a presenter arena in a browser and play one round to see that nothing refers to the removed mode.

## Report

The common report, plus: what you removed (files and exports), what you kept and why, and the migration test.
