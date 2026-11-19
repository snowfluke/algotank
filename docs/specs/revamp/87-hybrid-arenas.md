# Hybrid arenas

Owner, 2026-11-19, on the proposal of four layouts: "i approve all of it, all layout, how often is just the same as randomize one arena condition", and the recommendation for the water limit. A hybrid arena splits the board into areas. Each area has its own arena condition, and a tank plays by the condition of the square it stands on.

## Scope

The monthly arena only. A hybrid layout is one more entry in the monthly condition draw (`MONTHLY_CONDITIONS`), so a weather change (77-monthly-league.md, "Weather change") can draw a layout like any single condition. Rooms, practice and test matches keep single conditions. They can get the layouts later.

## Areas

An area uses one of these conditions: Standar, Jarak dekat, Musim kering, Hujan deras, Mata tajam. Lapangan luas changes the size of the whole board, so it is never an area.

| Rule | Decision |
|---|---|
| Throw | A throw uses the condition of the thrower's square: reach, water cost and hit table. |
| Refill | A tank refills at the rate of its square's condition. |
| Water limit | One limit for the whole layout: the largest limit of its areas. Moving between areas never takes water away. |
| Ultimates | An ultimate that needs "the water of one shot" (Splash ring) uses the thrower's square. Nothing else changes. |
| Items | Unchanged. |
| Floor | Each condition has its own floor drawing: cracked earth (Musim kering), puddles (Hujan deras), tall grass (Jarak dekat), a raised hill (Mata tajam), plain sand (Standar). The edges between areas are visible. |
| Legend | "Bantuan" lists the areas of the layout with their conditions. |
| Rules | Two new conditions: "aku berada di area {kondisi}" / "I stand in a {condition} area", and "target berada di area {kondisi}" / "the target stands in a {condition} area". With a single condition, every square is in that condition's area. |

Splash ring is described in the catalogue but its engine action is absent on this branch.

`// ponytail:` When the engine adds Splash ring, use `rulesAt(round, x, y).waterPerThrow` for its shot cost.

## Layouts

Fractions are of the board's width W and height H, rounded to whole squares.

| Layout (id / en) | Areas |
|---|---|
| Empat penjuru / Four quarters | Top left Standar, top right Musim kering, bottom left Hujan deras, bottom right Jarak dekat. At a new round the tanks spawn spread evenly over the four quarters. |
| Mata badai / Eye of the storm | The middle third (W/3 by H/3) is Hujan deras, the ring out to the middle two thirds is Musim kering, and the edge is Standar. |
| Front hujan / Rain front | A band of 3 columns of Hujan deras on Standar. The band moves one column to the right every 30 turns and starts again at the left edge. The tick carries the band's first column. |
| Bukit / Hills | Standar with 2-by-2 hills of Mata tajam: one hill per 60 squares of board, at least 2. The hills are drawn with the round's random source when the layout starts, never touching each other or the edge. |

The engine rounds the width and height of each fraction to the nearest square. For Eye of the storm, the starting square of each rectangle is half the space left along that axis, rounded up on a tie. For Rain front, the three columns wrap individually, so the band can cover both edges for two positions. For Hills, the count is the nearest whole number to the board area divided by 60, with a minimum of two. Diagonal neighbours count as touching.

The condition line shows the layout's name ("Kondisi arena: Mata badai"), and the weather-change notice uses it too.

## Stream

The board message (`state`) carries the layout id and its fixed area map. Standar is the ground under every area's rectangle. Rain front's state also carries its current first column so a viewer can join mid-round. The only layout field in a Rain front tick is the band's first column. With a single condition, nothing new is sent, so the existing streams stay byte-identical.

## Balance

Before the layouts go live, the monthly-field simulation plays each layout with the seven designed presets (4 tanks each, 4 days) and reports each preset's points against the field mean, next to a single Standar day. The owner sees the numbers before release.

## Measured

Run `bun apps/server/scripts/hybrid-balance.ts`. Each condition held for the full day while `LeagueDay` ran its fresh starts and items. Each day had 28 tanks, four per preset, and 96,000 turns. The layouts shared four pairs of round and seating seeds. Standar used the first pair.

Each value below is points per tank per day. The field mean was 0.0 in all runs because the 28 tanks only moved points between each other. The table values are also each preset's distance from that mean.

| Arena | Days | Ambusher | Item hunter | Dry hunter | Backstabber | Leader chaser | Picker | Evader |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Four quarters | 4 | +35.3 | +15.8 | −18.2 | −41.9 | +3.3 | −39.9 | +45.6 |
| Eye of the storm | 4 | +1.5 | −7.6 | −27.2 | −12.6 | +2.4 | +6.4 | +36.9 |
| Rain front | 4 | +23.3 | +4.3 | −32.0 | −6.9 | +12.3 | −45.2 | +44.2 |
| Hills | 4 | +22.4 | +22.9 | −27.3 | −13.1 | −3.9 | −2.9 | +1.8 |
| Standar | 1 | +4.0 | +21.0 | −67.5 | −1.3 | +11.8 | +12.8 | +19.3 |

Four quarters and Rain front have presets more than 40 points from the field mean, the yardstick used for single conditions in `league-day.ts`. The one Standar day also crossed that mark.
