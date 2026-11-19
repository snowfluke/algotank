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

## Layouts

Fractions are of the board's width W and height H, rounded to whole squares.

| Layout (id / en) | Areas |
|---|---|
| Empat penjuru / Four quarters | Top left Standar, top right Musim kering, bottom left Hujan deras, bottom right Jarak dekat. At a new round the tanks spawn spread evenly over the four quarters. |
| Mata badai / Eye of the storm | The middle third (W/3 by H/3) is Hujan deras, the ring out to the middle two thirds is Musim kering, and the edge is Standar. |
| Front hujan / Rain front | A band of 3 columns of Hujan deras on Standar. The band moves one column to the right every 30 turns and starts again at the left edge. The tick carries the band's first column. |
| Bukit / Hills | Standar with 2-by-2 hills of Mata tajam: one hill per 60 squares of board, at least 2. The hills are drawn with the round's random source when the layout starts, never touching each other or the edge. |

The condition line shows the layout's name ("Kondisi arena: Mata badai"), and the weather-change notice uses it too.

## Stream

The board message (`state`) carries the layout id and its fixed area map. Rain front sends only the band's first column in each tick. With a single condition, nothing new is sent, so the existing streams stay byte-identical.

## Balance

Before the layouts go live, the monthly-field simulation plays each layout with the seven designed presets (4 tanks each, 4 days) and reports each preset's points against the field mean, next to a single Standar day. The owner sees the numbers before release.
