# Items on the board

Read `00-overview.md` first. Owner, 2026-11-15: "Let's introduce in-arena item", "build all", items in every round, Pemburu Item in the picker instead of Penyeruduk, and the picker ordered from the most balanced play style.

Items give a rule list a new choice that the player can see on the board: drive to an item or keep fighting. Every item changes a number or a rule the game already has (water, a hit, the rule order, driving), so a player who knows the game reads it at once.

## The four items

| Item (en / id) | Drawing | When it acts | Effect |
|----------------|---------|--------------|--------|
| Bucket / Ember | A blue bucket of water; on the tank, a small one over the hatch | On the holder's next hit | The hit moves 2 points instead of 1. The bucket is used up. |
| Umbrella / Payung | A closed umbrella; on the tank, a small one over the hatch | When a throw would hit the holder | The throw rolls as usual. On a hit the umbrella opens, the throw is `blocked`: no point moves, and the umbrella is used up. A miss leaves it. |
| Pinwheel / Kincir | A four-blade toy that turns | On the holder's next hit | The tank that was hit is **dizzy** for 3 turns: its rules are checked from the bottom up. The pinwheel is used up. |
| Mud ball / Bola lumpur | A brown ball | On the holder's next hit | The tank that was hit is **stuck** for 2 turns: it cannot drive or turn, and it can still throw straight ahead. The mud ball is used up. |

The first draft had a water can that filled the tank on pickup. Measured on 2026-11-15 (600 finals of 60 turns, only that item on the board), a tank that went for water cans won 4.2% where the same rules without the item rule won 13.0%: water refills by 1 a turn anyway, so a full tank was worth less than the drive to it. The bucket gives the holder a point directly. Mud first let the tank turn. Not turning is a design choice toward the owner's "paralyzer", not a measured gain: a tank that went for mud balls won no more with either version (12.7% and 12.7% against 13.3% and 12.3% without the item rule). A stuck tank still answers a tank in front of it.

The pinwheel measured small: over 800 finals of 60 turns, a dizzy tank chose another move than it would have in 194 of its 1,515 dizzy turns (12.8%). The Charger and the Random walker have one rule per mode, so the pinwheel changes nothing for them. It is kept for rule lists that players write, where the order of several rules matters; the owner decides whether it stays.

Why these and not the first drafts: a full freeze ("paralyzer") gives every neighbour free hits at 90% from 1 cell, and the frozen tank's rules cannot answer, so it became Mud, which stops driving and turning and leaves the tank its shot straight ahead. "Confusion" became the Pinwheel, which reverses the rule order: the lesson of the game. Both need a hit to land, so they cost water and a roll and are never free.

## Rules of the board

| Topic | Rule |
|-------|------|
| Where | Every round of every arena: practice, tournament, monthly, private, presenter. `RoundConfig.items` is `true` there. Only the balance scripts (to compare the same seeds with and without items), the landing demo (whose story is one rule order) and the older seed fixtures pass `false`; a round with `items: false` draws exactly what it drew before items existed. |
| Appear | At the end of every 10th turn, one item appears when the board holds fewer than `max(1, floor(tanks / 4))`. Its kind is drawn by weight (bucket 3, umbrella 3, pinwheel 2, mud ball 2) and its square among the squares with no tank and no item. |
| Vanish | An item that nobody picks up disappears after 30 turns, so a new one can appear somewhere else. |
| Pick up | A tank with an empty hand that ends its move on an item's square takes it. A tank holds one item at a time; a tank that holds one drives over another without taking it, and "Go to the nearest item" cannot act for it. |
| Backfire | Owner, 2026-11-16: a pinwheel or a mud ball backfires on its taker with 20% (`ITEM_RULES.backfirePercent`): the taker gets the item's effect for the usual turns and holds nothing. The roll is one draw per such pickup, after the throw rolls and before the spawn draws. A backfire replaces an effect a hit gave on the same turn, because pickups come after throws. About 8% of pickups backfire (4 of 10 items are pinwheels or mud balls). Measured with it, 800 finals of 60 turns: the item hunter wins 12.9% of the mixed field (13.8% without), and 17.5 to 18.3% alone against the bot lineup with production ids (18.2 to 18.9% without). |
| Effects | A tank has at most one effect. A new effect replaces the old one. At the end of a turn the effects that existed when the turn began count down, and then the new ones are set: a tank hit on turn t is dizzy on turns t+1 to t+3 (stuck on t+1 and t+2) and free on the next. |
| Same turn | Pickups happen after every move and throw of the turn. An umbrella taken on turn t first protects on turn t+1, and a pinwheel or mud ball taken on turn t first acts on a hit on turn t+1. An umbrella blocks the first hit of a turn; a second hit on the same turn lands. |
| Spawn | A joining tank (monthly) never lands on an item. |
| Monthly new start | A new start builds a new round, so items, held items and effects clear. Points stay. |

All numbers are in `packages/engine/src/items/items.ts`, the one place to tune them.

## State of one item on the board

| From | To | Actor | Guard |
|------|----|-------|-------|
| (none) | on the board | engine, end of turn | turn number + 1 is a multiple of 10, fewer items than the cap, a free square |
| on the board | held | a tank drives onto it | the tank holds nothing |
| on the board | gone | engine, end of turn | 30 turns on the board |
| held | used | engine, throw resolution | umbrella: a roll hits the holder. Bucket, pinwheel, mud ball: the holder's throw hits a tank without an umbrella |

Terminal states: used, gone. A held item also ends with its round.

## State of one tank's effect

| From | To | Actor | Guard |
|------|----|-------|-------|
| none | dizzy (3) / stuck (2) | engine | a hit from a holder of a pinwheel / mud ball |
| dizzy / stuck (n > 1) | same, n − 1 | engine, end of turn | none |
| dizzy / stuck (1) | none | engine, end of turn | none |
| dizzy / stuck | the other effect | engine | a new hit with the other item |

## Random draws

A hit on an umbrella holder by a bucket holder is blocked, and the bucket stays.

Draws are added after every existing draw of a turn: after the throw rolls, one `int` for the kind and one `int` for the square, and only on a turn that spawns. A round therefore plays the same until its first spawn turn, and the item draws are part of the seed's rules like the others.

## Rules a player can write

| Id | Group | Sentence |
|----|-------|----------|
| `itemNear` (condition) | Items | An item ({item}) is within {n} squares |
| `myItem` (condition) | Items | My tank holds {item} |
| `myEffect` (condition) | Items | My tank is {effect} |
| `targetItem` (condition) | The target | The target ({target}) holds {item} |
| `goToItem` (action) | Items | Go to the nearest item ({item}); it cannot act when there is none |

## Play styles

- **Pemburu Item / Item hunter** (new): the Charger with one rule on top, "an item within 5 cells → go to it". Measured with items on, 800 finals: 13.8% of the mixed field at 60 turns, 13.3% at 150, and 17.8% alone against the bot lineup at 60 turns. The Charger alone: 2.0% and 0.6%. One rule on top of the weakest style makes it a middle one, which the item documentation can show.
- The bot lineup keeps its two Chargers. With an item hunter in place of the second one, the item hunter alone against the bots fell to 10.1%, under the 12% floor, because two hunters went for the same items.
- **Penyeruduk / Charger** stays in the engine: the scripts measure every play style against it and the bot lineup uses it. It leaves the picker.
- The picker lists the play styles by how close their mixed-field win rate is to luck (12.5% for 8 tanks), the closest first; a tie puts the lower win rate first. `PICKER_ORDER` in `presets.ts` holds it, and `DEFAULT_PRESET_ID` is its first entry. Random walker stays last. Measured with items on, 800 finals of 60 turns (+/- 1.3): item hunter 13.8, backstabber 14.6, picker 15.8, dry hunter 8.4, evader 16.6, leader chaser 17.9, ambusher 21.7, random walker 1.8. What the numbers support: the item hunter first, the Ambusher and the Random walker last, the Evader not first. Places 2 to 6 lie within the noise of each other, and at 150 turns the Evader would be third. Alone against the bot lineup at 60 turns it wins 24.3%, which is why it felt strong.
- Measured gates, items on: the strongest style in the mixed field wins 21.7% (60 turns) and 24.3% (150), under 40%; three different styles lead the six rule sets; the Statue and the Turtle stay under luck in every rule set at 60 and 150 turns. A 512-tank turn with all nine styles seated (item hunters included) takes 3.57 ms with items and 4.26 ms without (noise).

## Wire and screens

- `BotState` gains `item` and `effect`; `Snapshot` gains `items`; `TickResult` gains `pickups`; `ThrowEvent` gains the outcome `blocked`, and a hit from a bucket carries `bucket: true` (absent on every other throw). `Decision` gains `dizzy: true` on a turn of a dizzy tank (absent on every other turn), so the player's turn feed says that the tank read its rules from the bottom up. `PublicBot`, `PublicSnapshot`, `PublicTick` and the compact tick carry them. The compact tank keeps its 8 values: the held item and the effect go into the free bits of `flags`, so a 512-tank replay does not grow by three numbers per tank per turn. The outcome `blocked` is appended to the outcome table, so older indexes keep their meaning.
- Every reader of a throw's outcome (statistics, sounds, the shot drawing) names `blocked` explicitly; none may fall through to "miss".
- The board draws items, a held item on the tank, the dizzy swirl and the stuck mud, the umbrella opening on a block, and a pop on a pickup. The board legend names each item.
- Player documentation: `docs/items.md`.

## Measurement gate

Before the protocol and the screens: `scripts/simulate.ts` Tables 1 and 5 pass and `scripts/probes.ts` passes with items on (a tank that stands still or hides stays below luck). Each item, measured alone against items off on the same seeds, changes the results; an item that changes nothing is reported to the owner before it ships. The item hunter is near 12.5% in the mixed field, and its rate alone against the bot lineup is known. The picker order is computed last, with items on, the hunter in the field and the turn count of a practice round, and the new default still wins at least 12% alone against the lineup.

## Debt this creates

- None for replays: a stored round config carries `items`, and a config stored before items reads as `items: false` (`stored-arena.ts`), so its replay plays as it was played.
- A browser tab opened before the release cannot read the outcomes `blocked` and `bucketHit`. An arena tab then asks the player to reload the page, and a monthly tab reconnects and starts over on each such turn. Nothing forces an old tab to reload; a version check on the stream would clear it.
- In a crowd (a big arena seen whole) other tanks show no held item, no effect and no open umbrella; items on the floor still show.
