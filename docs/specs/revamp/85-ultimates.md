# Ultimates (Jurus pamungkas)

Read `00-overview.md` and `84-items.md` first. Owner, 2026-11-17: eight ultimates, "any strategy can pick any ultimate skill, and only one ultimate skill". Owner, 2026-11-18: "while dashing, it is immune to shot"; the big umbrella "blocks additional side left and right"; a monthly tank that is already seated gets the ultimate of its base play style, "if it differs and we can't find it, randomize, remember, 1 immutable ulti skill for every strategy". The owner gave the trigger, the activation and the visuals to the orchestrator and the advisor (2026-11-18).

The trailer promises the release on 22 November 2026, so the feature is behind a date gate (see Release).

## The eight ultimates

Each play style has one default. The Charger, which only the bots and the scripts use, has Dash.

| Ultimate (en / id / code id) | Default play style | Effect | Trigger (it holds before the tank decides) |
|---|---|---|---|
| Dash / Lari kencang / `dash` | Leader chaser, Charger | The tank drives up to 3 squares straight ahead in this turn, then rams the first tank straight ahead within its throw range: a sure hit worth 2 points, with no roll and no water. Every dash scores 2 points: a rammed tank gives them up, and a dash that rams nobody, or whose ram is blocked or dodged, gets them from the game (owner, 2026-11-26). It stops before an edge or a held square. **No shot can hit the tank in this turn**, whatever the move order. | The square ahead is free and the tank is not stuck, and either the first tank straight ahead is 2 to 4 squares away, or at least 1 tank aims at this tank (the dash then escapes the shot). |
| Smoke screen / Kabut / `smoke` | Evader | For 15 turns, shots use a quarter of the hit chance (rounded down). A shot the smoke makes miss has a 25% chance to bend toward a nearby tank. The smoked tank gets 1 point if the shot lands. | At least 1 tank aims at this tank (`aimedAtMe` with k = 1). No smoke is active. |
| Splash ring / Percikan / `splash` | Random walker | The tank shoots all 8 squares around it, and its water goes to 0. Every tank in those 8 squares is hit for 2 points, subject to the defenses below. | At least 2 tanks stand in the 8 squares around, and the tank has the water for one shot. |
| Full tank / Tangki penuh / `fullTank` | Backstabber | The water fills to the top, and the next 3 shots at a tank use no water. | The water is below one shot, and a tank is within the tank's throw range. |
| Mud bomb / Bom lumpur / `mudBomb` | Ambusher | A mud ball lands on the first tank in the throw line. That tank and every other tank within 1 square of it are stuck for 5 turns, and each of them gives 1 point to the thrower. The thrower is never stuck by its own bomb. | A tank is in the throw line. |
| Whirlwind / Angin puyuh / `whirlwind` | Picker | Every other tank within 2 squares spins round to the right for 4 turns (no rule checked). Each tank within 1 square gives 1 point to the whirlwind tank. | At least 2 other tanks are within 2 squares. |
| Big umbrella / Payung besar / `bigUmbrella` | Dry hunter | A big umbrella blocks the next 3 shots (4 before 2026-11-19) that come from the front, the left or the right, however long that takes. Only a shot from behind gets through. | At least 1 tank aims at this tank. No big umbrella is active. |
| Magnet / Magnet / `magnet` | Item hunter | A new bucket enters the hand first. The nearest floor items within 4 squares fill the remaining slots. The tank holds up to 3 items and uses them in the order they came. | The tank holds fewer than 3 items. |

A trigger reads only the snapshot from before the turn and draws no random number. All numbers are in `packages/engine/src/ultimates/ultimates.ts` (`ULTIMATE_RULES`), the one place to tune them.

### Exact rules

- **Direction of a shot.** A shot comes from the direction of the square of the thrower, seen from the target. Compare it with the target's facing in eighths of a turn: 0 is the front, 1 and 7 are front-left and front-right, 2 and 6 are left and right, 3, 4 and 5 are behind. The big umbrella blocks 0, 1, 2, 6 and 7 (5 of the 8 directions), and lets 3, 4 and 5 through. Since 2026-11-17 it blocked the front only (0, 1, 7). Owner, 2026-11-18: left and right also.
- **Big umbrella and the item umbrella.** The big umbrella checks a shot first. The item umbrella checks only a shot that the big umbrella lets through. A blocked shot gives the outcome `blocked`, as the item umbrella does.
- **Dash immunity.** A shot at a dashing tank, before or after its dash in the move order, gives the new outcome `dodged`. The thrower spends its water and draws no hit roll. A dash ends on the last free square of its 3, so it can stop at 0 squares, and the immunity holds then too.
- **Dash ram.** After the drive, the first tank straight ahead within the tank's throw range takes a sure hit worth 2 points: no roll, no water. It is a shot for the umbrellas (the big umbrella's direction rule, then the item umbrella, each block uses one) and does nothing to a dashing tank. Smoke does not reduce it, and the held item does not act. Owner, 2026-11-18: "work more on dash", twice. Measured (cross table, 1,600 finals per cell, average over 7 play styles): the plain dash 11.6%; with a normal shot and the escape trigger 13.4% at first, 11.7% once Splash ring and Mud bomb grew; with the ram (escape kept) 16.0%. A 5-square dash measured 11.5%.
- **Dash always scores.** Owner, 2026-11-26: "it should guarantee getting +2 even if no tank to bump". A dash whose ram finds no tank, is blocked by an umbrella, or meets a dashing tank still gives the dasher 2 points, and no tank loses them, so a round with ultimates no longer sums to zero. Measured (`ultimates-cross.ts`, 1,600 finals per cell, average over 7 play styles): Dash went from 13.32% to 18.41%, now the highest ahead of Mud bomb (18.02%) and Splash ring (18.01%); the median of the eight went from 14.71% to 14.49%. The Leader chaser, whose default is Dash, went from 8.19% to 13.69%. `ultimates.ts` passed the four gates: the highest play-style win rate was 19.83% (Ambusher), the Leader chaser went from 8.86% off to 15.19% on (under twice), and Dash fired 2.533 times per tank per 100 turns. The one-fire gate still flags 20- and 40-turn finals (0.864 and 0.971), as before this change.
- **Smoke.** It divides the hit chance by 4 before the roll (rounded down), so the roll still draws. Owner, 2026-11-18: smoke and whirlwind "weak, we need to improve it". Measured average over 7 play styles: 12.0% with half the chance for 10 turns, 15.3% with a third for 15 turns, 16.1% with a quarter for 15 turns.
- **Smoke deflection.** Owner, 2026-11-19: "if it smoke screen, extend the ability to a chance the other shoot to its neighbor tanks and gain point. *deflect". Compare the same shot roll with the reduced and original hit chances. Only a roll that misses the reduced chance and beats the original chance can deflect. If at least one other tank stands within 1 square of the smoke, including diagonally, draw the deflection chance. The original shooter is ineligible. On success, the round's random source picks one eligible neighbour uniformly. The water comes from the smoke and needs no new hit roll. If it lands, the neighbour loses 1 point and the smoked tank gets 1 point.
- **Splash ring.** It is one action with up to 8 hits. Each hit moves 1 point (`POINTS_PER_HIT`). A held bucket, pinwheel or mud ball does not act on these hits, and the thrower keeps it. The ring spends the water of one shot (the round's `waterPerThrow`); until 2026-11-18 it emptied the tank. Owner, 2026-11-18: "improve the splash ring again". Measured average over 7 play styles: 13.7% when the water went to 0, 18.0% for one shot's water, 24.4% with 2 points a hit. Every occupied square is hit and needs no roll (owner, 2026-11-18: "make splash ring 3/3 guaranteed"; from 2026-11-17 only the front square was sure and each other square was hit 1 time in 3, which measured among the weakest ultimates). A smoked tank in the ring is hit 1 time in 4 and draws one chance, clockwise from the front, in move order with the other ultimates. The big umbrella and the item umbrella block as for a shot. A dashing tank is not hit. Owner, 2026-11-18: "magnet is so low, improve it", then "splash ring and whirlwind as well", approved the same day. Since then each hit moves 2 points and the ring empties the tank again (it spent one shot's water from earlier the same day). Measured average over 7 play styles: 11.8% at 1 point for one shot's water, 13.6% at 1 point for no water, 19.9% at 2 points emptying the tank, 22.6% at 2 points for one shot's water.
- **Full tank.** The free shots count only shots at a tank (a shot that spends water today). A free shot draws the hit roll as usual.
- **Mud bomb.** It is not a shot: no hit roll, and no umbrella or smoke blocks it. Each tank it sticks gives 1 point (`POINTS_PER_HIT`) to the thrower, the first tank included (owner, 2026-11-18: "the mud bomb does 1 point to all in area, and keep sucking the point from the first tank"). A held item of the thrower does not act. A dashing tank is not stuck and gives no point. It gives the `stuck` effect for 5 turns (see When ultimates and items meet for an effect the tank already has).
- **Whirlwind.** It gives the `dizzy` effect for 4 turns, of which the first 2 spin. Today `spinsThisTurn` spins only while `turnsLeft > effectTurns.dizzy - dizzySpinTurns`, so a dizzy effect must record its own spin turns: the pinwheel gives 6 turns with 2 spins, the whirlwind 4 turns with 2 spins. Each tank within 1 square of the whirlwind tank also gives it 1 point (`POINTS_PER_HIT`); it is not a shot, so no umbrella or smoke stops it, and a dashing tank gives nothing. Measured average over 7 play styles: 10.7% with the spin alone, 18.7% with the point from tanks within 1 square, 34% with a point from every tank within 2 (the Picker won 40%, which fails the gate), 11.8% when the wind emptied the caught tanks' water. Owner, 2026-11-18: "magnet is so low, improve it", then "splash ring and whirlwind as well", approved the same day. Since then the whirlwind's dizzy effect is 4 turns that all spin (4 times 90 degrees), and the tank checks no rule in them. Measured average over 7 play styles: 13.5% with 2 spins and 2 reversed turns, 15.4% with 4 spins, 15.1% with 4 spins of 6 turns, 27.2% with a point from every tank within 2.
- **Magnet.** When the hand has room, a new bucket goes into its first free slot. An empty-handed tank holds the bucket immediately, and its next normal hit scores 2 points. Items already in the hand keep their places and remaining uses. The nearest floor items within 4 squares fill any slots left after the bucket. Equal distances go to the smaller row, then the smaller column, as for `goToItem`. Each pull takes effect in move order. When two Magnets reach the same item, each reserves a bucket slot first. The nearer Magnet with a slot left wins, with ties going to the first in move order. A Magnet that fills its hand leaves the remaining floor items for other Magnets. The fire's `items` list starts with `{ kind: "bucket" }` and then lists the floor pulls in hand order. The first item in the hand acts, and when it is used up, the next one comes forward with its full uses. A pulled umbrella waits behind the bucket and starts blocking once it becomes the held item. Items from Magnet draw no random number and cannot backfire. A pinwheel or a mud ball backfires only when a tank drives onto it (`84-items.md`). A tank holding any item skips floor pickups when it drives over them.
  - Owner, 2026-11-19, on the bucket going first. "since the bucket is guaranteed, make that as the first item. otherwise if he gets umbrella, he couldn't use the bucket unless he gets the hit to nulify the umbrella"
  - Owner, 2026-11-18, on adding the guaranteed bucket. "magnet is so low, improve it", then "splash ring and whirlwind as well", approved the same day. Measured average over 7 play styles was 10.7% before, 11.0% with a reach of 6 or 8, 10.7 to 11.1% when it also pulled items out of other tanks' hands, 14.4% with 1 new bucket, and 21.5% with 2 new items.

## When an ultimate fires

Owner, 2026-11-19: "i want player to maximize and craft the potential of their ulti for their strategy, not just default automatic". So a player can fire the ultimate from a rule. A strategy is in one of two firing modes:

| Firing mode | When | What fires the ultimate |
|---|---|---|
| automatic | no rule in any mode has the action `useUltimate` | the trigger table below, as before |
| by rules | at least one rule has the action `useUltimate` | only a rule with `useUltimate` that matches; the trigger table is off for this tank |

The automatic mode stays, so the 32 monthly seats and 57 saved styles of 2026-11-17 still fire on 22 November without a change by their players. The presets stay automatic in this release, because `assignUltimate` ranks by rule ids and a new rule in a preset would change what migration 11 assigns.

### Conditions and the action for the ultimate

| Id | Text (en / id) | Parameter | True when |
|---|---|---|---|
| `ultimateReady` | My ultimate is ready / Jurusku siap | none | the state is `ready` |
| `ultimateCharged` | My ultimate is at least {n}% charged / Jurusku terisi minimal {n}% | n in 25, 50, 75 | the state is `ready`, or charging with `(turnsTotal − turnsLeft) / turnsTotal × 100 ≥ n` |
| `ultimateCatches` | My ultimate would catch at least {n} tanks / Jurusku bisa kena minimal {n} tank | n in 1 to 4 | the tank count of the ultimate, computed now, is at least n (table below) |
| action `useUltimate` | Use my ultimate / Pakai jurus pamungkas | none | the rule matches only when the state is `ready` and the ultimate can act now; otherwise the tank reads the next rule |

With ultimates off, the three conditions are false and `useUltimate` never matches, so a round plays as before.

`turnsTotal` is a new field of the charging state: `firstReadyTurn` for the first charge and after a change of ultimate, `rechargeTurns` after a fire. The stream carries it with `turnsLeft`.

The tank count of `ultimateCatches` is one function, `ultimateReach`, which the automatic triggers also call:

| Ultimate | Tanks it would catch now |
|---|---|
| Dash | 1 if the first tank ahead is within `triggerMaxDistance`, else 0 |
| Splash ring | the tanks in the 8 squares around |
| Mud bomb | the first tank in line within throw range, plus every tank within 1 square of it |
| Whirlwind | the tanks within `reach` squares |
| Smoke screen, Full tank, Big umbrella, Magnet | 0: these do not hit tanks, so the editor does not offer `ultimateCatches` for them |

"Can act now" for `useUltimate` is the hard part of each trigger, without the "is it a good moment" part:

| Ultimate | Can act now |
|---|---|
| Dash | not stuck, and the square ahead is free |
| Smoke screen | no smoke is active on the tank |
| Splash ring | the tank has the water for a shot |
| Full tank | always |
| Mud bomb | a tank is in line within throw range |
| Whirlwind | always |
| Big umbrella | no big umbrella is active on the tank |
| Magnet | the hand has space |

`useUltimate` is one action with an optional mode switch, like `throw`. It cannot be a step of "steps in order".

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
3. A ready tank in the automatic firing mode whose trigger holds fires its ultimate. That is its move for this turn: it does not drive, turn or throw.
4. Otherwise the tank checks its rules (`decide`). A matching `useUltimate` rule fires the ultimate, with the same effect as step 3.

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
| A dashing tank | Nothing touches it in its dash turn: no shot or deflection, no Splash ring hit, no Dash ram, no Mud bomb, no Whirlwind, no point moved to an attacker, no new effect. A floor pickup still rolls for backfire, and a backfired item is lost without affecting the tank. |
| Smoke screen or Big umbrella fired on a turn | It protects from the start of that turn, whatever the move order, as Dash does. |
| Big umbrella against Splash ring or Dash ram | Both are shots, so the direction rule applies and a block uses one of its 4. |
| Big umbrella or Smoke screen against Mud bomb or Whirlwind | No protection: mud and wind are not water. |
| Smoke screen against Dash ram | No protection: the ram has no roll. |
| A deflection reaches a neighbour | A dashing neighbour dodges. A Big umbrella checks where the smoke is relative to the neighbour's facing and uses one block if it covers the shot. The deflection needs no hit roll and only bends once. |
| Two effects (stuck or dizzy) on one tank | One rule for every turn and every source, items included: the effect with more turns left stays, and a tie keeps the one the tank already had. The old effect counts down before comparison, and pickup backfires compete after move effects. Mud bomb's 5 stuck turns beat Whirlwind's 4 dizzy turns. |
| Two Magnets reach for the same item | Each reserves room for its new bucket first. The nearer Magnet with a slot left takes the floor item. At the same distance, the first in move order takes it. |
| Two tanks fire at each other in one turn | Both ultimates act in full, so their points can cancel out. |
| A tank whose own ultimate is ready when it is caught | Stuck: it can fire every ultimate except Dash. Spinning: it waits until the spin ends. |

### Items against ultimates

Held attack items act only on normal shots. The item umbrella can also spend blocks on Dash and Splash ring.

| Situation | Rule |
|---|---|
| The firing tank holds a bucket, pinwheel or mud ball | The tank keeps the item and all its uses on a deflection, Splash ring, Dash ram, Mud bomb or Whirlwind. |
| The firing tank holds a bucket during Full tank's free shots | The bucket acts: they are normal shots, so a free shot can move 2 points. |
| The target holds an item umbrella | It uses one block against a deflection, Splash ring or Dash ram. It does not stop Mud bomb or Whirlwind. The Big umbrella checks a shot first. |
| The target holds a bucket, pinwheel or mud ball | No protection. |
| A pinwheel or mud ball holder shoots a dashing tank | Nothing lands, so no effect. |
| An item holder shoots a smoked tank | The roll uses the smoke chance. |
| A Magnet | Pulls only items on the floor, never an item in another tank's hand. |

## Random draws

Moves, normal throw rolls and ultimate fires resolve in move order. Splash ring draws once per smoked tank in the ring, clockwise from the front. Dash rams and shots at a dashing tank draw nothing. A normal shot at a smoked tank uses its usual draw with a smaller chance. A smoke-caused miss with an eligible neighbour draws once for the deflection chance and, if it succeeds, once to pick the neighbour. Item pickup and spawn draws follow all moves. Rounds with ultimates off keep their previous draw order.

Until 2026-11-18, Splash resolved after pickups. Spending the last umbrella block then could leave an empty-handed tank standing on an item, and `goToItem` failed on the tank's own square. Splash now spends the block before pickups, so the tank can take that item on the same turn. A trigger draws nothing.

## Which ultimate a strategy has

`StrategyInput.ultimate: UltimateId` is required. `parseStrategy` rejects a strategy without it (a new issue code). `UltimateId` and `ULTIMATE_IDS` move from `apps/web/src/catalogue/messages.ts` to the engine. Each preset carries its ultimate, so `ULTIMATE_DEFAULT_STYLE` in the catalogue is derived from the presets.

**The player chooses, and can change it** (owner, 2026-11-19, replacing "1 immutable ultimate per strategy" of 2026-11-17). Each strategy has exactly one ultimate at a time:

- A saved play style (`account_strategy`): an upsert takes the ultimate of the body. The editor shows the ultimate picker before and after the first save.
- A monthly seat: `takeSeat` takes the strategy's ultimate. `changeStrategy` ("Ubah aturan") takes the new strategy's ultimate too. When the ultimate changes, the tank's charge starts again at `firstReadyTurn`, so a player cannot swap a ready ultimate for another ready one. When it stays the same, the charge continues.
- A room player: `submitStrategy` takes the ultimate of the strategy it is sent.
- A new play style takes the ultimate of the play style it starts from. When it starts empty, the player picks one.

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

- `ULTIMATES_FROM` = 20 November 2026, 00:00 Asia/Jakarta (22 November until the owner moved it, 2026-11-20: "i think i'm gonna release it today, strip out the 22 november"). A round created at or after that moment has `RoundConfig.ultimates: true`: monthly, room, presenter, tournament and practice rounds. A round created before it has `false`, so it plays as today until it ends.
- The catalogue's "Coming soon" tag and its note go away at the same moment, from the same constant.
- The balance scripts, the landing demo and the seed fixtures pass `false`. A round with `ultimates: false` draws exactly what it drew before, and its snapshots and decisions stay equal byte for byte.
- The new catalogue copy for Dash and the big umbrella, and their scenes, can go out before the gate.

## Stream and board

- `PublicBot` gets the tank's ultimate: its id, ready or turns left, and its active effect. A `TickResult` lists each fire with what the board needs to draw it: the Dash path and ram target, outcome and points, the Splash squares hit and missed, the Mud Bomb area, the Whirlwind area and points, and the items Magnet moved. The compact tick gets its own field for this, not the effect bits (2 bits, room for one kind only). `dodged` is appended to `COMPACT_OUTCOMES`.
- A bundle from before this change must not crash on the new shape. It shows the "new version" notice.
- The compact throw outcome `deflected` appends the neighbour index, its bearing relative to the shot in clockwise eighths, and the impact result (`hit`, `blocked` or `dodged`). Other throw rows still have five values. The board draws the jet bending at the smoke and the usual impact at the neighbour's square, with a score pop over the smoked tank on a hit.
- The board draws the catalogue's ultimate effects (`catalogue/UltimateEffect.tsx`), which move to the board's folder because the board and the catalogue both use them. A ready tank shows a gold ring. When it fires, the floor under it glows (the catalogue's charge), then the effect plays.
- Owner, 2026-11-19, on the monthly board: "I think you need to rework the visual when the skills active … the quality is dropping". On a board of 33 tanks with small squares the drawings must read at a glance:

  | Drawing | Rule |
  |---------|------|
  | Ready | A thin gold ring with a soft fill inside the tank's own square (radius 4.9 of 5), so ready neighbours never merge into one gold patch. |
  | Charge | The floor glow reaches just past the hull and fades in half a turn; the ultimate's own shape carries the rest of the turn. |
  | Smoke screen | A ring of puffs over the hull's edge for every smoked turn, with a grey shade under the square. The middle of the tank and its gauge stay visible. |
  | Whirlwind | A three-arm vortex inside the reach and one dashed outline around the area, not a tint on every square. |
  | Big umbrella | A purple canopy with one scallop per blocked eighth, under the hull, plus the blocks-left badge. |
  | Magnet | A horseshoe magnet over the tank and rings that close in on it. |
  | All | Every effect stops at the board's edge. |

- Sound (owner, 2026-11-19: "if your tank triggering a ulti or affected by others, it should spawn a sound effect"). A player hears their own tank's fire (`ultimate`), and a sound when another tank's ultimate reaches their tank: a Dash ram (`ram`), a Splash ring hit (`splash`), a Mud bomb (`mud`), a Whirlwind (`wind`). A viewer without a tank hears one `ultimate` cue in a turn with any fire. The rule is `ultimateSounds` in `apps/web/src/board/turnSounds.ts`.
- Owner, 2026-11-19: "not just the activation but the unique skills sfx as well. The catalogue should output the sfx as well." Then: "activation sound + skills sound are too jitter ... very contrast. Merge the sound nicely." Each ultimate makes one sound: a soft rise in the effects' C major that glides into the skill, with slow attacks that overlap, so activation and skill are one gesture. The skills: a whoosh and a bump (Dash), a soft hiss (Smoke screen), a big burst with drops (Splash ring), rising glugs and a ding (Full tank), a whistle and a splat (Mud bomb), whooshes that chase round (Whirlwind), a snap and a plucked note (Big umbrella), a buzz and a click (Magnet). A viewer without a tank hears the first fire's sound. The catalogue's scenes play on the same board, so they make the same sounds.
- Picking up an item plays that item's sound for the viewer's own tank: a clank (bucket), a snap (umbrella), a sparkle (pinwheel), a squish (mud ball). The board reads a pickup from the floor: an item on the tank's square that is gone after the turn (`pickupSound`).
- Owner, 2026-11-19: "This is a game, not website ... use big interactive visual icon that represent it." Every place that names a style's ultimate shows a gold tile with the ultimate's emblem: a coloured disc with an ink outline and a gold rim, drawn like the board (`apps/web/src/catalogue/UltimateEmblem.tsx`). The emblem wobbles when the pointer reaches the tile; it stays still with reduced motion. The tile opens the catalogue card in a new tab (`UltimateLink`): the workshop list and editor, the prep panes, the join steps and the "Tank kamu" pane. On a live tank the rim is a charge meter that fills with the turns, the tile says "Terisi n%", and the rim glows with "Siap!" when the ultimate is ready. The picker and the catalogue list show the same emblems.
- The live feed says which ultimate the player's tank used. The board legend ("Bantuan") gets one line about ultimates and a link to the catalogue's ultimates section.

## Balance gates

The balance script (800 finals of 60 turns, mixed field, items on) compares ultimates on and off:

- Each play style's win rate with ultimates on, and the change from off.
- How often each ultimate fires per tank per 100 turns.
- The big umbrella against the smoke screen and the item umbrella: the points each saves per fire.

Owner, 2026-11-18: "it's okay to be unbalanced for the ultimate skills, but with certain luck, not straight overpowered". So the ultimates do not have to be equal, and a strong one is allowed. The gates check only that luck still decides:

- No play style wins 40% or more of the mixed field with ultimates on (luck is 12.5% for 8 tanks).
- No play style's win rate with ultimates on is more than twice its win rate with them off. The Random walker is the exception: it is the luck baseline, under 2% with ultimates off, so any gain doubles it (1.55% to 4.22% after the 2026-11-18 tuning).
- No ultimate fires less than once per tank per 100 turns.
- The big umbrella saves more than the item umbrella. The owner sees its number next to the smoke screen's ("not far beyond smoke screen", 2026-11-18).

A gate that fails is reported to the owner with the numbers, and the numbers in `ULTIMATE_RULES` change. The design of an ultimate does not change.

### Smoke deflection balance, 2026-11-19

`ultimates-cross.ts` ran 1,600 seeded 8-tank finals of 60 turns per cell. The table gives the average win rate over the seven designed play styles. Before deflection, Smoke screen was last at 12.91%.

| Deflection chance | Dash | Smoke screen | Splash ring | Full tank | Mud bomb | Whirlwind | Big umbrella | Magnet | Median of eight | Second-highest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 25% | 13.32% | 14.61% | 18.88% | 15.51% | 18.64% | 13.99% | 14.08% | 14.80% | 14.71% | 18.64% |
| 50% | 12.96% | 17.16% | 18.68% | 15.29% | 18.79% | 13.62% | 13.70% | 14.57% | 14.93% | 18.68% |

Chosen chance: 25%. Smoke was 0.10 percentage points from the median and below the second-highest ultimate. At 50% it was 2.23 points from the median.

With 25%, `ultimates.ts` passed three gates. The highest play-style win rate was 20.68% (Ambusher). Every ultimate fired at least once per tank per 100 turns (the lowest was Splash ring at 1.878). Big umbrella saved 2.573 points per use, Smoke screen saved 2.017 and the item umbrella saved 1.357. The script flagged the Random walker at 1.55% off and 3.80% on, even though the spec exempts it from the doubling gate. The one-fire gate also flagged 20- and 40-turn finals, which averaged 0.864 and 0.970 fires per tank. The 60- and 160-turn finals averaged 1.644 and 3.660. Both script failures also occurred before deflection.

## Monthly field, 2026-11-19

The 8-tank finals above do not show the monthly arena: 28 tanks or more, open rounds, items, bots and fresh starts. A simulation of that field (7 designed presets × 4 tanks, `LeagueDay`, 4 days of 96,000 turns, ultimates on) gave these points per tank per day against the field mean:

| Big umbrella blocks | Field mean | Dry hunter | Leader |
|---|---|---|---|
| 4 | 236 | +854 | Dry hunter |
| 3 | 223 | −73 | Item hunter, +584 |
| 2 | 164 | −274 | Item hunter, +491 |

Owner, 2026-11-19, chose 3 blocks.

