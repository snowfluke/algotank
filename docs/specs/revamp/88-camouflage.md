# Camouflage

On 2026-11-19 the owner chose a build upgrade that shortens the distance at which point hunters notice a tank. The owner raised the build budget from 6 to 7 points. A player had asked, “Alel AKU BUTUH SKILL ULTI 'LOW PROFILE'”.

## Rule

| Camouflage level | Total upgrade cost | Maximum notice distance |
| ---: | ---: | --- |
| 0 | 0 points | Unlimited |
| 1 | 1 point | 8 squares |
| 2 | 2 points | 5 squares |

The notice distance is inclusive and uses Chebyshev distance, so a diagonal step counts as one square. The most points, nearest with more points, nearest with fewer points, and cut rival selectors skip tanks beyond their notice distance. The cut line still uses the full standings. Among tanks with the cut rival’s score, only those within notice are eligible, and if none are visible the selector has no target.

Other selectors, conditions, items and ultimates keep their existing rules. All tanks remain drawn and can be hit at the usual range and hit chance. Camouflage changes target selection, so it can change a tank’s decisions and how its score develops.

Saved strategies with a missing Camouflage key load at level 0. A supplied level must be a whole number from 0 to 2. The other three build keys are required and the total cost must be at most 7. Level 0 is omitted from round snapshots to keep existing replays and messages byte-for-byte compatible. Preset allocations are unchanged and now leave one point unspent.

## Measurement

The baseline and both upgrade levels used `largeRoundConfig(33, 333, 42, "standard", true)` from [large-round.ts](../../../packages/engine/scripts/large-round.ts). This plays 333 turns on a 17 × 13 board with items on and ultimates off. Seats cycle through the script’s eight recorded presets, giving Evader five seats and every other preset four. Each run starts from the same seed and seating order.

The two styles with the highest mean final score per tank in the baseline were Dry hunter with `(33 + 28 + 22 + 19) / 4 = 25.5` and Evader with `(43 + 29 + 26 + 23 + 0) / 5 = 24.2`. Their nine seats spent the extra point on Camouflage level 1. For level 2, those same seats also moved one point from Aim to Camouflage to stay within the budget.

At the start of each turn, take the first tank in the engine’s standings. Ties in points use the engine’s normal order. Count the increase in that tank’s `hitsTaken` over the turn. The median is the 17th score in the final standings.

| Build variation | Leader hits per 100 turns | Final spread, top minus median |
| --- | ---: | ---: |
| All tanks at level 0 | 30 × 100 ÷ 333 = 9.01 | 43 − 11 = 32 |
| Dry hunter and Evader at level 1 | 30 × 100 ÷ 333 = 9.01 | 43 − 11 = 32 |
| Dry hunter and Evader at level 2, with Aim reduced by one | 34 × 100 ÷ 333 = 10.21 | 48 − 7 = 41 |

Level 1 left both metrics unchanged in this field. The level 2 result includes the Aim trade-off. Each row covers one seeded round.

## Files

- [combat.ts](../../../packages/engine/src/combat/combat.ts) defines the budget, levels, costs and `NOTICE`.
- [targets.ts](../../../packages/engine/src/strategy/targets.ts) applies notice distance to the four point selectors. [score.ts](../../../packages/engine/src/strategy/score.ts) calculates the cut-line score.
- [parse.ts](../../../packages/engine/src/strategy/parse.ts) defaults missing Camouflage and validates build costs. [round.ts](../../../packages/engine/src/round/round.ts) preserves the legacy snapshot shape at level 0.
- [UpgradesPane.tsx](../../../apps/web/src/prep/UpgradesPane.tsx) displays the four upgrades. [Upgrades messages](../../../apps/web/src/prep/messages.ts) and [vocabulary messages](../../../apps/web/src/vocabulary/messages.ts) supply English and Indonesian copy.

## Measurement on the live league (2026-11-19)

The preset field above has few rules that pick by points, so it shows little. On the live league (league 1, 33 seats),
3 seats pick targets by points: 1 with "the most points" and 2 with "the nearest with more points". The same 33 saved
strategies ran 3 seeds of 1,000 turns each (3,000 turns), with Camouflage on the 3 best scorers that do not hunt by
points (level 2 paid with one point of Aim).

| Camouflage on the top 3 | Hits on them by the 3 hunters | All hits on the leader | Mean score of the 3 |
| --- | --- | --- | --- |
| 0 | 277 × 100 ÷ 3000 = 9.23 per 100 turns | 530 × 100 ÷ 3000 = 17.67 | 54.9 |
| 1 | 245 × 100 ÷ 3000 = 8.17 (−11%) | 505 × 100 ÷ 3000 = 16.83 | 55.0 |
| 2 | 207 × 100 ÷ 3000 = 6.90 (−25%) | 493 × 100 ÷ 3000 = 16.43 | 51.2 |

The cover works against the hunters, and level 2 costs some scoring through the Aim point it takes.

## The upgrades pane

The drawing uses the six-square scene of Aim and Dodge. At level 0 a hunter's red sight sits on your tank. From
level 1 a green cover (the meadow colours) hides your tank under leaves, the hunter stands outside it, and its sight
stops at the cover's edge with a "?"; level 2's cover is tighter. The sentence under the drawing names the squares
(8 or 5). The help sheet has one line about Camouflage.
