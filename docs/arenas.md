# Arenas

An arena is a place where tanks play. The server runs public arenas by itself, and a signed-in account creates a private or a presenter arena. The rules of one round are the same everywhere: every tank acts by its rules on a grid, one move per turn, and shoots water at the others. A hit moves 1 point from the tank that was hit to the shooter. A shot uses water, and the tank's water refills over time. With more than 8 tanks, each round keeps the top half until 8 remain, and one final decides the winner.

## Kinds

| Kind | Who opens it | Tanks | Bots | Rounds start |
|------|--------------|-------|------|--------------|
| Private | A signed-in account, for a friend group. The owner plays too. | The owner sets 2 to 64, default 16 | Fill the free seats up to that number, on by default | By the owner, now or after 1, 2, 3 or 5 minutes |
| Presenter | A signed-in account, for an event. The owner shows the big screen (`/a/:id/screen`), runs the rounds from `/a/:id/host`, and does not play. | The owner sets 2 to 512, default 512 | Off by default | By the owner, now or after 1, 2, 3 or 5 minutes |
| Practice | The server, for "Play now" | 8 people | Always | 30 s after the first player arrives, or 3 s after everyone is ready |
| Tournament | The server: one knockout that starts again and again | 64 people | Always, up to 16 | 60 s, or 5 s after everyone is ready. Each next round starts 20 s after the last. |
| Monthly league | The server: one round per calendar day in `LEAGUE_TIME_ZONE` (`77-monthly-league.md`) | 16 seats per league. A full league opens another one below it. | One bot, only while one tank is seated | 00:00 every day. A day round lasts until 24:00. |

The result of a game stays 20 s in the practice arena and 30 s in the tournament arena, and then a new lobby starts. "Play now" seats a visitor in a practice room that is in its lobby. When no room has a free seat, the server opens a new room. Only when `PUBLIC_ARENA_MAX` rooms exist does the visitor wait in a room whose game runs. A player whose page has been closed for more than 20 s when a game starts does not play and loses the seat.

## Private and presenter arenas

Creating an arena needs an account with an email and a password. An account owns at most one open arena. The owner closes it, or the server removes it after `ARENA_TTL_HOURS` (24 by default) without activity.

The owner sets the game speed, the round length (1, 1.5, 2, 3 or 5 minutes), the round rules (the same rules in every round, or one of six rule sets per round, shown before the round or only when it starts), and who can join: anyone, players with an account, or players with a verified email. With an account, each account has one seat, the owner sees each player's email (nobody else does), and a removed player can be kept out until the owner allows them again. Players tap "I'm ready" in the lobby and the break, which tells the owner ("7 of 12 ready"). The owner always decides when a round starts.

When a game of an owner's arena finishes, the server keeps its result for 180 days at `/r/<id>`: the winner, the final ranking and the round history.

## Monthly league

A signed-in account takes one seat in one league with a name, a look and a strategy. They stay fixed while the tank is seated. A seated tank plays every day round until its owner quits. The first name an account submits in a month stays its name until that month ends.

A tank's monthly score is the average of its points over the days it played from the day's first turn. At the end of a month, the lower half of each league and the upper half of the league below change places. The champion of the month is the first of League 1 with 7 or more counted days. The champion and League 1's top 10 are kept for good on `/champions`.

## Statistics for players

After each round the room's "Stats" tab shows the player what their rules did: shots, shots on target with their share of all shots, how often the tank got hit, squares moved, and the turns each rule ran, with one sentence for a rule that never ran in a mode the tank played. At the end of a game the numbers are the whole game's, and the rule rows are the last round's, because a player may change rules between rounds. The Try it match shows the same card, and the monthly league's "Your tank" shows today's. The engine counts in one place (`packages/engine/src/stats/stats.ts`) as running totals of a fixed size per tank, so a day-long league round costs the same as a short one. A player sees only their own tank's statistics. A signed-in player's games, wins, rounds, shots and hits add up on the "My tank" page.

## Saving and restarts

The server saves every arena to the table `arena` in `DATA_DIR/algotank.sqlite` and loads the table at start, so a game continues after a restart. A round that was running at the restart counts for nothing and starts again. A damaged row stops the start, and the message names the table and the arena code. The JSON folders of earlier versions are not read: the start names them in one log line and leaves them.
