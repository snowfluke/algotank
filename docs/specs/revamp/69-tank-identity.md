# Work package T1: tank identity (skins, a background plate, an icon, a custom name)

Read `00-overview.md`, `11-foundation-guide.md` (section 11) and `60-no-scroll.md`. Owner's request, verbatim: "For tank identity, it is best to introduce a lot of skins, polkadot etc, with option for custom bg and custom icon on top of the tank for easier identifier, also custom name (alphanumerical)."

Today a player picks one of 8 hull colours, and the tank shows one or two letters. With 8 colours, two tanks often look the same. After this package a player builds a look that is theirs and that they can find at a glance.

## A tank's look (decided)

| Part | Choices | Shown |
|------|---------|-------|
| Body colour | 12 colours | The hull |
| Skin (pattern) | At least 12: plain, polka dots, stripes, slanted stripes, checks, zigzag, waves, stars, hearts, splashes, bricks, scales | Drawn on the hull in the second colour |
| Second colour | The same 12 colours, different from the body colour | The pattern |
| Plate (background) | None, or one of the 12 colours | A rounded plate on the floor under the tank and behind the tank in lists, so the tank is found by two colours |
| Icon | None, or one of at least 24 simple drawings in one line style (for example star, heart, bolt, drop, leaf, sun, moon, crown, fish, cat, bird, flower, rocket, key, bell, anchor, cloud, flame, gem, paw, music note, snowflake, mushroom, smile) | On top of the turret, in place of the letters; always upright |
| Name | 3 to 16 characters: letters A to Z in either case, digits, and single spaces between words | In lists, on the tank's label when it has no icon (the first one or two letters), and in every result |

12 x 12 x 11 x 13 x 25 is more than 500,000 looks, so two players rarely match.

```ts
// packages/arena/src/types.ts (replaces `colour: TankColour` on Player, PublicPlayer and the join request)
export const TANK_COLOUR_COUNT = 12;
export type TankColour = 1 | 2 | ... | 12;
export type TankSkin = "plain" | "dots" | "stripes" | ...;          // TANK_SKINS lists them
export type TankIcon = "star" | "heart" | ...;                      // TANK_ICONS lists them
export interface TankLook {
  readonly colour: TankColour;
  readonly skin: TankSkin;
  readonly second: TankColour;        // ignored when skin is "plain"
  readonly plate: TankColour | null;
  readonly icon: TankIcon | null;
}
export function parseTankLook(value: unknown): TankLook | null;     // the one validator, used by server and browser
```

`setColour` becomes `setLook`. A stored arena with the old `colour` loads with a plain look in that colour (one migration with a test).

## Names

- One rule in one place (`packages/arena`): 3 to 16 characters from letters, digits and single spaces; trimmed; compared without case for "name taken".
- The rule now applies in every arena, public ones included: a player may type their own name there too. This replaces the earlier decision that public arenas only use names from the game. Because children play, the server refuses a name that contains a word from a block list (English and Indonesian, kept as data in one server file, matched on the letters after removing digits that stand in for letters, such as 0 for o), and answers with a code that makes the page offer a name from the game instead. The game still suggests a two-word name by default, so a child can join without typing.
- Named limit (decision log): a block list never catches everything. The presenter of an event can remove a player in the lobby (add "Remove from arena" to the owner's player list in private and presenter arenas, with Undo for a few seconds).

## Where a player sets their look

- "My tank": one place that holds the player's name and look for this device, and for the account when signed in (store it next to the play styles of the workshop, with the same merge rule: the newer one wins). It is reachable from the header on every page (the header shows the player's own tank as the entry) and it is the first step of joining any arena, already filled in from last time.
- The editor fits one screen without scroll on a phone: a large live tank on top (it slowly turns so every side shows; still under reduced motion), then one part at a time below it (body colour, skin, second colour, plate, icon, name) as a `Carousel` of parts or a short tab row, each part a grid of large choices. A "Surprise me" button makes a random look. Changes show on the big tank at once.
- A player can change their look in a lobby, in a break and after a game, as today with the colour.

## Drawing

- `TankShape` and `TankBadge` take a `look` (keep accepting `colour` alone for callers that have nothing else). Patterns are SVG patterns clipped to the hull, drawn so they stay readable at 40 px and do not flicker when the tank turns. The icon sits on the turret hatch and stays upright.
- Detail levels: full (pattern, icon, plate), simple (body colour, plate, icon as a dot of the second colour) for small squares, and tiny (plate and body colour only) for the whole-arena view of a large round. The viewer's own tank always gets full or simple.
- The ranking, the players list, results, the big screen and the celebration show the full look.
- Bots get looks from the game: plain skin, no icon, and the word "bot", so people stand out from bots.
- Colour-blind check: the 12 colours stay distinguishable in pairs as far as 12 hues allow, and the skin, plate and icon carry identity without colour.

## You own

`packages/arena/**` (types, reducer, stored form), `apps/server/**` (join, look, names, the block list, remove player), `apps/web/src/tank/**`, a new `apps/web/src/mytank/**`, the join steps (`src/player/JoinForm.tsx`, `src/home/PlayPage.tsx`), the header entry (`src/ui/AppHeader.tsx`), the players lists and every place that draws a tank (pass the look through; no redesign), the audit's states for the editor and the join step, and the foundation guide's tank section.

## Check

`bun test`, `bun run type-check`, `bun run build` clean. The no-scroll audit passes for every state, plus the "My tank" editor on each part at every supported size in both languages. A browser run on a phone: make a look, join a private arena with it, see it on the board, in the ranking and on the big screen; a name with a blocked word is refused kindly; an owner removes a player and undoes it. Read a zoomed capture of 8 tanks with different looks on the board, and of 64: can you tell them apart at a glance?

## Report

The common report, plus: the lists of skins and icons as built, the name rule and what the block list holds (its size and sources, not the words), and the screenshots you read.
