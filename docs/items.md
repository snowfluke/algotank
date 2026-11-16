# Items

Items are toys on the arena floor. A tank takes an item when it drives onto the item's square. Every round of every arena has items. The design and the measurements are in `docs/specs/revamp/84-items.md`, and the numbers are in `packages/engine/src/items/items.ts`.

## The four items

| Item (English / Indonesian) | When it acts | What it does |
|-----------------------------|--------------|--------------|
| Bucket / Ember | On the next hit of the tank that holds it | The hit moves 2 points instead of 1. Then the bucket is gone. |
| Umbrella / Payung | When a shot hits the tank that holds it | The umbrella stops the shot, and no point moves. Then the umbrella is gone. A shot that misses does not use the umbrella. |
| Pinwheel / Kincir | On the next hit of the tank that holds it | The tank that the shot hits becomes dizzy for 3 turns. Then the pinwheel is gone. |
| Mud ball / Bola lumpur | On the next hit of the tank that holds it | The tank that the shot hits becomes stuck for 2 turns. Then the mud ball is gone. |

A pinwheel or a mud ball can backfire. When a tank takes one, there is a 1 in 5 chance that the item's effect goes to that tank: it becomes dizzy for 3 turns (pinwheel) or stuck for 2 turns (mud ball), and the item is gone. The bucket and the umbrella never backfire.

A shot at a tank with an umbrella stops at the umbrella, also when the shooter holds a bucket, a pinwheel or a mud ball. The shooter then keeps its item for the next hit.

## The two effects

A dizzy tank reads its rules from the bottom of the list to the top. The rule that fits first from the bottom runs. The fallback ("If no rule fits") stays last. The turn feed of a dizzy tank says that the tank read its rules from the bottom.

A stuck tank cannot drive and cannot turn. It can shoot straight ahead, so it can still hit a tank in front of it.

A tank has one effect at a time. A new effect replaces the old effect. A tank that a shot hits on turn 10 is dizzy on turns 11, 12 and 13, or stuck on turns 11 and 12.

## How items appear, stay and go

- One item can appear after every 10th turn. In a public arena a turn is 0.9 seconds, so this is every 9 seconds.
- The board holds 1 item for each 4 tanks, and at least 1 item. A board with 8 tanks holds at most 2 items.
- An item appears on a square that has no tank and no item.
- An item that no tank takes goes away after 30 turns. Then a new item can appear on a different square.
- A tank holds one item at a time. A tank that holds an item drives over other items and does not take them.
- A tank takes an item at the end of the turn. A tank that takes an umbrella on turn 10 is safe from the first hit on turn 11.
- In the monthly league, a new start every 5 minutes makes a new round. The new round has no items, and no tank holds an item or has an effect. The points of the day stay.

## Rules that use items

The rule editor has an "Items" group. Each part below is in the editor in English and in Indonesian.

| Rule part | Kind | Sentence in the editor |
|-----------|------|------------------------|
| `itemNear` | Condition | An item is at most a given number of squares away. The item can be any item or one kind. |
| `myItem` | Condition | My tank holds an item, or one kind of item. |
| `myEffect` | Condition | My tank is dizzy, or my tank is stuck. |
| `targetItem` | Condition | A chosen tank holds an item, or one kind of item. |
| `goToItem` | Action | Drive to the nearest square with an item, or with one kind of item. |

`goToItem` does nothing when the board has no such item or when the tank holds an item already. The next rule in the list then runs, as for every action that cannot act.

## The Item hunter play style

The Item hunter (Pemburu Item) is the first card of the play style picker. It has the rules of the Charger (Penyeruduk) with one more rule at the top: "When an item is at most 5 squares away, drive to the nearest square with an item." Without that rule the Charger wins 2% of the test games against the other play styles. With that rule it wins 14%, near the luck of 8 tanks (12.5%). One rule in the correct place changes the result of a play style.

The Charger has no card in the picker now. The bots use it, and the balance scripts measure every play style against it.

## Tips

- Put "drive to an item" high in the list when you want items more than shots. Put it low when you want shots first.
- An item rule at the top can stop your tank from moving out of a line of fire. Measure the change in a practice game.
- Use `targetItem` to choose a different target when the tank in front holds an umbrella.
- A rule with "my tank is dizzy" helps only at the bottom of the list, because a dizzy tank reads the list from the bottom.
- Not every item helps every play style. In the test games, tanks that went for pinwheels and mud balls did not win more often. Tanks that went for buckets and umbrellas did.

## Terminology and STE assumptions

This document is descriptive. It uses "shot" for a throw of water (the engine calls it a throw), "square" for a cell, and "turn" for a tick, which are the words of the game's screens. Word approval against the ASD-STE100 dictionary is `UNVERIFIED`, because no licensed dictionary copy is available here.
