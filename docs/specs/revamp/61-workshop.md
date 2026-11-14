# Work package S1b: the tank workshop (build a play style ahead of time, save it, load it in any arena)

Read `00-overview.md`, `11-foundation-guide.md` and `60-no-scroll.md` (the layout system and the no-scroll rule apply here in full). Owner's request, verbatim: "There should be menu on the homepage to create a strategy, save it as preset, then user can just load it. To be honest creating a strategy takes time, impossible on less than a minute".

## Decisions (lead)

- A fifth entry on the home page, "Tank workshop" (Indonesian: "Bengkel tank"), opens `/workshop`. It needs no account and no arena, so a player can take as long as they want. (S0 adds the entry, the route and a placeholder page; this package fills the page.)
- What a player saves is called "my play style" ("gaya main buatanku"). It has a name (1 to 24 characters) and holds a full strategy (upgrades and rules), exactly what the arena accepts today.
- Where it is kept: in the browser for everyone; and in the account when the player is signed in, so it follows them to another device. One sentence in the workshop tells a signed-out player that their play styles stay on this device and that signing in keeps them everywhere.
- At most 20 play styles per player.
- In an arena, the Play style pane shows "Mine" next to the built-in styles. Choosing one of mine applies and saves it to the arena like a built-in style (with the same Undo). The Fine-tune pane gets "Save as my play style" (asks for a name), so a player who built something inside an arena can keep it.

## State of one saved play style

| From | To | Actor | Guard |
|------|----|-------|-------|
| none | saved | player | "New play style" from a built-in style or a copy of one of mine; the name is valid and unique among mine; fewer than 20 exist |
| saved | saved | player | edit (auto-saved; an invalid draft is kept on the device and marked "has a problem", and it cannot be loaded in an arena until it is valid), rename |
| saved | removed | player | delete, with Undo for a few seconds |

Terminal state: removed (after the Undo time).

## The workshop page (`/workshop`, `src/workshop/`)

No scroll, phone first (see `60-no-scroll.md`).

- **List:** my play styles as a paged list or grid of cards: the name, a small tank drawing, two traits read from its rules (the function that reads traits for built-in styles already exists in `src/prep/`), and "last changed". Actions per card: open, copy, rename, delete. One primary action: "New play style", which first asks what to start from (a `Carousel` or grid of the 8 built-in styles, each a valid starting point; there is no blank start, because an empty rule list is not a good first experience).
- **Editor:** the same panes the arena uses, reused, not copied: Upgrades, Rules (with the rule step sheet) and Try it (the test match runs the draft). A name field. The save line shows saving, saved, or the reason it is not saved. The round rules used for numbers and for the test match default to Standard, with a control to pick another.
- **Empty state:** one sentence that says what the workshop is for, and the primary action.

## Storage and sync

- `src/workshop/library.ts`: the one place that knows where play styles live. Typed interface: list, get, save, rename, remove, and a subscription for changes. Two backings behind it: the browser (local storage, try/catch, works without storage for the visit) and the account.
- Server (this package owns these new files): `apps/server/src/account-strategies.ts` and its routes, protocol types in a new `packages/arena/src/strategies-protocol.ts` exported from the arena package's index.

| Route | Who | Does |
|-------|-----|------|
| `GET /api/account/strategies` | account | Returns the account's play styles (id, name, strategy, updatedAt) |
| `PUT /api/account/strategies/:id` | account | Creates or replaces one. The strategy is checked with `parseStrategy`, the name with the name rule; at most 20 per account; body at most 64 KB. |
| `DELETE /api/account/strategies/:id` | account | Removes one |

  Stored per account in `DATA_DIR/strategies/<accountId>.json`, atomic write, mode 0600, the same patterns as the arena files. A file that cannot be read stops the start with a message that names it. The id is made by the client (a random id) so the same play style keeps its id on both sides.
- Merge when a player signs in (or opens the app signed in): play styles that exist only on the device are uploaded; ones that exist only in the account are downloaded; for the same id, the newer `updatedAt` wins. A style deleted on one side while changed on the other is kept (never lose work). Over the limit of 20 after a merge: keep all on the device, upload the newest 20, and tell the player in one sentence. Tests cover each case with an injected clock.
- A failed sync never blocks the workshop: the device copy is the working copy, and the save line says that the account copy is behind and retries.

## In the arena (`src/prep/`)

- Play style pane: a switch "Built-in" and "Mine" (hidden when the player has none, replaced by one line that points to the workshop). Mine with a problem are shown as not loadable, with the reason.
- Fine-tune pane: "Save as my play style".
- Loading one of mine copies it into the arena. Later edits in the arena do not change the saved one, and the pane says which saved style the tank started from until the player edits it.

## You own

`apps/web/src/workshop/**`, `apps/web/src/prep/**`, `src/editor/**`, `src/vocabulary/**`, the server and protocol files named above with their tests, one registration line in `apps/server/src/routes.ts` and `server.ts`, and the client functions for the three routes in `src/api/client.ts` (add only). The preparation pane's no-scroll layout from `60-no-scroll.md` (play style carousel or grid, the Upgrades and Rules switch, the rule step sheet, Try it as a pane) is part of this package, because the workshop and the arena share those panes. Another engineer (S1a) builds the room frame around the preparation pane and places it; keep `StrategyPanel`/`PrepPanel` importable with its current props and make it fill the box it is given. A third engineer (S2) owns the test match pane (`src/practice/`); you place it.

## Check

`bun test`, `bun run type-check`, `bun run build` clean. Serve the build and run the audit script (`apps/web/scripts/no-scroll-audit.mjs`) for the workshop states (empty, list with 1 and with 20, start-from picker, editor on each pane, an open rule, signed in and signed out) and the arena's preparation states, at every supported size in both languages. One browser flow by hand script: build a play style signed out, sign in, see it in the account from a second browser context, join an arena there and load it.
