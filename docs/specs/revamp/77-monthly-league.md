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
- Taking a seat submits the name, look, strategy and upgrades. They are fixed while the tank is seated. To change the tank, the owner quits and takes a seat again.
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
| New start | Every 333 turns (5 minutes at 900 ms a turn) the round starts again: every tank moves to a new random square with full water and keeps its points and statistics. Added 2026-11-14 after the owner saw two or three tanks lock into one loop for most of a day; the measurement is in `apps/server/src/monthly/league-day.ts` (`RESHUFFLE_TURNS`). |
| Bot | The table below. A bot never appears in a ranking. |
| Ties | A rule's target is settled by a tie rank that the engine draws for each tank at each join (`BotState.tieRank`), and some rules by the board's tank order; the league seats the tanks in a random order at every new round. Both change every 5 minutes. Before 2026-11-16 a tie went to the lower seat id, which a seat keeps all month: in a mixed field of 8 play styles that was worth up to about 400 points per 8,000 turns. After the change, the same seeds gave every play style the same points whichever id it held. Other arenas keep the id rule. |
| Kept per turn | Nothing. No replay and no turn history for a day round; a viewer who opens the page gets the current state and then each turn. |

Changed 2026-11-14 at the owner's request ("spawn and de-spawn bots every N minutes"): the bots are drawn again at every new start (every 5 minutes), at a new day, at a restart and at a rebuild. Each bot takes a random play style from the practice arena's bot mix (`apps/server/src/bots.ts`, `BOT_LINEUP`). A player keeps the points won from or lost to a bot.

| Seated tanks | Bots at each draw |
|--------------|-------------------|
| 0 | None. No turn is simulated. The league exists and its page shows the empty board. |
| 1 | 1 to 3. A draw of 0 is raised to 1, so the tank always has an opponent. When a quit leaves one tank without a bot, one bot joins at once. |
| 2 or more | 0 to 3. A tank that arrives does not remove the bots; they change at the next new start. |

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
- A seated owner sees their tank marked on the board and in the ranking, the "Tank kamu" feed, their counted days, or before the first one when the tank gets a place, what the month close did to them, and "Keluar dari arena bulanan" behind a question that says what quitting does to today and to the tank.
- The home page gets an entry to watch the monthly arena live, with one live line. The `/play` chooser's monthly tile opens the same page. `/champions` follows the new score.
- Interface text follows the UI copy rules; both languages; the whole no-scroll audit with new states at the end.

## Both

Never `bun run build`; never port 8787; build to your own scratch folder; M1 serves on port 9004 and M2 on port 9006. One headless browser at a time. Another builder may edit the create form and arena settings at the same time (`78-arena-seats.md`, port 9005, it takes stored arena version 8): edit shared files with small targeted edits after re-reading them. Report briefly.

Status 2026-11-14: the owner confirmed three choices as built: the month's rank is the average of counted day points, a tank's name is unique across all leagues, and only a tank that still has its seat at the month's end can be champion.
