# Work package W3a: the arena board and the test match

Read `00-overview.md`, then `11-foundation-guide.md` (tokens, components, message catalogs, the tank, sound). The owner "couldn't spot any tank". After this package the arena is a place where tanks fight with water, and it is fun to watch.

## You own

`apps/web/src/board/**`, `apps/web/src/practice/**`, `apps/web/src/water/**` (and their tests and `messages.ts` files; create `src/board/messages.ts` and add its slot to the catalog). Keep the exported props of `ArenaBoard`, `Scoreboard` and `Practice` compatible (optional additions only): other folders compose them. Do not edit `src/live`, `src/screen`, `src/standings`, `src/player`, `src/editor`, `src/prep`, `packages/**` or `apps/server`: other engineers are working there now.

## 1. The board (SVG)

- Each bot is a tank: `TankShape` in its hull colour, rotated to its direction with the existing short-way turn animation, its 1 or 2 character label readable, and the viewer's own tank with the "you" treatment. New optional prop `tanks?: ReadonlyMap<BotId, { colour: TankColour; isBot?: boolean }>`; without it, colour follows the order of the bots.
- The floor reads as an arena (floor and grid tokens, a visible border wall), not as a spreadsheet.
- A shot is a water jet from the nozzle to where it lands. A hit shows a splash on the target, a brief reaction of the hit tank and a "+1" that rises from the shooter. A miss and a shot with too little water each look different by shape, not only by colour.
- The leader carries a small crown mark; ties show no crown.
- New optional prop `countdown?: number | null`: a large 3, 2, 1 over the board before the first turn, while the tanks stand at their start squares. With a highlighted own tank, the board points it out during the countdown (for example a pulsing ring and the word "You" in the current language).
- Follow the `game-feel` reference: few layered effects, brief, stronger for a hit than for a miss, back to rest, never hiding a tank or its gauge. Under `prefers-reduced-motion`: no movement effects, state still shown.
- Sound: the board calls `playSound` for shot, splash, miss, dry shot, countdown and round start through one small function that maps a turn's events to sounds, at most a few per turn. A test covers the mapping.
- The water gauge stays readable beside each tank at every size. Tanks stay recognisable from 8 to 64 on a phone and on a 1920x1080 screen (use the simple tank detail when squares are small).
- Performance: no layout work per turn beyond what exists; effects are CSS animations keyed by turn.

## 2. The legend

A small legend near the board for what a first-time viewer cannot guess: the water gauge, a hit, a miss, "you", the crown. Drawn with the same shapes as the board. Collapsible on a phone, and remembered.

## 3. The test match (`src/practice/`)

- One dominant button "Run a test match" with defaults that need no choice. The match plays at once on the board, with the countdown.
- Play, pause, speed and a scrubber with accessible names.
- The result is one sentence ("Your tank finished 3rd of 8 in this test"), then "What your tank did most" in plain words that help the player decide what to change (use the vocabulary catalog from `src/vocabulary/messages.ts` when it has the texts; another engineer is writing it now, so fall back to your own short texts in `src/practice/messages.ts` and name the duplication as debt), and one line that says a test is one draw of luck and results vary.
- Opponents, round rules and length sit in a `Disclosure` "Test options" with plain labels (length as short, normal, long; never turns).

## How to look at your work

- API server on port 8944 with a temporary `DATA_DIR`, client with `API_PORT=8944 bunx vite --port 5944 --strictPort` in `apps/web` (do not run `bun run build`). Check `apps/server/src/config.ts` for the environment variables the server needs today, and `packages/arena/src/types.ts` for the contract as it is now (another engineer is changing both; if the server does not start, build a small page under `/kit` or a Playwright page that renders `ArenaBoard` from a round you run in the browser with the engine, which the test match already does).
- Playwright from a Playwright installation on the owner's machine. Scripts and screenshots in `<scratchpad>/revamp/w3a/` (the builder's scratch folder).
- Screenshots to take and read: the board with 8 tanks and with 64 tanks at 390 px wide and at 1920x1080; a zoomed capture during a hit, a miss and a dry shot; the countdown; the legend; the test match on a phone and at 1280x800, in English and Indonesian; one capture with reduced motion. Judge them as the owner would: can you spot the tanks at once, and is it fun to watch?
