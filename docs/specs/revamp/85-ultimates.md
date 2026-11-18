# Ultimates (Jurus pamungkas)

Read `00-overview.md` and `84-items.md` first. Owner, 2026-11-17: eight ultimates, "any strategy can pick any ultimate skill, and only one ultimate skill". Owner, 2026-11-18: "while dashing, it is immune to shot"; the big umbrella "blocks additional side left and right"; a monthly tank that is already seated gets the ultimate of its base play style, "if it differs and we can't find it, randomize, remember, 1 immutable ulti skill for every strategy". The owner gave the trigger, the activation and the visuals to the orchestrator and the advisor (2026-11-18).

The trailer promises the release on 22 November 2026, so the feature is behind a date gate (see Release).

## The eight ultimates

Each play style has one default. The Charger, which only the bots and the scripts use, has Dash.

| Ultimate (en / id / code id) | Default play style | Effect | Trigger (it holds before the tank decides) |
|---|---|---|---|
| Dash / Lari kencang / `dash` | Leader chaser, Charger | The tank drives up to 3 squares straight ahead in this turn, then rams the first tank straight ahead within its throw range: a sure hit worth 2 points, with no roll and no water. It stops before an edge or a held square. **No shot can hit the tank in this turn**, whatever the move order. | The square ahead is free and the tank is not stuck, and either the first tank straight ahead is 2 to 4 squares away, or at least 1 tank aims at this tank (the dash then escapes the shot). |
| Smoke screen / Kabut / `smoke` | Evader | For 15 turns, a shot at this tank uses a quarter of the hit chance (rounded down). | At least 1 tank aims at this tank (`aimedAtMe` with k = 1). No smoke is active. |
| Splash ring / Percikan / `splash` | Random walker | The tank shoots all 8 squares around it for the water of one shot. Every tank in those 8 squares is hit, subject to the defenses below. | At least 2 tanks stand in the 8 squares around, and the tank has the water for one shot. |
| Full tank / Tangki penuh / `fullTank` | Backstabber | The water fills to the top, and the next 3 shots at a tank use no water. | The water is below one shot, and a tank is within the tank's throw range. |
| Mud bomb / Bom lumpur / `mudBomb` | Ambusher | A mud ball lands on the first tank in the throw line. That tank and every other tank within 1 square of it are stuck for 5 turns, and each of them gives 1 point to the thrower. The thrower is never stuck by its own bomb. | A tank is in the throw line. |
| Whirlwind / Angin puyuh / `whirlwind` | Picker | Every other tank within 2 squares spins round to the right for 2 turns (no rule checked), then checks its rules from the bottom up for 2 turns. Each tank within 1 square gives 1 point to the whirlwind tank. | At least 2 other tanks are within 2 squares. |
| Big umbrella / Payung besar / `bigUmbrella` | Dry hunter | A big umbrella blocks the next 4 shots that come from the front, the left or the right, however long that takes. Only a shot from behind gets through. | At least 1 tank aims at this tank. No big umbrella is active. |
| Magnet / Magnet / `magnet` | Item hunter | The 3 nearest items within 4 squares slide to the tank. The tank holds up to 3 items and uses them in the order they came. | At least 1 item is within 4 squares, and the tank holds fewer than 3 items. |

A trigger reads only the snapshot from before the turn and draws no random number. All numbers are in `packages/engine/src/ultimates/ultimates.ts` (`ULTIMATE_RULES`), the one place to tune them.

### Exact rules

- **Direction of a shot.** A shot comes from the direction of the square of the thrower, seen from the target. Compare it with the target's facing in eighths of a turn: 0 is the front, 1 and 7 are front-left and front-right, 2 and 6 are left and right, 3, 4 and 5 are behind. The big umbrella blocks 0, 1, 2, 6 and 7 (5 of the 8 directions), and lets 3, 4 and 5 through. Since 2026-11-17 it blocked the front only (0, 1, 7). Owner, 2026-11-18: left and right also.
- **Big umbrella and the item umbrella.** The big umbrella checks a shot first. The item umbrella checks only a shot that the big umbrella lets through. A blocked shot gives the outcome `blocked`, as the item umbrella does.
- **Dash immunity.** A shot at a dashing tank, before or after its dash in the move order, gives the new outcome `dodged`. The thrower spends its water and draws no hit roll. A dash ends on the last free square of its 3, so it can stop at 0 squares, and the immunity holds then too.
- **Dash ram.** After the drive, the first tank straight ahead within the tank's throw range takes a sure hit worth 2 points: no roll, no water. It is a shot for the umbrellas (the big umbrella's direction rule, then the item umbrella, each block uses one) and does nothing to a dashing tank. Smoke does not reduce it, and the held item does not act. Owner, 2026-11-18: "work more on dash", twice. Measured (cross table, 1,600 finals per cell, average over 7 play styles): the plain dash 11.6%; with a normal shot and the escape trigger 13.4% at first, 11.7% once Splash ring and Mud bomb grew; with the ram (escape kept) 16.0%. A 5-square dash measured 11.5%.
- **Smoke.** It divides the hit chance by 4 before the roll (rounded down), so the roll still draws. Owner, 2026-11-18: smoke and whirlwind "weak, we need to improve it". Measured average over 7 play styles: 12.0% with half the chance for 10 turns, 15.3% with a third for 15 turns, 16.1% with a quarter for 15 turns.
- **Splash ring.** It is one action with up to 8 hits. Each hit moves 1 point (`POINTS_PER_HIT`). A held bucket, pinwheel or mud ball does not act on these hits, and the thrower keeps it. The ring spends the water of one shot (the round's `waterPerThrow`); until 2026-11-18 it emptied the tank. Owner, 2026-11-18: "improve the splash ring again". Measured average over 7 play styles: 13.7% when the water went to 0, 18.0% for one shot's water, 24.4% with 2 points a hit. Every occupied square is hit and needs no roll (owner, 2026-11-18: "make splash ring 3/3 guaranteed"; from 2026-11-17 only the front square was sure and each other square was hit 1 time in 3, which measured among the weakest ultimates). A smoked tank in the ring is hit 1 time in 4 and draws one chance, clockwise from the front, in move order with the other ultimates. The big umbrella and the item umbrella block as for a shot. A dashing tank is not hit.
- **Full tank.** The free shots count only shots at a tank (a shot that spends water today). A free shot draws the hit roll as usual.
- **Mud bomb.** It is not a shot: no hit roll, and no umbrella or smoke blocks it. Each tank it sticks gives 1 point (`POINTS_PER_HIT`) to the thrower, the first tank included (owner, 2026-11-18: "the mud bomb does 1 point to all in area, and keep sucking the point from the first tank"). A held item of the thrower does not act. A dashing tank is not stuck and gives no point. It gives the `stuck` effect for 5 turns (see When ultimates and items meet for an effect the tank already has).
- **Whirlwind.** It gives the `dizzy` effect for 4 turns, of which the first 2 spin. Today `spinsThisTurn` spins only while `turnsLeft > effectTurns.dizzy - dizzySpinTurns`, so a dizzy effect must record its own spin turns: the pinwheel gives 6 turns with 2 spins, the whirlwind 4 turns with 2 spins. Each tank within 1 square of the whirlwind tank also gives it 1 point (`POINTS_PER_HIT`); it is not a shot, so no umbrella or smoke stops it, and a dashing tank gives nothing. Measured average over 7 play styles: 10.7% with the spin alone, 18.7% with the point from tanks within 1 square, 34% with a point from every tank within 2 (the Picker won 40%, which fails the gate), 11.8% when the wind emptied the caught tanks' water.
- **Magnet.** An item that the magnet pulls cannot backfire. A pinwheel or a mud ball backfires only when a tank drives onto it (`84-items.md`). A tank with items from the magnet still takes no item by driving onto it, as a tank that holds one item does today. The first item in the hand is the one that acts. When it is used up, the next one comes forward with its full uses. Equal distances go to the smaller row, then the smaller column, as for `goToItem`. Each pull takes effect in move order. When two Magnets reach the same item, the nearer one with space has priority, then the first in move order. A Magnet that fills its hand leaves the remaining items for other Magnets. A firing Magnet with nothing to take recharges with an empty pull. A pulled umbrella can block as soon as it is the acting item, including later throws on the same turn.

## When an ultimate fires

In this version the ultimate fires automatically. A player cannot write a rule for it yet. The follow-up is a rule action "Use my ultimate" and a condition "My ultimate is ready" (see Later).

### State of one tank's ultimate

| From | To | Actor | Guard |
|---|---|---|---|
| (none) | charging (n = `firstReadyTurn`) | engine: createRound, joinRound | the round has ultimates on |
| charging (n > 1) | charging (n − 1) | engine, end of turn | none |
| charging (1) | ready | engine, end of turn | none |
| ready | fired | engine, start of turn | the trigger holds, and the precedence below lets it |
| fired | charging (n = `rechargeTurns`) | engine, end of the same turn | none |
| any | (none) | engine | the round ends, or a monthly new start builds a new round |

No other transition exists. A hit does not stop the charge. A ready ultimate waits, with no time limit, until its trigger holds. Terminal state: the end of the round.

### Precedence in one turn

1. A dizzy tank in a spin turn spins. Its ultimate waits.
2. A tank in the middle of steps in order does its next step. Its ultimate waits.
3. A ready tank whose trigger holds fires its ultimate. That is its move for this turn: it does not drive, turn or throw.
4. Otherwise the tank checks its rules (`decide`).

A stuck tank can fire every ultimate except Dash.

### Active ultimate effects

These are separate from the `effect` slot (dizzy or stuck), because a tank can be dizzy and under its own smoke at the same time. A tank has one ultimate, so it has at most one active ultimate effect. A new fire of the same ultimate replaces the old one.

| Active effect | Ends |
|---|---|
| smoke (turns left) | after 15 turns, including the turn it fires, counted down at the end of each turn |
| big umbrella (blocks left) | after its 4th block |
| full tank (free shots left) | after the 3rd free shot |

### Starting numbers

`firstReadyTurn` = 8 and `rechargeTurns` = 40. A room round lasts 20 to 600 turns, practice 40, 80 or 160 turns, and a monthly round lasts the rest of the day. The goal is at least 0.85 fires per tank on average in the shortest room round (20 turns), and more in longer ones.

Measured on 2026-11-18 across 800 standard mixed-field finals of 20 turns with items and ultimates on, by first charge: 15 turns gave 0.64 fires per tank, 10 gave 0.83, 8 gave 0.86, 5 gave 0.91, 1 gave 0.93, and every tank ready at the start gave 0.93. A 20-turn round allows one fire per tank, so the trigger, not the charge, sets the ceiling. Below 8 turns the gain is small, and 8 turns let the board show each tank's charge before the first ultimates go off. The first draft asked for 1.0 in every round length, which no charge reaches at 20 turns.

## When ultimates and items meet

Owner, 2026-11-18: "I haven't talked about when two or more ultis are colliding, who wins, what effect", then "also itemed tank vs ulti tank needs a treatment", approved the same day.

### Ultimates against ultimates

| Collision | Rule |
|---|---|
| A dashing tank | Nothing touches it in its dash turn: no shot, no Splash ring hit, no Dash ram, no Mud bomb, no Whirlwind, no point moved to an attacker, no new effect. A floor pickup still rolls for backfire, and a backfired item is lost without affecting the tank. |
| Smoke screen or Big umbrella fired on a turn | It protects from the start of that turn, whatever the move order, as Dash does. |
| Big umbrella against Splash ring or Dash ram | Both are shots, so the direction rule applies and a block uses one of its 4. |
| Big umbrella or Smoke screen against Mud bomb or Whirlwind | No protection: mud and wind are not water. |
| Smoke screen against Dash ram | No protection: the ram has no roll. |
| Two effects (stuck or dizzy) on one tank | One rule for every turn and every source, items included: the effect with more turns left stays, and a tie keeps the one the tank already had. The old effect counts down before comparison, and pickup backfires compete after move effects. Mud bomb's 5 stuck turns beat Whirlwind's 4 dizzy turns. |
| Two Magnets reach for the same item | The nearer Magnet takes it. At the same distance, the first in move order. |
| Two tanks fire at each other in one turn | Both ultimates act in full, so their points can cancel out. |
| A tank whose own ultimate is ready when it is caught | Stuck: it can fire every ultimate except Dash. Spinning: it waits until the spin ends. |

### Items against ultimates

Held attack items act only on normal shots. The item umbrella can also spend blocks on Dash and Splash ring.

| Situation | Rule |
|---|---|
| The firing tank holds a bucket, pinwheel or mud ball | It does not act on Splash ring, Dash ram, Mud bomb or Whirlwind, and the tank keeps it. |
| The firing tank holds a bucket during Full tank's free shots | The bucket acts: they are normal shots, so a free shot can move 2 points. |
| The target holds an item umbrella | It blocks Splash ring and Dash ram (shots) and uses one block. It does not stop Mud bomb or Whirlwind. The Big umbrella checks a shot first. |
| The target holds a bucket, pinwheel or mud ball | No protection. |
| A pinwheel or mud ball holder shoots a dashing tank | Nothing lands, so no effect. |
| An item holder shoots a smoked tank | The roll uses the smoke chance. |
| A Magnet | Pulls only items on the floor, never an item in another tank's hand. |

## Random draws

Moves, normal throw rolls and ultimate fires resolve in move order. Splash ring draws once per smoked tank in the ring, clockwise from the front. Dash rams and shots at a dashing tank draw nothing. A normal shot at a smoked tank uses its usual draw with a smaller chance. Item pickup and spawn draws follow all moves. Rounds with ultimates off keep their previous draw order.

Until 2026-11-18, Splash resolved after pickups. Spending the last umbrella block then could leave an empty-handed tank standing on an item, and `goToItem` failed on the tank's own square. Splash now spends the block before pickups, so the tank can take that item on the same turn. A trigger draws nothing.

## Which ultimate a strategy has

`StrategyInput.ultimate: UltimateId` is required. `parseStrategy` rejects a strategy without it (a new issue code). `UltimateId` and `ULTIMATE_IDS` move from `apps/web/src/catalogue/messages.ts` to the engine. Each preset carries its ultimate, so `ULTIMATE_DEFAULT_STYLE` in the catalogue is derived from the presets.

**Immutable.** A strategy keeps the ultimate it was made with:

- A saved play style (`account_strategy`, keyed by account and id): an upsert of an existing id keeps the stored ultimate, whatever the body says.
- A monthly seat: `takeSeat` fixes the seat's ultimate. `changeStrategy` ("Ubah aturan") keeps the seat's ultimate and takes only the new rules and build.
- A room player: `submitStrategy` takes the ultimate of the strategy it is sent, because a room is one round and nothing carries over.
- A new play style takes the ultimate of the play style it starts from. When it starts empty, the player picks one. The editor shows the ultimate and never lets the player change it after the first save.

**Assigning an ultimate to a strategy that has none** (`assignUltimate(strategy, random)`, in the engine, one function used by every boundary below):

1. A preset whose rules and build are equal → its ultimate.
2. Otherwise, the preset most similar by rule ids: shared ids divided by all distinct ids of both (Jaccard), over all modes. A style copied from a preset keeps the preset's rule ids even after the player changes a rule's numbers, and a preset with extra rules the player never had scores lower. Rules equal in id and content break a tie. Six presets come from `burstAndRetreat` and share the rule ids `loaded`, `dodge`, `spent` and `point-blank`, so the extra rules (`top`, `free-hit`, `go-behind`, `grab`) and then the content decide. Presets tied with the same ultimate (Leader chaser and Charger) are no tie.
3. A tie between different ultimates, or no shared rule id → a random ultimate. It is stored, so it never changes again.

Dry run on the 2026-11-17 backup: of 57 saved styles, 3 exact, 41 by similarity, 13 random. Of 32 monthly seats, 18 exact, 10 by similarity, 4 random. Counting equal rules only, the first draft left 35 styles and 13 seats to random.

Boundaries that can meet a strategy without an ultimate, each through `assignUltimate`:

| Boundary | What happens |
|---|---|
| SQLite: `account_strategy.strategy_json`, `league_seat.strategy_json`, `league_month_rules.strategy_json`, `arena.snapshot_json` | A migration rewrites each row once. Today `MIGRATIONS` holds SQL strings only, so a migration may also be a function of the database. |
| A request from a stale bundle (takeSeat, changeStrategy, account strategy upsert, submitStrategy) with no `ultimate` | A seat or a style that exists keeps its stored ultimate. A new one gets `assignUltimate`. |
| The browser's library (`StoredLibrary`, localStorage) | Version 2: loading version 1 assigns each style its ultimate, and the next save keeps it. |

Before the real migration runs, a dry run on a copy of the newest backup counts the rows that each of the 3 steps assigned. The owner sees the counts first.

## Release

- `ULTIMATES_FROM` = 22 November 2026, 00:00 Asia/Jakarta. A round created at or after that moment has `RoundConfig.ultimates: true`: monthly, room, presenter, tournament and practice rounds. A round created before it has `false`, so it plays as today until it ends.
- The catalogue's "Coming soon" tag and its note go away at the same moment, from the same constant.
- The balance scripts, the landing demo and the seed fixtures pass `false`. A round with `ultimates: false` draws exactly what it drew before, and its snapshots and decisions stay equal byte for byte.
- The new catalogue copy for Dash and the big umbrella, and their scenes, can go out before the gate.

## Stream and board

- `PublicBot` gets the tank's ultimate: its id, ready or turns left, and its active effect. A `TickResult` lists each fire with what the board needs to draw it: the Dash path and ram target, outcome and points, the Splash squares hit and missed, the Mud Bomb area, the Whirlwind area and points, and the items Magnet moved. The compact tick gets its own field for this, not the effect bits (2 bits, room for one kind only). `dodged` is appended to `COMPACT_OUTCOMES`.
- A bundle from before this change must not crash on the new shape. It shows the "new version" notice.
- The board draws the catalogue's ultimate effects (`catalogue/UltimateEffect.tsx`), which move to the board's folder because the board and the catalogue both use them. A ready tank glows gold. When it fires, the floor under it glows (the catalogue's charge), then the effect plays.
- The live feed says which ultimate the player's tank used. The board legend ("Bantuan") gets one line about ultimates and a link to the catalogue's ultimates section.

## Balance gates

The balance script (800 finals of 60 turns, mixed field, items on) compares ultimates on and off:

- Each play style's win rate with ultimates on, and the change from off.
- How often each ultimate fires per tank per 100 turns.
- The big umbrella against the smoke screen and the item umbrella: the points each saves per fire.

Owner, 2026-11-18: "it's okay to be unbalanced for the ultimate skills, but with certain luck, not straight overpowered". So the ultimates do not have to be equal, and a strong one is allowed. The gates check only that luck still decides:

- No play style wins 40% or more of the mixed field with ultimates on (luck is 12.5% for 8 tanks).
- No play style's win rate with ultimates on is more than twice its win rate with them off.
- No ultimate fires less than once per tank per 100 turns.
- The big umbrella saves more than the item umbrella. The owner sees its number next to the smoke screen's ("not far beyond smoke screen", 2026-11-18).

A gate that fails is reported to the owner with the numbers, and the numbers in `ULTIMATE_RULES` change. The design of an ultimate does not change.

## Later

- A rule action "Use my ultimate" and a condition "My ultimate is ready", so a player chooses the moment. When a mode has that action, the automatic trigger is off for that tank.
