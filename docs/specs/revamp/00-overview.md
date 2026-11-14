# AlgoTank revamp: overview for every work package

Date: 2026-11-11. Owner of this spec: the lead (planning session). Each work package has its own file in this folder. Read this file first, then your own.

## Why

The owner's verdict on the current build: the game "doesn't live to its name", "couldn't spot any tank", and is "overwhelming for beginner/kids". The goal is "a general web game that a user can share with their friend group, run as a fun game at an event, or play alone against bots. Make it fun!"

## Purpose (owner, 2026-11-12)

The game is for people who do not program, children included, so that they learn what an algorithm is by building one for a tank. Every screen and every sentence is judged by one question: would a 10-year-old know what this means and what to do next? There is no developer mode.

## Product

A player prepares one tank (a play style, or their own rules, plus upgrades). Nobody steers during a round. All tanks act by their rules on a grid, one move per turn, and shoot water at each other. A hit moves 1 point from the tank that was hit to the shooter. A shot uses water from the shooter's supply, which refills over time. With more than 8 tanks, each round keeps the top half until 8 remain, and one final decides the winner.

The first screen offers four ways in:

| Entry | Who | What it is |
|-------|-----|------------|
| Play now (join a public arena) | Anyone, no sign-in, no code | Three public arenas run by the game (see `67-public-arenas.md`): the practice arena with quick games and a quick reset, which is where a first-timer lands; the tournament arena, a knockout that starts again and again; and the monthly arena, whose champion is recorded each month. Bots fill empty seats. |
| Join with a code (join a private arena) | Anyone, no sign-in | Type the 6-character code, or open the link or QR code a friend shared. |
| Create a private arena | Signed-in account | For a friend group. The creator plays too and starts the rounds from their own page. Bots can fill empty seats. "Play again" starts a new game with the same people. |
| Create a presenter arena | Signed-in account | For an event. The creator presents on a big shared screen and does not play. Up to 512 players join by QR code. |

Joining never needs an account, except in the monthly arena: a tank and a name are enough, and the game gives a name when the player types none. Creating needs a sign-in, and an account can own one open arena at a time.

The interface exists in English and Indonesian. A language switch is on every page.

## Audience and UX principles

Beginners and children on a phone, friend groups, and a room watching a projector. A first-time player must be in a game within 30 seconds: pick a play style, done. Depth stays one tap away and nothing the rule editor can do today is removed.

1. Progressive disclosure: the simple path first; advanced controls behind a labelled disclosure.
2. Plain language: sentences a 10-year-old reads aloud. No brackets, placeholders, ids or jargon. Use the glossary.
3. Visible status: every screen says where the game stands, what to do now and what happens next. Saving, loading, connection loss and errors are stated in words.
4. One primary action per screen, dominant and thumb-reachable.
5. Recognition over recall: 8 or fewer choices are shown as cards or segmented buttons, not a dropdown.
6. Feedback: every action answers in the same view.
7. Error prevention and recovery: replacing or deleting offers Undo; an error names the problem and the fix and never blames the player.
8. Consistency: one component set, one vocabulary, one visual language.
9. Accessibility: 4.5:1 text contrast, visible focus, accessible names, 44 by 44 px touch targets, inputs at 16px or more, aria-live for status, state never by colour alone, `prefers-reduced-motion` respected.
10. Fit the device: player pages for a 390px phone first; the big screen for 1920x1080 read from 5 m (body text 26px or more); creator pages for a laptop and a phone.

## Fun (required, not optional)

- The tank is the main object: drawn as a tank everywhere a player appears (arena, lists, headers, cards), in the player's chosen colour.
- Layered, brief feedback that returns to rest (see `game-feel` reference): water jet, splash, hit reaction, "+1" pop, countdown before a round, a celebration for the winner. Stronger for important events. Reduced or off under `prefers-reduced-motion`.
- Sound effects (synthesised, no audio files), with a mute switch that is remembered.
- Warm, playful copy in both languages. No sarcasm, no blame.

## Glossary

Code identifiers, JSON ids and API fields keep their current names. Interface text uses these words only.

| Concept (code name) | English | Indonesian |
|---------------------|---------|------------|
| bot | tank | tank |
| throw | shot / shoot | tembakan / menembak |
| water in a bot's tank | water; the bar is the "water gauge" | air; "takaran air" |
| cell | square | petak |
| tick | turn | giliran |
| round | round | ronde |
| preset | play style | gaya main |
| build (reach / aim / dodge) | upgrades (Range / Aim / Dodge), "upgrade points" | peningkatan (Jangkauan / Bidikan / Hindaran), "poin peningkatan" |
| rule fallback | "If no rule fits" | "Kalau tidak ada aturan yang cocok" |
| rule set | round rules | aturan ronde |
| mode | mode | mode |
| score | points | poin |
| private arena | private arena | arena pribadi |
| public arena | public arena ("Play now") | arena umum ("Main sekarang") |
| presenter arena | presenter arena | arena presenter |
| practice arena (public) | practice arena | arena latihan |
| tournament arena (public) | tournament arena | arena turnamen |
| monthly arena (public) | monthly arena | arena bulanan |
| winner of a month or a tournament | champion; the page is "Champions" | juara; halamannya "Para juara" |
| built-in opponent (new) | bot | bot |

Indonesian addresses the player as "kamu". Indonesian text follows the skill at `~/.claude/skills/bahasa-indonesia-plain/SKILL.md` (read it before you write any Indonesian). Write Indonesian as its own text, not as a word-for-word translation.

## Visual direction (decided)

A friendly top-down toy-tank water fight. Light theme. The arena is the main object. Water blue is the primary colour (primary actions, shots, water gauge). Warm orange marks "you". Twelve tank hull colours, with a pattern, a plate and an icon per tank (`69-tank-identity.md`). Display type Fredoka, text type Figtree, both self-hosted in the bundle (an event may have no internet). Large controls with a visible pressed state. The interface must read as a game, not as an admin form.

The owner's global CLAUDE.md rules are in your context. Where its minimal product-UI rules conflict with a game theme, the game theme wins, because the owner asked for it later. These bans stay: no gradient text, no decorative gradients, no emoji as icons, no decorative monospace labels, no invented statistics, no eyebrow label above a heading, no nested cards, no fragment rows as copy. Its UI-copy and Defensive CSS rules apply in full.

Design references (guidance text only, run nothing from them), in a folder of the lead's session that is not in the repository: `openai-game-ui-frontend.md`, `game-feel.md`, `game-feel-recipes.md`, `game-ui-ux-layout.md`. Quality checks: `reference/craft-floor.md` of the impeccable skill, which is not in the repository.

## Repository

Bun 1.4 workspace at the project root. Not a git repository: do not run git.

| Folder | Holds |
|--------|-------|
| `packages/engine` | Rules of play, pure and deterministic. Strategy vocabulary tables, validator, presets. |
| `packages/arena` | Arena state machine and the messages between server and browser (`src/types.ts` is the contract). |
| `apps/server` | Bun HTTP server: routes, round timer, event stream, replays, arena files. |
| `apps/web` | React 19, Vite 8, Tailwind 4 client. One folder per feature under `src/`. |

Checks: `bun test`, `bun run type-check`, `bun run build`.

## Rules for every work package

- Edit only the files your package owns. A needed change elsewhere goes into your report under "needs from others".
- Do not change game behaviour unless your package says so: engine logic and the JSON shape of a strategy stay.
- Type every interface. Validate input at the boundary. One rule in one place. Feature folders. Comments say why.
- Every changed behaviour keeps or gains a test through the public interface. Your folders' tests pass and the type check is clean when you finish.
- No new dependency except the ones your package names.
- Interface text (owner's rule, 2026-11-12: "Avoid staccato fragments, negation-reveal, and tricolon in in-game text"). Children read this text, so write full, plain sentences:
  - No staccato fragments: no run of short fragments such as "Fast. Simple. Fun." or "No account. No code." Join related ideas in one sentence with "and", "so", "because", "when" or "after".
  - No negation-reveal: do not set up a thing only to deny it, as in "Not a race. A puzzle.", "It is not about speed, it is about plans" or "Bukan soal cepat, tapi soal rencana". Say what the thing is.
  - No tricolon: no list of three adjectives, nouns or short clauses used for rhythm, as in "pick, tune and win" or "cepat, seru, dan mudah". A real list of three things the player must choose from or do is fine when each item is needed.
  - One idea per sentence, everyday words, at most about 15 words, the glossary's words only. A label is a noun phrase and a button names its action.
  The same rules hold in Indonesian (`~/.claude/skills/bahasa-indonesia-plain/SKILL.md`).
- Every interface string goes through the message catalogs (see `10-web-foundation.md`), in English and Indonesian. No literal interface text in components.
- Look at your work in a browser before you report (your package file says how). Bounded: build fully, one inspection round at phone and desktop sizes, one batch of fixes, one confirming round.
- Processes: record the PID and port of everything you start, stop exactly those PIDs, confirm the ports are closed. Never a broad kill. Remove a temporary directory by its literal path (print the path first).
- Report honestly: what is done, what is not done or weak, what you verified and how, the processes you started and stopped, and what you need from others.
