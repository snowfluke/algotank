# Water fight arena game: decisions

Date: 2026-11-11

Reference: GoogleCloudPlatform/cloudbowl-microservice-game (Apache-2.0), read at commit 5c83990.
The new game takes the mechanics as a starting point. Its name, theme, art and look must differ.

| # | Question | Decision | Why |
|---|----------|----------|-----|
| Q1 | Event or public site | Time-boxed event for a known group. The engine must later be able to run always-on. | No accounts, abuse limits or long-term ranking in v1. |
| Q2 | Unit of a win | Short rounds, shown live on one shared screen. | A long cumulative score averages the random effects out, so the best strategy wins almost every time. |
| Q3 | Elimination | Knockout from round 1. Each round keeps the top half until 8 remain, then one grand final. Cut rule: `survivors = max(8, ceil(n / 2))`. | Owner's choice. One bad round can remove a strong strategy. |
| Q4 | Arena per round | One shared arena for all surviving players, up to 64. | One screen for the room, no heat draw. |
| Q5 | Tech and non-tech players | The host creates an arena and sets its input mode: the rule editor, or a JSON document over the API. Every player in that arena uses that mode. No mixed arenas. Both modes are built. | Players compete only against others with the same tool. 2026-11-12: the owner removed the developer mode, in his words: "i think i want to ditch the JSON/microservice stuff and focus for non-tech people play/kids targeting them so they learn algorithm." Every arena now uses the rule editor, and `inputMode` is gone from the settings and from the stored arena (version 3). |
| Q6 | Amount of luck | The strongest strategy wins a final of 8 about 35% of the time (pure luck is 12.5%). Tuned by simulation. | Identical strategies also need the random elements to separate them. |
| Q7 | Random elements | Random spawn cell and direction. Random move order each tick. Hit chance by distance. All drawn from one seed per round. The numbers are in `packages/engine/src/combat/rule-sets.ts`: 90 / 60 / 40 / 35 / 30% for 1 to 5 cells under the standard rule set after tuning (the first values were 90 / 60 / 30). | No new grid objects. Add a visible element (an item on a random cell) only if the simulation misses 35%. |
| Q8 | Strategy in Rules mode | The game rules and joining stay simple. The strategy is deep. A strategy is an ordered rule list (first true rule runs) with ALL / ANY conditions, thresholds, target selectors, a chance per rule, and modes. Actions are intents that the engine turns into one of `F`, `L`, `R`, `T`. The player also sets a build: a budget of 6 points across three bot attributes, Reach, Aim and Dodge (see "Changes from the design review"). A one-tap preset fills both. | Owner wants a large strategy space. The engine reads a strategy as data and runs no player code. |

Replaced by the revamp: Q1 (an event for a known group without accounts). The game now also runs public arenas and accounts for creators; see "Revamp, 2026-11-11".

## Defaults taken without a question

The owner asked for less deliberation. These are my defaults. Each one stands unless the owner changes it.

| Topic | Default |
|-------|---------|
| Tech arena input (Q9, not answered) | A strategy is one JSON document, and `PUT /api/arenas/:id/players/me/strategy` accepts it. A developer generates that document with their own code and sends it. No per-tick code, no webhook and no hosting in v1. This replaces the earlier default of a JavaScript function in the browser tab. Built: in an API arena the player page shows the token, the calls and the reference, and `GET /api/vocabulary` and `POST /api/strategies/validate` serve a script. 2026-11-12: the owner removed the developer mode, in his words: "i think i want to ditch the JSON/microservice stuff and focus for non-tech people play/kids targeting them so they learn algorithm." The two routes and the developer page are removed; the PUT route stays because the page itself saves through it. |
| Build order | Rules mode first, then the API arena. Per-tick code for developers is not built. 2026-11-12: the owner removed the developer mode, in his words: "i think i want to ditch the JSON/microservice stuff and focus for non-tech people play/kids targeting them so they learn algorithm." The API arena is removed. |
| Move order | The original orders moves by HTTP response time. The new game uses the seeded random order from Q7. |
| Strategy edits | Allowed between rounds, locked during a round. |
| Before round 1 | A build phase, and a practice arena against built-in bots. |
| Joining | A link and a display name. No accounts. |
| Arena creation | The owner only, in v1. The server requires a host key (`HOST_KEY`) to create an arena. |
| After a round | Replay from the seed, and the rule that fired on each tick. |
| Simulation | One server process runs the tick loop for the event. Every arena is saved to one file in `DATA_DIR`, so an event continues after a restart. A round that was running at the restart counts for nothing and the host starts it again. |
| Grid | Sized to the players in each round (about 15% of cells occupied, 4:3), so it shrinks as players leave. No interior walls. |
| What viewers see | Positions, scores, builds and throws of every bot. A player's rules and the mode a bot is in stay private. |
| Round length | The same for every round, set by the host when the arena is created. Time conditions use percent of the round. |

Replaced by the revamp: "Arena creation" with a host key (`HOST_KEY`). A signed-in account now creates an arena, and `HOST_KEY` no longer exists; see "Revamp, 2026-11-11".

## Changes from the design review

Three designers and one critic produced the strategy vocabulary on 2026-11-11. A first measurement of 1000 finals confirmed the critic's main finding, so these changes were taken without a question.

| Topic | Change | Why |
|-------|--------|-----|
| Build | Three attributes: Reach (0 to 2, 2 points per level), Aim and Dodge (0 to 3, 1 point per level). No Power attribute. | A points-per-hit attribute was the best purchase in all three designs. In the first measurement the three presets without Power won under 3% of finals. |
| Scoring | A hit moves 1 point from the target to the thrower. The scores of a round sum to 0. | The value of a hit is no longer a build choice. |
| Aim and Dodge | 6 points of hit chance per level, from 2 cells on. At 1 cell the chance is 90% for every build. | Otherwise Aim and Dodge are the same number in a duel. |
| Blocked step | A step into a cell that a bot holds becomes a throw. | Two of the three designs had bots that turn or push forever against a blocker. |
| Rule with no target | A rule whose target choice finds no bot is skipped, and the next rule is tried. | A substitute move hides the fact that the rule could not run. |
| Ties | Equal scores are ordered by more hits landed, then by a draw from the round seed. | Rewards the player who attacked. |
| Vocabulary | 27 conditions, 15 target choices, 12 actions, 8 presets after the review. Now 30 conditions and 16 target choices: the water rule below added 2 conditions and 1 target choice and replaced the presets, and the rule sets added 1 condition. | The critic's merged list, less the entries named below. |

Not built from the review: a "locked target" choice, conditions that count several hits in a time window, route search (the grid has no interior walls), and warnings for a rule that cannot fire in a small final.

## Measured result

Every table from here to "Open" describes the four-direction game (before 2026-11-12). The current game is in "Eight directions, 2026-11-12".

The numbers below are for the game with the water rule (see the next section). 1000 finals of 8 at 150 ticks, one seat per preset, `bun run simulate`. Pure luck is 12.5% per seat.

| Preset | Win % in the preset field | Win % alone against 7 Chargers |
|--------|---------------------------|--------------------------------|
| Evader | 32.2 | 35.9 |
| Leader chaser | 15.3 | 48.3 |
| Dry hunter | 14.3 | 36.5 |
| Ambusher | 13.7 | 30.8 |
| Picker (default) | 13.6 | 34.4 |
| Backstabber | 8.3 | 26.7 |
| Random walker | 1.5 | 9.0 |
| Charger | 1.1 | 12.9 |

In the preset field 22.4% of moves are turns, and the winner took no hit in 2.1% of finals.

Win % of one seat of the row preset against 7 copies of the column preset (400 finals per cell, about 1.7 points of noise at 12.5%):

| | Evader | Leader chaser | Dry hunter | Ambusher | Picker | Backstabber |
|---|---|---|---|---|---|---|
| Evader | 11.8 | 20.0 | 36.8 | 13.5 | 12.3 | 39.3 |
| Leader chaser | 2.3 | 10.5 | 32.3 | 7.3 | 5.8 | 15.3 |
| Dry hunter | 14.0 | 13.8 | 13.5 | 3.5 | 0.3 | 5.0 |
| Ambusher | 30.3 | 15.5 | 51.5 | 15.0 | 6.5 | 18.8 |
| Picker | 20.5 | 10.3 | 58.5 | 16.3 | 12.5 | 15.8 |
| Backstabber | 7.5 | 11.3 | 45.5 | 9.5 | 5.5 | 7.5 |

The Evader wins the preset field at 32.2% against the target of 35%. A final in which most players copy the Evader is won more often by an Ambusher (30.3%) or a Picker (20.5%), and no preset wins more than 12.5% alone against 7 Pickers. The default preset is the designed preset closest to 12.5% in the preset field; Picker (13.6%) and Ambusher (13.7%) are equal within noise.

Before the water rule, the same measurement gave Opportunist 29.5%, six presets between 8.9% and 12.4%, and the random walker 7.4%. Those presets no longer exist.

## Rule change: a throw costs water

The first measured result showed that strategy mattered too little: bots turned on about 1% of moves, 74% of finals were won by a bot that took no hit, and in 91% of finals no bot moved after tick 30. Four experiments each tested one answer on a private copy of the engine, with the same measurements over 1000 finals of 8 at 150 ticks.

| Experiment | Rule tested | Strongest in a mixed field | Does a counter beat the strongest? | Result |
|------------|-------------|----------------------------|-------------------------------------|--------|
| Control | None; search for stronger rule lists | 24.8% | No. The best counter wins 18.2% alone against 7 copies and ties 4 against 4 | Stronger rule lists exist, and all of them have one shape (wait, never trade hits, hit the leader). The build changes nothing. |
| Facing defence | A throw from the front hits 40 points less often, from the side 20 | 32.6% | Only by standing still (55 to 64% against 7 copies) | The same numbers appear with the rule off, so the rule does not cause them. |
| Bounty scoring | A hit takes 1 to 6 points by the target's score | 29.3% | No | The same numbers appear with the rule off, and a random walker wins more often (7.5% to 9.5% against 7 Chargers). |
| Water tank | A throw at a bot uses water, and the tank refills over time | 28.7% | Yes. The Ambusher wins 52.6% alone against 7 Dry hunters; a Dry hunter wins 3.8% alone against 7 Ambushers | Adopted. |

All four experiments ended with the verdict "partly". The water tank is the only one where the rule itself produced a counter-strategy, so the best rule list depends on what the other players bring. A cross-check played the strongest rule lists of the other three experiments under the water rule (600 finals each). Each beats a field of Dry hunters (35 to 38% alone against 7). Against a field of Ambushers or Pickers each wins 3 to 13%, which is at or below pure luck, and an Ambusher alone against 7 Evaders wins 32.7%.

The rule: a tank holds 9 water. A throw at a bot uses 3, hit or miss. A throw at an empty line uses none. A throw at a bot from a tank with less than 3 does nothing. The tank gains 1 on each tick without a throw at a bot. These are the numbers of the standard rule set. Every number is in `packages/engine/src/combat/rule-sets.ts`.

With the rule, in the experiment's mixed field: 16.5% of moves are turns, and the winner took no hit in 5.7% of finals. A bot that hides in a corner wins 4.5 to 8.3% there, below pure luck.

One exception was measured on the final engine (600 finals): a rule list that stands still and faces the nearest bot wins about 60% alone against 7 Evaders, because the Evader never throws at a bot that faces it. The same rule list wins 2 to 12% against 7 copies of any other preset and 4 to 9% in the preset field, so it pays only when most players copy the Evader.

## Rule sets: the rules can change each round

Reason: a player can ask an AI for a strategy before the event. One fixed set of numbers has one best prepared answer. Each round now plays under one named rule set, and the host chooses the mode per arena.

| Mode | When the rule set is drawn | What players know before the round |
|------|----------------------------|------------------------------------|
| The same rules every round | Never; every round is Standard | Everything |
| New rules, shown before the round (the default) | When the lobby or a break starts; never the set just played | The next rule set, so they can edit for it |
| New rules, shown when the round starts | When the host starts the round, from all six sets | Nothing; no id exists earlier |

| Rule set | What differs from Standard |
|----------|----------------------------|
| Standard | Tank 9, a throw uses 3, reach 3 cells |
| Arm's length | Reach 1 cell |
| Dry spell | Reach 2 cells, tank 6, a throw uses 5 |
| Downpour | Reach 1 cell, tank 12, a throw uses 2 |
| Open field | About twice as many cells (12 x 9 for 8 players) |
| Sharp eyes | Aim and Dodge count from 1 cell, 12 points per level |

Win % in the preset field under each rule set (1000 finals of 8 at 150 ticks, `bun run simulate`, Table 5; one standard deviation is 1.1 to 1.5 points):

| Preset | Standard | Arm's length | Dry spell | Downpour | Open field | Sharp eyes | Mean |
|--------|----------|--------------|-----------|----------|------------|------------|------|
| Evader | 32.2 | 12.1 | 20.2 | 23.4 | 26.3 | 32.7 | 24.5 |
| Leader chaser | 15.3 | 17.2 | 15.9 | 33.4 | 20.7 | 15.9 | 19.7 |
| Dry hunter | 14.3 | 10.5 | 31.7 | 3.0 | 13.0 | 14.6 | 14.5 |
| Ambusher | 13.7 | 27.0 | 13.1 | 16.4 | 18.2 | 14.0 | 17.1 |
| Picker | 13.6 | 17.3 | 6.4 | 12.3 | 12.6 | 14.5 | 12.8 |
| Backstabber | 8.3 | 14.5 | 7.1 | 9.8 | 7.1 | 6.6 | 8.9 |

The acceptance test set before the build: the top preset differs between at least two rule sets, and no preset is top in all of them. It passed: four presets lead (Evader in three sets, Ambusher, Dry hunter and Leader chaser in one each). The Standard column equals the earlier measurement exactly, so the refactor changed no standard number.

What the test did not cover, measured afterwards (`bun packages/engine/scripts/probes.ts`, part 3, 1000 finals). The new condition "This round's rules are ..." lets one document hold a branch per rule set. The Switcher is the Evader with three such branches, each to the modes of the preset that leads that set.

| Seat of the Switcher | Standard | Arm's length | Dry spell | Downpour | Open field | Sharp eyes | Lowest | Mean |
|----------------------|----------|--------------|-----------|----------|------------|------------|--------|------|
| In place of the lead preset | 32.2 | 27.2 | 26.4 | 28.8 | 26.3 | 32.7 | 26.3 | 28.9 |
| Beside the lead preset (the Charger's seat) | 23.9 | 24.4 | 9.5 | 17.7 | 25.5 | 23.2 | 9.5 | 20.7 |

So a prepared document with a branch per set wins about twice luck in every set when no other player brings the specialist of that set, and hiding the draw does not stop it. When a specialist also plays, the two share the wins and the Switcher falls to 9.5% (Dry spell) and 17.7% (Downpour). Removing the condition would change little: a document that reads its tank on the first tick finds Dry spell and Downpour anyway (26.2% and 28.6% in a scratch run of 500 finals) and loses only Arm's length (14.4%). The condition stays, because Q8 asks for a wide vocabulary.

What still limits a prepared answer: the result depends on what the other players bring (the matrix above), and luck (no document in any table wins more than about a third of finals).

Other results per set: turns are 22.4 to 28.2% of moves, the winner took no hit in 0.1 to 2.3% of finals, and a bot that stands still or hides in a corner wins below luck in every set (at most 9.7%). Under Sharp eyes the build decides: the Picker's rule list wins 13.0% with the build 0/3/3, 0.9% with 2/1/1 and 0.1% with 0/0/0. That shows that leaving 0/3/3 loses; it does not show a second build that works.

## Open

| Branch | Reason | Who decides |
|--------|--------|-------------|
| Default round length and tick rate | The host sets both per arena; no measured default exists | Owner |
| Whether the build matters | Under five of the six rule sets bots fight from 1 cell, where the hit chance is 90% for every build. In the experiments a rule list won at the same rate with any build (Dry hunter 31 to 36%), and Reach lowered results. Under Sharp eyes the build decides, but only one build (0/3/3) was shown to work | Owner, after play tests |
| One document for every rule set | A document with a branch per rule set keeps 26 to 33% when no specialist plays. Answers not built: a limit on modes that makes five behaviours not fit, a delay after a mode switch, or rule sets with numbers drawn at random so a branch cannot name them | Owner |
| The Evader as the safe pick | The Evader leads three of six sets and has the best mean (24.5%). Its lowest value is 12.1% under Arm's length | Owner, after play tests |
| Throws a player did not ask for | A blocked step, and a rule or fallback that cannot act, become a throw and use water when a bot stands in the line. The measured numbers include this | Owner, after play tests |
| The 35% target | The Evader wins 32.2% in the preset field, and the Leader chaser wins 48.3% alone against 7 Chargers. The target is not tuned further | Owner |
| Standing still against Evaders | A bot that stands still wins about 60% alone against 7 Evaders and below luck elsewhere. Not changed, because the Evader's rule causes it and a player can change that rule | Owner, after play tests |
| Rounds with more than 8 players | Every number in this log is from finals of 8. Cut rounds of 16 to 64 players were not measured with the water rule or under any rule set | Owner |
| Whether "aimed at me" counts a bot that cannot throw | The conditions and the action that read lines of fire count a bot with a tank too low to throw. A player can add the condition on the target's water. Changing it changes the measured numbers | Owner, after play tests |
| Per-tick code for developers | Not built; the JSON document covers the first event. Closed 2026-11-12: the owner removed the developer mode, in his words: "i think i want to ditch the JSON/microservice stuff and focus for non-tech people play/kids targeting them so they learn algorithm." | Owner |
| Theme | The name is AlgoTank (owner, 2026-11-11). I did not check the name against existing products or trademarks. The theme and art are not discussed | Owner |

## Revamp, 2026-11-11

The owner judged the first build too hard to read for beginners and children, and asked for a web game to share with a friend group, run at an event, or play alone against bots. The specs are in `docs/specs/revamp/`. The engine rules and the JSON shape of a strategy did not change.

| Question | Decision | Why |
|----------|----------|-----|
| Which arenas exist | Three kinds: private (a friend group, the creator plays, up to 16 players), presenter (an event, the creator shows the big screen and does not play, up to 64 players), public (run by the server, up to 8 players). | The owner asked for a game to share with a friend group, run at an event, or play alone against bots (`00-overview.md`). The home page shows one entry for each: Play now, Join with a code, Create a private arena, Create a presenter arena. |
| How one person plays alone | Public arenas run by the game. Bots fill the empty seats up to 8, a game starts 20 seconds after the first player joins, and a new game starts 15 seconds after the final. The server keeps up to 20 public arenas (`PUBLIC_ARENA_MAX`). | A first-time player must be in a game within 30 seconds (`00-overview.md`), and a person alone has nobody to start the rounds. |
| Who needs an account | Only a creator. Sign-in is by email and password (8 to 200 characters). Joining needs a name and a tank colour. | Owner's decision (`20-auth.md`). Joining never needs an account, so a name and a colour are enough to play (`00-overview.md`). |
| How many arenas an account owns | One open arena at a time. A second create answers `arena_limit` with the open arena, and the page offers to open it or to close it first. | Owner's decision (`00-overview.md`, `21-arena-backend.md`). The specs give no reason; inferred: it limits the arenas one account can hold on the server. |
| When an arena ends | The owner closes it, or the server removes a private or presenter arena after 24 hours without activity (`ARENA_TTL_HOURS`). Open streams get a `closed` message. | `21-arena-backend.md` sets the rule and gives no reason. Inferred: an arena that nobody uses must not stay on the server without end. |
| Player names in a public arena | The game gives each player a name from two word lists, for example "Brave Otter". Reversed on 2026-11-12, see "Tank identity". | Free text shown to strangers is not safe for children. |
| Bots | A bot is a player marked "bot", with a friendly water name, a preset play style and the least-used colour. Of 7 bots, 3 play weak presets, 3 middle presets and 1 a strong one. | `21-arena-backend.md`: the mix must let a beginner win sometimes, and it stays data so it can be tuned. |
| Languages | English and Indonesian. Each feature folder has a `messages.ts` with an `en` and an `id` catalog of the same type, so a missing Indonesian message fails the type check. Indonesian addresses the player as "kamu". | `00-overview.md` asks for both languages and a switch on every page. `10-web-foundation.md` asks for typed catalogs without key strings; the type check finds a missing translation. |
| Saving a tank | The preparation panel saves by itself 800 ms after the last change. A draft that the server refused stays in the browser and is saved again later. | `30-prep.md` ("Saving without a save button"): a change saves without an action from the player, and a change that cannot be saved yet is kept and saved later. |
| Start of a round | The server waits 3 seconds after a round starts before the first turn (`ROUND_START_DELAY_MS`), and the pages show a countdown. | `21-arena-backend.md`: the clients show a countdown while players find their tank. |
| Words on screen | Interface text uses the glossary: tank (code: bot), shot (throw), square (cell), turn (tick), play style (preset), upgrades Range, Aim and Dodge (build reach, aim, dodge), round rules (rule set), points (score). "Bot" now means only a built-in opponent. Code and JSON names stay. | `00-overview.md`: plain language that a 10-year-old reads aloud, and one vocabulary. |
| Host key | Removed. Ownership of an arena comes from the signed-in account. Arena files of the host-key version stop the start with a message. | `21-arena-backend.md`: ownership by account replaces the host key and the host token. |
| Big screen text | Every text on the big screen is 26px or more at 1920x1080 for up to 24 tanks. Lists add columns before the text shrinks; with more tanks the text goes down to 20px, and a list that still does not fit shows the top places and the places around the cut line with one line that counts the rest. | `00-overview.md`: the big screen is read from 5 m with body text of 26px or more. The 20px floor and the shortened list are this fix pass. |

### Open after the revamp

| Point | Reason | Who decides |
|-------|--------|-------------|
| Unverified emails | The server does not verify an email, so one person can register several accounts and own several open arenas. The per-address rate limit is the only brake. | Owner |
| Password recovery | No recovery by email exists. The person who runs the server resets a password with `apps/server/scripts/reset-password.ts`. Recovery by email needs a mail service. | Owner |
| Public names in English | The word lists for public names are English, also for a player who reads Indonesian. Names are shared by all players in an arena, so they cannot follow each viewer's language. | Owner |
| Balance with many tanks | Every balance number in this log is from finals of 8. Cut rounds of 16 to 64 tanks, the bot mix and the public arena settings were not measured. | Owner, after play tests |
| Developer reference in English | The reference tables and the server's validation messages stay in English, because they name the JSON fields. The developer panel says so in Indonesian. 2026-11-12: the owner removed the developer mode, in his words: "i think i want to ditch the JSON/microservice stuff and focus for non-tech people play/kids targeting them so they learn algorithm." The reference and the panel are removed; the server's validation messages stay in English. | Owner |
| Lobby with many players | On the big screen the lobby shows about 30 of 64 names (the first and the newest) with a line that counts the others. | Owner, after an event |

## Eight directions, 2026-11-12

The owner asked "Can we support diagonal". A tank now faces one of 8 directions, drives diagonally and shoots along diagonals. The rules are in `docs/specs/revamp/62-diagonal.md` and in the header of `packages/engine/src/directions.ts`.

### Decisions the spec did not state

| Topic | Decision | Why |
|-------|----------|-----|
| Move names | `L` and `R` stay 90 degree turns. The new moves are `L45` and `R45`. | Saved replays and strategies keep their meaning. The spec asks for names that do not differ only by letter case. |
| A 135 degree turn | The 90 degree turn comes first, then the 45 degree turn. | After one move the tank is 45 degrees off, not 90. |
| Driving toward a cell | The step is (sign dx, sign dy). | It lowers the Chebyshev distance by 1 and closes the most of the other gap. It is always unique, so no tie rule is needed. |
| Driving away from a cell | Order: the larger Chebyshev distance after the step, then the smaller angle to (-sign dx, -sign dy), then fewer turn moves, then more room before the wall, then clockwise from N. A step that keeps the Chebyshev distance and widens the other gap also counts as away. | The spec's "fixed order, then turn cost" leaves nothing for the turn cost to break if the fixed order is total, so the turn cost comes before the fixed order. Without the wall rule, a tank at a wall with a threat in its row cannot move away and shoots instead. |
| The direction to face | Of the 8 facings, the one with the smallest angle to the cell. | Integer offsets never lie exactly between two facings, so there is no tie. |
| Turn at a wall ("Drive forward", "Wander") | 45 degrees toward the one free cell beside the blocked one (left when both are free). When neither is free, 90 degrees toward the free side. | A diagonal driver slides along the wall. A straight driver turns as before. |
| "Walls touching me" and "distance to the nearest border" | They count the 4 sides (N, E, S, W), not the 8 facings. | With 8 facings a tank on the border would touch 3 "sides", and the parameter allows at most 3. |
| "Number of tanks aimed at me" | Its maximum rose from 4 to 8. | One tank per line through the square. |
| "Wander" | One draw from 8: 4 drive forward, and one each turns 90 left, 90 right, 45 left, 45 right. | Half the draws still drive. Without 45 degree turns a random walker that spawns facing N would never face a diagonal. |
| "Step out of the line of fire" and "Move away from the crowd" | They try all 8 neighbour squares in the order of fewest turn moves. | The first one keeps "left before right", the second "right before left", as before. |

### Play styles and the bot lineup

| Change | Why |
|--------|-----|
| Evader: "move away from the tank that aims at me" became "step out of the line of fire". | Moving straight away keeps the tank in the shooter's row. With the first away rule (diagonal flight, see below) the Evader won 15.2% of the mixed field. After the away rule changed to straight flight it won 9.5% (400 finals), and with this change 12.7% (1000 finals), all at 90 turns. |
| Backstabber: "a tank facing away within 8 squares" became "within 5". | 8 was measured in |dx| + |dy|. A Chebyshev distance of 5 covers 121 squares (11 x 11); a Manhattan distance of 8 covers 145 squares (2 x 8 x 9 + 1). |
| Default play style: Picker became Evader. | The default is the designed play style closest to luck in the mixed field. At 90 turns: Evader 12.7% (0.2 points from 12.5) and Backstabber 11.8% (0.7 points). |
| Bot lineup (`apps/server/src/bots.ts`): the Ambusher is the strong seat (5th), the Leader chaser moved to the 7th seat as middle. | The Ambusher wins the mixed field. The seven presets stay the same: 3 weak, 3 middle, 1 strong. |

Tried and not kept. The 400-final runs used seeds 1 to 400 (one standard deviation about 1.7 points); the 3000-final runs used seeds 1001 to 4000 (about 0.6 points) with a scratch script that is not in the repository, so only the listed `simulate.ts` and `probes.ts` runs can be repeated from this log.

| Variant | Measured | Finals |
|---------|----------|--------|
| Evader also shoots at 1 square | Evader 4.0% of the mixed field | 400 |
| Ambusher, Picker and Backstabber dodge first in rest mode and also in strike mode | Statue under Dry spell 12.9%; the Ambusher led 5 of 6 rule sets (400 finals) | 3000 |
| The same two dodge rules for the Picker and the Backstabber only | The Ambusher led all 6 rule sets | 400 |
| Dry hunter dodges at any water | Statue under Dry spell 16.0% | 400 |
| Leader chaser backs off when it cannot shoot | Statue under Dry spell 14.2 to 14.9% | 3000 |
| Evader attacks the nearest tank instead of driving toward it | Statue under Dry spell 14.7% | 3000 |

### Measured result

Method: `bun packages/engine/scripts/simulate.ts 1000 90 400 --lineup=charger,picker,random-walker,backstabber,ambusher,charger,leader-chaser`, the same with 150 turns, and `bun packages/engine/scripts/probes.ts 1000 90` and `1000 150`. Seeds 1 to 1000. Pure luck is 12.5% per seat. One standard deviation at 12.5% over 1000 finals is 1.05 points: sqrt(0.125 x 0.875 / 1000) = 0.0105.

Win % in the mixed field under each rule set (Table 5):

| Play style | Standard | Arm's length | Dry spell | Downpour | Open field | Sharp eyes |
|------------|----------|--------------|-----------|----------|------------|------------|
| 90 turns | | | | | | |
| Evader (default) | 12.7 | 17.2 | 18.2 | 17.2 | 13.3 | 12.1 |
| Leader chaser | 17.8 | 15.6 | 16.5 | 28.6 | 13.5 | 17.9 |
| Dry hunter | 7.5 | 6.9 | 19.9 | 2.7 | 7.0 | 8.6 |
| Ambusher | 29.4 | 29.6 | 17.4 | 20.4 | 32.4 | 28.5 |
| Picker | 18.2 | 15.2 | 10.4 | 12.4 | 18.1 | 19.1 |
| Backstabber | 11.8 | 13.0 | 7.8 | 14.8 | 12.2 | 11.9 |
| Charger | 1.3 | 1.5 | 8.2 | 2.0 | 2.5 | 1.5 |
| Random walker | 1.3 | 1.0 | 1.6 | 1.9 | 1.0 | 0.4 |
| 150 turns | | | | | | |
| Evader (default) | 15.5 | 15.9 | 20.4 | 18.3 | 11.6 | 16.7 |
| Leader chaser | 17.7 | 16.4 | 18.8 | 26.7 | 15.9 | 18.2 |
| Dry hunter | 8.4 | 7.4 | 22.3 | 2.2 | 6.8 | 8.4 |
| Ambusher | 28.5 | 31.2 | 17.3 | 25.4 | 36.0 | 26.5 |
| Picker | 18.0 | 14.9 | 10.0 | 13.7 | 18.7 | 18.1 |
| Backstabber | 10.7 | 12.7 | 7.5 | 12.3 | 9.5 | 11.6 |
| Charger | 0.4 | 0.9 | 2.9 | 0.5 | 1.3 | 0.3 |
| Random walker | 0.8 | 0.6 | 0.8 | 0.9 | 0.2 | 0.2 |

Mean hits each play style landed per final at 90 turns:

| Play style | Standard | Arm's length | Dry spell | Downpour | Open field | Sharp eyes |
|------------|----------|--------------|-----------|----------|------------|------------|
| Evader | 16.1 | 17.2 | 9.2 | 23.6 | 14.8 | 16.2 |
| Leader chaser | 14.6 | 15.2 | 8.2 | 22.2 | 12.6 | 14.8 |
| Dry hunter | 19.9 | 20.8 | 12.1 | 28.9 | 19.2 | 20.1 |
| Ambusher | 19.2 | 19.4 | 8.9 | 27.6 | 18.2 | 19.3 |
| Picker | 18.8 | 18.9 | 8.5 | 27.3 | 17.7 | 19.0 |
| Backstabber | 18.1 | 18.5 | 8.3 | 27.2 | 16.9 | 18.3 |

Win % of one seat of the row play style against 7 copies of the column play style, standard rules, 90 turns, 400 finals per cell (1.7 points of noise at 12.5%):

| | Evader | Leader chaser | Dry hunter | Ambusher | Picker | Backstabber |
|---|---|---|---|---|---|---|
| Evader | 12.3 | 25.8 | 26.8 | 6.3 | 6.5 | 19.8 |
| Leader chaser | 8.8 | 11.5 | 46.3 | 10.3 | 12.5 | 16.3 |
| Dry hunter | 7.5 | 16.0 | 12.8 | 6.5 | 0.5 | 5.0 |
| Ambusher | 21.8 | 33.5 | 53.0 | 10.3 | 8.5 | 25.8 |
| Picker | 11.8 | 24.3 | 52.5 | 11.3 | 9.8 | 16.0 |
| Backstabber | 6.8 | 25.8 | 46.5 | 6.8 | 7.8 | 12.8 |

Shape of play in the mixed field, standard rules:

| Measure | 90 turns | 150 turns |
|---------|----------|-----------|
| Turns, share of all moves | 40.2% | 38.6% |
| Drives (`F` moves, also blocked ones) made while facing a diagonal | 56.3% (64378 of 114406) | 56.3% (103383 of 183676) |
| Shots at a tank (outcome dry, miss or hit) along a diagonal | 39.7% (115573 of 291249) | 39.9% (204634 of 513443) |
| Mean hits landed per tank per round | 17.22 | 28.58 |
| Finals whose winner took no hit | 0.3% (3 of 1000) | 0.1% (1 of 1000) |

Under the other rule sets at 90 turns: diagonal drives 52.6 to 62.0%, diagonal shots at a tank 37.5 to 40.4%, mean hits per tank 9.34 (Dry spell) to 25.75 (Downpour), and the winner took no hit in 0.1 to 2.3% of finals.

Win % of a probe in the Charger's seat of the mixed field (`probes.ts`, part 1):

| Probe | Turns | Standard | Arm's length | Dry spell | Downpour | Open field | Sharp eyes |
|-------|-------|----------|--------------|-----------|----------|------------|------------|
| Statue (stands still, faces the nearest tank) | 90 | 8.9 | 5.7 | 14.8 | 3.0 | 6.4 | 9.1 |
| Turtle (hides in a corner) | 90 | 0.4 | 0.4 | 0.2 | 0.3 | 0.3 | 0.7 |
| Statue | 150 | 5.4 | 3.0 | 9.6 | 1.1 | 4.3 | 5.9 |
| Turtle | 150 | 0.0 | 0.1 | 0.1 | 0.1 | 0.0 | 0.2 |

The default play style (Evader) alone against the server's bot lineup, standard rules: 16.3% at 90 turns (163 of 1000) and 18.2% at 150 turns (182 of 1000).

### The seven conditions of the spec

| # | Condition | Measured | Result |
|---|-----------|----------|--------|
| 1 | Every designed play style lands hits in every rule set; the Charger and the random walker stay below the best designed style in every rule set | Fewest hits: Leader chaser 8.2 per final under Dry spell (90 turns). Highest filler: Charger 8.2% under Dry spell against Dry hunter 19.9% | Pass |
| 2 | No play style wins more than 40% of the mixed field under standard rules | Ambusher 29.4% (90 turns), 28.5% (150 turns) | Pass |
| 3 | The Statue and the Turtle each win below luck in every rule set | Statue under Dry spell at 90 turns: 14.8% (148 of 1000). Every other cell is below 12.5%, and all cells pass at 150 turns. See the table below | Fail at 90 turns under Dry spell |
| 4 | The top play style differs between at least two rule sets, and none is top in all six | Ambusher in 4, Dry hunter in Dry spell, Leader chaser in Downpour, at both lengths | Pass |
| 5 | At least 20% of drives and 20% of shots at a tank are diagonal | 56.3% and 39.7% (90 turns) | Pass |
| 6 | The default play style wins at least 12% alone against the bot lineup at 90 turns | 16.3% | Pass |
| 7 | Mean hits per tank and the share of finals won without a hit are reported; the share is below 15% | 17.22 hits per tank; 0.3% | Pass |

The Statue under Dry spell at 90 turns, by play styles and away rule ("diagonal" flight ranks the away steps by |dx| + |dy|, which steps diagonally also when the threat shares the row; "straight" is the shipped rule). Seeds 1001 to 4000 come from the scratch script:

| Play styles | Away rule | Statue | Finals, seeds |
|-------------|-----------|--------|---------------|
| Before this package | Diagonal | 11.0% | 1000, 1 to 1000 |
| Before this package | Diagonal | 12.7% +/- 0.6 | 3000, 1001 to 4000 |
| Final | Diagonal | 13.3% +/- 0.6 | 3000, 1001 to 4000 |
| Final | Straight (shipped) | 14.7% +/- 0.6 | 3000, 1001 to 4000 |
| Final | Straight (shipped) | 14.8% | 1000, 1 to 1000 |

So the shipped away rule and play styles cost about 2 points here (12.7 to 14.7), and no measured configuration is clearly below luck.

Why the Statue wins under Dry spell in short rounds (inferred, not proven): a shot uses 5 of 6 water, so each tank shoots about once every 5 turns, and a few hits decide a 90-turn round. A tank that walks toward a target steps diagonally until it shares a row or a column, so it enters the Statue's line facing 45 degrees off and needs one turn before it can shoot, while the Statue already faces it. A tally over 3000 finals showed that the Leader chaser loses the most hits to the Statue (about 2,900 more taken than landed).

### Open after eight directions

| Point | Reason | Who decides |
|-------|--------|-------------|
| The Statue under Dry spell at 90 turns | Condition 3 fails there (14.8%). A shot cost of 4 was tried later and gives 13.7% (see "Large arenas, 2026-11-12"). Answers not tried: the diagonal away rule (about 2 points better, against the spec's "straight after"), or a new play-style rule that waits for a tank that faces it to shoot first | Owner |
| The Ambusher leads 4 of 6 rule sets | It wins 26.5 to 36.0% there, under the 40% cap, and no play style beats it alone against 7 copies (best: Ambusher 10.3%, Picker 11.3%). The four-direction game had the Evader leading 3 of 6 | Owner, after play tests |
| More turning | Turns are 40% of moves against 22% in the four-direction game, because a tank turns 45 degrees each time its path changes between diagonal and straight | Owner, after play tests |
| The Switcher (`probes.ts`, part 3) | It now starts from the Ambusher with branches to the Dry hunter (Dry spell) and the Leader chaser (Downpour). In place of the lead play style it wins 19.4 to 32.4% at 90 turns | Owner |
| The lineup in `simulate.ts` | The engine cannot import the server, so the lineup is passed with `--lineup=`. After a change to `BOT_LINEUP`, pass the new ids in the same order | Whoever changes the lineup |

## Large arenas, 2026-11-12

The owner asked to "expand maximum arena presenter to 512". A presenter arena now holds 512 players. A private arena stays at 16 and a public arena at 8. The work package is `docs/specs/revamp/63-large-arenas.md` (L1: engine, arena, server, load test). Every number below comes from this laptop (Apple silicon, Bun 1.4.2), measured while other work ran on it (load average 2.6 to 8.5).

### What 512 means

| Quantity | Value | Arithmetic |
|----------|-------|------------|
| Rounds of a full arena | 6 cut rounds and the final, 7 rounds | The cut keeps max(8, ceil(n / 2)): cut rounds start with 512, 256, 128, 64, 32 and 16 players, and 8 play the final. The spec says "7 cut rounds and 1 final"; that counts one cut round too many. |
| Arena at the standard fill of 0.15 | 67 by 50 squares (3,350) | 512 / 0.15 = 3,413 cells; width = round(sqrt(3,413 x 4 / 3)) = round(67.5) = 67; height = round(67 x 3 / 4) = 50 (`arenaSize`). Open field (fill 0.075): 99 by 74. |
| Square size, whole arena on a 390 px phone | 5.8 px (Open field 3.9 px) | 390 / 67 and 390 / 99 |
| Square size, whole arena on 1920 x 1080 | at most 21.6 px | min(1920 / 67, 1080 / 50) = min(28.7, 21.6), before any page chrome |
| One turn as a PublicTick (before) | 115.3 KB mean at 512 (14.4 KB at 64) | 90 turns, seed 77; about 230 bytes per tank with its move and shots (115.3 x 1024 / 512), not the 110 the spec estimated |
| One turn as a CompactTick (after) | 18.0 KB mean at 512 (2.1 KB at 64) | 6.4 times smaller at 512 (115.3 / 18.0), 6.8 at 64 |
| Server output at 512 viewers and a 0.6 s turn, before | about 96 MB/s | 115.3 KB x 512 / 0.6 s = 98,389 KB/s |
| The same, after (measured by the load test) | about 13.8 MB/s | 27.5 KB/s per client x 512 = 14,080 KB/s |
| One arena message with 512 players | 48.7 KB in the lobby, 98.4 KB after round 1 | `toPublicArena` of 512 joined players; round 1 adds 512 standings and 256 survivor ids. Each later round adds its standings (256, 128 and so on). |
| Arena messages for 512 joins, every stream open, before | about 4.37 GB | the k-th join sends a message of k / 512 x 48.7 KB to k streams; the sum over k = 1 to 512 |
| Arena file with 512 players | about 350 KB in the lobby; the arena alone is 512 KB after round 1, and the round config of each started round adds the strategies again | the strategies of the players are most of it |

### Changes

| Item | Change | Kept on purpose |
|------|--------|-----------------|
| Capacity | `maxPlayersOf("presenter")` is 512. Joins per minute per address: 1,200 (about 2.3 per player, for retries). Open streams per arena: 600 (512 players, the presenter page, the big screen and second tabs). | "Number of tanks within r squares" keeps its maximum of 64: the count only gets a ceiling, and nothing breaks. The test against recorded rounds stays at 64 players, as the spec asks. The body limit of 64 KB is the size of a strategy document, not a player count. |
| Engine speed | `strategy/snapshot-index.ts`: one index per snapshot (bots by square, by id, scores sorted), kept in a WeakMap keyed by the snapshot object. "Who stands on this square" is one map lookup. "The first tank in my line" walks the line square by square. "Tanks aimed at me" walks the 8 lines around the tank, up to the longest shot, and is kept per snapshot. "In the line of fire", "Move away from the crowd", "The tank with the fewest tanks near it" and the cut-line score read the index. | Results: no change. Every engine test passes, 20 recorded 64-player rounds (`src/round/large-round.test.ts`) match tick for tick, and a scratch comparison against a copy of the old engine matched 150 turns at 512 tanks (25 turns under each rule set) and 1,613,040 condition, selector and action answers at 160 tanks. |
| Turn messages | The `tick` message and `ReplayResponse.ticks` carry a `CompactTick` (`packages/arena/src/compact-tick.ts`); `roundStart` keeps the full snapshot. The server serializes and encodes a turn once and adds only `own` per player. | In a compact shot, "empty" writes -1 for the distance as well as for the target and the hit chance. |
| Arena messages | A message that changes only the player list goes out at most once per second per arena (`DEFAULT_ARENA_MESSAGE_INTERVAL_MS`), as the newest list. Any other change goes out at once and replaces the one that waits. | Public arenas show a countdown, so their messages differ in `auto` and still go out at once. |
| Load-test client | The load test reads each stream on its own TCP connection and checks the chunked framing itself. With Bun's fetch as the reader, 3 to 9 of 512 streams failed with InvalidHTTPResponse in 5 of 7 runs whose joins took under a second (failed streams per run: 7, 4, 3, 3, 0, 0, 9; the two clean runs were 20-turn runs). Runs with slower joins (3.76 s and 12.67 s) had none, and copying each chunk per stream did not stop it (the 9 came with copies). The strict reader found no framing error in 3 runs of 512, so the failures came from Bun's fetch client, not from the server's output (inferred from these runs). | The server keeps one encoded chunk for all streams. |
| Saving | An arena whose only changes are strategy, colour or bot-fill edits is written at most once per second (`SAVE_INTERVAL_MS`). A new arena, a join, a leave, bots, a phase change and the round runner's events are written at once, and so are the edits that wait. `Store.flush()` writes the rest at shutdown. Worst loss in a crash: 1 second of edits. Tested with the manual clock in `store.test.ts`. | A failed coalesced save is logged and tried again a second later; the request already got its 204. |
| Streams | 600 open streams in one hub: heap +778 KB, one heartbeat round 0.045 ms (every 15 s). A stream dropped for reading too slowly is now logged. | One heartbeat timer per stream stays: 600 timers every 15 s cost nothing measurable. |

### Engine time per turn

`bun packages/engine/scripts/large-round.ts bench <players> 90`, every play style in equal shares, standard rules.

| Players | Before | After | Factor |
|---------|--------|-------|--------|
| 64 (3 rounds) | 2.39 ms mean, 4.95 ms worst | 0.22 ms mean, 2.21 ms worst | 10.9 (2.39 / 0.22) |
| 512 (1 round) | 999.78 ms mean, 1,420 ms worst | 4.03 ms mean, 11.86 ms worst | 248 (999.78 / 4.03) |

Measured again an hour later (load average 3.4, the old engine from a copy taken before the change): 64 players 2.37 ms before and 0.25 ms after; 512 players 979.43 ms before (1 round) and 3.84 ms after (3 rounds).

At 512 after the change, the other rule sets give 4.0 to 5.1 ms mean (2 rounds each, worst 18.8 ms). The target was below 50 ms, so a 0.6 s turn leaves room. Before the change, the time grew as about n to the power 2.9 (999.78 / 2.39 = 418 for 8 times the players; log 418 / log 8 = 2.9), because "aimed at me" scanned every tank for every tank, for every tank.

### Load test

`apps/server/scripts/load-test.ts`, one cut round of 40 turns at 600 ms, every player joins from one address and opens its stream right after the join. The client runs on the same laptop. CPU "before" is `ps %cpu`, which macOS reports as a decaying average; CPU "after" is computed from the CPU time `ps` reports, per 500 ms step, where 100% is one core. The "before" run reads the streams with fetch; both "after" columns use the final code and the strict reader (the reader does not change bytes or intervals). The 512 column is the first of three runs (the other two: joins 0.58 and 0.56 s, worst interval 620 and 622 ms, 512 of 512 streams).

| | 64 before | 64 after | 512 after |
|---|---|---|---|
| Time to join every player with a stream | 0.04 s | 0.03 s | 0.51 s (3.76 s in one fetch run at a load average of 8.5) |
| Turn interval seen by clients, mean and worst | 601 ms, 620 ms | 601 ms, 608 ms | 601 ms, 625 ms |
| Bytes per second per client in the round | 21.9 KB/s | 3.5 KB/s | 27.5 KB/s |
| Bytes per turn per client | 13.2 KB | 2.1 KB | 16.5 KB |
| Server CPU in the round | 2% mean, 7% worst (decayed) | 1% mean, 4% worst step | 7% mean, 18% worst step |
| Server memory in the round, mean and worst | 62 MB, 116 MB | 46 MB, 100 MB | 130 MB, 235 MB |
| Streams that got every turn | 64 of 64 | 64 of 64 | 512 of 512 |
| Strategy saves in the break (half answer 409: an eliminated player may not edit until the final) | mean 1.7 ms, worst 6.6 ms | mean 1.6 ms, worst 5.5 ms | mean 2.9 ms, worst 12.3 ms |

One 512 run with compact turns but before arena messages were held back took 12.67 s to join; every stream got every turn, and its turn interval was 608 ms mean, 877 ms worst.

### Dry spell: a shot costs 4 instead of 5?

`scripts/probes.ts 1000 <turns>` (Statue) and `scripts/simulate.ts 1000 <turns>` (Table 5, Dry spell column), seeds 1 to 1000. Luck is 12.5%.

| Measure | Cost 5, 90 turns | Cost 4, 90 turns | Cost 5, 150 turns | Cost 4, 150 turns |
|---------|------------------|------------------|-------------------|-------------------|
| Statue (stands still) | 14.8% | 13.7% | 9.6% | 8.5% |
| Turtle (hides in a corner) | 0.2% | 0.5% | 0.1% | 0.1% |
| Top play style | Dry hunter 19.9% | Dry hunter 22.8% | Dry hunter 22.3% | Evader 23.4% |
| Fewest hits of a designed style per final | Leader chaser 8.2 | Backstabber 9.5 | Backstabber 13.7 | Backstabber 15.8 |
| Charger (filler) | 8.2% | 6.3% | 2.9% | 3.2% |
| Mean hits per tank per round | 9.34 | 11.27 | 15.81 | 19.04 |

Conditions of `62-diagonal.md` at cost 4: 1 holds (every designed style lands hits, the Charger and the random walker stay below the best style), 2 holds (Ambusher 29.4% of the standard mixed field; Dry spell does not enter it), 4 holds (three different leaders at both lengths). Condition 3 still fails: the Statue wins 13.7% at 90 turns. One standard deviation at 1,000 finals is about 1.0 point (sqrt(0.125 x 0.875 / 1000) = 0.0105), so 13.7% is about one deviation above luck, not clearly below it.

Decision: the cost stays 5, because the spec keeps the change only when the standing tank falls below luck. The point stays open for the owner, with the other answers listed under "Open after eight directions".

### A large round is sane

100 rounds of 512 tanks, 90 turns, rule sets in turn (17 rounds each for the first four, 16 for the last two), seeds 5000 to 5099:

| Rule set | Mean hits landed per tank | Tanks that never shot at a tank | Rounds whose scores do not sum to 0 |
|----------|---------------------------|---------------------------------|-------------------------------------|
| Standard | 16.64 | 0.00% (0 of 8,704) | 0 |
| Arm's length | 17.85 | 0.02% (2 of 8,704) | 0 |
| Dry spell | 9.31 | 0.02% (2 of 8,704) | 0 |
| Downpour | 25.26 | 0.05% (4 of 8,704) | 0 |
| Open field | 15.10 | 0.31% (25 of 8,192) | 0 |
| Sharp eyes | 16.49 | 0.01% (1 of 8,192) | 0 |
| All | 16.79 | 0.07% (34 of 51,200) | 0 |

The hits per tank are close to those of a final of 8 (17.22 under standard rules at 90 turns), so a crowded arena plays at about the same pace.

### The measured limit

What worked at 512 on this laptop: 512 players joined from one address with their streams in 0.51 to 0.58 s, every one of 512 streams received every turn of a 40-turn round at 600 ms in three runs, the worst turn interval a client saw was 625 ms, and the server used 5 to 7% of one core on average and at most 235 MB. The engine needs 4 to 5 ms of a 600 ms turn.

What could not be measured:

- Real phones: parsing and expanding 18 KB per turn, and drawing 512 tanks (L2 measures the big screen in headless Chromium).
- A venue's Wi-Fi: 512 phones need about 13.8 MB/s together at the fast pace, plus about 49 KB per phone for each arena message while players join. Whether a venue's access points carry that is unknown.
- Clients on other machines: the load-test client shared this laptop with the server, so the numbers include its own work.
- Several 512 arenas at once, and a whole game of 7 rounds: one cut round was run.

### Debt from this package

| Debt | Ceiling | What would clear it |
|------|---------|---------------------|
| Replay of a 512 round | The first request blocks the event loop: 352 ms for 90 turns, 1,133 ms for 300 turns, and other arenas' turns wait. Each player who asks costs one gzip (33 to 101 ms). The web client does not request replays today. | Compute the replay in a worker, and gzip the shared part once |
| Arena messages carry the whole player list | 48.7 KB per message at 512 players, at most once per second while players join | A message that carries only the change, which the web would have to apply |

## Tank identity, 2026-11-12

The owner asked: "For tank identity, it is best to introduce a lot of skins, polkadot etc, with option for custom bg and custom icon on top of the tank for easier identifier, also custom name (alphanumerical)." The work package is `docs/specs/revamp/69-tank-identity.md` (T1). This section records the server half; `TankLook`, `parseTankLook` and `parsePlayerName` in `packages/arena/src/types.ts` are the contract.

### The look

| Part | Choices | Count |
|------|---------|-------|
| Body colour | 12 colours (was 8) | 12 |
| Skin | plain, dots, stripes, slants, checks, zigzag, waves, stars, hearts, splashes, bricks, scales | 12 |
| Second colour | the 12 colours except the body colour | 11 |
| Plate | none, or one of the 12 colours | 13 |
| Icon | none, or one of 24: star, heart, bolt, drop, leaf, sun, moon, crown, fish, cat, bird, flower, rocket, key, bell, anchor, cloud, flame, gem, paw, note, snowflake, mushroom, smile | 25 |

12 x 12 x 11 x 13 x 25 = 514,800 values. A plain skin does not draw the second colour, so 475,800 looks are different on screen: 12 x 11 x 11 x 13 x 25 = 471,900 with a pattern, plus 12 x 13 x 25 = 3,900 plain. The second colour differs from the body colour also on a plain look, so a change from plain to a pattern never draws the pattern in the hull's own colour. Bots get a plain look in the least-used of the 12 colours, with no plate and no icon.

A stored arena of version 3 has a `colour` per player. It loads as version 4 with a plain look in that colour; a whole number outside 1 to 12 is clamped into that range. A stored name is read as text and is not checked against the new name rule, because files from before the rule hold names it refuses, and a file that fails stops the server start.

### The name rule

A name has 3 to 16 characters: the letters A to Z in either case, the digits 0 to 9, and one space between two words. The server applies NFKC first, so full-width letters become plain letters, then trims the ends and turns a run of spaces inside the name into one space. "Name taken" ignores case. The same rule holds in every arena kind, for bots, and for the account's "My tank". A join without a name gets a two-word name from the game; the lists hold 24 x 24 = 576 names, so a full presenter arena of 512 players leaves at least 64 free. The name of a play style keeps its own rule (1 to 24 characters of free text), because only the player sees it and play styles saved under that rule must keep loading.

### Typed names in public arenas

The decision of 2026-11-11 was that public arenas use names from the game only, because free text shown to strangers is not safe for children. The owner's request for a "custom name (alphanumerical)" reverses it: a player may type a name in a public arena too. The mitigation is a block list in `apps/server/src/name-filter.ts`, which holds 182 English and Indonesian words (with common Javanese and Malay forms), written from common knowledge and not copied from a published list. A name with a blocked word is refused with 400 `name_blocked` and a name from the game as `suggestion`.

The filter reads the name three times: with every digit as a space, with look-alike digits as letters (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, 8 b, 9 g), and the same with 1 as l. Most words match only a whole word of the name, so "Classic Bass", "Grape Juice" and "Pantai Indah" pass. Words that do not occur inside ordinary words or names also match inside a longer word. A name is read with its spaces removed only when a word of one or two letters shows that a word was split on purpose; two ordinary words are never joined, so "Bang Satria" and "Meme King" pass. For a word without a doubled letter, a run of one letter counts as one letter, so stretching a word does not hide it, while "As Fast As Me" passes.

### Named limit

A block list never catches everything: a new spelling, another language, or a rude word built from two innocent words passes it. A contained word can also refuse an innocent name; "snigger" is the known case. Because of this limit, the owner of a private or presenter arena can remove a player in the lobby (`DELETE /api/arenas/:id/players/:playerId`). The removed player's token stops working at once, and the player can join again with a new name, so a removal is not a ban. The page delays the request for a few seconds to offer Undo, because the server cannot restore a token. A public arena has no owner, so nobody can remove a player there; the block list is its only check.


## Three public arenas, 2026-11-12

The owner asked: "The public arena should have 3, one is monthly basis with winner recorded for each month, one is running tournament that keeps reset, one is experiment public with a quick reset (default of first timer join)." The work package is `docs/specs/revamp/67-public-arenas.md` (P3a for the server, P3b for the web). The contract is `packages/arena/src/types.ts` (the kinds, `ready`, the routes) and `packages/arena/src/public-protocol.ts` (status, league and champions).

### The three arenas

| | Practice arena | Tournament arena | Monthly arena |
|---|---|---|---|
| Kind in code | `practice` | `tournament` | `monthly` |
| People per room | 8 | 64, waiting ones included | 8 |
| Rooms | a new room when all are full, up to `PUBLIC_ARENA_MAX` | exactly one | a new room when all are full, up to `PUBLIC_ARENA_MAX` |
| Bots | fill to 8 | fill to 16 | fill to 8 |
| One game | one round of 60 turns at 0.9 s | rounds of 90 turns, each keeps the top half until 8 remain, then the final; 20 s between rounds | one round of 90 turns |
| Start | 30 s after the first person (raised from 15 s on 2026-11-12: a first-timer lands here and needs time to read the lobby), or 3 s after everyone is ready | 60 s, or 5 s after everyone is ready | 30 s, or 3 s after everyone is ready |
| After the game | result for 12 s | result for 30 s; a person who won goes on the list of recent winners | result for 20 s; each person's points go to the monthly score |
| Who plays | anyone | anyone | signed-in accounts only; anyone watches |

Reasons. The practice arena is where a first-timer lands, so its games are short (54 s) and its countdown is short: a child sees a whole game within about a minute and a half of arriving. The tournament fills to 16 so that every tournament has a cut round before the final; with 8 there would be only the final, and the knockout would not show. It has one room so that "the tournament" is one event everyone watches, and a visitor who arrives while it runs waits for the next one, as in every public arena. The monthly arena needs an account because the score belongs to a person over a month; a device-only identity would be lost with the browser's storage. The numbers live in one place, `apps/server/src/public-kinds.ts`; the capacities and the bot fill live in the arena package (`maxPlayersOf`, `botFillSizeOf`) because the reducer and the stored form check them.

Ready. A person in a public lobby can tap "I'm ready". When every person in the room is ready, the countdown drops to the short time; a new person who joins is not ready, so the normal countdown continues from where it was. Ready only ever shortens a countdown: when the normal countdown ends sooner than the short time, it stays. The reducer owns who is ready and clears it at the start, the reset and a failed round; the server owns the timers.

### The monthly score

An account's monthly score is the sum of its 20 highest round scores of the month that are above 0. A round at 0 or below never counts. The ranking orders by score, then by games won, then by who reached the score earlier.

Worked example. Ayu plays 23 monthly games in November with these round scores: 14, 12, 12, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 3, 2, 1, 0 and -6. Twenty-one rounds are above 0, so the 20 highest count: 14 + 12 + 12 + 11 + 10 + 10 + 9 + 9 + 8 + 8 + 7 + 7 + 6 + 6 + 5 + 5 + 4 + 3 + 3 + 2 = 151. The 1 is the 21st best and drops out, and the 0 and the -6 never count. If Ayu now ends a game with 4 points, the 4 replaces the 2 and the score rises by 2 to 153 (`lastGame.added` is 2). Budi also has 151 points: if he won more games than Ayu, he ranks above her; with equal wins, the one who reached 151 first ranks above.

The month is the calendar month in `LEAGUE_TIME_ZONE` (default `Asia/Jakarta`). The server checks for the month's end when a monthly game ends (before it records the game, so a game that ends after midnight counts in the new month), at start, when the league is read, and once an hour. A month that ends stores its champion and top 10 for good in `DATA_DIR/league/champions.json`; a month in which nobody scored above 0 closes with no record. A month that ended while the server was down is closed at the next start.

### Decisions the spec left open

- What a player gained reaches the page through `GET /api/league/me`, not through a `leagueGain` field on the stream. The server records the score in the step that stores the final's result, before the finished arena message is sent, so a page that asks when it sees that message gets the new standing. `you.lastGame` (arena code and game number) tells the page whether the numbers belong to the game it watched.
- `PublicArena.nextGameInMs` was added so the result screen can say when the next game starts: in the finished phase it is the result time left plus the kind's full countdown.
- A failed save of a finished game's result is logged and the reset still runs, so a broken disk does not stop a public arena. The game is then not recorded.
- The tournament arena is never removed, even when it is empty at its reset. Extra practice and monthly rooms with no person left are removed at their reset, as before.
- Every account that played a monthly game this month has a row in the ranking, also with score 0. The stored top 10 of a month lists only rows above 0.
- `POST /api/public/seat` for the tournament returns its one arena even when it is full; the join then answers 409 `arena_full`, so the page offers the practice arena.
- A stored file of the old single public arena (version 4, kind `public`) is removed at start with one log line. Version 5 adds `ready` to each player and `playerAccounts` to a monthly arena.
- The bot names grew from 20 to 32, so 15 bots in a tournament always find free names next to 15 people who might have typed bot names.

### Named limits

- An email is not verified, so a person can register several accounts and hold several rows of the ranking.
- A player can raise their score by playing when only bots are in the room.
- The record carries no prize.
- An account holds one monthly seat at a time. A player who loses the page's stored token cannot leave or play from another device until the seat is removed: an absent player is removed at the reset after 3 minutes without an open stream.

## Public arenas after the first-timer test, 2026-11-12

A first-timer test with a real browser at real timings found four problems in the public arenas. The work package is `docs/specs/revamp/73-after-first-timer-test.md` (P4a for the server, P4b for the web). The numbers are in `apps/server/src/public-kinds.ts`.

| Problem | Decision | Where |
|---------|----------|-------|
| "Play now" seated a newcomer in a practice room whose game ran: 77 s before their first game, against the promise of 30 s. | The practice seat prefers a room in its lobby with a free seat; with none, it opens a new room up to `PUBLIC_ARENA_MAX`; only at that maximum does a visitor wait in a running room. An extra practice or monthly room that holds no human for one whole game (lobby, round and result: 104 s for practice, 131 s for monthly) closes; the last room of a kind stays. | `choosePracticeRoom` and `syncEmptyClose` in `public-arenas.ts` |
| A tank whose browser was closed kept its seat, kept playing monthly games and collected 28 points. | When a game starts, a human whose stream has been closed for more than 20 s does not play and is removed; the 3-minute rule stays at the reset. A monthly game scores only for players whose stream was open when it ended. | `startRound`, `removeAbsent` and `settle` in `public-arenas.ts`; presence from `StreamHub` only |
| The practice result showed for 12 s; its text needs 17 to 28 s of reading. | The practice result is 20 s. "I'm ready" is accepted on the result, and the reset keeps it, so a player who tapped it is ready in the next lobby; when everyone did, the next game starts after 3 s. | `readyIsOpen` and `applyReset` in `packages/arena/src/arena.ts` |
| Deployment behind a proxy had no health route. | `GET /api/health` answers `{ ok: true, startedAt, arenas }` without a session and without reading files. | `server.ts` |

Reasons. A seat in a lobby is the only way to keep the overview's promise of a game within 30 s, and bots fill a new room, so a newcomer never waits for other people. A new room per visitor would grow without bound, so the maximum still holds, and a room nobody came to closes once a whole game has passed without a human in it. Twenty seconds without a stream is longer than a phone needs to reconnect after a network change and much shorter than one game, so a closed browser stops holding a seat at the next start instead of after 3 minutes. A score needs a person who watched the game, which is why the open stream at the end decides it and not the join. Twenty seconds of result covers most of its reading time; a player who wants to go on taps ready and loses nothing.

### Decisions the spec left open

- Ready after the reset is decided in the reducer: a human who tapped ready on the result stays ready, everyone else is not. A round start and a failed round still clear it. Waiting players (who joined during the game) may tap ready on the result too. The stored arena allows a ready player in the finished phase of a public arena; the file's shape did not change, so its version stays 6.
- The result time does not shorten when everyone is ready on it; the short time applies in the next lobby.
- The 20-second rule runs only at a game's start (lobby to round 1). A tournament's break cannot remove players, so a tank that leaves during a tournament plays it to the end.
- When the 20-second rule removes every human, no game starts: the room idles in its lobby rather than playing bots against bots.
- A human who never opened a stream counts from the moment they joined. After a restart every human counts as seen at the restart.
- A room that shows its result is not a lobby for the seat rule, because its next game is 20 s plus 30 s away.
- Among lobbies with a free seat, the one with the most humans wins, so games have the most people; the same holds among running rooms at the maximum.
- The monthly seat rule is unchanged (the busiest room with a free seat, in any phase).
- The 20-second and 3-minute times are not divided by `PUBLIC_TIME_DIVISOR`, so a scripted run removes players as real play does.
- `startedAt` in the health answer is the server's start, ISO 8601 in UTC; `arenas` counts open arenas of every kind.
- The tournament break stays 20 s; the server did not change for row 4, and P4b cuts the text.

### Named limits

- A visitor who gets a lobby seat a moment before its countdown ends may still join after the start and wait for the next game.
- A player who closed the page less than 3 minutes before a reset is not ready in the next lobby, so the others wait the full countdown once; the 20-second rule then removes that player at the start.
- A restart between storing a monthly result and recording it records the game for nobody, because no stream is open in a new process.
- The empty-room timer lives in memory; a restart starts it again.
- The monthly score reads the stream at one moment, so a player whose page is reconnecting when the game ends gets no points for that game.
- `POST /api/public/seat` can return an empty lobby whose closing timer runs out before the visitor's join arrives; that join then answers 404.
- `PublicArena.nextGameInMs` on the result counts the short time when every human is ready; a player removed at the reset (3-minute rule) can make the real start sooner than it said.

## Arena chat, 2026-11-12

The owner asked: "Arena chat with 1 day retention should be good, in the waiting room, I plan to organize a tournament for my friends, while they wait for the organizer (me) to start it, they can have chit chat, rate limit it." The work package is `docs/specs/revamp/72-arena-chat.md` (CH1a for the server, CH1b for the web). The contract is `packages/arena/src/chat-protocol.ts` and `packages/arena/src/types.ts` (`Arena.chat`, `PublicArena.chat`, the event `setChat`, the stream messages `chat` and `chatRemoved`, the routes). The server half is `apps/server/src/chat.ts`, `chat-routes.ts`, `rate-limit.ts` and `hasBlockedWordInText` in `name-filter.ts`.

### What the chat is

| | Decision |
|---|---|
| Arenas | Private and presenter only. A public arena has no chat (`chat: null`, 404 `no_chat`). |
| When | Lobby, break and after the game. While a round runs, reading works and posting answers 409 `chat_closed`. |
| Who | A player in the arena (by token) and the owner (by session, as the host). Never a viewer, never the big screen. |
| Text | 1 to 200 characters on one line (`parseChatText`), shown as plain text. |
| Switch | The owner turns the chat off and on in any phase (`setChat`). Off: nobody reads or posts (409 `chat_off`). |
| Retention | 24 hours, at most 500 lines per arena. Pruned on every read and in the 10-minute sweep. Closing or expiring the arena removes the chat. |
| Rate limit | Per sender 5 at once, then 1 every 3 seconds; per arena 20 at once, then 5 per second. |
| Moderation | Removing a player removes their lines and sends `chatRemoved`. No deletion of single lines. |

### Decisions the spec left open

- `chat` sits on `Arena`, not in `ArenaSettings`, because the create request carries the settings and an older page would no longer pass the settings check. The stored arena rose to version 6; a version 5 file gets `"on"` in a private or presenter arena and `null` in a public one.
- The caller of a chat route: a player token makes a player (a wrong token is 403); without a token the owner's session makes the host (401 without a session, 403 `bad_origin` on a POST from another site, 403 `not_owner`). In a private arena the owner who also plays posts as their tank from the room page and as the host from the host page.
- The owner's stream is recognised when `/events` opens with the owner's session cookie; EventSource sends it by itself. A player the owner removed keeps an open stream for a moment, so the chat goes to the streams of the players who are in the arena now, not to every stream with a player id.
- `GET` while the chat is off answers 409 `chat_off`, so a line that made the owner switch it off is not served to anyone who arrives later. The lines stay and come back when the owner turns the chat on again.
- The `chat` stream message carries one line; the history is not sent on connect. A page reads `GET /api/arenas/:id/chat` when its stream opens and after a reconnect, and drops a line whose id it already has.
- The rate limit is a token bucket beside the existing sliding window in `apps/server/src/rate-limit.ts` (moved there from `auth/`). A sliding window cannot say "5 at once, then 1 every 3 seconds". Both buckets are checked before either is spent, so `chat_busy` costs no sender token and `chat_too_fast` no arena token. The refill is stored as milliseconds per token, because 1/3 token per second is not exact in floating point. The wait goes in `retryAfterMs`; `Retry-After` carries it in whole seconds, rounded up.
- A line refused for a blocked word spends its tokens, which slows down a person who tries spellings; an invalid line spends none.
- A chat post is not an arena event, so it does not keep an arena from expiring.
- The chat file is written at once when the last write is more than a second old, otherwise at the end of that second; a failed write is logged and tried again a second later. A chat file whose arena is gone is removed at start, because a crash can fall between removing the arena and removing its chat.
- A removed player's sender bucket is dropped. Message ids are `m` and 12 hex digits from the system's random source.

### The block list for sentences

`hasBlockedWordInText` uses the two word lists of the name filter with a stricter join. The name rule joins every word when one is short, which in a sentence finds "bangsat" in "bang satu aja ya". For a sentence, a whole-list word must be a whole word and a contained-list word may sit inside a word, as for names; only a run of one-letter words is read joined ("f u c k"); digits read as letters only in a token that also holds a letter, so "skor 455" and "0812-455-1234" pass and "k0nt0l" does not; inside a word @ $ ! read as a s i and a * is dropped; invisible format characters (a zero-width space) are removed; "wkwk" laughter is skipped, although it holds "kkk". The test keeps 45 ordinary Indonesian and 46 ordinary English lines that must pass and 29 lines that must be refused (with digits for letters, repeated letters, spaced and dotted letters, symbols and a zero-width space).

Known false hits: ordinary words on the list (Indonesian "babi" and "monyet"), "tai chi", "tit-mouse", "homo sapiens". Known misses: a word split in two-letter parts ("f uck"), letters of other alphabets that look Latin.

### Named limits

- A block list never catches everything. The owner can turn the chat off and remove a player.
- A message lost in the second before a crash is not recovered.
- A player who rejoins under a new seat gets a fresh sender limit, and a restart refills every bucket.
- `GET` answers the newest 100 lines and has no cursor, so lines 101 to 500 are kept but cannot be read.

## Organiser tournament, 2026-11-13

The owner asked for a tournament for friends with a gift for the winner: 5 minutes per round, the organiser decides when each round starts, signed-in players only, kick with or without the right to rejoin, a result and round history that stay viewable, and a winner who can be traced. The work package is `docs/specs/revamp/75-organiser-tournament.md` (O1). Two changes came the same day: "signed-in players only" became the three-level setting "Who can join", and a private arena holds 64 players. A "Support" entry in the header came with them.

### What was built

| Part | Decision | Where |
|------|----------|-------|
| Round length | 1, 1.5, 2, 3 or 5 minutes; turns = length / turn time (50 to 500, inside the server's 20 to 600) | `apps/web/src/create/createRequest.ts` |
| Who can join | `ArenaSettings.joinPolicy`: `"anyone"` (default), `"account"`, `"verified"`. Account and verified: a session per join (401), one seat per account (409 `account_seat_taken`), the email for the owner only, bans. Verified also needs `emailVerified` (403 `email_not_verified`). Public arenas are always `"anyone"`. | `packages/arena/src/types.ts` (`joinNeedsAccount`), `apps/server/src/routes.ts` |
| Ready | Lobby and break of an owner's arena, status "playing" only, with a take-back (`DELETE .../ready`). It informs; the owner decides. | `arena.ts` `applySetReady`, `readyIsOpen` |
| Scheduled start | `phase.start`: waiting, scheduled (`startsAt`), missed. The reducer owns the plan, `scheduled-start.ts` keeps one timer per arena equal to it after every change, through AutoSteps, so every viewer counts from `PublicArena.auto` and never from the phone's clock. | `apps/server/src/scheduled-start.ts` |
| Removal | `ownerRemove` in a lobby (the seat goes) or a break (status `"removed"`, kept for the round history, dropped at the reset). A break keeps two playing tanks. `ban` adds the account to `Arena.banned`; `allowAgain` lifts it. | `arena.ts`, `room/usePlayerRemoval.ts` |
| Stored result | `DATA_DIR/results/<id>.json`, 0600, atomic, 128-bit id, kept 180 days (the 10-minute sweep). The file holds account ids, never an email; the email is read from the auth store when the owner asks. | `apps/server/src/results.ts`, `packages/arena/src/results-protocol.ts` |
| Ended arena | `GET /api/arenas/:code` answers 404 with `resultId` of the code's newest kept result. | `routes.ts` |
| Support | A quiet heart in the header opens a modal with the GitHub Sponsors link and the business address (`apps/web/src/support/contact.ts`). | `apps/web/src/support/` |

### Decisions the spec left open

- The start plan is a union in the phase (`start: { kind: "waiting" } | { kind: "scheduled", startsAt } | { kind: "missed" }`), not a bare `startsAt`, because the owner must learn of a missed start from the arena itself: a phone that slept reconnects and receives only the arena message, so a one-time stream notice would be lost.
- A removal in a break keeps the player as status `"removed"`, because every round's standings must name players of the arena and the round history needs the name. The account stays with the player until the reset, so the stored result can still name it.
- The ban list lives on `Arena` (the reducer owns it, as the spec asks) and never reaches `PublicArena`, because it holds account ids. The owner reads it with emails from `GET /api/arenas/:id/accounts`.
- An account is recorded only in an arena that needs one; in an arena anyone may join, nobody saw the email sentence, so no account is linked even when a visitor is signed in.
- A removal with a ban happens at once and has no Undo; "Allow again" in the settings is the way back. A removal without a ban keeps the toast with Undo.
- The stored result is written by a listener of the store when a finished owner's game has no `resultId`, then `resultStored` links it. A failed write is logged and tried again on the arena's next change. Arenas loaded at start get theirs then, so a game that finished before this version also gets a result.
- `emailVerified` is a field of the accounts file, which rose to version 2 (a version 1 file reads with every email not verified). `Auth.markEmailVerified` is the one way to set it; sending codes is the next package.
- The phone keeps its panes: in an owner's arena "I'm ready" is a medium button without a helper sentence, the owner's start bar shows the ready count and hides "8 tanks will play" below the laptop width (a reason that blocks the start always shows), during a countdown both buttons are medium so they share one row, the result link's QR code shows from the laptop width only, and the accounts kept out are a step of their own behind "1 player is kept out" in the settings. Each came from a no-scroll audit failure at 360 x 640.
- The header holds a sixth control (Support). Below 400 px it uses an 8 px gutter and 4 px gaps, the only way six 44 px targets and the language switch fit in 360 px.
- A player removed in a break has no final place, so the final ranking skips that place (7, then 9).
- The Try it tab closes when the round starts because the room shows the round's own panes; a module flag (`practice/testMatchShown.ts`) lets the room say so in one sentence.

### Named limits

- A scheduled start does not survive a server restart; the plan goes back to waiting.
- An account's seat cannot be taken on a second device: the join answers `account_seat_taken` and the token is only in the first browser. A route that hands the seat's token to its own account would clear it.
- Every kept result is held in memory. An arena code can be drawn again after its arena ended; the ended-arena link then answers the newer arena.
- Until email verification exists, an arena set to "players with a verified email" admits nobody.

## Steps in order (S3), 2026-11-13

A rule's action is one action, as before, or a sequence of 2 to 4 steps (76-email-and-sequences.md, S3).

### Decisions the spec left open

- Stored shape: `Rule.action` is `ActionRef | { steps: ActionRef[] }`, told apart with `"steps" in action` (`isSequence`). Every older strategy keeps its shape and plays as before; `Mode.fallback` stays one action.
- A step is an `ActionRef` whose action is one of `STEP_ACTION_IDS`: `stepForward`, `turn` (any way), `throw`, `wait`. `parseStrategy` adds two issue codes: `stepCount` and `notAStep` (a shortcut such as "move toward" as a step).
- "Wait" did not exist: `T` with a tank in line shoots. It is a new action `wait` with a new move `W`, appended last to `MOVES` so the compact tick indexes stay. The one-action picker leaves `wait` out, so it keeps its 12 choices; the engine accepts it as one action.
- "Turn around" is not added, because the engine has no 180 degree move.
- The tank's place in a sequence lives in the round's private state (`RoundRuntime.sequences`), not in `BotState`, so a round without sequences produces the same snapshots and decisions byte for byte. `Decision.step` (`{ index, count }`) is present only on a sequence turn.
- The firing turn does step 1 after the conditions and the chance roll; later steps read no rule and draw no random number; a blocked step or a dry shot uses its turn; a hit does not stop a sequence; the mode switch applies after the last step; the round's end ends a sequence. The state machine is a table in `packages/engine/src/strategy/sequence.ts`.
- Editor: "One action" / "Steps in order" in the rule's Do part. A tap chooses a block; large buttons set its kind (forward, turn left, turn right, shoot, wait), move it earlier or later, or remove it; "Add a step" appends. No drag.
- Replay: under the board, for a strategy with steps, one line names the rule and the step, over that rule's step row with the running step filled. The turn's rows add "Step 2 of 3". The live feed adds "This was step 2 of 3 of rule 2."

### Named limits

- A browser with the old bundle cannot read a tick whose move is `W` (index 6). Reload clears it.
- Slight turns are valid steps but the editor offers only left and right.

## Email verification and password reset (E1), 2026-11-13

Codes by email over SMTP (76-email-and-sequences.md, E1), absolute link-preview addresses, and three follow-ups from O1.

### Decisions the spec left open

- Codes live in their own file, `DATA_DIR/auth/codes.json` (version 1), so `accounts.json` stays version 2. A code is stored only as an argon2id hash (`Bun.password`): a 6-digit code under SHA-256 would come back from a copy of the file in under a second.
- A try counts as wrong before the slow hash check and is dropped when the code is right, so parallel guesses cannot pass 5. A new code replaces the old one at once.
- The sign-up's code counts against the account's send limit (1 a minute, 5 an hour). A failed send at sign-up still creates the account; the answer says `verificationEmail: "failed"` and the code step offers a new code.
- A reset answers 202 for every valid email before anything about the email happens: the per-email limit, the hash and the send run after the answer, so neither the answer nor its time tells whether the email has an account. Only the per-address limit answers 429. The confirm has one error, `code_invalid`, for an unknown email and a missing, wrong, expired or used-up code.
- A right reset code also marks the email verified, because it proves the same mailbox. It ends every session and signs the resetting browser in.
- The page sends its language with each request that causes an email; English when none is sent.
- SMTP: port 465 uses TLS from the start; any other port must offer STARTTLS (`requireTLS`). The server never connects at start; half-set settings stop the start.
- Without mail settings, "verified" is disabled in the create form with the reason as its sentence; the server does not refuse such an arena (see debt).
- Second device: an account with a seat in a signed-in-only arena gets the same seat back with a new token in any phase, before the name check (the other device sends the seat's own name). A seat the owner removed in a break answers 409 `wrong_phase`. `account_seat_taken` is gone from the contract. The join step stays open in every phase for a signed-in account in such an arena, because the page cannot see whose seat is whose.
- Final ranking: the reducer closes the gaps once, when the final completes (place = 1 + players with a better place, so ties stay shared). The round standings keep their ranks.
- Link previews: `index.html` goes out with the request's origin (Host, or the first X-Forwarded-Host with TRUST_PROXY; https with COOKIE_SECURE) in front of `og:image`, and an `og:url`. A host that is not a plain host and port leaves the file as built. Root images get a day of cache (`public, max-age=86400`).

### Named limits and debt

- A Gmail account sends about 500 emails a day. A verified email proves a mailbox, not one person.
- Send limits are in memory; a restart resets them.
- The server accepts a "verified" arena while it has no mail settings; the create form is the only guard. Clear it with a check in `POST /api/arenas` (needs an `Auth.canSendEmail` and an error code).
- After a second device takes a seat, the first device's open event stream stays open until it reconnects; its next action is refused and the page drops the seat.
- `ui/ChoiceGroup.tsx` gained an optional `disabled` per card (S0's folder), for the "verified" card.
