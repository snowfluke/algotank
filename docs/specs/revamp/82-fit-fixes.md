# Work package F1: three screens that no longer fit at 360 x 640

Read `00-overview.md` and `60-no-scroll.md`. The whole audit after the cleanup package fails 8 checks in 5 states, all at 360 x 640. Three screens cause them. Each got one more element from a later package and nobody re-fitted the screen.

| Screen | States that fail | Cause | Decision |
|--------|------------------|-------|----------|
| Home | `home/default`, `tour/home-cue` (both languages) | The tile "Tonton arena bulanan" is a sixth entry, and "Buat arena presenter" is cut at the bottom. | All six entries stay visible and keep their order. In the compact form the monthly tile shows its status in one line: a short form when tanks play ("12 tank main sekarang" / "12 tanks playing now"), and no status line when no tank plays. Take the rest of the height from the two large tiles (icon beside the label instead of above it) or from the rows' padding. No entry loses its icon or its "Perlu masuk akun" mark. |
| Try it result | `prep/test-result` (both), `tour/workshop-08-result` (id) | The switch "Ringkasan / Statistik" takes a row, and the result sentence is cut. | In the compact form the switch moves into the header row beside the back arrow. The heading "Hasil uji coba" stays in the markup for screen readers and shows only where the row has room for both. The result sentence, the pager, "Uji coba lagi" and "Pilihan uji coba" are all visible. |
| Arena settings (lobby, owner) | `room/lobby-owner-settings-kept-out` (id) | The row "Jumlah tank" pushes "Tutup arena" off the panel. | Remove the sentence under the "Obrolan" switch on this panel in both languages (the label says the same), and delete its strings when nothing else uses them. When that is not enough at the worst case, tighten the panel's gaps with the existing spacing tokens. |

Rules for all three:

- Tap targets stay at 44 px or more, text sizes stay on the existing type scale, and nothing scrolls.
- The fix holds at the worst case, not only in the fixture: the longest language, a tank count of 64, the kept-out button present, a rank sentence of two lines. Add or extend an audit state where the worst case has none.
- 1728 x 1000 and the tablet sizes look as they do now, unless the same change is an improvement there; say which.
- Compact form means the existing short-viewport breakpoint or container query that the screen already uses. Do not add a new breakpoint system.

## Check

`bun test`, `bun run type-check`. The audit for these states and their neighbours (every `home/*`, `tour/*`, `prep/test-*`, `panes/test-*`, `room/lobby-owner-settings*`, `stats/*`) at every size in both languages: 0 failures. One headless browser.

Never `bun run build`; never port 8787; build to your own scratch folder and serve on port 9015. Remove the row "five failing audit states" from `docs/DEBT.md` when the audit passes. Report briefly, with the Indonesian captures of the three screens at 360 x 640.
