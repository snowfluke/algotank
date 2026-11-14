# Work packages P4a and P4b: fixes from the first-timer test (Q2)

Read `00-overview.md` and `67-public-arenas.md`. Source: the Q2 report of 2026-11-12 (screenshots in the session scratchpad under `revamp/q2/shots/`). These start after CH1a (server) and W2 (web) have finished, because they change the same folders.

## P4a: server (`apps/server/**`, `packages/arena/**`)

| # | Problem found | Decision |
|---|---------------|----------|
| 1 | "Play now" seated a first-timer in a practice room whose game was running: 33 s of watching, 12 s of another result, then the 30 s lobby (77 s before playing). The overview promises a game within 30 s. | `POST /api/public/seat` for `practice` prefers a room that is in its lobby and has a free seat. When there is none, it opens a new room (bots fill it), up to `PUBLIC_ARENA_MAX`. Only when the maximum is reached does a visitor wait in a running room. A room that holds no human for one whole game closes when it is not the last of its kind. |
| 2 | A tank whose browser was closed kept its seat, kept the room busy, kept playing monthly games and collected 28 points. | When a public game starts, a human with no open stream for the last 20 s does not play and is removed from the room. This replaces the 3-minute rule at that moment (the 3-minute rule stays for lobbies). A monthly score is only given to a player whose stream was open when the game ended. |
| 3 | The practice result shows for 12 s, and its text needs 17 to 28 s of reading. | Practice result 20 s. A player who taps "I'm ready" on the result goes to the next lobby as ready (the 3 s rule), so nobody is made to wait. |
| 4 | The tournament break is 20 s and holds about 80 words. | The break stays 20 s; P4b cuts the text to what fits (below). |
| H | The server has no health route, and deployment behind a proxy needs one for monitoring. | `GET /api/health` answers 200 with `{ ok: true, startedAt, arenas }` (the number of open arenas), without a session and without reading files. |

Tests for each row through the public routes with the injected clock. Update the tables in `public-kinds.ts`, the README and the decision log.

### P4a as built (2026-11-12): what P4b must know

- The practice result is 20 s. `apps/web/src/guide/tours.ts` (`PUBLIC_PHASE_SECONDS`) with its test, and `publicplay/RoomHarness.tsx`, still say 12 s.
- `setReady` and `POST /api/arenas/:id/players/me/ready` also work on a public result, and `PublicPlayer.ready` can be true in the finished phase. `readyIsOpen(arena)` is exported from `@game/arena`, so `ReadyBar` shows on the result too ("I'm ready" there means: start the next game as soon as everyone is ready). Being ready does not shorten the result.
- `nextGameInMs` on the result counts the 3 s lobby when every human is ready.
- A human whose stream has been closed for more than 20 s when a game starts is removed. A page that comes back after that finds its seat gone: this is the case of row 6 below, so the page joins again without a second form.
- A monthly score is given only to a player whose stream was open in the last 20 s before the game ended.
- `GET /api/health` exists (`HealthResponse`).
- A practice seat can now answer 503 when every room is full; the page shows the sentence it has for a failed seat.

## P4b: web (`apps/web/**`)

| # | Problem found | Decision |
|---|---------------|----------|
| 5 | In every new arena the tank starts as the Evader, not with the play style the player built or used last. | The device remembers the play style used last (a built-in one or one of "mine"), and a new seat starts with it. `workshop/playWith.ts` already does this once for a newly built style; make it the general rule in one place. |
| 6 | After "Play now" a second join form appeared: the stored seat was gone, but `publicplay/usePublicJoin.ts` trusted the stored session. | A stored seat that the server no longer knows is dropped without a second form: the page joins again with the stored name and look. |
| 7 | Break and result text exceed the reading time of their phase (reading time: 4 s plus 0.5 s per word). | Add a test like the tour's time budget: for every timed public phase, the sentences the phase shows fit its length minus 5 s. Cut text until it passes; the tie-break sentence moves behind the "?" help. |
| 8 | Round tour step 3 covers the player's own tank on a laptop (`ui/CoachPlacement.ts`). | The player's own tank is a keep-clear target during the round tour. |
| 9 | Three "x of y" counters on one screen in the workshop tour's test step; "Syarat 2 tidak benar" reads like an error; "Air 1 belum cukup" does not say for what; the "Kamu" label hides the tank behind it; the toast covers the pager or "Leave arena" for 6 s; the champions page has no Back. | Fix each where it is small; report the rest. |

| 10 | Left over from W2 (2026-11-13): `board/PaneHarness.tsx` and `board/messages.ts` still show a "Fine-tune" tab in their stand-in tabs, which no longer exists (the tabs are Play style, Rules, Upgrades, Try it). | Rename the stand-ins to the real tabs and delete the unused message. |
| 11 | Found by W2: when the room changes between its phone and its laptop layout (a window resize or a phone turned sideways), the tank pane is mounted again and jumps back to the Play style tab. | Keep the chosen tab across the layout change (hold it above the part that is mounted again). |
| 12 | Found by W2: `prep/useBenchFit` copies the loop of `ui/useFitDetail`, because `useFitDetail` stayed on a level whose content overflowed after a chain of resizes (768 x 1024, then 1000 x 600 in the 22rem column). | Find the cause in `ui/useFitDetail` with a test that repeats the resize chain; when it is fixed, the bench uses the hook again and `useBenchFit` goes. When the cause is not found within the package's bounds, leave the copy and report what you learned. |
| 13 | The whole no-scroll audit last ran before W2's final 11 fixes and before the chat screens. | Your whole audit at the end is the final one for all of these; it must pass with the overlap rule enforced. |

| 14 | Left over from CH1b (2026-11-13): the events route accepts `?chat=0` (the big screen uses it), but the route comment in `packages/arena/src/types.ts` and the README's route list do not say so. | Add it to both. |
| 15 | Left over from CH1b: a chat line longer than 4 rows is cut with an ellipsis; on a 1000 x 600 presenter window the chat shows one or two lines. | Report only, unless the fix is small. |

Status on 2026-11-13: W2, CH1a, CH1b, P4a, D2 and P4b are finished. The final whole no-scroll audit on the final code passed 4,038 of 4,038 checks; `bun test` passes 1,870 tests. P4c (2026-11-13) added the "Other arenas" link on public results and made "Play now with it" apply the chosen play style to a held seat too (`prep/lastStyle.ts`, a stored request); `bun test` then passes 1,879 tests, and the public-room states passed the audit again (316 of 316), without another whole run. The lead watched rows 8 and 11 on the final code. Open: a play-with request that never meets a room stays stored; row 15 is reported only; the monthly result meets its reading time only when the clock label and the "Top three" heading are not counted.

Workshop tour step 6 (the callout covers the number control) was solved in W2: the whole condition editor is now the step's target.

Check: `bun test`, `bun run type-check`, the whole no-scroll audit, and one browser run at real timings (`PUBLIC_TIME_DIVISOR` unset): a clean profile reaches a practice lobby within 30 s of "Play now" while another room's game is running.
