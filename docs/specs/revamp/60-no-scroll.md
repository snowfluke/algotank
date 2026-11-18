# Work packages S0, S1, S2: slower pace, and no scrolling on any screen

Read `00-overview.md` and `11-foundation-guide.md` first. Owner's feedback on the finished revamp, verbatim: "the pace is too fast and i don't want any scroll".

## Decisions (lead)

### Pace

| What | Was | Now |
|------|-----|-----|
| Game speed, milliseconds per turn (`GAME_SPEEDS`) | relaxed 700, normal 500, fast 300 | relaxed 1200, normal 900, fast 600 |
| Round length, seconds (`ROUND_LENGTHS`) | short 45, normal 75, long 120 | short 60, normal 90, long 120 |
| Public arena round | 150 turns at 400 ms | 90 turns at 900 ms |
| Public arena countdown before a game | 20 s | 30 s |
| Public arena result time | 15 s | 20 s |
| Test match speeds, milliseconds per turn | slow 700, normal 400, fast 200, fastest 80 | slow 1200, normal 900, fast 500, fastest 200 |

A viewer must be able to follow one tank with their eyes at normal speed. Movement and effects already scale with the turn time; check that a move still glides for the whole turn and that the jet, splash and "+1" are readable at 900 ms. The server's accepted ranges for `tickMs` and `ticksPerRound` must allow these values.

### Sound only for the viewer's own tank

Owner's feedback, verbatim: "the sfx should only for the player tank to avoid confusion".

| Viewer | Shot, miss, dry shot and splash sounds |
|--------|-----------------------------------------|
| A player with a tank in the round (room page, test match) | Only for events of their own tank: it shoots (shot, miss or dry shot) and it is hit or lands a hit (splash) |
| A viewer with no tank in the round (big screen, presenter page, a spectator, a player who is out or waiting) | All tanks, as now, at most a few per turn |

Ultimates follow the same rule (85-ultimates.md, Stream and board): a player hears their own tank's fire and an ultimate that reaches their tank; a viewer with no tank hears one cue in a turn with any fire.

The countdown, round start, round end and win sounds are unchanged. The rule lives in `src/board/turnSounds.ts` with a test for both rows. S2 owns it.

### No scroll

On every screen, at every supported size, the page does not scroll, and no part of a main flow scrolls inside itself. Content that does not fit is paged (previous, next, a position such as "2 of 3") or moved to another tab, step or dialog. Text is never shrunk below the type scale to make it fit.

| Supported size (CSS px) | Stands for |
|-------------------------|------------|
| 360 x 640 | small phone |
| 390 x 844 | phone |
| 430 x 932 | large phone |
| 768 x 1024 | tablet, upright |
| 1000 x 600 | small laptop window (the owner's) |
| 1280 x 720 | laptop |
| 1920 x 1080 | big screen page only |

Owner's requirement, verbatim: "mobile responsive is a must". The phone is the first design target for every player screen: every flow works one-handed on a phone, touch targets are 44 px or more, nothing depends on hover, the layout adapts at every width between the sizes in the table (not only at them), and the page respects the phone's safe areas (`env(safe-area-inset-*)`) and the moving browser bars (`dvh`). A phone held sideways (for example 844 x 390) uses the fallback below and must stay fully usable.

Fallback: below 360 px wide or 560 px high, or when the reader enlarges text so content cannot fit, the page scrolls normally. Content is never cut off. Apply the fixed-height layout inside `min-width` and `min-height` media queries.

No exception: no part of the interface scrolls inside itself (2026-11-12, R1). The developer arena's reference tables were the one named exception, and they went with the developer mode. A `textarea` still scrolls its own text.

## The layout system (S0 builds it, everyone uses it)

- `AppShell` (in `src/ui/`): the page is a grid that fills the viewport height (`100dvh`): a compact header (one row, at most 56 px), a main area that takes the rest (`min-height: 0`, `overflow: hidden`), and an optional bottom bar (a tab bar on a phone, or the screen's primary action). Every page uses it. `Page` keeps working for the fallback case.
- Pane contract: a component placed in the main area or a tab gets a box with a fixed height and must fit in it. It lays itself out with flex or grid and `min-height: 0`, and it never relies on the page growing.
- `Pager` (in `src/ui/`): shows as many items of a list as fit the height it has (measured, no guess), with previous and next buttons and a position ("2 of 3"), keyboard and swipe support, and an option to keep one item (for example the viewer's row) on the visible page. `FitList` and `useBoxSize` exist; build on them.
- `Carousel` (in `src/ui/`): one item at a time with previous and next, dots, swipe and arrow keys; used where each item deserves the whole pane.
- `BottomTabs` (in `src/ui/`): the phone's tab bar for a screen with several panes (icon plus short label, 44 px targets, `aria` tablist). On a laptop the same panes sit side by side where they fit.
- `StepSheet` (in `src/ui/`): a full-pane step that replaces the pane's content, with a back control and a title, for editing one thing (a rule, the options of a form).
- An audit script, `apps/web/scripts/no-scroll-audit.mjs`: it drives the built client served by the Bun server with Playwright (import path from the `PLAYWRIGHT` environment variable, which pointed to a Playwright installation on the owner's machine until R1 made Playwright a dev dependency), visits every screen state in the table below at each supported size and in both languages, and fails when (a) the document is taller or wider than the viewport, (b) any element has `scrollHeight > clientHeight + 1` with a scrollable overflow, or (c) any text or control is cut off by an `overflow: hidden` ancestor (compare each visible leaf's box with its clipping ancestors; allow intended one-line ellipsis on names). It writes one screenshot per state and size, and a table of results. This script is the acceptance test of the whole package.

## Screens

| Screen | Phone | Laptop |
|--------|-------|--------|
| Home | Name with tank and one sentence, then the five entries (the four ways in, plus "Tank workshop", see `61-workshop.md`) as large tiles in the remaining height (Play now most prominent). The animated arena scene shows only when the height allows; it is never the reason for a scroll. | Scene and tiles side by side, as now, fitted to the height |
| Join, sign-in, Play now | One centred form | Same |
| Create arena | The short form; "More options" opens a `StepSheet` | Same, or options beside the form |
| Room, not joined | Join form | Same |
| Room, lobby | A status line (one or two lines, not a tall banner), then one pane at a time with `BottomTabs`: Tank (default), Players, Invite. The owner's "Start the game" is the bottom bar's primary action on every tab, with its one-line explanation. Colour change and leave live in Players; the bots switch and Close arena in Invite or an owner menu. "How the game works" is a dialog with four steps, reachable from a help button; it does not open by itself, because the lobby tour (`65-guidance.md`) introduces a first-timer. | Two or three columns that fit the height: players and invite at the side (players paged), the Tank pane in the middle |
| Tank pane (preparation) | Sub-tabs Play style, Fine-tune, Try it. **Play style:** a `Carousel`, one style per page with its drawing large, name, sentence, traits and a clear selected state; choosing applies it. **Fine-tune:** a switch between Upgrades and Rules; Upgrades fit one pane; Rules is the mode tabs plus a `Pager` of rule sentences; tapping a rule, "Add a rule" or "If no rule fits" opens a `StepSheet` to edit it (When, Do, More options as steps or sections that fit; long choice lists are paged or grouped behind a second step). **Try it:** the board fills the pane with the controls under it; the result and "What your tank did most" are a second page of the same pane. | Play style as a grid of 8 compact tiles (4 x 2) that fits; rules list and the open rule side by side |
| Room, running | The board as large as the pane allows with the player's own status (place, points, water) in one compact row above it and the timer in the status line. `BottomTabs`: Arena (default), Ranking (paged, own row kept on the page), My tank (recent turns, paged). The legend is a dialog behind a help button. | Board in the middle, ranking (paged) and own status at the side |
| Room, break and finished | `BottomTabs`: Result (default: the outcome sentence, the recap, the winner, and the top places), Ranking (paged), Tank (preparation). The owner's next action is the bottom bar's primary action. | Result and ranking side by side, preparation reachable as a tab |
| Presenter page | The same idea: Invite (QR), Players (paged), and the primary action in the bottom bar; during a round a paged ranking and the time | All in one view: share panel, players, action |
| Big screen | Already fits; keep it passing the audit at 1920 x 1080 |
| Dialogs, toasts | Never taller than the viewport; a long dialog pages its content |

Player counts: the owner raised the presenter arena's limit to 512 players (a later package, `63-large-arenas.md`, changes the capacity, the server and the board for it). Build every list, ranking and player pane so that it works with 512 entries through paging, and never assume 64.

Keep everything a screen can do today. Where a control moves, it must stay findable within two taps from where it was.

## Work split

- **S0** (first): the pace changes with their tests; `AppShell`, `Pager`, `Carousel`, `BottomTabs`, `StepSheet` with tests and gallery entries in `/kit`; the audit script, runnable and failing on today's screens; and the simple screens fitted and passing: home, join, sign-in, Play now, create arena, not-found. Owns `src/ui/**`, `src/app/**`, `src/home/**`, `src/auth/**`, `src/create/**`, `src/kit/**`, `apps/web/scripts/**`, the pace constants (`src/create/createRequest.ts`, `src/practice/replay.ts`, `apps/server/src/public-arenas.ts` and server validation), and updates `11-foundation-guide.md`.
- **S1a** (after S0): the room frame in every phase, the players and invite panes, the presenter page and the developer arena. Owns `src/room/**`, `src/player/**` except the result views and the files S1b owns, `src/host/**`, `src/developer/**`, `src/rules/**`, `src/share/**`. S1a places the preparation pane (`StrategyPanel`, current props) and S2's panes; it does not edit them.
- **S1b** (after S0, with S1a and S2): the preparation pane's no-scroll layout (play style, fine-tune, the rule step sheet) and the tank workshop; see `61-workshop.md`. Owns `src/prep/**`, `src/editor/**`, `src/vocabulary/**`, `src/workshop/**`, `src/player/StrategyPanel.tsx`, `useStrategy.ts`, `SaveStatus.tsx`, `WhenStrategyReady.tsx`.
- **S2** (after S0, with S1a and S1b): the watch panes: the board at any pane size, the live round's Arena, Ranking and My tank panes, the result pane, the test match pane, the legend dialog, and the big screen. Owns `src/board/**`, `src/live/**`, `src/results/**`, `src/standings/**`, `src/practice/**`, `src/screen/**`, `src/player/ResultViews.tsx`, `DecisionFeed.tsx`, `feed.ts`. S2 exports pane components that fill the box they are given; S1a places them. Seam (fixed now, so both can work at once): S2 exports from `src/live/panes.tsx` the components `ArenaPane`, `RankingPane`, `MyTankPane`, `ResultPane` and `FinalRankingPane`, and from `src/practice/Practice.tsx` the existing `Practice` as a pane; each takes the props the current `LiveRound` and result views take (`arena`, `stream`, `viewerId`, and so on: S2 writes the exact props at the top of `panes.tsx` first, before anything else, and S1a reads them there).

Every interface string stays in the message catalogs in both languages (read `~/.claude/skills/bahasa-indonesia-plain/SKILL.md` before writing Indonesian; "kamu").

## Check (each package)

`bun test`, `bun run type-check` and `bun run build` are clean. Then serve the build on your port with a temporary `DATA_DIR` and run the audit script for your screens; your package is done when the audit passes for them at every supported size in both languages, and you have read the screenshots at 360 x 640 and 1000 x 600 to confirm that nothing is cramped, cut off or unreadable (fitting by cramming is a failure too: touch targets stay 44 px, text stays on the type scale).
