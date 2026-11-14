# Work packages L1 and L2: presenter arenas with up to 512 players

Read `00-overview.md` first. Owner's request, verbatim: "expand maximum arena presenter to 512". Today the limit is 64. A private arena stays at 16 and a public arena at 8.

What 512 means in numbers (show these in the decision log):

- Rounds: the cut keeps `max(8, ceil(n / 2))`, so 512 → 256 → 128 → 64 → 32 → 16 → 8, then the final: 7 cut rounds and 1 final.
- Arena: at the standard fill of 0.15, 512 tanks need 512 / 0.15 = 3,413 squares, about 68 by 51. On a 390 px phone that is 390 / 68 = 5.7 px per square, too small to show a tank. On a 1920 x 1080 screen it is about 20 px per square.
- Live data today: one turn message carries every tank as a JSON object (about 110 bytes each). 512 tanks x 110 bytes = 56 KB per turn per viewer; with 512 viewers and a turn every 0.9 s that is 56 KB x 512 / 0.9 s = about 32 MB per second from the server. Measure the real numbers before and after.

## Seam between L1 and L2 (L1 writes it first; L2 codes against it)

`packages/arena/src/compact-tick.ts`, exported from the arena package's index, with tests that a round trip returns the same public tick:

```ts
/** One turn in a compact form. Indexes refer to the order of `roundStart.snapshot.bots`. */
export interface CompactTick {
  readonly tick: number;
  /** Per bot: [x, y, direction index, score, water, flags, hitsLanded, hitsTaken]. Flags bit 0: was hit this turn. */
  readonly bots: readonly (readonly number[])[];
  /** In the order the moves resolved: [bot index, move index]. */
  readonly moves: readonly (readonly [number, number])[];
  /** [thrower index, outcome index, target index or -1, distance, hit chance or -1]. */
  readonly throws: readonly (readonly number[])[];
}
export function compactTick(tick: PublicTick, order: readonly PlayerId[]): CompactTick;
export function expandTick(compact: CompactTick, spawn: PublicSnapshot): PublicTick;
```

The index tables (directions, moves, outcomes) are exported constants in the same file. `StreamMessage`'s `tick` message and `ReplayResponse.ticks` carry `CompactTick`. `roundStart` keeps the full snapshot (it defines the order and the builds). The web expands a tick at the boundary (`src/stream/`), so the rest of the client keeps working with `PublicTick`.

## L1: engine speed, arena, server, load test

You own `packages/engine/**`, `packages/arena/**`, `apps/server/**`, and `docs/decisions/2026-11-11-water-fight-game.md`.

1. **Capacity.** `maxPlayersOf("presenter")` is 512. Find every place that assumes 64 (limits of condition parameters, tests, texts in the server) and decide each: a parameter limit such as "number of tanks near me" may stay at 64 if nothing breaks; say what you kept.
2. **Engine speed.** Measure `runRound` with 512 players and 90 turns, each play style in equal shares. Target: the mean time of one turn is under 50 ms on this machine, so a 0.6 s turn (the fast speed) leaves room. Profile and remove work that grows faster than the number of tanks squared per turn (for example a per-tank scan of all tanks inside a per-tank scan). No change of results: every existing engine test passes, and a new test checks that a 64-player round gives the same result as before your change for 20 seeds (record the results before you start).
3. **Compact turn messages** as in the seam. Serialise each turn once for all viewers; only the small `own` part differs per player. Send nothing twice.
4. **Saving.** Today every change writes the whole arena file at once. With 512 players who edit their tank in a break, that is many multi-megabyte writes per second. Coalesce: an arena is written at most once per second, and immediately on a phase change, at shutdown, and when a player joins (a join must survive a crash, because the player holds a token). State the worst loss in the store's header comment (up to 1 second of strategy edits) and test it with an injected clock.
5. **Limits.** Joins per minute per address: 1,200 (a venue shares one address). Check the stream hub with 600 open streams (heartbeat cost, memory).
6. **Balance left over from the eight-direction work.** Under the "Dry spell" rule set a tank that stands still wins 14.8% of 90-turn finals (luck is 12.5%). Lower that rule set's water cost per shot from 5 to 4, measure Dry spell again with `scripts/simulate.ts` and `scripts/probes.ts` (1000 finals, 90 and 150 turns), and keep the change only if the standing tank falls below luck and the conditions 1, 2 and 4 of `62-diagonal.md` still hold. Record the table.
7. **Sanity of a large round.** 100 rounds of 512 (90 turns): mean hits per tank, share of tanks that never shot, and whether the scores sum to 0. Report.
8. **Load test** (`apps/server/scripts/load-test.ts`, documented in README): against a running server, it registers an owner, creates a presenter arena, joins N players over HTTP, opens N event streams, starts the round, and during the break sends one strategy save per player spread over 10 seconds. It reports: the time to join N players, the server's turn interval as seen by clients (mean and worst), bytes per second per client, the server's CPU and memory during the round (read from `ps`), and whether every stream got every turn. Run it once with 64 and once with 512, for one cut round only. This is a work laptop: keep each run under 3 minutes and run nothing else at the same time. Report the numbers before your changes (64 only, to have a baseline) and after.

Report the measured limit plainly: what worked at 512 on this machine, and what you could not measure (real phones, a venue's Wi-Fi).

## L2: the client at 512

You own `apps/web/**` except what L1 owns. Read `11-foundation-guide.md` (section 11) and `60-no-scroll.md`: every screen must still pass the no-scroll audit.

1. **Stream.** Expand compact turns at the boundary with `expandTick`. Keep parsing strict: a malformed compact turn is a protocol error, not a crash.
2. **Follow camera on a phone and in a small pane.** When the whole arena would give less than 22 CSS px per square, the arena pane shows a window around the viewer's tank at a comfortable square size (28 px or more), clamped at the arena's edges, moving smoothly with the tank. A small overview map in a corner shows every tank as a dot, the viewer's dot marked, and the window as a rectangle. A control switches between "My tank" and "Whole arena". A viewer without a tank gets "Leader" (the window follows the tank with the most points) and "Whole arena". Draw only the tanks inside the window plus a margin of one square. The countdown points at the viewer's tank in the window. Tests cover the window maths (centre, clamping at each edge and corner, arenas smaller than the window).
3. **Whole arena with 512 tanks** (the big screen at 1920 x 1080, and the overview): simple tank detail, no gauge except the viewer's, no label, effects limited so that a turn with 150 shots stays smooth. Measure frames per second in headless Chromium during a 512-tank round on the big screen page and report it; target 30 or more on this machine. If SVG cannot reach it, draw the whole-arena view on a canvas and keep SVG for the follow window; say which you chose and why.
4. **Lists.** Rankings, the lobby's players, "through" and "out" lists, and the presenter's player list work with 512 entries through `Pager`, with the viewer's row kept on the visible page and a way to jump to the cut line. The big screen shows the top places, the places around the cut line and a count of the rest, as it does today with 64.
5. **Texts** that say "64" (home card, create page, and so on) say 512, in both languages.
6. **Check.** The audit passes for the room, the presenter page and the big screen with a 512-player arena (add a fixture: joined over HTTP; you may need `TRUST_PROXY=1` and a varied `X-Forwarded-For`), at every supported size in both languages. Screenshots of a 512-tank round: phone follow window, phone overview, laptop, big screen.

## Check (both)

`bun test`, `bun run type-check`, `bun run build` clean. L2's browser checks use a build in its own folder (`bunx vite build --outDir <scratchpad>/revamp/l2/dist`) served with `STATIC_DIR`.
