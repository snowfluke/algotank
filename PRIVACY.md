# Privacy

This file describes what a server of AlgoTank stores, where, and for how long, and what stays in the player's browser. It is written for a person who hosts the game and for a parent. It is a description of the code, not legal advice. The person who hosts a server decides how to run it and is responsible for it.

The server keeps everything in one SQLite database, `DATA_DIR/algotank.sqlite` (`docs/settings.md`). The database file and its `-wal` and `-shm` files have mode 0600 in a folder with mode 0700, so only the user that runs the server can read them. A backup made with `bun run backup` holds the same data and also has mode 0600. The tables below name the table that holds each kind of data.

## Without an account

A player can play in the practice arena, the tournament arena and most private or presenter arenas without an account. The player gives a tank name (or takes one that the game makes) and a tank look. The server does not ask for an email, an age or a real name.

## Accounts

| What | Stored | How long |
|------|--------|----------|
| Email address | In the table `account`, trimmed and in lower case | Until the person who hosts the server removes it. The game has no route that deletes an account. |
| Password | Only as an argon2id hash (`Bun.password`), never as the password itself | As long as the account |
| Whether the email is verified, and when the account was made | In the table `account` | As long as the account |
| Sessions | In the table `session`, as a SHA-256 hash of the session token, so a copy of the database signs nobody in. An account has at most 10 sessions. | 30 days, or until the player signs out or resets the password |
| Email codes (verify, reset) | In the table `email_code`, as an argon2id hash, with the expiry and the count of wrong tries. The code itself is never stored or logged. | 15 minutes, or until 5 wrong tries |

The browser keeps the session in one cookie, `algotank_session`. It is `HttpOnly` and `SameSite=Lax`, it lasts 30 days, and with `COOKIE_SECURE=1` the browser sends it over HTTPS only.

When the server has mail settings, it gives the email address and the code to the mail server in `SMTP_HOST` to send the email. That mail server belongs to whoever the host chose, for example Gmail.

## Arenas

| What | Stored | How long |
|------|--------|----------|
| An arena: its name, settings, each player's tank name, look, rules and points, and the rounds of the current game | The table `arena`, one row per arena | A private or presenter arena: until the owner closes it, or after `ARENA_TTL_HOURS` (24 by default) with no activity. A public arena is never removed by time. |
| Each player's token, which lets that browser act as that player | In the same row, as plain text | As long as the arena, or until the owner removes the player |
| Which account holds which seat, in an arena for players with an account | In the same row, as account ids | As long as the arena |
| Chat lines: the text, the time, and the sender's tank name and look | The table `chat_line` | 24 hours, at most 500 lines per arena. Closing or removing the arena removes its chat. When the owner removes a player, the server removes that player's lines. |
| The result of a finished game of a private or presenter arena: arena name, tank names, looks, rounds and ranking | The table `result`, with account ids but never an email | 180 days. Anyone with the link can open it. |

The owner of an arena for players with an account sees the email address of each player in it, and the email of each player in that arena's stored results. Other players never see an email.

## Things an account keeps

| What | Stored | How long |
|------|--------|----------|
| "My tank": one tank name and look | The table `account_tank` | As long as the account. There is no delete. |
| Saved play styles (rules), at most 20 | The table `account_strategy` | Until the player deletes them |
| Statistics: the number of games, wins, rounds, shots and hits, in total and for each of the last 12 months the account played in | The tables `account_stats` and `account_stats_month`, written at the end of a round | As long as the account. There is no delete. |

A round counts for an account when its player joined the arena while signed in. A tank's statistics of a round (its numbers, its mode names and how often each rule ran) go only to that player's own page. They are never in what other players, viewers or the big screen receive. The arena's statistics are kept in memory and a restart forgets them. The monthly league keeps each seat's statistics of today in the table `league_checkpoint`, and a quit or a new day clears them. The monthly league does not add to an account's statistics.

## Public records

| What | Stored | How long |
|------|--------|----------|
| The last 50 tournaments won by a person: tank name, look, date, number of tanks | The table `tournament_winner` | Until 50 newer wins replace it |
| Monthly league seats: account id, tank name, look and rules, and each account's name of the month | The tables `league_seat`, `league_name` and `league_move` | Until the owner of the seat quits |
| The league's days: each tank's counted days and each finished day's top 3 | The tables `league_day_score` and `league_day_record`, and today's points in `league_checkpoint` | No code removes them |
| The champion of each month and League 1's top 10: tank name, look and score | The tables `champion_month` and `champion` | For good |

The champions and the tournament winners are public on `/champions`. The monthly league's rankings, with tank names and looks, are public on `/monthly` (`docs/specs/revamp/77-monthly-league.md`).

A data folder of an earlier version can still hold JSON folders such as `auth/` or `arenas/`. The server does not read them, logs one line at start that names them, and leaves them as they are. The host removes them.

## Addresses and logs

The server reads each visitor's network address to limit sign-ins, sign-ups, email codes, seats and joins. It keeps these counters in memory only, and a restart clears them. It writes no address to the database.

The server prints to its standard output when it starts, when a request fails (the method and the path of the request, and the error), and when an email cannot be sent (the account id and the error). Where those lines go depends on how the host runs the server, for example the systemd journal.

## Usage numbers

The server counts what happens each day, so the host can see whether people play: visitors, page opens by page, arenas created, joins, games and rounds by arena kind, tanks per round, new and verified accounts, sign-ins, monthly seats taken and given up, chat lines, the most open connections at once, the language shown, rules with steps saved, and how far new devices get on their first visit. Each number is a count for one day and nothing else. No count holds an address, an account, a name, an arena code or any text a person typed.

The numbers go to the table `metrics_counter`, one row per day and counter, and the server removes a row after 400 days. Only the accounts named in `ADMIN_EMAILS` can read them, on `/admin/metrics`. No outside tracker, script or cookie is used for counting.

To count a visitor once a day, the server keeps a hash of the network address, the browser's User-Agent and a random value in memory for that day only. The random value changes every day, and neither it nor any hash is written to the database. A restart forgets them, so a visitor who comes back after a restart counts again.

The page sends `POST /api/metrics/event` with a name and a label from a fixed list, such as "page opened: home". `GET /metrics` gives the host's monitor numbers about the server (memory, open connections, turn times, requests by group), only with `METRICS_TOKEN`.

## In the browser

The page stores these values in the browser's `localStorage`. They never leave the device, except where the table says so.

| Key | Holds |
|-----|-------|
| `arena:<code>:player-session` | The player id and token in that arena, so a reload keeps the same seat |
| `arena:<code>:strategy-draft`, `arena:<code>:new-seat` | Rules not saved yet, and whether a new seat waits for the play style used last. `arena:monthly:strategy-draft` holds the tank prepared for the monthly arena; it goes to the server when the player puts the tank in. |
| `algotank:language`, `algotank:sound`, `algotank:tours` | The language, the two sound switches (music and sound effects), and which tours for first-time players are done |
| `algotank:my-tank`, `algotank:last-name`, `algotank:last-colour` | "My tank" on this device. A signed-in player's copy also goes to the server. |
| `algotank:workshop:play-styles` | The play styles of the tank workshop. A signed-in player's copy also goes to the server. |
| `algotank:last-style`, `algotank:play-with-request`, `algotank:finished-game` | The play style used last, one that "Play now with it" asked for, and whether this device finished a game |
| `algotank:first-visit-path` | The steps of the first visit this device already reported to the usage numbers, so it reports each step once. The list itself is never sent. |

The page loads its fonts, pictures and code from the server that hosts the game, and makes no request to another site. A test of the home page, `/play`, the tank workshop and a result page with a browser saw no request to another site. The "Support" window links to GitHub Sponsors, which opens only when the player presses it.

## Where this comes from

| Topic | Source |
|-------|--------|
| Accounts, sessions, cookie | `apps/server/src/auth/store.ts`, `auth/routes.ts`, `auth/request.ts` |
| Email codes and mail | `apps/server/src/auth/codes.ts`, `auth/email-routes.ts`, `apps/server/src/mail.ts` |
| The database and its tables | `apps/server/src/db/schema.ts`, `db/open.ts`, `db/backup.ts` |
| Arenas and their lifetime | `apps/server/src/arena-rows.ts`, `store.ts`, `arena-lifetime.ts`, `packages/arena/src/stored-arena.ts` |
| Chat | `apps/server/src/chat.ts`, `packages/arena/src/chat-protocol.ts` |
| Results | `apps/server/src/results.ts`, `packages/arena/src/results-protocol.ts` |
| My tank, play styles | `apps/server/src/account-tank.ts`, `account-strategies.ts` |
| Statistics | `apps/server/src/stats/`, `packages/arena/src/stats-protocol.ts` |
| Public records | `apps/server/src/tournament-winners.ts`, `apps/server/src/monthly/` |
| Browser storage | `apps/web/src/session/storage.ts`, `app/preferences.ts`, `workshop/library.ts` |
| Usage numbers | `apps/server/src/metrics/`, `packages/arena/src/metrics-protocol.ts`, `apps/web/src/metrics/track.ts` |
