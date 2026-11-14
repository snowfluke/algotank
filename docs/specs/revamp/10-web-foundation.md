# Work package W0: web foundation

Read `00-overview.md` first. Everything other web packages build on. They start the moment you finish, so the app must compile, `bun test apps/web` must pass and `bunx tsc --noEmit -p apps/web` must be clean at the end.

## You own

`apps/web/src/index.css`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/brand.ts`, `apps/web/src/ui/**`, `apps/web/src/app/**`, `apps/web/package.json` (only the dependencies named here), and these new folders: `apps/web/src/i18n/`, `apps/web/src/tank/`, `apps/web/src/sound/`, `apps/web/src/share/`, `apps/web/src/home/`, `apps/web/src/kit/`. You also create one `messages.ts` stub in each existing feature folder (see i18n). In other files you may make only the smallest edit that keeps the app compiling after your changes; list each one.

Allowed new dependencies (in `apps/web`): `@fontsource-variable/fredoka`, `@fontsource-variable/figtree`, `qrcode-generator`.

## 1. Tokens and type (`index.css`)

- Palette in `@theme`, light theme, exact values, text at 4.5:1 or better: ground, panel, ink, muted, line, water, water-ink, a darker water for pressed states, self (orange), ok, hit/danger, warning, arena floor and arena grid, and `--color-tank-1` to `--color-tank-8` (hull colours that stay distinguishable from each other and from the floor, as far as 8 hues allow for common colour-blindness), each with a darker partner `--color-tank-N-dark` for tracks and turret. Keep the token names code already uses (ground, panel, ink, muted, line, water, water-ink, self, hit, ok); values may change.
- `--font-display` (Fredoka) and `--font-sans` (Figtree), self-hosted through the two packages, with system fallbacks.
- A type scale for phone and laptop, and a larger one for the big screen (class or data attribute on the screen page root; body 26px or more at 1920x1080).
- Radii, one raised shadow with offset and blur, a focus ring, selection and caret colours, tabular numerals for numbers.
- Motion utilities with a `prefers-reduced-motion` rule for each.

## 2. Shared components (`src/ui/`)

Typed props, accessible, each with a header comment that says when to use it, tests for the ones with logic. Existing exports (`Button`, `LinkButton`, `Field`, `Notice`, `ErrorNotice`, `Page`, `CopyField`, `RadioGroup`, `FitList`, the hooks) stay importable under their names and props.

| Component | Purpose |
|-----------|---------|
| `Button` | primary, secondary, quiet, danger; sizes; loading state; optional leading icon; visible pressed state |
| `IconButton` | icon-only control; an accessible label is required by its type |
| `LinkButton` | navigation that looks like a button |
| `Page`, `AppHeader` | page column; header with the AlgoTank wordmark and tank glyph, an optional title (for example the arena name), the language switch, the sound switch and a slot for the account control |
| `Section` | heading plus content with the spacing rhythm |
| `ChoiceCard`, `ChoiceGroup` | a radio group drawn as large selectable cards (title, one sentence, optional leading visual); arrow keys work |
| `SegmentedControl` | 2 to 5 options |
| `Tabs` | accessible tablist with panels |
| `Disclosure` | "More options" pattern |
| `Stepper` | minus, value, plus for a small integer with min and max |
| `TextInput`, `Select`, `Field` | form controls with label, optional help and error text next to the field |
| `StatusBanner` | info, success, warning, danger; a title sentence and optional action; role status or alert |
| `SaveIndicator` | saving, saved, not saved with a reason |
| `Toast` | one at a time, aria-live, optional Undo action, auto-dismiss that pauses on hover and focus |
| `EmptyState` | condition plus next step |
| `Countdown` | large number for "starts in N" (pure display; takes a number) |
| `Dialog` | for a destructive confirmation only; focus trap, Escape closes |

## 3. Internationalisation (`src/i18n/`)

Typed catalogs, no key strings.

- Each feature folder has `messages.ts` that exports `en` and `id`. `en` is the source of truth; `id` is typed as `typeof en`, so a missing or extra Indonesian entry is a compile error. A message is a string, or a function for text with values, for example `place: (n: number, total: number) => ...`. English functions handle singular and plural; Indonesian has no plural form.
- `src/i18n/catalog.ts` composes every feature's messages into one object per language: `{ common, home, auth, create, room, prep, vocabulary, live, screen, results, practice, developer, errors, share, sound }`. Create every slot now. Features that other packages will write (`auth`, `create`, `room`, `prep`, `vocabulary`, `live`, `screen`, `results`, `practice`, `developer`, `errors`) get a stub `messages.ts` in their folder (create the folder when it does not exist: `src/auth`, `src/room`, `src/prep`, `src/vocabulary`, `src/results`) that exports empty `en` and `id` objects, so those packages edit only their own file.
- `I18nProvider` and `useMessages()` return the catalog of the current language; usage reads as `const m = useMessages(); m.home.playNow`.
- Language choice: the stored choice, else the first of `navigator.languages` that is Indonesian or English, else English. Stored with the existing session storage helpers pattern (try/catch, works without storage). `<html lang>` follows it. `LanguageSwitch` component (two options: "English", "Bahasa Indonesia", each named in its own language).
- `formatNumber`, `formatList`, `formatDuration` (seconds to "1 min 30 s" style) that use `Intl` with the current language.
- Tests: the stored choice wins; the browser language decides otherwise; a function message gives singular and plural in English; the `id` catalog type-checks against `en` (the type check is the test); switching language re-renders text.
- You write English and Indonesian for the features you build (`common`, `home`, `share`, `sound`, and the UI kit's own text such as "Copy", "Copied", "Undo", "Close", "More options"). Read the Indonesian skill first.

## 4. The tank (`src/tank/`)

- `TankShape`: an SVG `<g>` in a box of 10 by 10 units centred on 0,0, facing east at 0 degrees: two tracks, a hull in the hull colour, a turret, a barrel with a nozzle. It must read as a tank at a glance, top-down, friendly (rounded, toy-like), not military-menacing. Props: `colour` (1 to 8), `self` (adds the orange "you" treatment that also reads without colour, for example a ring), `label` (1 or 2 characters, readable on or beside the turret), `detail` ("full" or "simple"; simple stays recognisable when a square is 12 CSS px wide).
- `TankBadge`: a standalone `<svg>` wrapper for lists, headers and cards, with a size prop and an accessible name.
- `colours.ts`: `TANK_COLOUR_COUNT = 8`, `type TankColour = 1 | ... | 8`, `tankColourByOrder(order: number): TankColour`, `tankColourVar(colour)`, and a translated name for each colour in the `common` messages (for the colour picker's accessible names).
- `TankColourPicker`: a radio group of 8 tanks for the join form.

## 5. Sound (`src/sound/`)

Synthesised with the Web Audio API, no audio files, each effect under 400 ms except the win jingle (under 2 s): shot, splash (hit), miss, dry shot (too little water), countdown beep, round start, round end, win, button tap (very quiet). One `playSound(name)` function that does nothing when muted, when the page has had no user gesture yet, or when the API is missing. `useSoundSetting()` and a `SoundSwitch` (remembered; default on). Never more than a few sounds per turn: `playSound` drops repeats of the same effect within 60 ms. Tests for the mute, the throttle and the missing-API path (inject the audio context).

## 6. Sharing (`src/share/`)

`SharePanel` for every place a link is shared (private arena, presenter arena, the big screen): a QR code of the link (crisp SVG from `qrcode-generator`, with a quiet zone and an accessible name), the 6-character code in large type, the link with a Copy button, and a "Share" button that opens the phone's share sheet when `navigator.share` exists (hidden otherwise). Props: `link`, `code`, `size` ("compact", "full", "screen"). `QrCode` is exported on its own too.

## 7. Routes and the home page

`route.ts` stays the only file that knows URL shapes. Define all of these now, so later packages only fill pages:

| Path | Page | Built by |
|------|------|----------|
| `/` | home | you |
| `/join` | type a code | you |
| `/play` | join a public arena | placeholder page from you, filled by W2 |
| `/new/private`, `/new/presenter` | create an arena | both show the existing create page for now, replaced by W2 |
| `/a/:id` | player page | exists |
| `/a/:id/host` | creator page | exists |
| `/a/:id/screen` | big screen | exists |
| `/kit` | component gallery | you |

Home page: the AlgoTank name with a tank, one sentence that says what the game is, and four large choices in this order, each a card with a small drawing (tanks, not stock icons), a title and one sentence: "Play now" (the primary one), "Join with a code", "Create a private arena", "Create a presenter arena". The two create cards carry a short "Sign-in needed" note (the sign-in itself comes with W2; link them to their routes). Language switch and sound switch in the header. The page must feel like the front of a game on a phone and on a laptop: give it one authored moment (for example tanks that roll in and one that shoots a water jet), built with `TankShape`, that is still under reduced motion.

`/join`: one field for the code (6 characters, forgiving of case, spaces and a pasted full link), one primary action. The code is checked with `GET /api/arenas/:id`; an unknown code gets a plain sentence with what to do.

Update `App.tsx`, navigation and their tests, and every link to the old create path.

## 8. The gallery (`/kit`)

Every component, the tanks in all 8 colours at full and simple detail, self marking, the share panel and buttons that play each sound. It is for the other engineers and for your screenshots.

## How to look at your work

- API server: `HOST_KEY=ux-host-key PORT=8941 DATA_DIR=<a directory you make with mktemp -d under the scratchpad> bun apps/server/src/index.ts` in the background.
- Client: `cd apps/web && API_PORT=8941 bunx vite --port 5941 --strictPort` in the background. Do not run `bun run build`.
- Playwright, headless Chromium, one browser: `import { chromium } from "<a Playwright installation>/index.mjs"`. Scripts and screenshots go to `<scratchpad>/revamp/w0/`, in the builder's scratch folder.
- Screenshots to take and read: `/` and `/join` and `/kit` at 390x844 and 1280x800, in English and in Indonesian; a zoomed capture of the tanks; `/kit` with reduced motion.

## Report

In addition to the common report: a usage guide for the engineers who build on this right now. It must be exact enough that they do not read your source first: every token and its purpose, every component with import path, props and one example, the message catalog pattern with an example of adding a feature's messages, the tank API, the sound API, the share panel, the type and spacing rules, and a do and do-not list. Save the same guide as `docs/specs/revamp/11-foundation-guide.md`.
