# Work packages K1 (usage numbers and server health) and K2 (player statistics)

Read `00-overview.md` first. Owner, 2026-11-14: "build a metrics for the game"; asked what it should measure, the owner chose all three: usage numbers for the host, statistics for players, server health. Both packages start after M1 (`77-monthly-league.md`), because M1 changes the turn loop and the server.

The game is for children, and the code will be public. So: no outside tracker, no cookie for counting, no stored address, no identifier in any counter. `PRIVACY.md` gets a section that says what is counted.

## K1a: usage numbers for the host

| Topic | Decision |
|-------|----------|
| Where | `apps/server/src/metrics/` counts things the server already handles. The page adds a few named events through `POST /api/metrics/event` (an allow-list of names, no free text, no identifier, rate limited). |
| Day | A day in `LEAGUE_TIME_ZONE`. One file per day, `DATA_DIR/metrics/<YYYY-MM-DD>.json`, written atomically once a minute and at a clean stop, kept 400 days. |
| Visitors | A count per day. To count a visitor once, the server keeps a hash of address, browser name and a random salt in memory for that day only; the salt changes every day and neither salt nor hash is stored. Only the number is stored. |
| Counted | Visitors; page opens by page (home, play, workshop, arena, monthly, champions, result); arenas created by kind; joins by kind; games started and finished by kind; rounds played and tanks per round; accounts registered and verified; sign-ins; monthly seats taken and quit; chat lines; the highest number of open streams; the language in use; the first-timer path as steps (opened home, entered the practice arena, watched a first round end, opened the Rules tab, changed a rule, played a second round); a rule with a step sequence saved. |
| Who sees it | Accounts whose email is in the setting `ADMIN_EMAILS` (comma separated; with mail settings on, the email must be verified). `GET /api/admin/metrics?from=&to=`; everyone else gets 404. |
| Page | `/admin/metrics`: today against yesterday as numbers, the last 30 days as small line charts drawn in SVG by the app (no chart library), and the first-timer path as bars with the share that reached each step. English and Indonesian, no scroll rules as everywhere, tables readable on a phone. Use the `dataviz` skill's rules for the charts when it is available to you. |

## K1b: server health

- `GET /metrics` in the Prometheus text format, written by hand (no dependency). It answers only with `Authorization: Bearer <METRICS_TOKEN>`; without the setting the route does not exist.
- Values: uptime; memory (resident and heap); open streams; arenas by kind; rounds running; time to compute a turn and how late a turn fired, as histograms; requests by route group and status class; errors caught; emails sent and failed; rate-limit refusals; the league's seats and leagues; the age of the newest checkpoint.
- `docs/deployment/06-monitoring.md`: how to read it with `curl`, a scrape example, and three alerts worth having (the process is down, turns fire late, memory grows). `deploy/env.example` and the README's settings table name `ADMIN_EMAILS` and `METRICS_TOKEN`.

## K2: statistics for players

The purpose is learning: a player sees what their rules did, and which rule never ran.

| Topic | Decision |
|-------|----------|
| Per tank and round | Shots, hits, hit rate, times hit, squares moved, turns without any matching rule, and per rule the number of turns it ran. Kept as running totals per tank (a fixed size, nothing per turn), so a day-long league round costs the same as a short one. |
| Where it shows | After a round and after a game in the player's "Tank kamu" pane, as one compact card: the three main numbers, then the rules as a row each with a bar ("Aturan 2 jalan 31 giliran"), and a rule that never ran is marked with one sentence that suggests looking at its condition. The same card after a Try it match. In the monthly league: the seat's totals of today. No scroll: the card is a tab or a pane where the layout needs it. |
| Account totals | For a signed-in account: games, rounds, wins, shots and hits over time, on the "My tank" page. One small store per account. |
| Not included | No comparison with other players' rules (their rules are theirs), no global leaderboard of statistics. |

Tests through the public interfaces: counters from real route calls; the admin guard; the day change with the injected clock; the visitor count without a stored identifier; the Prometheus text parsed back; statistics from a played round compared with a hand count; the monthly totals over a join and a quit. The audit for the new page and card at every size in both languages.

Never `bun run build`; never port 8787; build to your own scratch folder; K1 serves on port 9010 and K2 on port 9011; one headless browser. Report briefly.
