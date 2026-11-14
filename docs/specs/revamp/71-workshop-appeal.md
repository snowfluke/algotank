# Work package W2: play style cards, the upgrade bench, and rules as a picture of an algorithm

Read `00-overview.md`, `11-foundation-guide.md` (section 11), `60-no-scroll.md` and `65-guidance.md` first.

## Why

The owner played the build on a laptop window of about 1728 x 1000 in Indonesian and reported three problems, verbatim:

1. Play style picker: "Too verbose and dense here, and card inconsistency."
2. Upgrades: "Probably the worst UX is here. I don't even know at first that I had 6 point and I had to spend it wisely, it just didn't appealing especially for kids."
3. Rules: "The rule tab is easy to miss because people spend the time reading the point stuff. We don't even know that this is a mode and for what."

And: "you can do better and interesting & creative".

The cause is the same in all three: the screens explain with sentences what a picture must show. A child does not read helper text. Every earlier check was done by a reader of all the text, so it did not find this.

## Acceptance test for this package (the reading-free test)

Hide every helper sentence in your head and look at the screen for five seconds. The picture alone must show:

| Screen | What a child must see without reading |
|--------|----------------------------------------|
| Play style picker | Eight cards of one shape, and what each tank does from its moving drawing |
| Upgrades | There are 6 tokens, where each one sits now, that a token can be taken out and put elsewhere, and what each upgrade changes on the tank |
| Rules | The rules are checked from the top, one after the other, and each rule is "when this, do that" |
| Modes | A tank with modes has more than one list of rules and moves between them |

You judge this on captures at 1728 x 1000 (Indonesian), 390 x 844 (Indonesian) and 360 x 640 (English). The no-scroll audit proves that nothing is cut off; it does not prove appeal. Read your captures for both.

## Facts you must design for

- Budget: `BUILD_BUDGET` is 6. Range (`reach`) has levels 0 to 2 and each level costs 2. Aim and Dodge have levels 0 to 3 and each level costs 1 (`packages/engine/src/combat/combat.ts`).
- Every built-in play style arrives with all 6 points spent (0/3/3, or 1/2/2 for the wanderer). A child therefore always opens the screen on "0 left". The budget and the way to take a point back must be obvious in exactly that state. Do not change the builds of the built-in styles: that is game behaviour.
- "Poin" also means the score of a round. Upgrade points get their own drawn token (below), so the two are never confused. The words stay "upgrade points" / "poin peningkatan".
- Effects depend on the round rules. Take every number from `throwRange` and `hitChancePercent` or from `upgradeNumbers` (`prep/upgrades.ts`), never from a fixed sentence. Base range is 1 in two rule sets. When the rules are secret (`rules === null`), the pictures show levels without numbers and one sentence says that the numbers are hidden until the round rules are known.
- Five of the eight built-in styles have one mode. Three (the ambusher, the picker, the backstabber) have two, "Rest" and "Strike", and rules that switch between them.
- `prep/` components are shared by two hosts: the room (`prep/PrepPanel.tsx`) and the workshop (`workshop/WorkshopEditor.tsx`). Every change below applies in both.

## Part A: play style cards

Files: `prep/BuiltInStyles.tsx`, `prep/PlayStyleScene.tsx`, `prep/playStyles.ts`, the play style texts in `vocabulary/messages.ts`.

- One card shape. The drawing has one fixed aspect ratio in every tile and slide (it does not take "the height the text leaves"). Under it: the name on one line, then one sentence of at most 9 words that takes at most 2 lines at the tile's width. In the grid, all drawings start at the same height and all names sit on the same line.
- The trait chips go. They repeat the sentence. Delete the trait data and messages when nothing else uses them.
- Rewrite the 8 sentences in both languages: what the tank does, in the order it does it, in words a 10-year-old uses. Example: "Menghindar dulu, lalu menembak tank yang lengah."
- The drawing acts the style out. Each scene becomes a loop of 2 to 4 seconds in which the tank does what the sentence says (the evader steps out of the dashed aim line and then shoots; the leader chaser drives to the tank with the star; the ambusher backs away, its water gauge fills, and it runs in). Use the scene's own SVG and CSS or the Web Animations API, no new dependency. A viewer who sees only the loop must be able to tell two styles apart.
- One scene moves at a time, so the grid is calm: on a wide pane, the tile under the pointer or with keyboard focus, otherwise the chosen tile; in the carousel, the current slide. Under `prefers-reduced-motion` every scene is the still drawing of today.

## Part B: the upgrade bench

Files: `prep/UpgradesPane.tsx` (rebuild), `prep/upgrades.ts`, `editor/build.ts`, `ui/` only for a part that is generic.

```
 [o][o][ ][ ][ ][ ]   You have 2 points to place.              (take all out)
 +------------------+ +------------------+ +------------------+
 | drawing: jet     | | drawing: aim     | | drawing: dodge   |
 | reaches 4 squares| | ring tightens    | | tank sidesteps   |
 | Range            | | Aim              | | Dodge            |
 | - [oo][  ]  +    | | - [o][o][ ]  +   | | - [o][ ][ ]  +   |
 | Your shot reaches| | Your shots hit   | | Shots at you hit |
 | 4 squares.       | | 12% more often.  | | 6% less often.   |
 +------------------+ +------------------+ +------------------+
```

- The token: one drawn object for an upgrade point (a bolt, a gear tooth or another workshop part; your choice, one SVG component). It is the same object in the tray, in the sockets, and in the tour.
- The tray, on top: six places. A free token lies in the tray; a placed token leaves an empty outline there and sits in a socket of its upgrade. Beside the tray, one live sentence: with free tokens, "You have 2 points to place."; with none, "All 6 points are placed, so take one out to move it." (`aria-live="polite"`). A quiet action "Take all out" sets the three levels to 0, so a child can share out all six. It offers Undo in the same place (overview principle 7).
- Three cards, one per upgrade, in the order Range, Aim, Dodge. Each holds:
  - a drawing that changes visibly at every level. Range: a lane of squares with the tank's water reaching exactly `throwRange` squares, so one more level is one more wet square. Aim and Dodge: your design, as long as level 0, 1, 2 and 3 look different and the change says "hits more" and "gets hit less".
  - the sockets: Range has 2 sockets that each hold 2 tokens (drawn as a double socket, which is how the cost is shown); Aim and Dodge have 3 sockets that each hold 1. A socket is a button: an empty one fills the upgrade up to that level when the free tokens allow it, and the last filled one empties. The minus and plus buttons stay beside the sockets, because they are what a child tries first.
  - one live sentence of at most 12 words that states the effect now, with the round's numbers: "Your shot reaches 4 squares.", "Your shots hit 12% more often.", "Shots at you hit 6% less often.", and at level 0 a sentence that says the upgrade is still empty. The rule that Aim and Dodge count from a distance of 2 squares moves to a help step behind a "?" button next to the tray; it is not on the cards.
- A token moves from the tray to its socket in about 200 ms (no motion under `prefers-reduced-motion`).
- A blocked tap answers in the same view: when plus or an empty socket needs more tokens than are free, the tray reacts (a short shake, none under reduced motion) and the tray sentence becomes "You need 2 points and have 1, so take a point out of another upgrade first." No control looks active and does nothing.
- Layout: on a wide pane the three cards sit in one row and the group has a maximum width (about 60rem), so nothing stretches across a 1700 px window. On a narrow pane the cards stack as rows (drawing left, name, sockets and sentence in the middle, minus and plus right). When the pane is short (`useFitDetail`), the sentence goes first, then the drawing; the tray and the sockets always stay.
- The problems list (`Problems`) stays above the cards.

## Part C: rules first, shown as an algorithm

### C1. Order of the tabs

The rules are the algorithm, which is the purpose of the game, so they come before the upgrades.

- Workshop (`WorkshopEditor.tsx`): the bottom tabs are Rules, Upgrades, Try it, and the editor opens on Rules.
- Room (`PrepPanel.tsx`): the tabs are Play style, Rules, Upgrades, Try it. The "Fine-tune" tab and its inner switch (`PaneSwitch` with the hook `tune`) are removed, because a switch inside a tab is what the owner missed. The "Save as my play style" action stays reachable from Rules and from Upgrades.
- Check the four tabs with the save line at 360 px in both languages before you build further. When they do not fit, the save line becomes its icon with the same accessible name on a narrow pane; report what you chose.
- Update what depended on the old order: the workshop tour, the `data-coach` anchors, the audit's hooks and state names, the kit page.

### C2. A rule is a card of blocks

Files: `prep/RulesList.tsx`, `vocabulary/sentence.ts`.

- One structure for every rule (today one rule is a sentence and the next a bulleted list): the word "When", then one block per condition with the joining word ("and" / "or") between blocks, then an arrow, then one action block with an icon for the kind of action (drive toward, drive away, step aside, shoot, turn, wait, wander, and so on for all 12). A rule that changes mode ends with a chip that names the mode it goes to. A rule with a chance shows it as a small chip.
- "If no rule fits" uses the same card with its own lead-in and no condition block.
- Condition blocks and action blocks have two different colour roles from the existing tokens. Do not use the guide yellow (tours) or the orange that marks "you".
- Order as a drawing: the rule numbers sit on one vertical line with arrowheads that runs from the first rule down into "If no rule fits". The intro sentence becomes shorter ("Each turn, your tank does the first rule from the top that fits.") and still shows only when the height allows.
- `vocabulary/sentence.ts` gains one function that returns a rule's parts (condition texts, joiner, action text and id, the mode it switches to, the chance) and the card renders from it; `ruleLines` goes. The card stays one button that opens the rule's step, and its accessible name is the full sentence (`ruleBriefText`).
- Height: with blocks, at least 3 cards show per page at 390 x 844 in the workshop and at least 2 at 360 x 640 in the room. Blocks wrap; a long condition wraps inside its block.

### C3. Modes

Files: `prep/RulesList.tsx`, the modes step in `prep/RuleSteps.tsx`.

| The play style has | The rules pane shows |
|--------------------|----------------------|
| One mode | No mode control. Beside "Add a rule" there is a quiet "Add a mode". |
| Two or more modes | A strip above the rules with the label "Modes": one chip per mode with its name. The first mode carries the flag and the word "start". The chosen chip is joined to the rule list below it like a tab, so the list visibly belongs to it. When the chips fit one row and there are at most 4, arrows between chips show which mode a rule can switch to. A pencil button "Edit modes" opens the modes step. |

- The modes step (and "Add a mode") opens with a small drawing of two rule lists with an arrow from a rule in one to the other, and one sentence: "A mode is one more list of rules, and a rule can tell your tank to change mode, for example from Refill to Attack."
- With two or more modes, one sentence under the strip says where the tank starts ("Your tank starts in Refill."), when the height allows.

## Text

Every string goes through the catalogs in English and Indonesian, follows the overview's text rules and passes `i18n/copyRules.test.ts`. Read `~/.claude/skills/bahasa-indonesia-plain/SKILL.md` before you write Indonesian. This package removes more sentences than it adds: delete every message that nothing shows any more.

## Tour

The workshop tour (`guide/tours.ts`, `65-guidance.md`) keeps at most 10 steps and its tested time budgets. It now starts on Rules. Its upgrades step points at the tray and says that the tank has 6 points to place. Do the tour in phase 2.

## You own

`apps/web/src/prep/**`, `apps/web/src/vocabulary/**`, `apps/web/src/editor/**`, `apps/web/src/workshop/**`, `apps/web/src/guide/**`, the kit page's states for these panes, `apps/web/scripts/no-scroll-audit.mjs` (states and hooks only), `docs/specs/revamp/11-foundation-guide.md` (the sections on these panes), and the tests of those folders. A needed change elsewhere goes into your report.

## Two phases

Phase 1: build parts A, B and C in both hosts with their tests. Run `bun test` and `bun run type-check`. Build into your own folder and serve it on your own port (below). Capture the play style picker (workshop "start from" and the room's Play style tab), the upgrade bench (0 free, 2 free, 6 free, a blocked tap, rules secret), the rules pane (a one-mode style, a two-mode style, the open modes step) at 1728 x 1000 in Indonesian, 390 x 844 in Indonesian and 360 x 640 in English, in the workshop and in a room. Run the no-scroll audit only for the states you changed. Then stop and report with the paths of the captures; the lead reads them and answers.

Phase 2, after the lead's answer: the lead's fixes, the tour, the foundation guide, then the whole no-scroll audit once, `bun test` and `bun run type-check`.

## Build and processes

- Never run `bun run build`: it rewrites `apps/web/dist`, which the owner's server serves on port 8787 right now. Never use port 8787 and never stop that server.
- Build: `cd apps/web && bunx vite build --outDir <scratch>/revamp/w2/dist --emptyOutDir`. Serve: `PORT=8991 TRUST_PROXY=1 STATIC_DIR=<that dist> DATA_DIR=<a mktemp dir> bun apps/server/src/index.ts`. Audit: `node apps/web/scripts/no-scroll-audit.mjs http://localhost:8991 <out> [state names]`.
- One headless browser at a time. Record the PID and port of everything you start, stop exactly those PIDs, and confirm that port 8991 is closed. Remove a temporary directory by its literal path.

## Report

The common report, plus: for each row of the reading-free test, the capture that proves it and what you still doubt; every decision this file leaves to you (the token, the Aim and Dodge drawings, the colour roles, the tab row at 360 px); the messages you deleted; and the technical debt you created, with what would clear it.
