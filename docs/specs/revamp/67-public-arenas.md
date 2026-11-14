# Work packages P3a and P3b: three public arenas

Read `00-overview.md` first. Owner's request, verbatim: "The public arena should have 3, one is monthly basis with winner recorded for each month, one is running tournament that keeps reset, one is experiment public with a quick reset (default of first timer join)."

## The three arenas (decided)

| | Practice arena | Tournament arena | Monthly arena |
|---|---|---|---|
| Kind in code | `practice` | `tournament` | `monthly` |
| For | Trying things; where a first-timer lands | A knockout with a winner, again and again | A month-long contest with a recorded champion |
| Human seats per room | 8 | 64 | 8 |
| Rooms | A visitor gets a room in its lobby with a free seat; when there is none, a new room opens, up to `PUBLIC_ARENA_MAX`; only at that maximum does a visitor wait in a room whose game runs. An extra room with no human for one whole game closes (amended 2026-11-12, `73-after-first-timer-test.md`) | One tournament at a time; a visitor who arrives while it runs watches it and plays the next one | A new room opens when all are full |
| Bots | Fill to 8 | Fill to 16 when fewer than 16 humans joined, so there is always a cut round and a final | Fill to 8 |
| One game | One round of 60 turns at 0.9 s (54 s) | Rounds of 90 turns; each keeps the top half until 8 remain, then the final; 20 s between rounds, started by the server | One round of 90 turns (81 s) |
| Start | 30 s after the first human is in the lobby (raised from 15 s on 2026-11-12, so a first-timer has time to read the lobby), or 3 s after every human in the room tapped "Ready" | 60 s after the first human is in the lobby, or 5 s after every human tapped "Ready" | 30 s after the first human is in the lobby, or 3 s after every human tapped "Ready" |
| After the game | Result for 20 s (raised from 12 s on 2026-11-12, so its text can be read), then a new lobby; a player who tapped "I'm ready" on the result is ready in it | Result for 30 s, the winner goes on the list of recent winners, then a new lobby | Result for 20 s, each human's points of the round go to their monthly score when their page was open at the game's end (amended 2026-11-12), then a new lobby |
| Record | None | The last 50 tournaments that a person won (name, look, date, number of tanks). A tournament that a bot wins records nothing, and its result says that a bot won this time. | This month's ranking; at the end of each month the champion and the top 10 are stored for good |
| Who can play | Anyone, no sign-in | Anyone, no sign-in | Signed-in accounts only (owner, 2026-11-12: "public arena monthly only for signed people"); anyone can watch and read the ranking |

Joining in any phase stays as today: a visitor who arrives during a game gets the status "waiting", can prepare, and plays from the next game.

The tournament room holds 64 people in total, waiting ones included. A 65th visitor gets 409 `arena_full`, and the page offers the practice arena in the same sentence.

Names and looks follow `69-tank-identity.md` in all three arenas: a player may type a name, the block list applies, and a join without a name gets a name from the game.

### Ready

In a public lobby a player can tap "I'm ready". When every human in the room is ready, the countdown drops to the short time in the table. A new human who joins is not ready, so the normal countdown continues from where it was. `PublicPlayer` gains `ready: boolean` (meaningful in a public lobby and on a public result; a player who taps it on the result starts the next lobby as ready, everyone else starts it as not ready; see `73-after-first-timer-test.md`).

### Monthly score

- A player's monthly score is the sum of their 20 highest round scores of the month. (A round score is the points the tank ended the round with; it can be negative, and a negative round is never among the 20 unless the player has fewer than 20 rounds, in which case only rounds with a positive score count.) So: `score = sum of the top 20 positive round scores`. One sentence explains it to a player: "Your 20 best games of the month are added up."
- Ranking: higher score first; then more games won; then the player who reached the score earlier.
- The month follows the time zone in `LEAGUE_TIME_ZONE` (default `Asia/Jakarta`); a month's id is `YYYY-MM`. When a month ends (checked when a monthly game ends, at start, and once an hour), the server stores that month's champion and top 10 and starts the new month empty. A month in which nobody scored records no champion.
- Bots never get a score.

### Monthly identity

- Only a signed-in account can join a monthly room. The account is the identity: one score per account per month, and one seat at a time. A visitor who is not signed in can open the monthly arena, watch a game and read the ranking, and sees one sentence that says signing in lets them play for the month's title, with the sign-in action.
- The name and look on the ranking are the ones the account used in its latest scored monthly game. The league file stores them with the score, so the ranking reads one store, and a stored month record keeps what they were when the month ended. Two accounts may show the same name; the look tells them apart.
- Named limits (write them in the server file's header and in the decision log): an email is not verified, so a person can register several accounts; scores can be raised by playing when only bots are in the room. The record carries no prize.

## Contract (P3a writes these first; P3b codes against them)

```ts
// packages/arena/src/types.ts
export type ArenaKind = "private" | "presenter" | "practice" | "tournament" | "monthly";
export type PublicKind = "practice" | "tournament" | "monthly";
export const PUBLIC_KINDS: readonly PublicKind[];
export function isPublicKind(kind: ArenaKind): kind is PublicKind;      // replaces every `kind === "public"`
export interface PublicPlayer { /* plus */ readonly ready: boolean }
// JoinRequest is unchanged; joining a monthly room needs the session cookie (401 `not_signed_in` otherwise).
export interface PublicSeatRequest { readonly kind: PublicKind }

// packages/arena/src/public-protocol.ts (new, exported from the index)
export interface TournamentWinner { readonly name: string; readonly look: TankLook; readonly wonAt: string /* ISO */; readonly tanks: number }
export interface LeagueRow { readonly rank: number; readonly name: string; readonly look: TankLook; readonly score: number; readonly games: number; readonly wins: number }
export interface MonthRecord { readonly month: string /* YYYY-MM */; readonly champion: LeagueRow; readonly top: readonly LeagueRow[] /* up to 10 */ }
export interface PublicStatusResponse {
  readonly practice: { readonly humans: number };
  readonly tournament: { readonly phase: "lobby" | "running" | "break" | "finished"; readonly humans: number; readonly startsInMs: number | null; readonly round: number | null; readonly recentWinners: readonly TournamentWinner[] /* newest first, up to 5 */ };
  readonly monthly: { readonly month: string; readonly players: number; readonly top: readonly LeagueRow[] /* up to 3 */; readonly lastChampion: MonthRecord | null };
}
export interface LeagueStandingResponse { readonly you: (LeagueRow & { readonly counted: number /* rounds in the score, at most 20 */ }) | null }
export interface LeaguePageResponse { readonly month: string; readonly total: number; readonly rows: readonly LeagueRow[] }
export interface ChampionsResponse { readonly months: readonly MonthRecord[] /* newest first */; readonly tournamentWinners: readonly TournamentWinner[] /* newest first, up to 50 */ }
```

| Route | Who | Does |
|-------|-----|------|
| `GET /api/public` | anyone | `PublicStatusResponse` |
| `POST /api/public/seat` | anyone | Body `PublicSeatRequest`; returns the room to join for that kind |
| `POST /api/arenas/:id/players` | anyone; an account in a monthly room | As today. In a monthly room: 401 `not_signed_in` without a session, and 409 with code `league_seat_taken` when the account already holds a seat. |
| `POST /api/arenas/:id/players/me/ready` | player | Marks the player ready (public lobby only) |
| `GET /api/league/me` | anyone | `LeagueStandingResponse` for the session's account; `you` is null when not signed in or without a score |
| `GET /api/league/current?offset=&limit=` | anyone | `LeaguePageResponse`, `limit` at most 50 |
| `GET /api/champions` | anyone | `ChampionsResponse` |

After a monthly game, the room's result must let a player see what they gained: add to the `arena` stream message for monthly rooms, in the finished phase, `leagueGain: readonly { playerId; counted: boolean; score: number; rank: number }[]` (how each human's standing changed), or expose it through `GET /api/league/me`; P3a chooses the simpler one and states it in the contract file.

## P3a: arena package and server

You own `packages/arena/**`, `apps/server/**`, README (routes, environment variables), and the decision log section "Three public arenas, 2026-11-12" (the table above with reasons, the score rule with one worked example, the named limits).

- Replace the single public kind by the three kinds everywhere (`isPublicKind`), with the table's numbers as data in one place (`apps/server/src/public-arenas.ts` or a file beside it).
- The tournament: a knockout run entirely by the server (start, each next round after 20 s, result, reset), bots added up to 16, late joiners waiting for the next one, the winners list stored in `DATA_DIR/public/tournament-winners.json`.
- Ready, with the reducer owning who is ready and the server owning the timers.
- The league: `apps/server/src/league.ts` (the month clock with an injected time source and time zone, the score rule, ranking, rollover, storage in `DATA_DIR/league/<month>.json` and `DATA_DIR/league/champions.json`, atomic writes, a damaged file stops the start with its name). Tests for: the score rule (fewer than 20 rounds, more than 20, negative rounds, ties broken by wins and then time), one seat per account, a join without a session refused, rollover at the month's end in the configured time zone including a month without players, a restart in the middle of a month, and that bots never score.
- Stored arenas: the stored form's version rises (it is 4 today); a stored arena of the old kind `public` is dropped at load with one log line (public rooms hold nothing worth keeping), and other arenas load as before.
- Keep at least one room of each public kind alive. `PUBLIC_ARENA_MAX` limits practice and monthly rooms each.
- Check: `bun test`, `bun run type-check`; one real run on port 8973 with a temporary `DATA_DIR`: a visitor through a full practice cycle using Ready, a tournament with 3 scripted humans through both rounds and the reset (the winner appears in `GET /api/champions`), two monthly games for one signed-in account with the standing rising, and a join without a session refused, and a month rollover forced by the injected clock in a test (not by waiting).

## P3b: web

You own `apps/web/**`. Read `11-foundation-guide.md` (section 11) and `60-no-scroll.md`; every screen stays without scroll and passes the audit, and all text follows the overview's text rules.

- `/play` becomes a chooser of the three arenas, each a large tile with a drawing made of tanks, its name, one sentence that says what happens there, and one live line from `GET /api/public` (practice: how many tanks play now; tournament: "starts in 0:42" or "round 2 is running, the next one starts after it"; monthly: the leader and the player's own place). The join step of today (the player's tank, "Change my tank" and the name field from `src/mytank/JoinTank.tsx`) stays on this screen. The page reads `GET /api/public` when it opens and every 5 s while it is visible.
- First-timer default: a device that has never finished a game does not see the chooser first. "Play now" seats it in the practice arena directly (one tap on the join step), and after its first result the page offers the other two arenas in one sentence each. From the second visit on, "Play now" opens the chooser with the practice arena preselected.
- Room: "I'm ready" as the bottom bar's action in a public lobby, with who is ready shown on the players' badges; the tournament's status line and result (round number, who went through, the winner, when the next tournament starts); the monthly room's lobby line with the player's standing and its result line with what the round added ("This game added 12 points. You are 9th this month.").
- `/champions`: the hall of fame. This month's ranking (paged, the player's own row kept in view), the champions of past months with their top 3, and the recent tournament winners. Linked from the chooser and from the monthly and tournament rooms.
- The monthly arena needs a sign-in to play: its tile on the chooser says so, a signed-out visitor who opens it can watch and read the ranking and gets the sign-in action with a return to the same room, and a signed-in visitor joins like anywhere else.
- Names: Practice arena / Arena latihan, Tournament arena / Arena turnamen, Monthly arena / Arena bulanan, champion / juara, and the page `/champions` is called Champions / Para juara. They are in the glossary of `00-overview.md` already.
- Accepted by the lead: at 360 x 640 the chooser shows a tank button beside Play in place of the whole join step, and the button opens the editor, which holds the name.
- Audit states for the chooser, the three rooms in lobby and result, and `/champions` (empty, with data, with 100 rows).
- Check: the audit for your states at every supported size in both languages, and one browser run per arena on a phone in Indonesian: first-timer through practice, then the chooser, a tournament with bots through both rounds, two monthly games and the hall of fame.

## Report (both)

The common report, plus: for P3a the contract as built and every decision this file does not state; for P3b each screen's text in both languages.

## Amended 2026-11-13 (P4a, P4b)

- A public break or result shows only its clock in the status line; the pane's heading says what happened. Every timed public phase must pass the reading-time test (`publicplay/phaseText.test.tsx`: 4 s plus 0.5 s per word within the phase length minus 5 s).
- The monthly result says only what the game added ("This game added 12 points." or "This game added no points."). The month's place is on the Ranking tab and on `/champions`.
- The first-timer offer after the first result is removed; from the first finished game on, "Play now" opens the chooser.
- "I'm ready" also shows on a public result (`readyIsOpen` in `@game/arena` is the one rule, used by the server and the browser).
- The result of every public arena has a quiet link "Other arenas" / "Arena lain" (`publicplay/OtherArenasLink.tsx`, hook `data-other-arenas`) that opens the chooser. Its words are an action's name and are not counted in the reading time.
