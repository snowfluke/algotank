# Work package W3b: the live round, the big screen, results and rankings

Read `00-overview.md`, `11-foundation-guide.md`, then the contract as built (`packages/arena/src/types.ts`) and the board engineer's report that your prompt carries (the board's props, the countdown, the legend, sounds). This package makes a round fun to watch on a phone and in a room, and makes results clear at a glance.

## You own

`apps/web/src/live/**`, `src/screen/**`, `src/standings/**`, `src/results/**`, `src/stream/**`, `src/player/ResultViews.tsx`, `DecisionFeed.tsx`, `feed.ts`, and their tests and `messages.ts` files. Keep the exported names and props of the components other folders compose (`LiveRound`, the result views, `ScreenPage`, `StandingsTable`): optional additions only. Another engineer rebuilds the arena room and presenter page at the same time and composes your components with their current props. You compose, and do not edit, the board (`src/board`), the tank, sound and share folders.

## 1. Stream state (`src/stream/`)

The state must give the pages what they need: the pause before the first turn (`roundStart.startsInMs`, anchored to the time the message arrived), the `auto` step of a public arena, the game number, and the `closed` message. Tests for each.

## 2. Live round on a phone

- The 3, 2, 1 countdown on the board before the first turn, with the player's own tank pointed out.
- First the player's own status in one sentence and large numbers: place, points, water, and whether that place goes through.
- Then the board with each tank in its player's colour (`PublicPlayer.colour`) and bots marked, then the legend.
- Then the ranking with tank badges, the cut line labelled in words ("Top 8 go through") and tied places shown honestly.
- "What your tank did": the most recent turns as plain sentences from the vocabulary catalog (`src/vocabulary/messages.ts`), newest first, for example "Turn 12: moved away from the nearest tank, because no rule fit". No internal names.
- A viewer who is not a player sees the same without the own-status part.

## 3. The big screen (`/a/:id/screen`, 1920x1080, read from 5 m)

Root has `data-scale="screen"`. A safe margin for projector overscan. A `SoundSwitch`.

| Phase | Shows |
|-------|-------|
| lobby | How to join, very large: `SharePanel` size "screen" (QR code, code, the link without its scheme), the players who joined as tank badges with names (still readable with 64), the next round's rules when announced |
| running | The countdown; then the board as large as possible, the timer, the round name and its rules in a few words, the ranking with tank badges and the labelled cut line |
| break | Who went through and who is out, clear at a glance, and what comes next |
| finished | The winner and the top three as the one authored celebration (the `win` sound once, tanks and water, still under reduced motion), then the full ranking |

## 4. Results on a phone (`src/results/`)

- After a round and at the end, the player's outcome comes first as a sentence with the reason ("You finished 3rd of 9, so you go through to round 2").
- A short recap from the round's numbers: hits landed and hits taken ("You hit 5 tanks and were splashed 3 times").
- A player who is out gets a clear, kind message and can keep watching.
- The winner gets a celebration on their own phone.
- Then the table (`StandingsTable`): tank badges, the viewer's row marked beyond colour, bots marked, long names handled.

## How to look at your work

- API server on port 8945 with a temporary `DATA_DIR`: `PORT=8945 DATA_DIR=<dir> bun apps/server/src/index.ts`. Client: `cd apps/web && API_PORT=8945 bunx vite --port 5945 --strictPort`. Do not run `bun run build`.
- Creating an arena needs an account: register over HTTP (`POST /api/auth/register` with an `Origin` header equal to the host you call), keep the cookie, then create a presenter arena, join players over HTTP and start rounds as the owner. Read the routes in `packages/arena/src/types.ts`.
- Playwright from a Playwright installation on the owner's machine. Scripts and screenshots in `<scratchpad>/revamp/w3b/`.
- Screenshots to take and read, in English and Indonesian: the big screen at 1920x1080 in the lobby (1, 9 and 64 players), the countdown, a running round (9 and 64 tanks), a break and the end; a phone at 390x844 in a running round as a player, in a break as a player who went through and as one who is out, and at the end as the winner and as another player; one capture with reduced motion.
