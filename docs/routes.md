# HTTP routes

The full list with request and answer types is at the bottom of `packages/arena/src/types.ts`. The monthly league's routes are listed in `packages/arena/src/monthly-protocol.ts`. "Account" means the sign-in cookie. A request that changes state with it must send an `Origin` header that matches the host.

A strategy is data. The server runs no player code, and it does not call a player's service.

## Accounts

| Route | Who | Does |
|-------|-----|------|
| `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` | anyone | Accounts and sessions (`packages/arena/src/auth-protocol.ts`). A sign-up says whether its verification code went out (`verificationEmail`). |
| `GET /api/auth/capabilities` | anyone | `{ canSendEmail }`: whether the server has mail settings. |
| `POST /api/auth/verify/send`, `POST /api/auth/verify` | account | A new verification code (1 a minute, 5 an hour), and the code that marks the email verified (15 minutes, 5 wrong tries). |
| `POST /api/auth/reset/send`, `POST /api/auth/reset` | anyone | "Forgot password": the same answer for every valid email. The code with a new password signs this browser in and ends the account's other sessions. |
| `GET`, `PUT /api/account/tank` | account | "My tank": `{ "name", "look", "updatedAt" }`. The newer copy wins, so an older one answers 409 `tank_stale`. The name follows the same rule and block list as a join (`packages/arena/src/account-tank-protocol.ts`). |
| `GET /api/account/stats` | account | The account's statistics: games, wins, rounds, shots and hits in total and for each of the last 12 months it played in, or `{ "stats": null }` (`packages/arena/src/stats-protocol.ts`). A round counts for an account when its player joined with the account's cookie. |
| `GET /api/account/strategies`, `PUT`, `DELETE /api/account/strategies/:id` | account | The play styles the account saved in the tank workshop, at most 20 (`packages/arena/src/strategies-protocol.ts`). A `DELETE` answers 204 also when the play style does not exist. |
| `GET /api/account/arena` | account | The account's open arena, or null. |
| `GET /api/account/results` | account | The account's stored results, newest first. |

## Private and presenter arenas

| Route | Who | Does |
|-------|-----|------|
| `POST /api/arenas` | account | Creates a private or presenter arena. 409 `arena_limit` with the open arena's id when the account owns one. 400 `mail_off` for the join policy "verified" on a server without mail settings. |
| `POST /api/arenas/:id/rounds` | owner | Adds bots when bots are on, in the lobby, then starts the round. |
| `POST`, `DELETE /api/arenas/:id/rounds/schedule` | owner | `{ "minutes": 1 }` (1, 2, 3 or 5) starts the round after that time, in a lobby or a break. Every viewer gets the time left in the arena's `auto`. With too few players at that time the plan becomes `missed`. `DELETE` stops the countdown. A server restart drops a scheduled start. |
| `GET /api/arenas/:id/accounts` | owner | In an arena for players with an account: each seat's email and the accounts kept out. 404 in an arena anyone may join. |
| `DELETE /api/arenas/:id/bans/:accountId` | owner | "Allow again" for an account kept out. 404 `not_banned`. |
| `POST /api/arenas/:id/reset` | owner | After the final: a new game with the same people and no bots. |
| `PATCH /api/arenas/:id/settings` | owner | Changes a setting in the lobby, for example `{ "botFill": true }`. |
| `DELETE /api/arenas/:id` | owner | Closes the arena. Open streams get a `closed` message. |
| `DELETE /api/arenas/:id/players/:playerId[?ban=1]` | owner | Removes a player in the lobby or a break. In a break the player is out of the game and keeps their name in the round history. The player's token stops working. Without `ban` the player may join again. `ban=1` keeps the account out, in an arena for players with an account only (400 `ban_unavailable` elsewhere). The player's chat lines are removed too, and the chat's readers get `chatRemoved`. |
| `GET /api/arenas/:id/chat` | player, or owner | The newest 100 chat lines younger than 24 hours, oldest first (`packages/arena/src/chat-protocol.ts`). A public arena answers 404 `no_chat`. A chat the owner turned off answers 409 `chat_off`. |
| `POST /api/arenas/:id/chat` | player, or owner | `{ "text" }`: one line of 1 to 200 characters, sent to the players' and the owner's streams. The owner without a player token writes as the host. 409 `chat_closed` while a round runs, 409 `chat_off`, 400 `chat_text_invalid`, 422 `chat_text_blocked`, and 429 `chat_too_fast` (5 at once, then 1 every 3 seconds per sender) or `chat_busy` (20 at once, then 5 per second per arena) with `retryAfterMs`. |
| `PUT /api/arenas/:id/chat` | owner | `{ "on": true }` or `false`, in any phase. |
| `GET /api/results/:id` | anyone with the link | A stored result (`packages/arena/src/results-protocol.ts`): names, looks, every round and the final ranking. The arena's owner also gets each player's email. 404 after 180 days. |

## Every arena

| Route | Who | Does |
|-------|-----|------|
| `GET /api/arenas/:id`, `/events`, `/rounds/:round/replay` | anyone | The arena, its event stream, and replays of the current game. An arena that ended answers 404 with the `resultId` of its last stored result while that is kept. Only a stream opened with a player token or the owner's cookie gets the chat messages `chat` and `chatRemoved`. `/events?chat=0` sends no chat at all (the big screen uses it). A stream opened with a player token gets `stats`, that player's own statistics, at each round's end just before the arena message and on connect while the game lasts; no other stream gets it (`packages/arena/src/stats-protocol.ts`). |
| `POST /api/arenas/:id/players` | anyone; an account in an arena for players with an account | Joins with `{ "name", "look" }`. Without `name` the game gives a two-word name. A name has 3 to 16 letters, digits and single spaces. A name with a blocked word answers 400 `name_blocked` with a `suggestion`. In an arena for players with an account: 401 `not_signed_in`, 403 `banned`, 403 `email_not_verified` (verified email only), and an account that already has a seat there gets the same seat back with a new token (the old token stops working), so the player can move to another device. A seat the host removed in a break answers 409 `wrong_phase`. 1,200 per minute per address, because the phones at a venue share one address. |
| `POST /api/arenas/:id/players/me/leave` | player | Leaves, in the lobby only. |
| `POST /api/arenas/:id/players/me/ready` | player | "I'm ready", in the lobby or on the result of a public arena, and in the lobby or a break of a private or presenter arena (a player who plays the next round). In a public lobby, when every person is ready, the countdown drops to the short time. Ready on the result carries into the next lobby. In an owner's arena it only tells the owner. |
| `DELETE /api/arenas/:id/players/me/ready` | player | Takes "I'm ready" back, in a private or presenter arena only. |
| `PATCH /api/arenas/:id/players/me` | player | `{ "look" }`, outside a running round. |
| `GET`, `PUT /api/arenas/:id/players/me/strategy` | player | Reads or saves the player's strategy. A save answers 400 with the list of errors, and is refused while a round runs that the player plays in. |

## Public arenas and the server

| Route | Who | Does |
|-------|-----|------|
| `POST /api/public/seat` | anyone | Body `{ "kind": "practice" }` or `"tournament"`: the public arena of that kind to open. Practice: a room in its lobby with a free seat, else a new room, else (at `PUBLIC_ARENA_MAX` rooms) a room whose game runs. The tournament is always the one arena. 30 per minute per address. |
| `GET /api/public` | anyone | One status line per public kind (`packages/arena/src/public-protocol.ts`). |
| `GET /api/champions` | anyone | The champions of past months with their top 10, and the last 50 tournaments that a person won. |
| `GET /api/health` | anyone | `{ "ok": true, "startedAt", "arenas" }`: the server's start time (ISO 8601, UTC) and the number of open arenas. It reads no file, for a proxy's or a monitor's check. |

## Monthly league

| Route | Who | Does |
|-------|-----|------|
| `GET /api/monthly`, `GET /api/monthly/leagues/:league/events`, `.../ranking`, `.../days` | anyone | The leagues, one event stream per league (the state, then each turn), today's and this month's ranking, and this month's finished days. With the sign-in cookie, a turn carries the account's own tank's decision while its seat plays in that league, also for a seat taken after the stream opened. A league that the month close empties sends `closed` with the number of leagues left and ends its stream. |
| `GET /api/monthly/me`, `POST`, `DELETE /api/monthly/seat`, `PUT /api/monthly/name`, `POST /api/monthly/me/move-seen` | account | The account's seat (with its strategy and today's statistics, `seat.stats`): take one with `{ name?, look, strategy }`, quit, rename once in a new month, and mark the month close's move as seen. Seat, quit and rename share a limit of 12 per minute per account, then answer 429 `rate_limited` with `retryAfterSeconds`. |

## Usage numbers and health

| Route | Who | Does |
|-------|-----|------|
| `POST /api/metrics/event` | anyone | Body `{ "name", "label" }` from the lists in `packages/arena/src/metrics-protocol.ts` (a page open, the language, a first-visit step): 204, 400 for any other name or label. 600 per minute per address. |
| `GET /api/admin/metrics?from=&to=` | account in `ADMIN_EMAILS` | The day counts from `from` to `to` (YYYY-MM-DD, at most 400 days; the last 30 days without them). Everyone else gets the 404 of a route that does not exist. |
| `GET /api/admin/players` | account in `ADMIN_EMAILS` | Every tank seated in the monthly arena, League 1 first in the month ranking's order, with its owner's email, whether it is verified, and when the account was made. Everyone else gets the 404 of a route that does not exist. |
| `GET /metrics` | `Authorization: Bearer <METRICS_TOKEN>` | Server health in the Prometheus text format; 401 without the token. Without `METRICS_TOKEN` the route does not exist. |
