# Work packages M1 (engine, arena, server) and M2 (web): the monthly arena becomes a league that always runs

Read `00-overview.md` first, then `67-public-arenas.md` (the monthly column and "Monthly score" are replaced by this file; practice and tournament arenas do not change).

Owner, 2026-11-14: "monthly arena is long running arena. 1 round lasted 24h. Once people joined, it will be there always until people decide to quit and change the tank. A name submitted for monthly arena can only be change in the next month. Bot is only one, and it present if the only joined tank is just 1 tank in the arena." And: a joined tank plays every round and continues into the next month by itself; "The monthly winner is average winner from each day"; the arena runs when people quit; it is "public view only for those who wants to watch, it displayed in a like a presenter way"; the home page has an entry to watch it live; "If the maximum player is reached, it spawn another monthly arena, this time with tiering, promotion and demotion between monthly arena. Half could be promoted and half could be demoted".

## Words

| Word | Meaning | Indonesian |
|------|---------|------------|
| League | One monthly arena. League 1 is the top one. | Liga 1, Liga 2 |
| Seat | One account's tank in a league: name, look, strategy, upgrades | |
| Day round | The one round a league plays on one calendar day in `LEAGUE_TIME_ZONE` | Ronde hari ini |
| Counted day | A day round that goes into a tank's monthly score | |

## 1. Seats

- Only a signed-in account takes a seat (as today). One seat per account over all leagues. The seat belongs to the account on any device.
- Taking a seat submits the name, look, strategy and upgrades. Since 2026-11-16 "Change rules" gives the seated tank new rules in place (its points stay), and "Change look" its look.
- The name: the first name an account submits in a month stays its name until that month ends, also after quit and rejoin. From the first day of a later month the owner can change it once; that name is then fixed for that month. The block list and "a name already used in the league is refused" apply.
- Quit: the tank leaves the board at the next turn. Its counted days of the month stay.
- A seated tank plays every day round and stays seated when the month changes.
- A new seat goes to the lowest league that has a free seat. When every league is full, a new lowest league opens. A league has 512 seats (`MONTHLY_SEATS`, one constant; 16 until 2026-11-16, raised so a month's players share one board and one ranking). The board is sized for the tanks seated, at least 16 (`boardTanksFor` in `league-day.ts`), at every new round; a seat that brings the tanks past 1.5 times the board's size rebuilds the round at once, so a rush of joiners never fills the board.
- Nothing removes a seat except its owner's quit (no "page was open" rule, no absence rule, no arena lifetime sweep). Named limit: a tank whose owner never returns stays.

## 2. The day round

| Topic | Decision |
|-------|----------|
| Length | From 00:00 to 24:00 in `LEAGUE_TIME_ZONE`, one turn every 0.9 s (86,400 s / 0.9 s = 96,000 turns). The day ends by the clock, not by a count; `ticksTotal` is the number of turns planned for the day, so the "time left" condition keeps working. |
| Day start | Every seated tank respawns with full water and 0 points. |
| Join during the day | The tank appears on a free square at the next turn and plays at once. That day is not a counted day for it. |
| Quit during the day | The tank leaves at the next turn. When it was seated at the day's first turn, the day is a counted day with the points it had when it left, so quitting cannot erase a bad day. |
| Board | A fixed size for 16 tanks; it does not change when tanks come and go. |
| New start | Rolling, one tank at a time (owner, 2026-11-19: "Rework the arena shuffling to be smooth, non-interruption of the play, natural"). The round never starts again for a new start. Each tank gets a fresh start once every 333 turns (5 minutes at 900 ms a turn), on its own turn: the tanks take turns in a fixed rotation, so about one tank in every 333 / N turns (N tanks on the board; more than one per turn when N > 333). A fresh start moves the tank through a tunnel to a random free square, with full water, a new tie rank, no running step sequence, and its points and statistics kept. The other tanks play on. Before 2026-11-19 the whole round started again every 333 turns, which stopped every fight at once. The reason for a new start is unchanged: added 2026-11-14 after the owner saw two or three tanks lock into one loop for most of a day (`RESHUFFLE_TURNS` in `apps/server/src/monthly/league-day.ts`). |
| Bot | The table below. A bot never appears in a ranking. |
| Ties | A rule's target is settled by a tie rank that the engine draws for each tank at each join (`BotState.tieRank`), and some rules by the board's tank order; the league seats the tanks in a random order at every new round, and a fresh start draws the tank's tie rank again and puts it last in the board's order. So each tank's tie rank changes every 5 minutes. Before 2026-11-16 a tie went to the lower seat id, which a seat keeps all month: in a mixed field of 8 play styles that was worth up to about 400 points per 8,000 turns. After the change, the same seeds gave every play style the same points whichever id it held. Other arenas keep the id rule. |
| Kept per turn | Nothing. No replay and no turn history for a day round; a viewer who opens the page gets the current state and then each turn. |

Changed 2026-11-14 at the owner's request ("spawn and de-spawn bots every N minutes"): the bots are drawn again at a new day, at a restart and at a rebuild. Since 2026-11-19 a bot's fresh start replaces that bot: it leaves through the tunnel and a newly drawn bot comes out of another tunnel, or no bot when the table below allows 0. Each bot takes a random play style from the practice arena's bot mix (`apps/server/src/bots.ts`, `BOT_LINEUP`). A player keeps the points won from or lost to a bot.

| Seated tanks | Bots at each draw |
|--------------|-------------------|
| 0 | None. No turn is simulated. The league exists and its page shows the empty board. |
| 1 | 1 to 3. A draw of 0 is raised to 1, so the tank always has an opponent. When a quit leaves one tank without a bot, one bot joins at once. |
| 2 or more | 0 to 3. A tank that arrives does not remove the bots; each bot changes at its own fresh start. |

Engine: joining and leaving happen between turns, as new functions beside `stepRound` (for example `joinRound(state, player)` and `leaveRound(state, id)`). A round that never calls them plays as before; the existing replay tests must stay identical.

Restart (every release restarts the process): the server writes a checkpoint per league every minute and at a clean stop: the day, and per seat the points of today and whether the day counts. At start it resumes the day with a new engine round, the tanks respawn and keep their points. Lost and named: positions, water, a running step sequence, and after a crash up to 60 s of points. Turns are not made up for the time the server was down.

## 3. Score (one pure function, one file)

- Day score of a tank: its points at the day's end, or at its quit.
- Counted day: the tank was seated at the day's first turn (see section 2).
- Monthly score: the average of the tank's counted day scores of the month, to one decimal.
- Ranking in a league: tanks with `MONTHLY_RANKED_DAYS` or more counted days first, by monthly score; then tanks with fewer, by monthly score, marked as not ranked yet. Ties: more counted days, then the earlier seat. The minimum was 7 and is 1 since 2026-11-16 (owner: "make it fair so that people who joined between 17-30 still has chance"): one day is 96,000 turns, and five simulated days of one field gave each play style's day points a spread (sd) of 76 to 367 against gaps of hundreds to thousands between styles. Close rivals can swap places on one day's luck, and a tank's days are played against the field of those days.
- The month's champion is rank 1 of League 1 when it has `MONTHLY_RANKED_DAYS` or more counted days; the champion and League 1's top 10 are stored for good (the existing champions store and `/champions`). A month without such a tank records no champion.
- Each finished day also keeps its winner and top 3 per league for the month ("Juara hari ini").
- One sentence explains it to a player: "Skor bulananmu adalah rata-rata poin dari hari-hari yang tank kamu ikuti sejak awal hari."

The owner may still choose "average place" over "average points"; that must be an edit in this one function.

## 4. Month close: promotion and demotion (one pure function with table tests)

Computed from the final rankings of the month, before any move:

1. Between each pair of neighbouring leagues, the lower half of the upper league and the upper half of the lower league change places. The number that moves is the same in both directions: the smaller of the two halves (16 and 16 seats: 8 move each way; 16 and 5 seats: 2 move each way).
2. Then free seats are filled from the league below in ranking order, so only the last league has free seats. A league left empty closes.
3. With one league nothing moves.

Each seat keeps what happened to it for the owner to see once: went up, went down, stayed.

## 4b. What everyone may read (owner, 2026-11-17)

- A game master's tank (the organizer's, "GM") always has open rules: its sheet shows them.
- Every tank's rules as they stood at a month's close open to everyone at that close, from
  December 2026 on (`FIRST_PUBLISHED_RULES_MONTH`); November 2026 began with private rules, so its
  close opens nothing. A tank that quit before the close is not in the copy.
- Each tank's numbers of a finished day (turns, shots, hits, times hit, squares moved) are open;
  the rule counts are not, because they show how the rules are written.
- The server enforces this (monthly/disclosure.ts, monthly-protocol.ts has the state table); the
  page opens a tank's sheet from a ranking row, and a published month's list from its card on
  the champions page. The About list, the rules step and the month-close notice say it.

## 5. Contract and server (M1)

You own `packages/engine/**`, `packages/arena/**` (monthly parts), `apps/server/**` (monthly parts), and in `apps/web/**` only what the contract change breaks. Shapes are yours; type everything, validate at the boundary, and put the state tables in the file headers before the code (seat: none → seated → none; league day: idle / with bot / without bot / closing; month close).

- Recommended: the league is its own module (`apps/server/src/monthly/`, `packages/arena/src/monthly-protocol.ts`), not a phase machine of the arena reducer, because it has no lobby, break or finished phase. Decide and report. Remove what the old monthly room needed and nothing else uses: the top-20 score rule, `leagueGain`, `league_seat_taken`, ready and lobby for the monthly kind.
- Routes (names are a proposal): the leagues with their live numbers; one stream per league (state, then turns); take a seat; quit; rename when allowed; my seat; a league's ranking of today and of the month; past days' winners. Watching needs no session.
- `GET /api/public` keeps a monthly entry that the chooser and the home page can show (tanks playing now, the month, the last champion).
- Old data: the owner's `DATA_DIR` holds stored monthly rooms and league files in the old shapes. The first start sets them aside in a dated folder and goes on; it never stops for them. Stored champions of past months stay.
- Web in M1: keep `bun run type-check` and `bun test` green. Remove the old monthly room's pages, tour and audit states, and leave `/monthly` as a plain page that shows the live board and today's ranking of League 1, so the server can be seen working. M2 designs the real page.

Tests (injected clock and time zone): every row of both tables in section 2; join and quit between turns in the engine; a day close with counted and uncounted tanks; the score function (fewer than 7 days, ties, a quit day); the month close function (1, 2 and 3 leagues, uneven sizes, an empty league); the name rule across a month change; the checkpoint and resume; old data set aside; a day of 96,000 turns keeps memory flat (run a shortened day and assert that nothing grows per turn).

## 6. The pages (M2, after M1)

- `/monthly`: one page for everyone, laid out like the big screen: the board large, "Ronde hari ini berakhir dalam 05:12:44", the ranking with the tabs "Hari ini" and "Bulan ini", the league switch when there is more than one league, and yesterday's winner. It works on a phone and at 1728 x 1000 without scroll.
- A visitor without a seat sees one action, "Ikut arena bulanan": sign in when needed, then the name (with the sentence that it stays for the month), then the tank with the existing prep tabs (play style, rules, upgrades, try it), then "Masukkan tank". The tank appears on the board at once.
- Owner, 2026-11-18: "the bottom bar for mobile is so full with 6 menu, 3 of them are two line as well". On a phone, the tabs are Arena, Peringkat / Ranking, Tank kamu / Your tank (seated players), and Aktivitas / Activity. Each label fits on one line at 360 px in both languages. A visitor's Join button stays in its own row above the tabs. A seated player finds "Ubah aturan" / "Change rules" and "Ubah tampilan" / "Change look" just below the tank name in the "Tank kamu" pane. The owner found that a row of two large buttons above the tabs took too much of the phone on 2026-11-16. On a laptop, both actions stay in the header when the player's own league is shown.
- A seated owner sees their tank marked on the board and in the ranking, the "Tank kamu" feed, their counted days, or before the first one when the tank gets a place, what the month close did to them, and "Keluar dari arena bulanan" behind a question that says what quitting does to today and to the tank.
- The home page gets an entry to watch the monthly arena live, with one live line. The `/play` chooser's monthly tile opens the same page. `/champions` follows the new score.
- Interface text follows the UI copy rules; both languages; the whole no-scroll audit with new states at the end.

## Both

Never `bun run build`; never port 8787; build to your own scratch folder; M1 serves on port 9004 and M2 on port 9006. One headless browser at a time. Another builder may edit the create form and arena settings at the same time (`78-arena-seats.md`, port 9005, it takes stored arena version 8): edit shared files with small targeted edits after re-reading them. Report briefly.

Status 2026-11-14: the owner confirmed three choices as built: the month's rank is the average of counted day points, a tank's name is unique across all leagues, and only a tank that still has its seat at the month's end can be champion.

### Fresh start on the board (2026-11-19)

| Rule | Decision |
|---|---|
| Stream | A fresh start does not send a new board (`state`). The turn's compact tick lists the tanks that moved through a tunnel, each with its new square, after the moves of that turn. A bot that changes is a quit and a join, as today. |
| Board | The tank does not glide across the board. In the same turn it sinks into the floor at the old square with a ring of dust, then rises at the new square with a ring of dust. The trail of a game master starts again at the new square. |
| Reduced motion | The tank is at the new square at once, with a small ring at both squares. |
| Feed | When the viewer's own tank takes a fresh start, the feed says so in one line: "Tank kamu masuk terowongan dan keluar di petak lain dengan air penuh." / "Your tank went through a tunnel and came out on another square with full water." |
| Notice | The "Diacak ulang" notice remains only for a rebuild (a rush of joiners that needs a bigger board), which still starts the round again. |

### Weather change (2026-11-19)

Owner, 2026-11-16: "randomize the arena condition each reshuffle". The round no longer starts again, so the condition changes during the round instead (owner, 2026-11-19, chose "weather change, no restart"):

| Rule | Decision |
|---|---|
| When | Every 333 turns (`RESHUFFLE_TURNS`), the league draws a condition from `MONTHLY_CONDITIONS`, each as likely. A draw of the condition that plays now changes nothing. A new day, a restart and a rebuild draw one as before. |
| Tanks | They keep their squares, points, statistics, tie ranks and running step sequences. Water above the new condition's limit is cut to the limit. |
| Lapangan luas | It needs the larger board. Into Lapangan luas, the board grows on its right and bottom edges, and the tanks keep their squares. Out of it, the board shrinks back; a tank outside the new board takes a tunnel (a fresh start), and an item outside it is removed. |
| Stream | A change sends one `state`, which keeps the turn number, so the page does not count it as a reshuffle. |
| Page | A notice for a few seconds: "Kondisi arena berubah menjadi {name}." / "The arena condition changed to {name}." The condition line under the clock shows the new name. |
| Rules | A rule that reads the arena condition reads the one that plays in that turn. |
