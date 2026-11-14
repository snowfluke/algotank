# Work package X1: the owner sets how many tanks an arena has

Read `00-overview.md` and `75-organiser-tournament.md`. Owner, 2026-11-14: "Can we also set the max player in private arena? So when I set like 48, it will fill the rest with bot."

Today a private arena takes up to 64 people (`maxPlayersOf`) and bots fill only to 8 (`botFillSizeOf`, setting `botFill`). The owner cannot choose the size of the game.

## Decisions

| Topic | Decision |
|-------|----------|
| Setting | `tankCount` in the arena's settings: how many tanks a game has. Private: 2 to 64, default 16. Presenter: 2 to 512, default 512. |
| Joining | A join is refused with `arena_full` when the arena has `tankCount` people (today: the kind's maximum). The join page says the arena is full in one sentence. |
| Bots | With `botFill` on, bots fill the free seats up to `tankCount` when a game starts (today: up to 8). With `botFill` off there are no bots, as today. The defaults of `botFill` do not change. |
| Create form | "Jumlah tank" / "Number of tanks" on the form's main step, next to the bot switch, because the two belong together. A control that needs no typing on a phone: presets (8, 16, 32, 48, 64 for a private arena; the presenter's own steps up to 512) and minus and plus. The bot switch's sentence names the number: "Bot mengisi kursi kosong sampai 48 tank." |
| Changing it later | In the lobby the owner can change it in Settings, not below the number of people already in. Not during a game. |
| Rounds | The cut rounds follow the number of tanks that start, as today. Show the owner how many rounds that makes when the form already shows it; do not add a new line when it does not. |
| Public arenas | No change. |
| Stored arenas | Version 8 with a migration: an older arena gets its kind's old numbers (private 64 people, bots to 8) expressed so that a stored arena plays as before. Say how you expressed it. |

You own the arena settings in `packages/arena/**`, the create form and the settings sheet in `apps/web/src/{create,room,host}/**`, the server's start of a game (`start-round.ts`, bot fill) and the join route's full check. Another builder rebuilds the monthly arena at the same time (`77-monthly-league.md`): edit shared files with small targeted edits after re-reading them; when a test fails in its files, report it and leave it.

## Check

`bun test`, `bun run type-check`; tests for: a join at the limit, bots filling to 48, no bots with the switch off, the lobby change with its guard, the migration. Audit states for the create form with the new control at 360 x 640 and 1728 x 1000 in both languages; only your states, one headless browser.

Never `bun run build`; never port 8787; build to your own scratch folder and serve on port 9005. Report briefly, with the capture of the create form in Indonesian at 1728 x 1000 and on a 390 x 844 phone.
