# Work package D1: replace the browser's default dropdown

Read `00-overview.md`, `11-foundation-guide.md` (section 11) and `60-no-scroll.md`. Owner's request, verbatim: "swap out default dropdown as well". Every native `<select>` in the interface is replaced by a control that looks and behaves like part of this game.

## The control (`src/ui/Picker.tsx`)

- Closed: a button in the input style that shows the current choice and a chevron, with the label above it like every field. 44 px or more tall.
- Open on a phone (the `fit` layout without `laptop`): a sheet from the bottom with the label as its title and the choices as large rows (44 px or more), the current one marked with a check and the water colour. Choosing closes it.
- Open on a laptop: a list anchored to the button, opening downward or upward where there is room, as wide as its longest choice within the pane.
- Long lists never scroll (the no-scroll rule): the choices are paged with `Pager` inside the sheet or the list, and the page that holds the current choice opens first. Grouped choices (for example the 30 conditions in 5 groups) show the groups first as a short list or as tabs, then the choices of one group.
- Keyboard: Enter, Space or Arrow Down opens; arrows move; Home and End jump; typing a letter jumps to the next choice that starts with it; Enter chooses; Escape closes and returns focus to the button; Tab closes. Screen readers get the combobox and listbox roles with the active choice announced. A disabled choice says why in a short note.
- Props mirror what `Select` takes today (label, value, onChange, choices with value and label, optional groups, hint, error, disabled), so a call site changes one import and its children.
- Tests for the pure parts: paging with a current choice, type-ahead, the grouped flow, the open direction.

## Where

Every `<select>` and every use of `Select` from `ui/Field.tsx` in `apps/web/src`: the rule editor (condition, comparison, action, target, switch-to-mode, place and way choices), the test options, the workshop's round-rules control, the create page's options, and any other. A choice among 5 or fewer short options that fits its row should be a `SegmentedControl` instead, as the foundation guide already says; use the picker for the rest. After this package `grep -rn "<select" apps/web/src` finds nothing, and `Select` is removed from `ui/Field.tsx` and from the guide.

The picker's parts inside the rule sentence must keep the sentence readable: the closed button is inline, sized to its text, and wraps with the sentence.

## Check

`bun test`, `bun run type-check`, `bun run build` clean. Serve the build and run the no-scroll audit: every state passes, plus new states with a picker open (a short list, a long paged list, a grouped list) at 360 x 640, 390 x 844 and 1000 x 600 in both languages. Keyboard-only run of one rule edit on a laptop. Read the screenshots: the open picker must look like the rest of the game and not like a browser menu.

## Report

The common report, plus: the list of call sites you changed, which became a `SegmentedControl` and which a `Picker`, the audit result, and the screenshots you read.
