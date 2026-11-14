# Work package F1: fixes found by the guidance package and the lead's review

Read `00-overview.md`, `11-foundation-guide.md` (section 11, with 11.6 for the coach marks) and `65-guidance.md`. This package repairs defects. It adds no feature and changes no sentence.

A second builder (C2) rewrites interface text at the same time. C2 owns every `apps/web/src/**/messages.ts` and the tests that assert text. Do not edit a `messages.ts` file; when a fix needs a new or changed sentence, reuse an existing message or name the need in your report.

## Fixes (in this order)

| # | Where | Defect | Wanted |
|---|-------|--------|--------|
| 1 | `src/mytank/` inside the room's join step (audit state `room/not-joined-mytank`) | At every size the part tabs of "My tank" lie under "Surprise me" and "Done". The overlap rule reports it. | No control covers another at any supported size, and the editor still fits without a scroll. |
| 2 | `src/publicplay/PlayPage.tsx` (audit state `chooser/tournament-full`) | At 360 x 640 the "Champions" link is covered when the "tournament is full" sentence shows. | The sentence, its action and the link are all visible and usable. |
| 3 | `src/home/` with the first-visit cue (audit state `tour/home-cue`) | On a phone the cue's callout covers the game's name and the sentence under it, which a first-timer has not read yet. | The name, its sentence and both main tiles stay visible while the cue shows. Put the cue in the page's flow or under the tiles; it still must not cause a scroll. |
| 4 | `src/ui/Toast.tsx` | While a toast leaves, it slides or fades over the bottom tabs of a room. | A toast never covers the bottom bar or the tabs, also while it enters and leaves. |
| 5 | `src/host/HostPage.tsx` | A game with one round says "The final is running". | Use `liveTitle()` from `src/room/roomStatus.ts`, as the player page does. Check the big screen (`src/screen/`) for the same condition and fix it there too. |
| 6 | `apps/web/scripts/no-scroll-audit.mjs` | The state name `room/lobby-owner-players` is defined twice. | One name per state; a duplicate name makes the script stop with a message. |
| 7 | `src/ui/CoachMark.tsx` | The last step of a tour shows "Finish the tour" and "Skip the tour", which do the same. | The last step shows only the finish action. |
| 8 | `src/ui/CoachPlacement.ts` and the audit's overlap rule | 14 tour states are exempt from the overlap rule as a list of names. In a timed lobby, step 1's callout covers the countdown for about 11 s. | Replace the list by a rule: a tour's callout may cover controls for its one step, except its own target, the bottom bar and the tabs, and (in a room) the countdown clock; give the clock a `data-` hook. A state that breaks this fails. After fixes 1 to 3 the exemption list is empty and is removed. If a step cannot meet the rule at 360 x 640 after one honest attempt, keep that one state as a named exception with its reason. |
| 9 | The running view's help (`src/live/` or `src/board/` legend dialog) | The first-round tour has no replay. | "Show me around" there replays the round tour, as the workshop's help button does for its tour. Reuse the existing message. Skip this item when it needs a new sentence, and say so. |

## Check

`bun test` and `bun run type-check` clean. Build to your own folder and serve on your own port. Run the audit for the states you touched at every size in both languages and read the screenshots at 360 x 640 and 1000 x 600 for each fix. Do not run the whole audit: the text package runs it after you.

## Report

The common report, with one line per fix: done, partly done (what remains) or not done (why).
