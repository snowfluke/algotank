# Monthly arena activity

Owner, 2026-11-18: "in the monthly arena there's an activity tab to see who just joined, who just left, who just changed strategy, who just changed style/appearance".

Read `77-monthly-league.md` for seats, the day round and the month close.

| Event | When it is recorded | English | Indonesian |
|-------|---------------------|---------|------------|
| `joined` | A tank takes a seat, including a same-day return | joined the arena | masuk ke arena |
| `left` | A tank leaves its seat | left the arena | keluar dari arena |
| `changedRules` | A seated tank gets different rules | changed its rules | mengganti aturannya |
| `changedLook` | A seated tank gets a different look, including a change from My tank | changed its look | mengganti tampilannya |

## What the league keeps

- Each event snapshots the public seat id, tank name and board look at the time of the change, with the league clock's time in milliseconds. The log contains only these public fields and the event kind.
- When the latest event in the league has the same seat id and kind and is within 10 minutes, refresh that row with the new time and tank snapshot. An unchanged save adds nothing and leaves the previous time alone.
- SQLite stores the latest 50 entries per league, newest first by recorded order, including changes made at the same millisecond. A restart keeps them. A new day keeps them too.
- The month close can move seats and reuse league numbers. The new rounds read the new month's log, which starts empty, and expired months are removed from the table. Moving leagues at the close creates no events.
- The existing stream's `state` includes the bounded list on connection and after changes. Everyone gets the same public list, and the per-turn messages stay the same. The page needs no extra request when the tab opens.

## What each reader sees

| Reader | View |
|--------|------|
| Visitor or player | Activity / Aktivitas shows the selected league's tanks, what each did and how long ago, newest first. An empty list leaves the pane blank. |
| Phone | Activity in the bottom tabs. |
| Laptop | Activity in the selector beside the board. |

Long lists scroll inside the activity pane and contain overscroll. The page stays fixed at the supported sizes in `60-no-scroll.md`.
