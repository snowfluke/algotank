# Work package E1: eight directions (tanks face, drive and shoot diagonally)

Read `00-overview.md` first. Owner's request, verbatim: "Can we support diagonal". Decision (lead): yes. Today a tank faces one of 4 directions, drives to the square in front and shoots along its row or column. After this package it faces one of 8 directions, drives diagonally and shoots along diagonals too. This is a deliberate change of game behaviour, the one exception to "do not change game behaviour".

## You own

`packages/engine/**` (code, tests, `scripts/`), the web files that must follow the engine: `apps/web/src/board/boardHelpers.ts` and its tests (direction to angle, jet geometry), `apps/web/src/stream/parseStreamMessage.ts` (accept the 8 directions), `apps/web/src/vocabulary/**` (texts for changed meanings and new option values, both languages), `apps/web/src/home/HomeScene.tsx` only if it breaks; `apps/server/src/bots.ts` (the lineup, after measuring); and `docs/decisions/2026-11-11-water-fight-game.md` (a new section). Another engineer is changing `apps/web/src/ui`, `app`, `home`, `auth`, `create`, `kit`, `apps/web/scripts`, the pace constants in `src/create/createRequest.ts`, `src/practice/replay.ts` and `apps/server/src/public-arenas.ts` at the same time: do not edit those. If the type check is red at the end only inside their folders, say which files.

## Rules of play (decided; implement exactly, and put the table into the engine's header comment)

| Topic | Rule |
|-------|------|
| Directions | N, NE, E, SE, S, SW, W, NW, clockwise. A tank starts a round facing one of the 8, drawn from the seed. |
| Turn | One turn move rotates the tank by 45 or 90 degrees, left or right. So a half turn (180 degrees) still costs 2 moves, as today, and a 135 degree turn costs 2. |
| Drive | "Forward" moves one square in the facing direction, diagonal included. A diagonal step may pass between two occupied squares. A step into an occupied square or the wall behaves as today (it becomes a shot, or the tank stays, by the same rules as now). |
| Shot | Along the facing direction, in a straight line of squares (row, column or diagonal). It reaches the first tank in that line within range. |
| Distance | Everywhere (range, hit chance by distance, "nearest", "within N squares", wall distance in a direction): the number of squares along the way, counting a diagonal step as 1 (Chebyshev distance). A diagonal shot of range 3 reaches the third square on the diagonal. |
| Hit chance, range, water, points | Unchanged tables. Distance is the new distance. |
| "In line" | Wherever the engine means "in my row or column" (lines of fire, "aimed at me", "first tank in my shot line", `targetInRowOrColumn`, "step out of the line of fire"), it now means row, column or diagonal. |
| Bearing | "Ahead, left, right, behind" of a target is by the angle between the facing direction and the direction to the target, in four quarter sectors centred on ahead, right, behind and left. A target exactly on a sector border counts as ahead or behind (not left or right). State this in a comment and test the borders. |
| Driving toward or away | A tank picks the facing that reduces (or increases) the distance most: diagonal while both the column and the row differ, straight after. Ties are broken by a fixed, documented order, then by the turn cost. |
| Strategy JSON | Every id and parameter key stays, so saved strategies stay valid. Meanings widen as in this table. The action "turn" keeps `left` and `right` (90 degrees) and gains `slightLeft` and `slightRight` (45 degrees). No other new ids unless a preset needs one; if you add one, give it texts in both languages. |
| Moves on the wire | The move type gains the two 45 degree turns. Name them clearly (not by letter case). Every place that reads a move must handle them (replay, practice usage, the feed sentences). |

Everything else stays: seeded and deterministic, all tanks decide from the same snapshot, moves resolve in the seeded order, scores sum to 0, water rules, rule sets, the cut rule.

## Measure and tune (the engine's `scripts/simulate.ts` and `scripts/probes.ts`)

Run 1000 finals of 8 at 90 turns (the public arena's new round length) and at 150 turns. Record the tables in the decision log. The package is done when all of these hold, or when you report exactly which does not and what you tried:

1. Every designed play style lands hits in every rule set, and the two filler styles (charger, random walker) stay below the best designed style in every rule set.
2. No play style wins more than 40% of finals in the mixed field under the standard rules (luck is 12.5%).
3. A tank that stands still and a tank that hides in a corner each win below luck in every rule set.
4. The top play style differs between at least two rule sets, and none is top in all six.
5. Diagonals are used: in the mixed field at least 20% of drive moves and at least 20% of shots at a tank are diagonal. If the play styles avoid diagonals, fix the driving and aiming logic, not the measure.
6. A beginner can win: the default play style, alone against the server's bot lineup of 7 (`apps/server/src/bots.ts`), wins at least 12% of finals at 90 turns. Change the lineup's mix if needed and keep it as data.
7. A round is lively at 90 turns: the mean number of hits per tank per round, and the share of finals whose winner took no hit, are reported, and the second is below 15%.

Tune by changing the play styles' rules or thresholds (they are data) and, only if needed, the standing rules above by a clearly named amount. Do not tune the hit, water or range numbers.

## Web

- The board draws a tank at its angle (`TankShape` takes any angle), a jet along a diagonal, and the splash at the target. Check one diagonal hit, miss and dry shot at `/kit?show=board`.
- Vocabulary texts in both languages for the widened meanings ("in a straight line with me" instead of "in my row or column"; Indonesian in its own natural wording; read `~/.claude/skills/bahasa-indonesia-plain/SKILL.md`; "kamu") and for the two new turn options. The sentence test must pass for every play style in both languages.

## Check

`bun test`, `bun run type-check` clean (except files in the other engineer's folders, named). Engine tests cover every row of the rules table through the public interface: each of the 8 facings for turn, drive, shot and distance; the border cases of bearing; a diagonal step between two occupied squares; determinism and the sum of scores under every rule set. Client check: `cd apps/web && bunx vite --port 5962 --strictPort`, look at `/kit?show=board` (no API server needed), stop Vite by its PID.

## Report

The common report, plus: the rules as implemented (any place where you had to decide something this file does not say), the measured tables, each of the seven conditions with its number and pass or fail, what you changed in the play styles and the bot lineup, and what a player will notice.
