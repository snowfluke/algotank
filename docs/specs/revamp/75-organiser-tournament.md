# Work package O1: an organiser's tournament (private and presenter arenas)

Read `00-overview.md`, `11-foundation-guide.md` (section 11), `60-no-scroll.md`, `72-arena-chat.md` (state table style). Owner, 2026-11-13: a tournament for friends with a gift for the winner; 5 minutes per round; the organiser decides when each round starts; signed-in players only; kick with or without the right to rejoin; the result and its round history stay viewable; the winner can be traced.

All of this applies to private and presenter arenas only. Public arenas do not change.

## 1. Create form

| Setting | Decision |
|---------|----------|
| Round length | 1, 1.5, 2, 3 or 5 minutes (today 1, 1.5, 2). Turns = length / turn time, inside the server's 20 to 600. |
| Players | New switch "Only signed-in players" (`requireAccount`, default off). |
| Round rules | Unchanged: standard, announced, surprise. |

## 2. Signed-in-only arena (`requireAccount`)

- Joining needs a session: 401 `not_signed_in` otherwise, and the join step offers sign-in with a return to the arena.
- One seat per account in the arena (409 `account_seat_taken` with a link back to that seat). This is what stops one person from playing two tanks.
- The join step says in one sentence that the host can see the email address of each player. The owner's player list and the stored result show the email to the owner only; other players never see it.
- Names: as today, a name already used in the arena is refused without regard to case and the page offers another one. No change.

## 3. Ready and start

The owner always decides. Ready only informs.

- In a lobby and in a break, a player who will play the next round can tap "I'm ready" (and take it back). The owner's page shows "7 of 12 ready" and a mark per player. Reuse `Player.ready`, `setReady` and `ReadyBar`; `readyIsOpen` gains these phases for private and presenter arenas.
- The owner starts the round now, or picks "Start in 1 / 2 / 3 / 5 minutes".

| State (lobby or break) | Event | Actor | Guard | Next |
|------------------------|-------|-------|-------|------|
| waiting | start now | owner | enough players | running |
| waiting | schedule start (minutes) | owner | 1, 2, 3 or 5 | scheduled (`startsAt`) |
| scheduled | cancel | owner | | waiting |
| scheduled | start now | owner | enough players | running |
| scheduled | time reached | server | enough players, else back to waiting with a notice to the owner | running |

Everyone sees the countdown while a start is scheduled (`data-countdown-clock`). The timer is the server's (`timers.ts`); a server restart drops a scheduled start back to waiting (named limit). The finished phase has no countdown, as today.

## 4. Remove a player

- The owner can remove a player in a lobby and in a break (today: lobby only). In a break the removed player is out of the game.
- In a `requireAccount` arena the removal asks one question: "May this player join again?" Yes removes the seat; No also puts the account on the arena's ban list (403 `banned` on join, with a kind sentence). The settings sheet lists banned accounts with "Allow again".
- In an arena without `requireAccount` there is no ban, because nothing identifies a visitor reliably; the dialog says that only signed-in arenas can keep a player out. Undo stays for a removal without ban.
- Removing a player removes their chat lines (exists).

## 5. Stored result and round history

- When a game of a private or presenter arena finishes, the server stores a result: arena name and kind, finish time, game number, round length, rule mode, every round (rule set, ranking with points, who went through), the final ranking, and per human the name, look and account id when there is one. Bots are marked. `DATA_DIR/results/<resultId>.json`, atomic, kept 180 days (pruned in the 10-minute sweep), unguessable id.
- `GET /api/results/:id`: anyone with the link gets names, looks and rankings. With the owner's session it also carries each account's email. `GET /api/account/results`: the owner's stored results, newest first.
- Page `/r/:id` ("Tournament result" / "Hasil turnamen"): the winner with the celebration drawing, the final ranking, and the round history. The owner sees a "Winner's email" line and can copy it.
- Round history ("Riwayat ronde"): one column per round, each a ranking with points and a mark for through or out, the final last, so the path of each tank reads from left to right; the viewer's own tank and the winner are highlighted. On a phone it is one round per page with the `Pager`. It also shows on the finished view of the player page, the host page and the big screen (as a tab or pane; no scroll).
- The finished view shows the result link with copy and QR (`share/`). A player who closed the page and opens the arena link again gets the result as today; when the arena is gone, the arena link shows "This arena has ended" with a link to its stored result when one exists.
- The account menu gains "My results" / "Hasilku" for the owner: the list from `GET /api/account/results`.

## 6. Try it in an arena lobby

Keep the Try it tab: testing rules while waiting is how a player improves. Two changes so it does not compete with the real game: its start button is a secondary button inside an arena (the workshop keeps the primary one), and when the real round starts a running test closes with one sentence that says the round has started.

## Contract notes

Additive changes in `packages/arena` (settings field, phase field `startsAt`, ban list, events, error codes, stored arena version with a migration, `results-protocol.ts`). Type everything; validate at the boundary; the reducer owns who is ready, banned and scheduled; the server owns timers and files.

## Check

`bun test`, `bun run type-check`; tests through the routes for every row of the start table, the seat-per-account rule, ban and allow again, the result file (content, 180-day prune, owner-only email), and the migration. The whole no-scroll audit with new states (create form with the new settings, lobby and break with ready counts and a scheduled start, the remove dialog, the result page with 16 and with 512 players and 7 rounds, round history on a phone). One browser run on a phone in Indonesian: a signed-in-only presenter arena with three accounts, ready, a scheduled start, a removal with ban, two rounds, the result page from a fresh browser, the owner's view with the email.

Never `bun run build`; never port 8787; build to your own folder and serve on port 8999.

## Amended 2026-11-14 (as built)

- `requireAccount` became `joinPolicy: "anyone" | "account" | "verified"`; private arenas hold 64 players.
- E1 removed 409 `account_seat_taken`: an account that joins again from another browser gets its seat back with a new token, and the old token stops working.
- A player removed in a break leaves no gap in the final ranking.
- Open: the API accepts a "verified" arena on a server without mail settings (the create form is the only guard); an ended arena's code can be drawn again; a restart drops a scheduled start.
