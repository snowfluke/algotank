# Work package W1: preparing a tank (play style, fine-tune, try it)

Read `00-overview.md`, then `11-foundation-guide.md` (tokens, components, message catalogs, the tank). This is the screen the owner called terrible: one long page of dropdowns with text such as "My tank holds [comparison] [amount] water". A beginner or a child must be ready in 30 seconds, and an interested player must still reach every option the editor has today.

## You own

`apps/web/src/editor/**`, `apps/web/src/prep/**`, `apps/web/src/vocabulary/**`, `apps/web/src/player/StrategyPanel.tsx`, `useStrategy.ts`, `SaveStatus.tsx`, `WhenStrategyReady.tsx` (move them into `src/prep/` if that serves the structure, and keep `StrategyPanel` importable from its current path with its current props, because the player page composes it), and in the engine only an additive change to the validator (see "Problems"). Do not edit `src/practice/**` (you only place the existing `<Practice>` component), `src/board`, `src/rules`, `src/player/PlayerPage.tsx`, `packages/arena` or `apps/server`: other engineers are working there now.

## 1. Vocabulary in two languages (`src/vocabulary/messages.ts`)

The interface never shows an engine label. For every id in the engine tables it shows text from this catalog, in English and Indonesian: every condition (30), target choice (16), action (12), their parameters and option values, the condition and action groups, the three attributes with their effect sentences, the 8 play styles (name and one-sentence summary) and the 6 round rules (name and one-sentence summary). Type the catalog from the engine's id types, so a new engine id without text is a compile error.

- A condition, an action and a target are sentence parts, written so that a full rule reads as one correct sentence for every parameter value, 1 included, in each language on its own terms. Design the parts for composition, for example condition `myWater`: "my water is {compare} {n}"; action `moveToward`: "move toward {target}"; target `nearestWithLessWater`: "the nearest tank with less water than me". A rule then reads: "When my water is at least 6, move toward the nearest tank with less water than me." Indonesian: "Kalau airku paling sedikit 6, dekati tank terdekat yang airnya lebih sedikit dariku." Use message functions where word order differs between the languages.
- Use the glossary. Summaries of play styles say only what the rules do.
- Read `~/.claude/skills/bahasa-indonesia-plain/SKILL.md` before writing Indonesian. Address the player as "kamu".
- A test renders every preset's every rule as a sentence in both languages and fails on a leftover placeholder, a double space, or an id.

## 2. The three tabs (phone first)

Use `Tabs`. One sentence above them says the tank is ready and everything else is optional.

**Play style.** The 8 play styles as `ChoiceCard`s: a tank drawing, the name, the one-sentence summary and at most two short traits that are true of its rules (for example "keeps its distance", "hunts the leader"). Choosing one applies and saves it at once. When the player has changed rules or upgrades by hand, the choice shows a `Toast` with Undo instead of a blocking question.

**Fine-tune.**
- Upgrades: 6 points across Range, Aim and Dodge, one `Stepper` each, points left always visible, one short sentence per attribute with this round's real numbers when the round rules are known. The control prevents spending more than 6.
- Rules: one sentence explains that the tank reads the rules from top to bottom each turn and does the first one that fits. Each rule is a card that reads as a sentence. Tapping it opens it in place: "When" (each condition is chosen from a grouped list with plain names; its parameters are edited inside the sentence with selects and steppers; "all of these" or "any of these" in words), "Do" (action and target as a sentence), and a `Disclosure` "More options" for: chance, switch to another mode, and "is not true" per condition, each with a one-sentence explanation. Move up, move down, duplicate and delete have accessible names and visible meaning; delete offers Undo. "If no rule fits" shows the last-resort action as a sentence. A new rule starts valid.
- Modes: a row of mode tabs above the rules, with one sentence where they first appear. Add, rename, set as the start mode and delete stay possible. Limits are stated only when reached.

**Try it.** Place the existing `<Practice>` component (another engineer redesigns its inside).

When the arena changes round rules, the next round's rules appear once near the top in plain words, and the list of all round rules sits behind a disclosure.

## 3. Saving without a save button

Valid changes save automatically a short moment after the last edit, and when the tab is hidden. `SaveIndicator` always shows saving, saved, or not saved with the reason in words (an invalid rule, a round in progress, no connection) and a Retry action on failure. A change that cannot be saved is kept locally and saved when it becomes possible. Keep every field of `StrategyHandle` that other folders read, and keep `saveStrategy` and `refreshSaved` working for the developer panel. Tests with fake timers cover the delay, a failure with Retry, and a change made during a round.

## 4. Problems

The editor prevents invalid states where it can. For the rest, add structured issues to the engine's validator without changing its current result: next to `errors: string[]`, return `issues: { path, code, params }[]` with a typed code per kind of problem. The editor shows each problem next to the rule or field it belongs to, in plain words with the fix, in both languages, and never as a raw path. Engine tests cover every code.

## 5. Nothing lost

List in your report every capability of today's editor and where it now lives.

## How to look at your work

- API server on port 8942 with a temporary `DATA_DIR`, client with `API_PORT=8942 bunx vite --port 5942 --strictPort` in `apps/web` (do not run `bun run build`). Check `apps/server/src/config.ts` for the environment variables the server needs today. Scripts in `<scratchpad>/e2e/` show how to create an arena and join over HTTP; the contract may have changed, so read `packages/arena/src/types.ts` as it is now.
- Playwright from a Playwright installation on the owner's machine. Scripts and screenshots in `<scratchpad>/revamp/w1/` (the builder's scratch folder).
- At 390x844 and 1280x800, in English and Indonesian: a first visit, choosing a style, Undo, opening and editing a rule sentence, adding a condition, upgrades at the limit, a failed save (stop your API server for a moment), and keyboard-only use of the tabs and one rule.
