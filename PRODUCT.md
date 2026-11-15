# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Players who do not program, children of about 10 included, who want a quick game in the browser with friends or bots. Second: teachers and event organisers who run a presenter arena on a big screen while up to 512 players join by QR code.

## Product Purpose

AlgoTank is a water fight game in the browser. Each player builds rules for a toy tank ("When [something is true] → [do this]"), which is an algorithm, and then watches the tank play by itself against the other tanks. Success: a player understands that the order of their rules decides what the tank does, and wants to change the rules and play again.

## Positioning

Nobody steers. The player's only input is the list of rules, so the game teaches what an algorithm is by letting the player watch their own algorithm win or lose.

## Operating Context

Played on phones and laptops, alone against bots (practice arena), in a public tournament of up to 64, in a monthly league, in a private arena with friends, or in a presenter arena at an event with a big screen. The interface starts in Indonesian and every page has a switch to English.

## Capabilities and Constraints

- Arenas: practice, tournament, monthly league, private, presenter (`docs/arenas.md`).
- Rules: each turn the tank does the first rule from the top that fits. Upgrade points go to Range, Aim and Dodge. A hit moves 1 point from the hit tank to the shooter. A shot uses water that refills over time. Items on the floor (bucket, umbrella, pinwheel, mud ball) change one hit each; a bucket's hit moves 2 points (`docs/items.md`).
- The landing page is a standalone static page. Its source is in `apps/web/landing/` so it can reuse the game's drawings, tokens, copy and engine, and `bun run build:landing` writes the static files to `apps/web/landing/dist/`. Its buttons point to the game at `GAME_URL` in `apps/web/landing/build.tsx` (https://algotank.awala.my.id), and `.github/workflows/landing.yml` publishes it to GitHub Pages.

## Brand Commitments

- Name: AlgoTank (`apps/web/src/brand.ts`).
- Visual world: the game's own (`apps/web/src/index.css` tokens, Fredoka and Figtree, the toy tanks in `apps/web/src/tank/`).
- Copy follows the user's UI copy rules: plain headings, subtitles as full sentences, no taglines or badges nobody asked for.

## Evidence on Hand

- Screenshots: `docs/assets/screenshot-*.png`. Banner: `docs/assets/banner.png`.
- There are no player counts, testimonials, schools or events to cite. Do not invent them.

## Product Principles

- The player builds, the tank acts.
- Readable by a 10-year-old in Indonesian and English.
- Free to play with no sign-in for the practice arena.

## Accessibility & Inclusion

Children are a primary audience: plain words, large touch targets, text contrast of 4.5:1 or better, and every animation stops under reduced motion.
