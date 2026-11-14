# Work package W2: sign-in, creating, joining and the arena room

Read `00-overview.md`, `11-foundation-guide.md`, then the contract as built: `packages/arena/src/types.ts`, `packages/arena/src/auth-protocol.ts` and the B2 report section "contract" that your prompt carries. This package connects the home page's four entries to working flows and gives every arena page its frame.

## You own

`apps/web/src/auth/**`, `src/create/**`, `src/room/**`, `src/host/**`, `src/home/PlayPage.tsx` (and the home messages it needs), `src/player/JoinForm.tsx`, `PlayerPage.tsx`, `playerView.ts`, `src/developer/**`, `src/rules/**`, `src/api/**`, `src/session/**`, `src/app/**` (routes for the pages you add), `src/ui/AppHeader.tsx` only for the account control slot's default, and their tests and `messages.ts` files. You compose, and do not edit: the preparation panel (`StrategyPanel` from `src/player/StrategyPanel.tsx` or `src/prep/`), the live round, results, rankings and big screen (`src/live`, `src/results`, `src/standings`, `src/screen`, `src/player/ResultViews.tsx`), the board and the test match. Another engineer rebuilds the watch pages at the same time and keeps their exported names and props.

## 1. Sign-in (`src/auth/`)

- `/sign-in` with two tabs, "Sign in" and "Create account": email, password (a show or hide control; one hint: 8 characters or more), one primary action. `?next=` returns the person to where they came from (only a path inside the app). Every `AuthErrorCode` has a sentence in both languages next to the field it concerns; `rate_limited` says how long to wait. A forgotten password cannot be reset by email: one sentence says so and tells the person to ask whoever runs this server.
- `useAccount()` (from `GET /api/auth/me`), sign out, and the account control in `AppHeader`: "Sign in" when signed out; when signed in, a small menu with the email, "My arena" (when `GET /api/account/arena` returns one) and "Sign out".
- One sentence on the create-account tab says why an account exists: only to create arenas, and joining never needs one.

## 2. Creating (`src/create/`)

- `/new/private` and `/new/presenter`. A signed-out visitor sees the sign-in step first on the same page, then the form.
- Private: arena name (a friendly default is filled in), "Bots fill empty seats" (on). Presenter: arena name, and the same switch (off). Both: a `Disclosure` "More options" with game speed (relaxed, normal, fast), round length (short, normal, long, each with its seconds), round rules (the same every round; new rules each round, shown before the round; new rules each round, a surprise) and, for presenter only, who plays (everyone; developers who send a strategy from their own code). Defaults: normal speed, normal length, the same rules every round, everyone.
- One primary action. Private goes to the arena room, presenter to the presenter page.
- The answer `arena_limit` shows a banner that names the existing arena with two actions: open it, or close it (a `Dialog` that states the consequence) and then create the new one.

## 3. The arena room (`/a/:id`, `src/room/` with `PlayerPage` as its entry)

One page for a player in any kind of arena. Frame: `AppHeader` with the arena name (a translated "Public arena" for a public one), then one `StatusBanner` that always says the state and the next step, then the content for the phase.

| Phase | Player sees | Owner of a private arena also sees |
|-------|-------------|------------------------------------|
| not joined | Join step: name (not in a public arena, where the game gives a name), `TankColourPicker`, "Join". The last name and colour are remembered. An arena that does not exist, is full, or already started gets a plain sentence with what the visitor can do (watch, or go home). | the same |
| lobby | Who is here (tank badges with names; bots marked "bot"; "you" marked), an "Invite friends" `SharePanel` (compact; open by default for the owner), the preparation panel. In a public arena: the countdown from `auto` ("Game starts in N seconds"). | "Start the game" as the dominant action with the number of tanks that will play (with bots when the switch is on), the bots switch, and "Close arena" inside More options |
| running | The live round component. A player with the status "waiting" sees one sentence that they play from the next game, and can prepare. | nothing more |
| break | The round result component, the next round's rules when announced, the preparation panel | "Start round N" or "Start the final" |
| finished | The final result component, the preparation panel for the next game. In a public arena: the countdown to the next game. | "Play again" |
| closed | "This arena was closed" and a way home | |

- A player can change their tank colour (lobby, break, finished) and leave (lobby).
- A first-time "How the game works" block of at most four short sentences with drawings made from `TankShape` (a tank, a shot, water, points). The player can close it, and it stays closed.
- Connection loss is stated in words, and the page recovers by itself.
- Owner detection: the signed-in account's arena from `GET /api/account/arena` is this arena.

## 4. Play now (`/play`)

One tap: the visitor picks a colour (the last one is preselected), taps "Play", and lands in the arena room of the arena that `POST /api/public/seat` returns, joined, with the name the game gave them shown once ("You are Brave Otter"). A full server gets a plain sentence.

## 5. The presenter page (`/a/:id/host`)

For a laptop, usable on a phone. Before round 1: `SharePanel` (full), "Open the big screen" (new tab) with its link, the players as tank badges with a count, the bots switch, and "Start round 1" as the dominant action, which says in words why it cannot start when it cannot. During a round: what is happening and the time left. In a break: who went through, the next round's rules when announced, "Start round N" or "Start the final". Finished: the winner, "Play again", "Close arena". A visitor who is not the owner sees a sentence and a link to the room.

## 6. Developer arena, errors, storage

- Developer arena (who plays: developers): the room shows the developer panel in place of the preparation panel. Lead with the three steps (copy the token, read the reference, send a document). Restyle with the foundation components and translate the panel's own text. The reference tables stay in English; say so in one sentence in Indonesian.
- `src/api/messages.ts`: a sentence in both languages for every error code the server can send (arena errors, auth errors, `arena_limit`, `not_owner`) and for network failure, each naming the problem and the recovery, none blaming the player.
- Session storage: host tokens are gone; remove their code. Player tokens stay.

## How to look at your work

- API server on port 8943 with a temporary `DATA_DIR`: `PORT=8943 DATA_DIR=<dir> bun apps/server/src/index.ts`. Client: `cd apps/web && API_PORT=8943 bunx vite --port 5943 --strictPort`. Do not run `bun run build`.
- Playwright from a Playwright installation on the owner's machine. Scripts and screenshots in `<scratchpad>/revamp/w2/`.
- At 390x844 and 1280x800, in English and Indonesian: create account, sign in with a wrong password, create a private arena, the limit banner, the room as owner and as a second player in every phase (drive rounds through the interface), colour change, leave, play now through a full public cycle, the presenter page through a full event with 9 players joined over HTTP, a closed arena, and connection loss (stop the server for a moment).
