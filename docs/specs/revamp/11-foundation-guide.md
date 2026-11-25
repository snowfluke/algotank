# Web foundation usage guide (W0)

Date: 2026-11-11. For the engineers who build on the web foundation now. Read `00-overview.md` first. You can build a page from this guide without reading the foundation's source. The `/kit` page shows every part listed here. Start the dev stack as `10-web-foundation.md` describes.

All paths are relative to `apps/web/src/`. Import each file by its path. There is no barrel file.

## 1. Rules

Do:

- Get every interface string from `useMessages()`. Put your text in your feature's `messages.ts` file.
- Use the token utilities (`bg-water`, `text-muted`, `text-title`). Use `var(--color-…)` only in SVG and inline styles.
- Draw a player as a tank: use `TankBadge` outside an SVG and `TankShape` inside one.
- Put one primary `Button` or `LinkButton` on each screen.
- Show 8 or fewer choices as `ChoiceGroup` or `SegmentedControl`. Use `Picker` for a longer list, for choices under group names, and for a choice inside a sentence. There is no native `<select>`.
- Put an error next to its field (`error` prop). Use `StatusBanner` for a page state. Use `Toast` with `onUndo` for an action that can be undone. Use `Dialog` only for an action that cannot be undone.
- Call `playSound(name)` at the event that the sound belongs to.
- Give a component with logic a test of a pure function or of `renderToStaticMarkup` output. The test runner has no DOM.

Do not:

- Do not write interface text as literals in components.
- Do not use hex colours in components. Add a token to `index.css` and write its purpose in a comment.
- Do not use `text-sm`, `text-lg` and similar. Use the scale in section 3.
- Do not add gradient text, decorative gradients, emoji as icons, an eyebrow label above a heading, or nested cards.
- Do not put `as const` on an `en` messages object. With it, `typeof en` requires the same English strings in `id`.
- Do not create an `AudioContext` yourself. Do not play a sound on page load.
- Do not write URLs as strings. Use `paths` from `app/route.ts`.

## 2. Tokens (`index.css`)

The tokens are in `@theme static`, so each one exists on `:root` as `--color-<name>` (or `--text-…`, `--radius-…`). Each one also exists as a Tailwind utility: `bg-<name>`, `text-<name>` and `border-<name>`. All text tokens have a contrast of 4.5:1 or better on `panel` and `ground`.

| Token | Value | Purpose |
|-------|-------|---------|
| `ground` | #f6f3ec | Page background |
| `panel` | #ffffff | Cards, inputs, dialogs |
| `ink` | #1b2733 | Main text (15.2:1) |
| `muted` | #54616d | Secondary text (6.4:1) |
| `line` | #d8d2c4 | Input borders and row dividers. Never use it for text. |
| `line-strong` | #b9b3a5 | Hovered borders and the lip of a disabled button |
| `water` | #1667c0 | Primary actions, shots, the water gauge, links (5.6:1) |
| `water-ink` | #ffffff | Text on water |
| `water-deep` | #0e4b8f | Pressed state and the lip of a primary button |
| `water-hover` | #125aa9 | Hovered primary button |
| `water-soft` | #e2eefb | Background of a selected card, info banner |
| `water-light` | #9cc8f5 | Water-coloured text on `ink` (toast Undo) |
| `self` | #e8650f | "You": fills and rings only. It is 3.3:1, so do not use it for text. |
| `self-ink` | #a5470a | "You" as text (6.0:1) |
| `self-soft` | #fdebdc | Background of a "you" row |
| `ok`, `ok-soft` | #21784a, #e1f3e8 | Success text and background |
| `hit`, `hit-soft`, `hit-deep` | #c4302b, #fce4e2, #8a1f1b | Hit, danger and error text, background, button lip |
| `warning`, `warning-soft` | #8a5a00, #fdf1d3 | Warning text and background |
| `arena-floor`, `arena-grid` | #efe6d0, #dccfb0 | Board floor and grid lines |
| `arena-<ground>-floor`, `-grid`, `-wall`, `-mark` | see index.css | The ground of each round condition: clay, meadow, court, range, wet; standard uses `arena-floor`, `arena-grid` and `arena-sand-mark` (board/arenaGround.ts) |
| `tank-outline` | #1b2733 | Outline of every tank |
| `tank-1` … `tank-12` | blue #2f7fe0, red #e2453c, yellow #f4c534, green #2ea869, purple #8b5cd6, pink #ef77b4, sky #58c7e8, slate #59646f, orange #f7962b, brown #8d5b37, white #f4f2ec, black #2a2f36 | Tank colours: the hull, the pattern and the plate |
| `tank-N-dark` | darker partner of each colour | Tracks, barrel and the plate's rim |
| `guide-on` | #3d2c00 | Text on the `guide` fill. `guide-ink` is for text on `guide-soft` and `panel`. |
| `hit-ink` | #ffffff | Text on `hit` (the danger button) |
| `scrim` | #1b2733 | The dim behind a dialog: `backdrop:bg-scrim/50`. Do not use `ink`, which turns light in the dark theme. |
| `toast` | #1b2733 | Background of a toast |

### The dark theme

`:root[data-theme="dark"]` in `index.css` gives the interface tokens their dark values (ground, panel, text, water, self, guide text, status, scrim, toast, shadow). `theme/theme.ts` sets `data-theme`: the device's setting until the person presses the header's dark mode button, then their stored choice (`PREFERENCE_KEYS.theme`). An inline script in `index.html` sets it before the first paint.

Only the interface turns dark. The arena, the tanks and every drawing keep their light colours, because the board was tuned light so the tank outline and the "You" ring show on it. The rule `:root[data-theme="dark"] svg > *` gives an SVG's shapes the light values back. Lucide icons draw in `currentColor`, so they follow the text. So:

- A token that is text on a fill needs a partner that stays readable in both themes (`water-ink`, `hit-ink`, `guide-on`). Do not put `text-white` or `text-ink` on a coloured fill.
- A drawing can use any token; it shows the light value in both themes.
- A new interface token needs a dark value in the dark block, and a light value in the SVG block when it changes in the dark theme. `theme/contrast.test.ts` checks the text ratios of both themes and that the SVG block matches `@theme`.

Other tokens:

| Token | Use |
|-------|-----|
| `--font-display` (`font-display`) | Fredoka: headings, buttons, numbers that are shown large |
| `--font-sans` (`font-sans`, the default) | Figtree: all other text |
| `--radius-control` | Buttons, inputs, segmented controls: `rounded-[var(--radius-control)]` |
| `--radius-card` | Cards, banners, dialogs: `rounded-[var(--radius-card)]` |
| `--shadow-raised` | The only shadow. Use it for things that float (a selected segment, a toast, a dialog): `shadow-[var(--shadow-raised)]` |
| `--ease-out-expo`, `--ease-back` | Settle and pop easings |

Global rules in `index.css` are in `@layer base`, and `.press` is in `@layer components`. Tailwind utilities are in `@layer utilities`, so a utility always wins over these rules: `text-lead` on a button and `font-bold` on a heading both work. If you add a global rule, put it in `@layer base`. An unlayered rule beats every utility. Only the reduced-motion block, `[data-scale="screen"]` and the "My tank" editor's `.mytank-stage` container rule are unlayered on purpose.

Rules:

- `h1`, `h2` and `h3` use Fredoka 600 and balanced wrapping.
- `:focus-visible` shows a 3px water outline with a 2px offset. Do not remove it.
- `::selection` and the caret use water.
- Inputs, selects and textareas are 16px or larger, so iOS does not zoom. Do not give an input `text-caption`.
- Class `tabular`, and every `<time>` or `[data-numeric]` element, gets tabular numerals. Use it for points, timers and codes.
- Class `press` gives the pressed state: the element moves down 2px. Buttons and cards already have it.

## 3. Type, spacing and motion

| Utility | Phone and laptop | Big screen (`data-scale="screen"`) | Use |
|---------|------------------|------------------------------------|-----|
| `text-caption` | 14px | 26px | Notes under a control, token names |
| `text-body` | 16px | 28px | Body text (the default) |
| `text-lead` | 18px | 32px | Intro sentence under a heading, card body |
| `text-title` | 22px | 40px | Section heading, card title |
| `text-heading` | 28px to 36px (fluid) | 56px | Page `h1` |
| `text-display` | 44px to 72px (fluid) | 96px | The game name, a countdown |

The big screen: put `data-scale="screen"` on the root element of the screen page. The scale variables change inside that subtree, so all the utilities above become larger. The body text becomes 28px, which meets "26px or more at 1920x1080".

Spacing uses the Tailwind 4px scale. `Page` puts `gap-6` (24px) between its sections. `Section` puts `gap-3` (12px) between the heading and its content and adds `pt-2` above. A group of controls uses `gap-2` or `gap-3`. Do not wrap a section in a bordered box. Separate sections with space.

Motion utilities (each one has a `prefers-reduced-motion` rule):

| Class | What it does | Under reduced motion |
|-------|--------------|----------------------|
| `animate-pop` | Scale 0.6 to 1 with overshoot, 260 ms (a new number, a badge) | Shows at once |
| `animate-rise` | Moves up 12px and fades in, 420 ms (a toast, a new row) | Shows at once |
| `animate-pulse-soft` | Breathes, repeats (waiting states) | No motion |

To replay a one-shot animation, change the element's React `key`. The arena board has its own motion (`board/arenaMotion.ts`): the hit wobble, the recoil and the "+1".

## 4. Messages (`i18n/`)

Use them like this:

```tsx
import { useMessages, useFormat, useLanguage } from "../i18n/I18nProvider.tsx";

const m = useMessages();          // the catalog of the current language
m.home.playNow.title;             // "Play now" or "Main sekarang"
m.common.startsIn(3);             // "Starts in 3 seconds"
const f = useFormat();
f.number(1500); f.list(["Ana", "Budi"]); f.duration(90); // "1,500", "Ana and Budi", "1 min 30 sec"
f.month("2026-11"); f.date("2026-11-12T10:00:00Z");       // "November 2026", "12 November 2026" (day first in both languages)
const [language, setLanguage] = useLanguage();            // "en" | "id"
```

Slots in `i18n/catalog.ts` and their files:

| Slot | File | Owner |
|------|------|-------|
| `common` | `ui/messages.ts` | W0. Kit text, page titles, colour names, connection problems. |
| `home` | `home/messages.ts` | W0. Home, `/join`, `/play`. |
| `share` | `share/messages.ts` | W0 |
| `sound` | `sound/messages.ts` | W0 |
| `kit` | `kit/messages.ts` | W0. This slot is not in the spec. It holds the gallery text. |
| `auth`, `room`, `prep`, `vocabulary`, `results` | `<slot>/messages.ts` (new folders) | Other packages. They are empty now. |
| `create`, `live`, `screen`, `practice` | the existing folder's `messages.ts` | Other packages. |
| `mytank` | `mytank/messages.ts` | T1. "My tank": the editor, the names of the patterns and icons, the join step's tank. |
| `errors` | `api/messages.ts` (next to `errorSentences.ts`) | The errors package. It is empty now. |
| `publicplay` | `publicplay/messages.ts` | P3b. The three public arenas: their names (`names[kind]`), the chooser on `/play`, the first-timer's join step, Ready, the monthly standing, the tournament's winner line, the offer after a first result. |
| `champions` | `champions/messages.ts` | P3b. The page `/champions`. |

To fill your slot, edit only your own `messages.ts`:

```ts
// src/room/messages.ts
export const en = {
  heading: "Your arena",
  players: (n: number) => (n === 1 ? "1 player has joined." : `${n} players have joined.`),
  ready: { title: "Ready", body: "Your tank waits for the first round." },
};

export const id: typeof en = {
  heading: "Arena kamu",
  players: (n) => `${n} pemain sudah gabung.`,
  ready: { title: "Siap", body: "Tank kamu menunggu ronde pertama." },
};
```

If an `id` entry is missing or extra, `bunx tsc --noEmit -p apps/web` fails. That type check is the test. A message is a string, or a function for text with values. English functions handle singular and plural. Indonesian has no plural form. To add a new slot, import your file in `i18n/catalog.ts` and add it to both objects.

Language choice: the browser's stored choice wins (localStorage `algotank:language`). If there is none, the first Indonesian or English entry in `navigator.languages` decides. If there is none, English. A blocked storage still works for the current visit. `<html lang>` follows the choice. Without a provider, `useMessages()` reads the app store, so a bare `renderToStaticMarkup` gives English. To test a component in Indonesian, write: `<I18nProvider store={createLanguageStore({ store: null, browserLanguages: ["id"] })}>…</I18nProvider>`.

For Indonesian text, read `~/.claude/skills/bahasa-indonesia-plain/SKILL.md`. Address the player as "kamu", use sentence case, and write one idea per sentence.

## 5. Components (`ui/`)

| Component | Import | Props (required in bold) | Example |
|-----------|--------|--------------------------|---------|
| `Button` | `ui/Button.tsx` | `variant` "primary" \| "secondary" \| "quiet" \| "danger" (primary), `size` "md" \| "lg", `loading`, `icon`, plus all `<button>` attributes | `<Button size="lg" loading={busy} onClick={save}>{m.prep.save}</Button>` |
| `LinkButton` | `ui/Button.tsx` | **`href`**, **`children: string`**, `variant` (secondary), `size`, `icon`, `newTab` | `<LinkButton href={paths.join()} variant="primary">{m.home.joinCode.title}</LinkButton>` |
| `buttonClasses(variant, size)` | `ui/Button.tsx` | | For an element that must look like a button |
| `IconButton` | `ui/IconButton.tsx` | **`label`**, **`icon`**, `variant` "secondary" \| "quiet" | `<IconButton label={m.common.close} icon={<X aria-hidden />} onClick={close} />` |
| `AppHeader` | `ui/AppHeader.tsx` | `title`, `account` (ReactNode), `showWordmark` (true) | `<AppShell header={<AppHeader title={arena.name} />}>`. It is one row, 56 px tall. |
| `Page` | `ui/Page.tsx` | **`children`**, `width` "narrow" (36rem) \| "wide" (48rem) \| "editor" (72rem) | Old: for a screen not yet moved to `AppShell` (section 11). |
| `Section` | `ui/Section.tsx` | **`heading`**, **`children`**, `intro`, `level` "h2" \| "h3", `action` | `<Section heading={m.prep.upgrades} intro={m.prep.upgradesIntro}>…</Section>` |
| `ChoiceGroup` | `ui/ChoiceGroup.tsx` | **`legend`**, **`choices`** `{ value, title, description?, visual? }[]`, **`value`**, **`onChange`**, `hideLegend`, `layout` "list" \| "grid" | `<ChoiceGroup legend={m.prep.style} value={style} onChange={setStyle} choices={[{ value: "splasher", title: …, description: …, visual: <TankBadge … /> }]} />` |
| `SegmentedControl` | `ui/SegmentedControl.tsx` | **`legend`**, **`options`** `{ value, label, lang? }[]`, **`value`**, **`onChange`**, `hideLegend`, `size` "sm" \| "md" | 2 to 5 options |
| `Tabs` | `ui/Tabs.tsx` | **`label`**, **`tabs`** `{ value, label, panel }[]`, **`value`**, **`onChange`** | Simple and advanced editor views |
| `Disclosure` | `ui/Disclosure.tsx` | **`children`**, `summary` (default "More options"), `defaultOpen` | `<Disclosure><RuleEditor /></Disclosure>` |
| `Stepper` | `ui/Stepper.tsx` | **`label`**, **`value`**, **`min`**, **`max`**, **`onChange`**, `disabled` | `<Stepper label={m.prep.range} value={reach} min={0} max={4} onChange={setReach} />` |
| `TextInput` (old name `Field`) | `ui/Field.tsx` | **`label`**, `hint`, `error` (string \| null), `display` "text" \| "code", plus `<input>` attributes except `id` and `className` | `<TextInput label={m.room.name} value={name} onChange={…} error={nameError} />` |
| `Picker` | `ui/Picker.tsx` | **`label`**, **`value`** (string), **`onChange(next)`**, **`choices`** `{ value, label, disabledNote? }[]` or **`groups`** `{ name, choices }[]` (one of the two), `hint`, `error`, `disabled`, `placeholder` (shown while the value is not a choice; default "Choose one"), `look` "field" \| "inline", `title` (the open list's title when it should differ from the label: an inline picker in a rule sentence is labelled "Action, tank" for a screen reader and asks "Which tank?" in its sheet, from `m.prep.rules.paramQuestions`), `data-picker` (audit hook) | The game's own dropdown; see below |
| `INPUT_CLASSES` | `ui/Field.tsx` | | Classes for a custom input |
| `StatusBanner` | `ui/StatusBanner.tsx` | **`tone`** "info" \| "success" \| "warning" \| "danger", **`title`** (a sentence), `body`, `action` | `<StatusBanner tone="info" title={m.room.waitingForHost} />` |
| `SaveIndicator` | `ui/SaveIndicator.tsx` | **`state`** `{ kind: "saving" } \| { kind: "saved" } \| { kind: "notSaved", reason }` | Next to an auto-saved form |
| `Toast` | `ui/Toast.tsx` | `useToast().show({ message, onUndo?, onDone? })`, `.dismiss()`. `onDone` runs once when the toast closes without Undo (time out, Dismiss, or replaced by another toast): use it for an action that waits for its Undo time, such as "Remove from arena" | `toast.show({ message: m.prep.ruleRemoved, onUndo: () => restore(rule) })`. `ToastProvider` is in `main.tsx`. Tests that render a component with `useToast` must wrap it in `<ToastProvider>`. |
| `EmptyState` | `ui/EmptyState.tsx` | **`title`**, **`body`**, `visual`, `action` | The condition and the next step |
| `Countdown` | `ui/Countdown.tsx` | **`seconds`**, `size` "md" \| "xl" | `<Countdown seconds={left} size="xl" />`. The caller owns the clock and the beep. |
| `Dialog` | `ui/Dialog.tsx` | **`open`**, **`title`**, **`body`**, **`confirmLabel`**, **`onConfirm`**, **`onCancel`** | Native `<dialog>`. Focus is trapped, and Escape cancels. |
| `ErrorNotice` | `ui/Notice.tsx` | **`children: string`**, `details` | Old component. Prefer `StatusBanner tone="danger"`. |
| `CopyField` | `ui/CopyField.tsx` | **`label`**, **`value`** | A read-only value with a Copy button |
| `FitList`, `StreamStatus` | `ui/…` | Not changed | For a radio group, use `ChoiceGroup` or `SegmentedControl` |
| Hooks | `ui/useCopy.ts` | Not changed | |

**Picker.** Closed, a combobox button in the input style with the current choice and a chevron; `look="field"` puts the label above it, `look="inline"` makes it a part of a sentence (the label is then the accessible name, and the open list's title is `title` when given, else the label). Open, it is a modal `<dialog>` in a portal: on a phone (not `laptop:`) a sheet from the bottom with `title` (or the label) as its title and 52 px rows; on a laptop a list anchored to the button, as wide as its longest choice within the step sheet or `main`, opening downward or upward where its rows fit, and over the button when they fit on neither side. The rows are a `Pager`, so a long list pages and opens on the page of the current choice; the current choice has a check and the water background. With `groups`, the group names come first (the group that holds the current choice shows it under its name), then one group's choices with a Back button. Keys: Enter, Space or Arrow Down open; arrows, Home and End move; a letter jumps to the next choice that starts with it; Page Up and Page Down turn the page; Arrow Left goes back to the groups; Enter or Space chooses; Escape and Tab close and return focus to the button. A choice with `disabledNote` shows that sentence and cannot be chosen. The pure rules (rows, keys, type-ahead, placement) are in `ui/picker.ts`.

```tsx
<Picker label={m.practice.botStyles} value={mix} data-picker="bot-styles" onChange={setMix}
  choices={[{ value: "mix", label: m.practice.mixOfStyles }, ...styles]} />
```

Buttons, icon buttons and home cards play the `tap` sound when pressed. Navigation inside the app: `LinkButton` and `Wordmark` use `followLink` from `app/navigation.ts`. Put it on any `<a>` to an app page as `onClick={followLink}`. It changes the page without a reload and keeps modifier-click behaviour.

## 6. Tanks (`tank/`) and "My tank" (`mytank/`)

Spec: `69-tank-identity.md`. A player's tank has a look: a colour (12), a pattern ("skin", 12) in a second colour, a plate under it (none or a colour) and an icon on the turret (none or 24). The type, the lists and the one validator are in `packages/arena/src/types.ts` (`TankLook`, `TANK_SKINS`, `TANK_ICONS`, `parseTankLook`, `plainTankLook`); `tank/look.ts` re-exports them with the web's helpers.

```tsx
import { TankShape, TankHull, TankHatch, TankPlate, SelfRing, hatchContent, TURRET_X } from "../tank/TankShape.tsx"; // SVG <g> parts
import { TankBadge } from "../tank/TankBadge.tsx";                // a standalone <svg>
import { tankLetters, randomLook, withColour, sameLook, contrastingColours, plainTankLook, parseTankLook, type TankLook } from "../tank/look.ts";
import { TANK_COLOUR_COUNT, TANK_COLOURS, tankColourByOrder, tankColourVar, tankColourDarkVar, toTankColour, type TankColour } from "../tank/colours.ts";
import { useMyTank, myTankStore } from "../mytank/useMyTank.ts";
```

- `TankShape` props: **`look`** or **`colour`** (one of the two; a colour alone draws a plain tank, for callers that have nothing else), `self` (the "you" ring: orange with a white and an ink casing, so it shows on every plate and hull, orange included), `label` (1 or 2 letters on the hatch when the look has no icon; `tankLetters(name)` makes them), `detail`, `angle` (degrees clockwise from east, so 90 faces down). The plate, the icon and the letters stay upright at any angle.
- Detail levels:

| `detail` | Hull | Hatch | Plate | Where |
|----------|------|-------|-------|-------|
| `"full"` | colour and pattern | the icon (filled with the second colour), or the letters | yes | badges of 32 px or more, board squares of 40 px or more, lists, results, the big screen |
| `"simple"` | colour, thicker lines | a dot of the second colour, or the letters | yes | badges under 32 px, board squares of 22 to 40 px, the viewer's own tank in a crowd |
| `"tiny"` | colour, thicker lines | none | yes | the board's crowd (squares under 22 px, up to 512 tanks): one `<use>` per tank of a shared drawing per hull and plate pair (a round plate there, because that drawing turns) |

- Geometry: a 10 by 10 unit box centred on 0,0. The plate reaches 5.4 units and the "you" ring 6. On a board with 10-unit squares, write `<g transform={`translate(${x * 10 + 5} ${y * 10 + 5}) scale(0.9)`}><TankShape … /></g>`. A board that turns tanks with CSS draws the parts itself, as `board/ArenaBoard.tsx` does: the plate on the square, `TankHull` (via `TankShape` with `plate` and `icon` null) in the turning group, and `TankHatch` at `TURRET_X` turned back by the same angle.
- Patterns are plain geometry (`tank/skins.ts`), kept inside the hull, so they need no SVG ids and turn with the hull. Icons are geometry on a 24-unit grid in one line style (`tank/icons.ts`). Neither uses an icon font or emoji.
- `TankBadge` props: the paint (**`look`** or **`colour`**), **`size`** (px), **`name`** (accessible name, or `null` when nearby text already names the tank), `self`, `label`, `angle`, `detail` (default: "simple" below 32px). Example: `<TankBadge look={player.look} label={tankLetters(player.name)} size={40} name={m.common.tankOf(player.name)} self={isMe} detail="full" angle={-90} />`.
- Bots have a plain look from the server (no plate, no icon) and the word "bot" next to their name, so people stand out.
- `tankColourByOrder(i)` gives a colour by position (repeats after 12). `toTankColour(n)` narrows an API number. `randomLook(random)` is "Surprise me": the pattern and the plate come from the other lightness group than the hull (`LIGHT_COLOURS`), so they show also to a colour-blind player. Colour names: `m.common.tankColours[colour]`; pattern and icon names: `m.mytank.skins[skin]`, `m.mytank.icons[icon]`.
- "My tank" (`mytank/`): `useMyTank()` returns `{ tank: { name, look, updatedAt }, account, blockedName, persistent }`; change it with `myTankStore.setLook(look)` and `myTankStore.setName(name)` (false for a name that breaks `parsePlayerName`; "" lets the game give a name at join). The device copy is under `PREFERENCE_KEYS.myTank`; a signed-in account syncs through `GET`/`PUT /api/account/tank`, and the newer copy wins (the table at the top of `mytank/myTank.ts`).
- The editor: `MyTankEditor` (a pane: the live tank, the part tabs, a paged grid of large choices), hosted by the page `/my-tank`, by `MyTankSheet` (a `StepSheet` with "Surprise me" and Done, used by the join steps and by the room's "Change my tank"), and `JoinTank` (the tank, "Change my tank" and the name field in a join form; `detail` "full" (default), "brief" (no hint) or "compact" (the tank and "Change my tank" in one row, the name left to the editor, a name problem still shown) lets a crowded screen give way). The header shows the player's own tank as the way in (`mytank/MyTankEntry.tsx`).

## 7. Sound (`sound/`)

```ts
import { playSound } from "../sound/player.ts";
playSound("splash"); // returns true when it played
```

Names: `shot`, `splash` (a hit), `miss`, `dry` (not enough water to shoot), `countdown`, `roundStart`, `roundEnd`, `win` (about 1.2 s), `tap`. The list is in `SOUND_NAMES` in `sound/sounds.ts`. The effects are synthesised and have no audio files. The background music is the one exception: its files are in `apps/web/public/music/` (`80-background-music.md`).

`playSound` does nothing in these cases: the "Sound effects" switch is off, the page has had no click, tap or key press yet, Web Audio is missing, or the same effect played less than 60 ms ago. Thus 8 hits in one turn give one splash. You can call it in every turn handler without your own checks.

There are two sound switches, "Music" and "Sound effects". `useSoundSettings()` (from `sound/setting.ts`) returns `[{ music, effects }, set]`. `SoundControl` (from `sound/SoundControl.tsx`) is the button that opens both switches, and it is already in `AppHeader` and on the big screen. Both settings are remembered together in `algotank:sound`, and both default to on. The big screen ignores the remembered music setting: it starts without music, and the presenter turns music on there for that visit only (`sound/music.ts`).

## 8. Sharing (`share/`)

```tsx
import { SharePanel } from "../share/SharePanel.tsx";
import { QrCode } from "../share/QrCode.tsx";

<SharePanel link={`${window.location.origin}${paths.player(arena.id)}`} code={arena.id} size="full" />
```

- `size` "compact" gives a 160px QR code and a heading-size code (a side column or a phone). "full" gives 240px and a display-size code. "screen" gives 420px, a very large code, the scan sentence and the link as text without its scheme. It has no Copy and no Share (for the projector).
- The panel contains: a QR code with a 4-module quiet zone and an accessible name, the code split into two groups of 3, the link with Copy, and Share. Share opens `navigator.share` and is hidden where the browser has no share sheet.
- `QrCode` props: **`text`**, **`size`**, **`label`**.

## 9. Routes (`app/route.ts`)

| Path | `Route` | `paths` | Page |
|------|---------|---------|------|
| `/` | `{ page: "home" }` | `paths.home()` | `home/HomePage.tsx` |
| `/join` | `{ page: "join" }` | `paths.join()` | `home/JoinPage.tsx` |
| `/play` | `{ page: "play" }` | `paths.play()` | `publicplay/PlayPage.tsx` (a first-timer's join step, or the chooser of the three public arenas) |
| `/new/private`, `/new/presenter` | `{ page: "create", kind }` | `paths.create("private" \| "presenter")` | `create/CreateArenaPage.tsx` |
| `/a/:id` | `{ page: "player", arenaId }` | `paths.player(id)` | `player/PlayerPage.tsx` |
| `/a/:id/host` | `{ page: "host", arenaId }` | `paths.host(id)` | `host/HostPage.tsx` |
| `/a/:id/screen` | `{ page: "screen", arenaId }` | `paths.screen(id)` | `screen/ScreenPage.tsx` |
| `/kit` | `{ page: "kit" }` | `paths.kit()` | `kit/KitPage.tsx` (`?show=layout` is the layout system demo) |
| `/workshop` | `{ page: "workshop" }` | `paths.workshop()` | `workshop/WorkshopPage.tsx` |
| `/my-tank` | `{ page: "myTank" }` | `paths.myTank()` | `mytank/MyTankPage.tsx` ("Done" returns to the page before with `goBack(paths.home())` from `app/navigation.ts`) |
| `/play?arena=<kind>` | `{ page: "play" }` | `paths.playIn(kind)` | `publicplay/PlayPage.tsx`: the chooser with that public arena chosen (`kindFromSearch` reads it) |
| `/champions` | `{ page: "champions" }` | `paths.champions()` | `champions/ChampionsPage.tsx` |

`arenaIdFromLink(text)` reads the arena id from a pasted link. To swap a page, change its `case` in `RoutePage` in `app/App.tsx`. The document title comes from `m.common.pageTitles[route.page]`.

## 10. Preferences

`app/preferences.ts` holds `readPreference`, `writePreference` and `PREFERENCE_KEYS` for settings that apply to every arena, "My tank" (`myTank`) among them. `finishedGame` is "1" once this device saw the end of a game its tank played; read and write it through `publicplay/firstGame.ts` (`hasFinishedGame`, `markFinishedGame`). `theme` is "light" or "dark" once the person pressed the dark mode button (`theme/theme.ts`); `index.html` reads the same key. `lastName` and `lastColour` are only read once, to fill the first "My tank" on a device that an older version used. Each access is wrapped in try/catch. To add a setting, add a key there.

## 11. The layout system (no scroll)

Added 2026-11-12 by S0. Read `60-no-scroll.md` for the rule. This section is the contract for S1a, S1b and S2: the props and behaviour below are final. Every page is built from `AppShell`; lists that can be long use `Pager`; one-at-a-time content uses `Carousel`; a screen with several panes on a phone uses `BottomTabs`; editing one thing uses `StepSheet`.

### 11.1 Where the fixed height applies

| Name | Query | CSS variant | Hook (`ui/layout.ts`) |
|------|-------|-------------|------------------------|
| Fit | `(min-width: 22.5em) and (min-height: 35em)`, 360 x 560 CSS px at default text size | `fit:` | `useFitLayout()` |
| Laptop | `(min-width: 56em)`, 896 CSS px | `laptop:` | `useLaptopLayout()` |

- Inside `fit:` the page is exactly the viewport (`100dvh`) and nothing scrolls. Outside it (a phone held sideways such as 844 x 390, a window under 560 px high, or a reader whose default text is larger than 16 px, because the queries are in `em`) the page scrolls normally and nothing may be cut off. So put every fixed height, `overflow-hidden` and `h-full` that exists to stop scrolling behind `fit:`.
- `laptop:` is where panes may sit side by side. The owner's 1000 x 600 window is a laptop; an upright 768 x 1024 tablet is not, so it gets the phone layout with more room.
- Both hooks return `false` in a server render (the tests).
- `index.css` and `ui/layout.ts` hold the same two queries. Change both together.
- Do not use Tailwind's `sm:`/`md:`/`lg:` for layout decisions any more; use `laptop:` so every screen switches at the same width.

### 11.2 The pane contract

A component placed in `AppShell`'s main area, in a tab panel or in a `StepSheet` body gets a box of fixed height and must fit in it:

- Its root is `flex min-h-0 flex-1 flex-col` (or a grid with `minmax(0, 1fr)` rows). Every flex or grid child that holds a list or a board has `min-h-0`.
- It never relies on the page growing. Content that does not fit is paged (`Pager`, `Carousel`), moved to a tab (`BottomTabs`) or a step (`StepSheet`, `Dialog`), or, for optional detail only, left out with `useFitDetail`.
- Text stays on the type scale and touch targets stay 44 px. Fitting by shrinking is a failure.
- A board or a drawing that should use the room it has: measure it with `useBoxSize`, or let an SVG with a `viewBox` fill `size-full`.

### 11.3 Components

| Component | Import | Props (required in bold) |
|-----------|--------|---------------------------|
| `AppShell` | `ui/AppShell.tsx` | **`children`**, `header` (default `<AppHeader />`; `null` for none), `bottom` (ReactNode), `width` "narrow" (36rem, one form) \| "wide" (72rem, default) \| "full" (no gutters), `align` "start" (default) \| "center" |
| `Pager<T>` | `ui/Pager.tsx` | **`label`**, **`items`**, **`itemKey(item, i)`**, **`renderItem(item, i)`**, `keepIndex` (number \| null), `gap` 0 \| 8 (default) \| 12, `ordered` (default true: `ol`), `uniformHeight` (every item as tall as the first: one item is measured), `jump` (`{ label, index }`: a button that turns to the page of item `index`, such as the cut line), `active` (`{ index, onChange }`: shows the page of item `index`; turning a page calls `onChange` with the new page's first item instead, so the owner moves its highlight: the Picker), `listboxId` (the list becomes a listbox with this id, and each wrapper `role="none"`) |
| `Carousel<T>` | `ui/Carousel.tsx` | **`label`**, **`items`**, **`itemKey`**, **`renderItem`**, **`index`**, **`onIndexChange`** |
| `BottomTabs<T>` | `ui/BottomTabs.tsx` | **`idBase`**, **`label`**, **`tabs`** `{ value, label, icon }[]`, **`value`**, **`onChange`** |
| `tabPanelProps(idBase, value)` | `ui/BottomTabs.tsx` | Spread on the element that holds the chosen pane |
| `StepSheet` | `ui/StepSheet.tsx` | **`title`**, **`onBack`**, **`children`**, `backLabel` (default "Back"), `action` (ReactNode) |
| `useFitDetail(levels, content)` | `ui/useFitDetail.ts` | Returns `{ ref, level }`; see below |
| `TextInput` `trailing` | `ui/Field.tsx` | New optional prop: an `IconButton` inside the right end of the field (the password's show button) |

**AppShell.** A grid of header (at most 56 px; `AppHeader` is 56), main and bottom bar. It keeps clear of the notch and the home indicator with `env(safe-area-inset-*)` (index.html sets `viewport-fit=cover`). The main area has `min-h-0` and, in `fit:`, `overflow: hidden`, with 8 px above and 16 px below the content. The bottom bar has a panel background and a top border; put the screen's primary action there (with its one-line explanation), then `BottomTabs`.

```tsx
<AppShell header={<AppHeader title={arena.name} />} bottom={<StartBar />}>
  <LobbyPane />
</AppShell>
```

**Pager.** Shows as many items as fit its height, and under them Previous, "2 of 3" and Next (44 px buttons) when they do not all fit. It measures every item in an invisible layer of the same width (`data-pager-measure`), again when the box or the items change and after the fonts load; with `uniformHeight` the layer holds the first item only, so a list of 512 rows that changes on every turn costs one row (rankings and player lists use it). The controls row is measured too, because a `jump` button can wrap it to a second line. Before the first measurement, in a server render and outside `fit:` it lists every item without controls. `keepIndex` keeps one item (the viewer's row) in view: on a page it does not belong to, it is drawn last after a dashed line. Keys: Page Up and Page Down, and the arrows when focus is not in a text field, radio group or tab list. Touch: a sideways swipe of 48 px. The Pager fills its parent's height, so give the parent one (`flex-1 min-h-0`). Items must have a stable height (no height change on hover or focus), and one item must be shorter than the pane. `renderItem` runs twice per item (the visible copy and the measuring copy), so it must not create ids that must be unique on the page (`useId` is fine, a fixed `id` is not), start effects with side effects, or hold focus-dependent state; keep such state in the screen.

```tsx
<Pager label={m.room.players} items={players} itemKey={(p) => p.id} gap={0} keepIndex={players.findIndex((p) => p.id === viewerId)}
  renderItem={(p) => <PlayerRow player={p} />} />
```

Previous and Next use `aria-disabled` on the first and last page (not `disabled`), so keyboard focus stays on them; keys work anywhere inside the Pager, including on its buttons.

**Carousel.** One item at a time, the item taking all the height above a row of Previous, dots and Next. The screen owns `index`, so it can open on the chosen item; choosing an item is a button inside the item. The dots are a picture of the position (the current one is wider), not targets; the position is read aloud. Keys and swipe as Pager. It does not wrap at the ends.

```tsx
<Carousel label={m.prep.styles} items={PRESETS} itemKey={(p) => p.id} index={i} onIndexChange={setI}
  renderItem={(p) => <StyleCard preset={p} chosen={p.id === chosen} onChoose={choose} />} />
```

**BottomTabs.** The tab bar for a phone screen with several panes: icon over a short label, at least 52 px tall, the chosen tab marked by a soft background and a bar (not colour alone), arrow keys, Home and End. The bar goes in `AppShell`'s `bottom`; the pane goes in the main area in an element with `tabPanelProps(idBase, value)`. The screen owns the value, so a primary action in the bottom bar stays on every tab.

```tsx
const [tab, setTab] = useState<"tank" | "players" | "invite">("tank");
const laptop = useLaptopLayout();
<AppShell
  bottom={<>{startBar}{laptop ? null : <BottomTabs idBase="room" label={m.room.parts} value={tab} onChange={setTab} tabs={tabs} />}</>}
>
  {laptop ? (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,18rem)] gap-6">{players}{tank}{invite}</div>
  ) : (
    <div {...tabPanelProps("room", tab)} className="flex min-h-0 flex-1 flex-col">{panes[tab]}</div>
  )}
</AppShell>
```

The laptop layout is the screen's choice: its column order may differ from the tab order, and a laptop screen may still keep one pane behind `BottomTabs` (the break: result and ranking side by side, preparation as a tab). `/kit?show=layout` is a working example.

**StepSheet.** A full-pane step that replaces the pane's content (render it instead of the pane, never on top), with a Back button and the title in one row, the body, and an optional action row. The title takes focus when it opens; Escape goes back. When the step closes, move focus back to the control that opened it (the screen renders that control again, so keep a ref and focus it in `requestAnimationFrame`). A step that holds too much opens a second step (the create page: More options, then Round rules), or pages its body. The screen keeps the state of the thing being edited, so Back loses nothing.

```tsx
{editing === null ? <RuleList onOpen={setEditing} /> : (
  <StepSheet title={m.prep.ruleTitle(editing + 1)} onBack={() => setEditing(null)} action={<Button onClick={done}>{m.prep.done}</Button>}>
    <RuleEditor index={editing} />
  </StepSheet>
)}
```

**hide-when-short.** A class in `index.css` for a drawing that should give way when there is little height: put `[container-type:size]` and a height (`fit:flex-1 min-h-0`) on its wrapper and `hide-when-short` on the drawing; it hides when the wrapper is under 7rem tall. The home scene uses it. (Tailwind's arbitrary `[@container(...)]` variant does not compile for a height query, so use this class.)

**useFitDetail.** For optional detail only (a sentence under a title). The screen draws `levels` versions, from the fullest (0) down; the hook measures the element given `ref` (a callback ref, so it follows the element when a pane is unmounted and mounted again) (which needs a height and `fit:overflow-hidden`) and moves to the next level before paint while the content is taller than the box. A change of the box or of `content` (pass the language) starts at 0 again; content that grows inside the element (an error sentence) moves it to a briefer level without a reset. Outside `fit:` the level is 0. The home page and the create form use it.

### 11.4 Language-neutral hooks for the audit

The audit script (`apps/web/scripts/no-scroll-audit.mjs`) reaches each screen state with these attributes, so one step works in both languages. Keep them when you rebuild a screen, and add the ones marked for you.

| Hook | Where | Who provides it |
|------|-------|-----------------|
| `data-tab="<value>"` on each tab, `data-tab-panel="<value>"` on its panel | `Tabs` and `BottomTabs` do it | S0 (done) |
| Room tab values: lobby `tank`, `players`, `invite`; running `arena`, `ranking`, `mytank`; break and finished `result`, `ranking`, `tank` | the room's `BottomTabs` | S1a |
| Preparation tab values `style`, `rules`, `upgrades`, `try` (the Fine-tune tab and its `data-tune` switch are gone, W2) | the preparation pane, `prep/PrepPanel.tsx`; the workshop editor's tabs are `rules`, `upgrades`, `try` and it opens on `rules` | W2 |
| `data-upgrade-tray`, `data-upgrade="<attribute>"` (a card: `reach`, `aim`, `dodge`), `data-upgrade-minus` and `data-upgrade-plus` (value: the attribute), `data-socket="<attribute>-<level>"`, `data-take-all-out` ("Take all out", and "Put them back" after it), `data-upgrade-help` (the "?" step), `data-token-at`, `data-tray-place` (the cogs, for their motion) | the upgrade bench, `prep/UpgradesPane.tsx` | W2 |
| `data-rule-add` (the "Add a rule" slot on the order line, before "If no rule fits"; it keeps `data-focus-key="add-rule"`), `data-mode-chip="<index>"` (the mode strip's chips; the pencil "Edit modes" and, for one mode, "Add a mode" carry `data-focus-key="modes"`) | `prep/RulesList.tsx` | W2 |
| `data-style-tile="<play style id>"` (a tile of the grid), `data-scene="<id>"` and `data-scene-live` (the one scene that moves) | `prep/BuiltInStyles.tsx`, `prep/PlayStyleScene.tsx` | W2 |
| `data-rule-open` | each rule in the rules list (the audit clicks the first) | S1b |
| `data-step-sheet` | `StepSheet` does it | S0 (done) |
| `data-test-run`, `data-test-board`, `data-test-show-result`, `data-test-result` | the test match: run button, its board, the control that shows the result page, the result page | S2 |
| `data-workshop-empty`, `data-workshop-list`, `data-workshop-new`, `data-workshop-start-from`, `data-workshop-open` | the workshop: empty state, list, "New play style", the start-from picker, a card's open action | S1b |
| `data-create-form`, `data-create-options`, `data-create-option="<name>"`, `data-limit-banner`, `data-limit-close` | the create page | S0 (done) |
| `data-room-pane="<pane>"` on the box of each pane (the tab values above, or `sheet` while a step sheet replaces the panes) | `room/RoomFrame.tsx`, so the audit can tell a pane that overflows its box from a frame that gives too little | S1a (done) |
| `data-opens="settings"` (the owner's settings button) and `data-opens="look"` ("Change my tank" in Players and in the settings sheet); focus returns to the same hook when the sheet closes | `room/SettingsSheet.tsx`, `player/PlayerPage.tsx`, `host/HostPage.tsx` | S1a, T1 (done) |
| `data-how-it-works` (the dialog), `data-how-it-works-open` (the help button), `data-how-it-works-next`, `data-how-it-works-done` | `room/HowItWorks.tsx` | S1a (done) |
| Presenter page tab values: lobby `invite`, `players`, `screen`; running `ranking`, break `through`, finished `winner` (one pane each, so no tab bar) | `host/hostLayout.ts` | S1a (done) |
| `data-style-source="builtIn"` and `data-style-source="mine"` (built-in play styles or the player's own) | the Play style pane, `prep/StylePane.tsx` | S1b (done) |
| `data-rule-section="when"`, `"do"`, `"more"` and `data-rule-match="all"`, `"any"` | the rule step sheet, `prep/RuleSteps.tsx` (all through `prep/PaneSwitch.tsx`) | S1b (done) |
| `data-rule-fallback` (the "If no rule fits" card, on the last page of the rules list), `data-save-as` (save the tuned strategy as a play style; in the top row of Rules and of Upgrades since W2), `data-prep-pane` (the preparation pane's box) | `prep/RulesList.tsx`, `prep/PrepPanel.tsx` | S1b (done) |
| `data-arena-pane`, `data-ranking-pane`, `data-result-pane`; `data-legend-open` (the legend's help button) | `live/panes.tsx`, `board/BoardLegend.tsx` | S2 (done) |
| `data-camera="mine"`, `"leader"` or `"whole"` on the board's box: what the arena pane shows; `data-camera-switch` around the switch (radio inputs of value `follow` and `whole`), shown only where the whole arena gives a square under 22 px (the corner map was removed, owner 2026-11-19: "it is disrupting the view") | `board/ArenaView.tsx` | L2 (done) |
| `data-picker="<name>"` on each closed picker (`condition`, `action`, `switch-to`, `bot-styles`, and `param-<key>` in a sentence, such as `param-target`); `data-picker-list` on the open list; on its rows `data-picker-group="<index>"` (a group, in engine order) or `data-picker-value="<id>"` (a choice), and `data-picker-index`; `data-picker-back` (back to the groups). The open list also holds invisible copies of its rows, so select rows inside `[role="listbox"]` | `ui/Picker.tsx`, `prep/RuleParts.tsx`, `prep/PhraseEditor.tsx`, `prep/RuleSteps.tsx`, `practice/TestOptions.tsx` | D1 (done) |
| `data-tank-part="<part>"` on each part tab of the "My tank" editor (`colour`, `skin`, `second`, `plate`, `icon`, `name`) and `data-tank-part-panel="<part>"` on its panel; `data-choice="<value>"` on each choice (`none` for no plate or icon); `data-choice-pages` around the choice pages' controls; `data-mytank-done`, `data-surprise`, `data-mytank-entry` (the header's tank), `data-live-tank` | `mytank/` | T1 (done) |
| `data-opens="mytank"` ("Change my tank" in a join step) and `data-join-form`; `data-remove-player="<id>"` (the owner's "Remove from arena" in Players) | `mytank/JoinTank.tsx`, `player/JoinForm.tsx`, `room/PlayerList.tsx` | T1 (done) |
| `data-pager`, `data-pager-item`, `data-pager-kept`, `data-pager-measure`, `data-pager-controls`, `data-pager-previous`, `data-pager-next`, and `data-pager-jump` (the button that turns to the page of the cut line in a ranking) | `ui/Pager.tsx` | S0, L2 (done) |
| `data-chooser` (the chooser's form), `data-arena-tile="<kind>"` (a tile; click it to choose), `data-play-bar` (the bottom bar with Play and its problem line), `data-play-first` (the first-timer's form) | `publicplay/PlayPage.tsx`, `publicplay/ArenaTile.tsx` | P3b (done) |
| `data-ready-bar` (`""` with the button, `"done"` once ready), `data-first-offer` and `data-offer="<kind>"` (the offer after a first result), `data-monthly-sign-in` (a monthly room for a visitor who is not signed in), `data-champions-link` (the trophy link in a tournament or monthly room's status line) | `publicplay/ReadyBar.tsx`, `publicplay/FirstResultOffer.tsx`, `publicplay/MonthlySignIn.tsx`, `champions/ChampionsLink.tsx` | P3b (done) |
| `data-champions` (the page), `data-champions-part="month"`, `"months"`, `"tournaments"` (each part); champions tab values `month`, `months`, `tournaments` | `champions/ChampionsPage.tsx` | P3b (done) |
| `data-coach="<id>"` on each tour target (section 11.6); `data-coach-callout`, `data-coach-ring`, `data-coach-pill`, `data-coach-counter` on the coach mark; `data-coach-dock` on a screen's slot for a callout; `data-show-around` ("Show me around"); `data-first-style-done` (the workshop's happy moment); `data-start-bar` (the owner's start action) | `ui/CoachMark.tsx`, `guide/`, the screens | G1 (done) |
| `data-countdown-clock` (the clock in a room's status line: "Starts in", "Time left"); `data-coach-keep-clear` (what a screen keeps in view while a tour shows: the home page's name and sentence and its two main tiles); `data-show-around` also on the board legend's "Show me around" (it replays the first-round tour) | `room/StatusLine.tsx`, `home/HomePage.tsx`, `board/BoardLegend.tsx` | F1 (done) |
| Room tab value `chat` (lobby, break, finished, out, waitingBreak, when the arena has a chat); presenter tab value `chat` (lobby, break, finished). On a laptop the chat is a radio of value `chat` in the side column's switch | `room/roomFrame.ts`, `host/hostLayout.ts` | CH1b (done) |
| `data-chat-pane="<open\|off>"` (the pane), `data-chat-lines` (the list's box), `data-chat-line="own\|host\|other"`, `data-chat-empty`, `data-chat-off`, `data-chat-quick` (the four quick lines), `data-chat-form`, `data-chat-input`, `data-chat-send`, `data-chat-refusal="<tooFast\|busy\|blocked\|off\|closed\|tooLong\|failed>"`, `data-chat-switch` (the owner's on/off switch, in the settings sheet); `data-unread-dot` on a tab or switch option | `chat/ChatPane.tsx`, `ui/BottomTabs.tsx` | CH1b (done) |

A state may also name `inView` (rule f, CH1b): selectors whose last visible element must lie inside the viewport. The size `390x450` (a phone with its keyboard open, below the fixed-height layout) is checked only by the states that name it in `sizes`.

Two more fields of a state: `mock` lists `{ route, status, body }` answers set before the page loads (`body` may be a function of the request's address), for data a page reads as it opens (the chooser's live lines, the champions); `returning: true` marks the device as one that finished a game, so `/play` shows the chooser. The public rooms' lobby and result are checked through `/kit?show=room&kind=…&phase=…` (`publicplay/RoomHarness.tsx`, the parameters are at the top of that file), because a real public lobby starts its game within 15 to 60 s.

Flags of a state in the audit script that change how it is reached: `perSize: true` loads the page and runs the steps again at every size (an open picker belongs to the layout it was opened in, and a screen that swaps its panes at the laptop width unmounts it); `sizes` limits a state to the named sizes (the tour states use 360 x 640 and 1000 x 600); `tours` sets the stored state of tours (every state starts with every tour finished, so no coach mark shows unless the state asks for one); `tour: "callout"` or `"pill"` checks that the coach mark's callout shows and leaves its target's ring free, or that the where-to-go pill shows. The step `{ pageToEnd: "<selector>" }` presses that Next button until it is `aria-disabled` (the last page of a Pager), for an item that sits on the last page, such as `data-rule-fallback`. "How the game works" no longer opens by itself, so its states click `data-how-it-works-open`.

The audit has two more rules (G1, `65-guidance.md` section 5b; F1, `70-fixes-after-guidance.md` fix 8): (d) the overlap rule: for every visible, enabled button, link and input inside the viewport, the element at its centre point is the control, one of its descendants, or its label (a control under an open modal dialog is exempt). A tour's callout or pill may cover a control for its one step, except a control in the bottom bar. No state is exempt by name. (e) the tour check above, and the callout or pill meets no `KEEP_CLEAR` box: the bottom bar with its tabs (`data-shell-bottom`), the countdown clock (`data-countdown-clock`) and `data-coach-keep-clear`. The script stops with a message when two states share a name. Its third argument names screens (`room`) or single states (`room/lobby-owner-players`), separated by commas.

The kit's pane harness (`/kit?show=board&pane=…`) takes `round=<address>` to replay a round recorded by `apps/web/scripts/record-round.ts` (for example `bun apps/web/scripts/record-round.ts 512 <dist>/kit/round-512.json`, then `round=/kit/round-512.json`): a real 512-tank round, which the engine is too slow to play in the browser. Without it, `players=512` copies the tanks of a 64-tank round onto the same squares.

### 11.5 Do and do not

Do:

- Start every page with `AppShell`. Put the one primary action in `bottom` on a phone screen with tabs, or in the form for a short centred form.
- Give every list whose length the screen does not control a `Pager`, and keep the viewer's row with `keepIndex`.
- Test each state with the audit at every size in both languages, and read the screenshots at 360 x 640 and 1000 x 600.
- Use `fit:` for anything that only exists to stop scrolling, so the fallback scrolls instead of cutting.
- Use `laptop:` (or `useLaptopLayout()`) for side-by-side layouts.

Do not:

- Do not use `overflow-auto` or `overflow-y-scroll` in a main flow. Nothing scrolls inside itself; only a `textarea` scrolls its own text.
- Do not set a fixed `h-screen`, `h-dvh` or `overflow-hidden` outside `fit:`.
- Do not shrink text below the scale or targets below 44 px to make something fit.
- Do not open a `StepSheet` on top of the pane, and do not nest a scrolling list in a sheet.
- Do not guess heights from the viewport: measure (`Pager`, `useBoxSize`, `useFitDetail`).
- Do not use `Page` for a new screen. It stays for screens not yet moved to `AppShell`.

### 11.6 Guidance for first-timers: the guide colour and coach marks

Added 2026-11-12 by G1 (`65-guidance.md`). Yellow means "look here next": nothing but guidance uses it.

| Token | Value | Purpose |
|-------|-------|---------|
| `guide` | #ffd23f | The coach mark's ring, its step counter, the guide-coloured buttons and the workshop tile. Fills and rings only (1.3:1 on `ground`), so the ring has an ink casing (13.7:1). |
| `guide-ink` | #3d2c00 | Text on `guide` (9.3:1), on `guide-soft` (12.3:1) and on `panel` (13.5:1) |
| `guide-soft` | #fff5cc | The workshop's checklist line and sheet |
| `guide-deep` | #b88a00 | The lip under a guide-coloured tile or button; never text |

Tank yellow (`tank-3`) is close to `guide`, so guidance is also told by its form: the thick pulsing ring with an ink casing, the callout and the step counter appear nowhere else.

**A tour** is data in `guide/tours.ts`: steps of kind "look" (Next, or its reading time in a timed phase) or "do" (a tap on a selector, or a signal a screen sends with `guideSignal(name)` from `guide/guideStore.ts`). Each step names its targets as selectors, in order; the first visible one is used, and `Pager`'s measuring copies and hidden panes never count. While no target shows, a pill says where to go (`where` in `guide/messages.ts`) beside the element named in `way`. The state machine is in `guide/tourMachine.ts` (its table is in the file's header), the rules of section 2b (a tour never fights the clock) in `guide/tourDriver.ts`, and the state of each tour is stored under the preference `tours`.

**Render a tour** with `<Tour id phaseOn eligible occurrence clock onFinish? variant? />` from `guide/Tour.tsx`. `phaseOn`: the tour's phase is on the screen. `eligible`: the device may start it (read only to start it). `occurrence`: a name of this occurrence of the phase (the room's `frameKey`), so a paused tour resumes in the next one. `clock`: `{ kind: "untimed" }` (the workshop, a private lobby) or `{ kind: "timed", secondsLeft }`. The room renders `guide/RoomTours.tsx`; the workshop and the home page render theirs. "Show me around" is `showAround(id)`.

**A target** gets `data-coach="<id>"` (or an existing hook, such as `data-start-bar`). Keep it small: the callout must fit beside it. A screen whose target fills it provides `<div data-coach-dock="top" className="shrink-0 empty:hidden" />` where the callout may take room in the flow (`data-coach-dock-when="laptop"` for the laptop layout only); a step with `dock: true` always uses it.

**`CoachMark`** (`ui/CoachMark.tsx`): **`target`** (element or null), **`way`**, **`counter`**, **`text`**, **`where`**, **`label`**, **`next`** (`{ label, finish, onNext }` or null; `finish` marks the last step, whose callout then shows only that button), **`skip`** (`{ label, onSkip }` or null; the where-to-go pill always shows it), `preferDock`. The ring and the dim are `pointer-events: none`, so the target and every other control stay usable. The callout's place comes from `ui/CoachPlacement.ts` (tested): beside the target, never over it or off the screen, covering the fewest controls. It may cover other controls for its one step, but never meets a `KEEP_CLEAR` box (the bottom bar, the countdown clock, `data-coach-keep-clear`); next to such a box beside the target it goes just past the box. Mark what a screen must keep in view with `data-coach-keep-clear`. Under `prefers-reduced-motion` the ring does not pulse.

### 11.7 The preparation panes (W2, `71-workshop-appeal.md`)

Added 2026-11-12 by W2. The play style picker, the upgrade bench and the rules pane explain with pictures, not helper sentences. Both hosts use them: the room (`prep/PrepPanel.tsx`, tabs Play style, Rules, Upgrades, Try it) and the workshop (`workshop/WorkshopEditor.tsx`, tabs Rules, Upgrades, Try it, opening on Rules).

| Pane | What it draws | Where the rule lives |
|------|---------------|----------------------|
| Play style | One card shape: a 5:3 scene, the name on one line, one sentence of at most 9 words with two lines kept. A grid of 4 x 2 on a wide pane, a `Carousel` that hugs its card on a narrow one. Each scene acts its style out in a 3.2 s loop; only one moves (`movingStyle`: pointer, else focus, else the chosen one; in the carousel the current slide), and only under `prefers-reduced-motion: no-preference`. | `prep/BuiltInStyles.tsx`, `prep/PlayStyleScene.tsx`, `prep/playStyles.ts` |
| Upgrades | A tray of 6 cogs (one cog is one upgrade point, `prep/UpgradeToken.tsx`); a placed cog leaves its silhouette in the tray and sits in a socket. Range has 2 double sockets, Aim and Dodge 3 single ones. A socket, minus and plus are buttons; a tap that needs more cogs than lie free shakes the tray and says so. "Take all out" becomes "Put them back" in the same place. The cards' drawings change at every level and grow with the free height; on a short pane the sentences go first, then the drawings, then the secret-numbers line, then the tray's count (still read aloud); the tray, sockets, minus and plus always stay, and a card is never clipped. | `prep/UpgradesPane.tsx`, `prep/upgrades.ts` (pure: `socketsOf`, `tapSocket`, `tapPlus`, `tapMinus`, `freePoints`, `upgradeSentence`), `prep/UpgradeDrawings.tsx`, `editor/build.ts` (`emptyBuild`) |
| Rules | Each rule is a card of blocks: "When", one blue block per condition with "and"/"or" between, an arrow, one green action block with its icon (`prep/actionIcons.ts`), then a "to mode X" chip and a chance chip. A block is one box. On a list under 32rem the blocks stack one per line in caption size; from 32rem they flow as a sentence. The rule numbers sit on one order line with arrowheads that runs through an "Add a rule" slot into "If no rule fits". Two or more modes get a one-row strip of chips joined to the list like a tab, with arrows between neighbours (`prep/modes.ts`) when at most 4 fit; when they do not fit, the chosen chip and "+N". | `prep/RulesList.tsx`, `vocabulary/sentence.ts` (`ruleParts`) |

Do not use a container query (`@container`) on an element whose overflow `useFitDetail` must see: it adds layout containment, which hides the children's overflow. The bench reads its own width in JavaScript for that reason.

### 11.8 Arena chat (CH1b, `72-arena-chat.md`)

Added 2026-11-13 by CH1b. Chat exists in private and presenter arenas while people wait: the lobby, the break and after the game. It is absent in a public arena and while a round runs, and the big screen never shows it.

| Part | Where | Rule |
|------|-------|------|
| Where the chat shows | `chat/chatRules.ts` (`chatPlace`: `"none"`, `"open"`, `"off"`; the table is in the file's header) | The one rule for the room's and the presenter page's layouts, the pane and the history read |
| The lines | `chat/chatLog.ts` (`reduceChatLog`) | History and stream merge by id, same-millisecond lines keep the server's order, a removed player's lines go and stay gone, at most 500 kept; `hasUnread` with a `SeenMark` |
| The state | `chat/useArenaChat.ts` | Called once by `JoinedRoom` (`player/PlayerPage.tsx`) and `HostRoom` (`host/HostPage.tsx`), above the panes, because a pane unmounts when another tab shows. Reads the history on mount, after every reconnect (`ArenaStreamState.opens`) and when the owner turns the chat on; validates with `parseChatText` before a POST; keeps the draft, the refusal and the owner's switch |
| The stream | `useArenaStream(arenaId, token, chatFeed)` | Pass the page's `useChatFeed()` to receive `chat` and `chatRemoved` (`chat/chatFeed.ts`); pass `null` and the stream asks the server for no chat at all (`?chat=0`), as the big screen does |
| The server's shapes | `chat/chatWire.ts` (`isChatMessage`, `isChatHistoryResponse`) | One check for the stream and for the GET and POST answers |
| A refusal | `chat/chatRules.ts` (`refusalOf`, `waitUntil`) | Each `ChatErrorCode` has its own kind; a wait ends at `receivedAt + retryAfterMs` and disables Send and the quick lines until then |
| The pane | `chat/ChatPane.tsx` | Lines as tank + speech bubble with the name leading the text (own lines on the right in the "you" colours with the word "you", the host's with a crown and "Host"), at most 4 rows a line so one line always fits the list box; the four quick lines, the input (16 px, Enter sends) and Send. The list is a `Pager` with `newestLast` |
| The owner's switch | `ChatSwitch` (in `chat/ChatPane.tsx`) | In the settings sheet (`room/SettingsSheet.tsx`, `SettingsParts.chat`) of the room and of the presenter page, next to the bots switch, so the pane keeps its height for the lines |

`Pager` gained `newestLast: { earlier, later }`: pages are planned from the newest item back (`planPagesFromEnd` in `ui/paging.ts`), the Pager opens on the newest page and stays there while items arrive, the items sit at the bottom of the box, and the controls row above the list says "Earlier messages" with the position read aloud only. `BottomTab` and `SegmentOption` gained `dot` (the unread mark, with its words for a screen reader), and `FramePane.dot` passes it through `RoomFrame`.

## Amended 2026-11-13 (P4b)

- 11.4: the `data-first-offer` hooks no longer exist (the first-result offer was removed).
- 11.6: the keep-clear list also holds the player's own tank and its "You" label inside the arena pane (`[data-arena-pane] [data-self="true"]`, `[data-arena-pane] [data-you-marker]`).
- `ui/useFitDetail` applies a measurement only to the level it was taken at (`measuredLevel`); the upgrade bench uses the hook again.
- 11.4: new hook `data-other-arenas` on the link to the chooser on a public result.

## Amended 2026-11-14 (K2)

- 11.4: new hooks `data-stats-card` (the statistics card, `stats/StatsCard.tsx`), `data-stats-numbers`, `data-stats-quiet` (the never-ran sentence), `data-stats-row="rule|fallback"`; `data-test-stats` (the card on the Try it result, behind its switch's radio `stats`); `data-own-part` (the monthly "Your tank" switch, radios `summary` and `stats`); `data-mytank-part` and `data-account-stats` (the "My tank" page's switch and the account's totals). The room's `mytank` pane is also there after a round (break, finished, out) once the player's own `stats` message arrived, labelled "Stats" / "Statistik" (`m.stats.tab`); on a laptop it is the radio `mytank` in the ranking's column.
- Message slot `stats` (`stats/messages.ts`): the card, the switch labels (`parts`) and the account's totals.
- `/kit?show=room` takes `stats=1|quiet`; `/kit?show=board&pane=test` takes `rules=quiet` (a rule that never runs).
