# Contributing to AlgoTank

AlgoTank is for people who do not program, children of about 10 included. Judge every screen and every sentence by one question: does a 10-year-old know what this means and what to do next?

## Set up

You need Bun 1.4 or later. The no-scroll audit also needs Node 23.6 or later.

1. Get the code and go into its folder.
2. Install the dependencies:

   ```sh
   bun install
   ```

3. Start the API in one terminal:

   ```sh
   bun run dev:server   # port 8787, database in apps/server/data/algotank.sqlite
   ```

4. Start the client in a second terminal:

   ```sh
   bun run dev:web      # port 5183, sends /api to 8787
   ```

5. Open `http://localhost:5183/`.

## The checks a change must pass

| Check | Command | When |
|-------|---------|------|
| Type check | `bun run type-check` | Every change. It also checks that the Indonesian catalog has every English message. |
| Tests | `bun test` | Every change. A changed behaviour keeps or gains a test through the public interface. |
| Text rules | `bun test apps/web/src/i18n/copyRules.test.ts` | Every change of interface text. `bun test` runs it too. |
| Both languages | (part of the type check) | Every interface string exists in English and in Indonesian. |
| No-scroll audit | `bun run audit -- ...` in `apps/web` | Every change to a screen. The section below explains it. |
| Balance | `bun run simulate` | Every change of game behaviour. Write the change in the pull request. |

`bun run complete-check` runs the type check, the tests and the build in one command. CI runs the same steps on pushes to `main` and on pull requests (`.github/workflows/ci.yml`), but only for the parts a change can affect: a change in `packages/` runs everything, a change in one app runs that app's tests, and a change to docs alone runs nothing. CI does not run the audit.

## How the code is organised

| Rule | Where |
|------|-------|
| One folder per feature. A feature keeps its components, its logic and its interface text (`messages.ts`) together. | `apps/web/src/<feature>/` |
| The server and the browser share typed contracts. A route, a message or a stored shape changes in the contract first. | `packages/arena/src/` (`types.ts` lists every route) |
| The engine is pure and deterministic. The same strategies and seed give the same round, so a replay is exact and the recorded rounds in the tests stay the same. The engine reads no clock and no random source of its own. | `packages/engine/src/` |
| A strategy is data. The server runs no player code. | `packages/engine/src/strategy/` |
| A screen does not scroll at the supported sizes. | `docs/specs/revamp/60-no-scroll.md` |

The design record of each part is in `docs/specs/revamp/`, starting at `00-overview.md`. `docs/DEBT.md` lists the deliberate shortcuts and known limits. When you take a shortcut on purpose, mark it in the code with a `ponytail:` comment that says what would clear it, and add a row to `docs/DEBT.md`. When you clear one, delete its row.

## How to add things

| To add | Do this |
|--------|---------|
| An interface string | Add it to the `en` and the `id` object of the feature's `messages.ts`. A component reads it from the catalog and never holds literal text. Indonesian addresses the player as "kamu". |
| A new feature folder with text | Create `src/<feature>/messages.ts`, import it in `apps/web/src/i18n/catalog.ts`, and add a slot to both languages. |
| A condition | Add an entry to `packages/engine/src/strategy/conditions.ts`. Then add its words in both languages in `apps/web/src/vocabulary/messages.ts`. The type check fails until the words exist. |
| An action | Add an entry to `packages/engine/src/strategy/actions.ts`, and its words to `apps/web/src/vocabulary/messages.ts`. |
| A rule set | Add one row to `RULE_SETS` in `packages/engine/src/combat/rule-sets.ts`, then run `bun run simulate` and `bun packages/engine/scripts/probes.ts`. The rows are tuned together. |
| A table, or a column of a table | Add one migration at the end of `MIGRATIONS` in `apps/server/src/db/schema.ts`. Never edit a migration that a released version applied. Put the SQL in the store's own file in its feature folder: the store gets the `Database` in its constructor and prepares its statements there. `apps/server/src/db/README.md` has the conventions. Test the store on `memoryDatabase()` from `db/testing.ts`. |

Write interface text in full, plain sentences of about 15 words or fewer. Do not write a run of short fragments ("Fast. Simple. Fun."), a denial followed by the real point ("Not a race. A puzzle."), or a list of three words for rhythm. `copyRules.test.ts` checks these rules.

## Run the no-scroll audit

The audit (`apps/web/scripts/no-scroll-audit.mjs`) opens every screen state in English and Indonesian at every supported size in a headless Chromium. It fails a state when the page is taller or wider than the window, when a part scrolls inside itself, or when text or a control is cut off. It creates the accounts, arenas and players it needs over HTTP, and closes the arenas at the end.

The audit uses Playwright, a dev dependency of `apps/web` that `bun install` installs. Playwright needs its own Chromium, which you download once.

1. Download Chromium for Playwright:

   ```sh
   cd apps/web && bunx playwright install chromium
   ```

2. Build the client:

   ```sh
   bun run build
   ```

3. Make an empty data folder for the audit, for example `mkdir -p /tmp/audit-data`.
4. Start a server on a free port. Do not use the port of a server that has real data.

   ```sh
   PORT=8961 TRUST_PROXY=1 DATA_DIR=/tmp/audit-data bun apps/server/src/index.ts &
   ```

5. Write down the process ID that the shell shows.
6. Run the audit for the screens you changed:

   ```sh
   cd apps/web && bun run audit -- http://localhost:8961 /tmp/audit-shots home,join
   ```

7. Read the table that the audit prints. The details of each failure are in `/tmp/audit-shots/results.md`.
8. Stop the server with `kill <process ID>`.

The arguments are the server, the folder for the screenshots and results, and an optional comma-separated list of screens or states (`room` or `room/lobby-owner-players`). Without the list, every state runs, which takes several minutes. `TRUST_PROXY=1` is necessary because registration allows 5 accounts per hour per address, so the audit sends a different `X-Forwarded-For` for each client. The audit exits with 1 when a state fails.

To use another Playwright installation, for example one whose browsers you already downloaded, set `PLAYWRIGHT` to the path of its `@playwright/test/index.mjs`.

## Report a bug

Open an issue with the "Bug" form. Write what happened, what you expected, the steps, the device and browser, and the language of the page. Do not put an email address or an arena code in a screenshot. Report a vulnerability as `SECURITY.md` says, not in an issue.

## What a pull request needs

1. One change per pull request, with the issue it closes.
2. The checks of the table above. The pull-request template repeats them as a checklist.
3. For a screen change, one screenshot in English and one in Indonesian.
4. Text that follows the text rules above, in both languages.
5. No real email address, token, password or machine path in the code, the tests or the documents. Tests use made-up addresses at the reserved domain `example.org`.

By sending a pull request, you agree that your contribution is published under the MIT license of the project (`LICENSE`).
