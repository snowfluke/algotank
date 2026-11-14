# Work packages R1 (open-source repository files) and C3 (cleanup)

Owner, 2026-11-14: "cleanup", and "prepare for community release, like README (with banner), contributing guide, policy, CI, funding.yaml etc for standard open source repo, .gitignore, MIT license". The owner publishes the code as open source and non-commercially; the GitHub account is `snowfluke`, the repository is assumed to be `snowfluke/algotank` (not created yet).

Nobody runs git in these packages: the owner decides when the repository is created and what the first commit is.

## R1: repository files (can run while other builders change the source)

You own the project root's documentation files, `.github/**`, `docs/assets/**`, and the metadata fields of the root `package.json`. You do not edit `apps/**` or `packages/**` (other builders are changing them), except a new script file for the banner.

| File | Decision |
|------|----------|
| `LICENSE` | MIT, year 2026. Copy the copyright holder's name exactly from the `LICENSE` of the owner's other repository. |
| `README.md` | English. Banner; what the game is in two sentences (for people who do not program and for children: build rules, watch the tank play); three or four screenshots; how to play; quickstart (Bun version, install, dev, build, start, the environment variables that matter, with a link to the full list); what is in the box (private and presenter arenas, organiser tournament, public arenas, the monthly league from `77-monthly-league.md`, chat, accounts with email codes, two languages); project layout (the four packages and the feature folders); scripts; tests and the no-scroll audit; deployment (link to `docs/deployment/`); documentation map; contributing; support (GitHub Sponsors `https://github.com/sponsors/snowfluke`); license. Replace the existing README: keep every fact that is still true (read it first), move reference tables that are too long for a front page into `docs/`. Follow the owner's writing rules: literal statements, no marketing words, no feature grid of three cards, no emoji. |
| Banner | `docs/assets/banner.png`, 1280 x 640, made from the game's own drawings (the logo in `apps/web/public/favicon.svg` or `promo/assets/svg/`, the tank drawings the web app renders) on the game's own background colour, with the name and one line. Source as `docs/assets/banner.html` and a small script that renders it with one headless browser, the way the owner's other repository does it (`assets/banner.html` and `scripts/render-banner.ts`). No gradient text, no decoration that carries no information. |
| Screenshots | `docs/assets/screenshot-*.png` at 1280 x 720 in English, taken from a build you serve yourself (port 9007): the rule editor with a step sequence, a live round, the organiser's lobby, the tournament result. The monthly page is added later. |
| `CONTRIBUTING.md` | Setup; the checks a change must pass (`bun test`, `bun run type-check`, the no-scroll audit for a screen change, both languages for every string, `i18n/copyRules.test.ts`); how the code is organised (feature folders, typed contracts in `packages/arena`, the engine is deterministic); how to add a string, a condition or an action (point at the files); how to report a bug; what a pull request needs. State plainly that the audit needs Playwright and how to get it (see below). |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 by reference and a short summary, with reports going to the maintainer through the contact on their GitHub profile. Do not print an email address. |
| `SECURITY.md` | Reports through GitHub's private vulnerability reporting on the repository; what to include; no public issue for a vulnerability. No email address. |
| `PRIVACY.md` | What a server of this game stores and for how long, taken from the code and not from memory: accounts (email, how the password is stored), sessions, email codes, arenas and their lifetime, chat (24 hours, 500 lines), stored results (180 days), the league, the "My tank" and saved play styles, what stays in the browser's storage, and whether the page makes any request to another site (check fonts and other assets). Written for a person who hosts the game and for a parent. It is a description, not legal advice; say that in one sentence. |
| `.github/workflows/ci.yml` | On push and pull request: check out, Bun at the project's version, `bun install --frozen-lockfile`, `bun run type-check`, `bun test`, `bun run build`. Look up the current major versions of the actions you use in their documentation. No audit in CI. Least permissions (`contents: read`). |
| `.github/FUNDING.yml` | `github: snowfluke` |
| `.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md` | A bug form, an idea form, and a pull-request checklist that repeats the checks from the contributing guide. |
| `.gitignore`, `.editorconfig` | Ignore dependencies, builds, every data folder the server writes (read `apps/server/src/config.ts` for the default `DATA_DIR`), `.env*` except an example, logs, OS files, `promo/renders/`, `promo/node_modules/`, unused voice takes in `promo/assets/voice/` that came from online services (`gadis`, `samantha`). List what the ignore rules leave out of the repository and its size, and anything over 5 MB that would still go in. |
| Root `package.json` | `description`, `license`, `repository`, `homepage`; a script `complete-check` that runs type-check, tests and build. Nothing else. |
| Audit for contributors | The audit script takes Playwright from a path on the owner's machine (`PLAYWRIGHT=...`). Make it work for a contributor: `@playwright/test` as a dev dependency of `apps/web` at the version the owner's machine already has, a script `bun run audit`, and the `PLAYWRIGHT` variable kept as an override. This is the one edit under `apps/web` you make (its `package.json` and the script's import); report it. |

Private data check, before you finish: search the whole project (not `node_modules`) for paths into the home folder and the temporary folder, for email addresses, for keys and tokens, and for data files with accounts. Fix what is in files you own; list the rest with file and line for the cleanup package. The only email address that may appear in the repository is the business address in `apps/web/src/support/contact.ts`.

Never `bun run build` in the project folder (CI runs it, you do not); never port 8787; build to your own scratch folder; one headless browser. Report briefly, with the banner path.

## C3: cleanup (after the monthly packages M1 and M2)

Decided by the lead; the builder gets its prompt when M2 is done.

- Remove dead code, unused files, exports and strings (one-off tools such as `bunx knip` may find candidates; every removal is checked by the type check and the tests).
- Scrub machine paths from `docs/` (the specs stay as the design record) and act on R1's private-data list.
- Resolve or list every `ponytail:` comment and every "debt" named in the specs' status sections in one file, `docs/DEBT.md`.
- Remove leftover harness pages, fixtures and scripts that nothing uses; keep the ones the audit needs.
- From B1 (music): a long cache lifetime for `/music/` in `apps/server/src/static.ts` (the file names carry a version); `PRIVACY.md` and `11-foundation-guide.md` describe two sound switches; a test that the loop points in `tools/music/measurements.json` and `sound/musicTracks.ts` agree.
- From R1: `index.html`'s theme colour (#f7f2ed) against the app's `--color-ground` (#f6f3ec); `docs/deployment/01-overview.md` still says email is not verified; machine paths in 11 spec files and in `promo/tools/gen-svg.tsx`, `g2p-id.ts`, `voice-piper.py`.
- The whole suite and the whole audit at the end.
