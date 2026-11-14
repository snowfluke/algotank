# Work package B2: arena kinds, ownership, bots, public arenas (arena package and server)

Read `00-overview.md` first, then `20-auth.md` (already built: `createAuth`, `Auth.accountOf`, `Auth.requireAccount` in `apps/server/src/auth/`). This package changes the arena contract and the server. A web package (W2) builds the screens on it afterwards.

## You own

`packages/arena/**`, `apps/server/**` except `apps/server/src/auth/**` (import from it; if its rate limiter is generic, reuse it, and if a change there is needed, list it). In `apps/web` you may make only the smallest edits that keep the web client compiling and its tests passing against the new contract (`src/api/client.ts`, `src/session/storage.ts`, fixtures, and the create and host pages, which W2 replaces afterwards); make `apps/web/src/tank/colours.ts` take the colour count and type from `@game/arena`. Do not touch `src/editor`, `src/prep`, `src/vocabulary`, `src/board`, `src/practice`, `src/sound` or `src/water`: other engineers are working there now. Also update `README.md` (run instructions, environment variables, routes).

## Arena kinds

| | private | presenter | public |
|---|---------|-----------|--------|
| Created by | a signed-in account | a signed-in account | the server |
| Owner plays | yes (joins like any player) | no | no owner |
| Found by | code, link, QR | code, link, QR | `POST /api/public/seat` |
| Most players | 16 | 64 | 8 |
| Bots fill empty seats up to 8 | setting, default on | setting, default off | always |
| Player names | free text | free text | given by the server |
| Rounds start | owner | owner | the server, on a countdown |
| After the final | owner can reset for a new game | owner can reset | the server resets |

`maxPlayersOf(kind)` in the arena package is the one place for the capacity.

## State machine (replace the table at the top of `packages/arena/src/types.ts`)

Terminal state: none inside the reducer. An arena ends when it is closed or expires, which removes it from the store.

| From | To | Actor | Guard |
|------|----|-------|-------|
| lobby | running | owner, or the server in a public arena | at least 2 players after bots were added; the rule set fits the mode and the lobby |
| running | break | engine | last turn played, not the final; the next announcement fits the mode |
| running | finished | engine | last turn played, the final |
| running | lobby or break | engine | the round failed (as today) |
| break | running | owner | the rule set fits the mode and the break |
| finished | lobby | owner, or the server in a public arena | none. Removes every bot, sets every remaining player to "playing", clears the rounds, raises `game` by 1, takes the announcement for the new lobby |

Player actions:

| Action | Allowed | Guard |
|--------|---------|-------|
| join | lobby in every kind; any phase in a public arena | name valid and free, arena not full; a player who joins a public arena outside the lobby gets the status "waiting" and plays from the next game |
| add bots | lobby | server only; capacity |
| remove players | lobby | server only (bots at a reset are removed by the reset itself; this event prunes absent players in a public arena and serves "leave") |
| leave | lobby | the player's own token |
| set colour | lobby, break, finished | the player's own token |
| submit strategy | any phase | rejected only while a round runs that this player plays in, and for an eliminated player before the arena is finished |

## Contract changes (`packages/arena/src/types.ts`)

```ts
export const TANK_COLOUR_COUNT = 8;
export type TankColour = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ArenaKind = "private" | "presenter" | "public";

export interface ArenaSettings {
  readonly name: string;            // "" for a public arena; the client shows a translated "Public arena"
  readonly kind: ArenaKind;
  readonly ticksPerRound: number;
  readonly tickMs: number;
  readonly inputMode: InputMode;    // "editor" always for a public arena
  readonly ruleSetMode: RuleSetMode;
  readonly botFill: boolean;        // bots fill the seats up to FINAL_SIZE when a game starts
}

export type PlayerStatus = /* as today */ | { readonly kind: "waiting" };

export interface Player { /* as today, plus: */ readonly isBot: boolean; readonly colour: TankColour }
export interface PublicPlayer { /* as today, plus: */ readonly isBot: boolean; readonly colour: TankColour }

export interface Arena { /* as today, plus: */ readonly game: number /* 1 for the first game, +1 at each reset */ }

/** What the server will do by itself and when. `inMs` is measured at the moment the message is sent. */
export type AutoStep = { readonly action: "start" | "reset"; readonly inMs: number } | null;
export interface PublicArena { /* as today, plus: */ readonly game: number; readonly auto: AutoStep }

// Events: join gains `colour` and `status` is derived from the phase; new events
// addBots { bots: readonly { playerId, name, strategy, colour }[] }, removePlayers { playerIds },
// setColour { playerId, colour }, reset { nextRuleSetId }.
// New errors: "not_owner" is not an arena error (it is HTTP 403); add "colour_invalid".

export interface CreateArenaRequest {
  readonly kind: "private" | "presenter";
  readonly settings: Omit<ArenaSettings, "kind">;
}
export interface CreateArenaResponse { readonly arenaId: ArenaId }
export interface JoinRequest { readonly name?: string; readonly colour: TankColour }   // name is ignored in a public arena
export interface JoinResponse { readonly playerId: PlayerId; readonly playerToken: string; readonly name: string }
export interface OwnArenaResponse { readonly arena: { readonly id: ArenaId; readonly kind: ArenaKind; readonly name: string } | null }
export interface PublicSeatResponse { readonly arenaId: ArenaId }

// StreamMessage: roundStart gains `startsInMs` (the pause before the first turn);
// new message { type: "closed" } sent once before the server ends the stream of a closed or expired arena.
```

Routes (session cookie = the account from `auth.requireAccount`; player token as today):

| Route | Who | Does |
|-------|-----|------|
| `POST /api/arenas` | account | Creates a private or presenter arena owned by the account. 409 with code `arena_limit` and the existing `arenaId` when the account already owns an open arena. |
| `GET /api/account/arena` | account | `OwnArenaResponse`: the account's open arena, or null |
| `POST /api/arenas/:id/rounds` | owner | Adds bots first when `botFill` is on, the phase is the lobby and fewer than 8 players joined; then starts the round |
| `POST /api/arenas/:id/reset` | owner | finished to lobby |
| `PATCH /api/arenas/:id/settings` | owner | `{ botFill }`, in the lobby only |
| `DELETE /api/arenas/:id` | owner | Closes the arena: sends `closed`, ends its streams, stops its round, removes the record and the file |
| `POST /api/public/seat` | anyone | `PublicSeatResponse`: the public arena this visitor should join |
| `POST /api/arenas/:id/players` | anyone | Join with a colour (and a name, except in a public arena) |
| `POST /api/arenas/:id/players/me/leave` | player | Lobby only |
| `PATCH /api/arenas/:id/players/me` | player | `{ colour }` |
| the existing GET arena, events, strategy and replay routes | as today | |

A request by a signed-in account that is not the owner gets 403 with the error code `not_owner`. The host key and the host token no longer exist: remove `HOST_KEY`, `hostToken` and their checks everywhere.

## Rules

- One open arena per account: an account owns at most one arena record. Closing or expiry frees it. This rule lives in the store.
- Expiry: a private or presenter arena is removed when nothing happened in it for 24 hours (`ARENA_TTL_HOURS`, default 24): no event, no running round. A sweep runs every 10 minutes and at start. Expiry does what closing does.
- Stored form: version 2 with `ownerAccountId: string | null` (null for public) and `lastActivityAt`. Arena files move to `DATA_DIR/arenas/`. A version 1 file stops the start with a message that names the file and says it comes from an older version.
- Bots (`apps/server/src/bots.ts`, one table): a bot is a player with `isBot: true`, a name from a list of friendly water names (for example Splashy, Bubbles, Drizzle, Puddle, Ripple, Misty, Geyser, Soaker; at least 16, never a name a human in the arena has), a preset strategy and the least-used colour. The mix must let a beginner win sometimes: of 7 bots, 3 play weak presets (charger, random-walker), 3 play middle presets (backstabber, picker, ambusher) and 1 plays a strong one (leader-chaser or evader). Keep the mix as data so it can be tuned. Bot ids must not collide with player ids. Bots have no token.
- Start with one human: with `botFill` on, one human is enough, because bots bring the count to 8. With it off, the reducer's guard (2 players) answers `not_enough_players`.
- Pause before the first turn: after `roundStart` the server waits 3 seconds (`ROUND_START_DELAY_MS`) before the first turn, and `roundStart.startsInMs` says so, so clients can show a countdown while players find their tank. A viewer who connects during the pause gets the remaining time.
- Public arenas (`apps/server/src/public-arenas.ts`): the server keeps at least one. Settings: standard rules, 150 turns at 400 ms, bots on. Cycle: in the lobby, a 20 second countdown runs while at least one human player is in the arena; at its end bots are added and the round starts; after the final the result stays 15 seconds; then the reset. `PublicArena.auto` carries the next step and time for these arenas and is null for the others. With no human player the arena idles in the lobby without timers. At each reset, a human player whose event stream has been closed for more than 3 minutes is removed. `POST /api/public/seat` returns the public arena with the most human players that still has a free seat (8 humans at most), and creates a new public arena when all are full, up to 20 (`PUBLIC_ARENA_MAX`); beyond that it answers 503 with a plain sentence. An extra public arena with no human player is removed at its reset. After a restart the timers are armed again.
- Public arena names: the server gives each player a name from two word lists (for example "Brave Otter"), unique in the arena, and ignores the `name` in the request. Reason: free text shown to strangers is not safe for children.
- Presence: the stream hub can say when each player's last stream closed, and whether one is open.
- Rate limits, per client address: `POST /api/public/seat` and joins, 30 per minute each.
- `toPublicArena` takes the auto step as an argument; the reducer never reads a clock.
- The static file handler serves the client's `index.html` for every non-API path (the client has new routes: `/join`, `/play`, `/new/private`, `/new/presenter`).

## Check

- `bun test` for `packages/arena` and `apps/server`, and `bun run type-check` for all four projects, are clean at the end (the web may be red only in folders other engineers are editing now; say which).
- Tests through the public interface for: every row of both tables above, accepted and rejected; the arena limit and its release by closing and by expiry (inject the clock); ownership (another account gets 403, no session gets 401); bots (the mix, names, colours, removal at reset, a start with one human); the pause before the first turn; a full public cycle with a fake scheduler (countdown, bots, round, result, reset, pruning, idle with no humans, a second arena when the first is full, removal of an empty extra arena); the stored form, a restart in each phase, and a version 1 file; `closed` reaching open streams.
- One real run on port 8952 with a temporary `DATA_DIR`: register an account (the auth routes exist), create a private arena, try a second one (409), join with a colour, start with one human and bots, wait for the result, reset, close; and one visitor through `/api/public/seat` for a full public cycle. Stop the server by its PID, confirm the port is closed, remove the directory by its literal path.

## Report

The common report, plus: the final contract as it now stands (types and routes) for the web engineers, every decision you took that this file does not state, and the web files you had to touch.
