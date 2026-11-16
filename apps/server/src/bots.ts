// Built-in opponents. A bot is a player with isBot: true, a friendly water name, a
// preset strategy and a plain look in the least-used body colour (no pattern, plate or
// icon, so people stand out from bots). Bots have no token, so nobody can edit
// or move them, and the reset after a game removes them.
//
// The mix must let a beginner win sometimes. BOT_LINEUP is the order in which seats
// are filled, so any number of bots keeps a similar mix; 7 bots (one human) give
// 3 weak, 3 middle and 1 strong. Tune the mix here, as data. The tiers follow the
// win rates of the eight-direction game in docs/decisions (the Ambusher leads the
// mixed field), and scripts/simulate.ts --lineup= measures the default play style
// against this list: pass the 7 preset ids in this order after any change. Since the
// retune of 2026-11-16 the designed presets get about the same points in a mixed
// field, so only "weak" (the Charger, the Random walker) still means weaker; "middle"
// and "strong" now name only where the tier stood before.

import { botsToAddAtStart, plainTankLook, TANK_COLOURS, type Arena, type BotSeat, type PlayerId, type TankColour } from "@game/arena";
import { PRESETS, type Strategy } from "@game/engine";

export type BotTier = "weak" | "middle" | "strong";

export interface BotSlot {
  readonly tier: BotTier;
  readonly presetId: string;
}

export const BOT_LINEUP: readonly BotSlot[] = [
  { tier: "weak", presetId: "charger" },
  { tier: "middle", presetId: "picker" },
  { tier: "weak", presetId: "random-walker" },
  { tier: "middle", presetId: "backstabber" },
  { tier: "strong", presetId: "ambusher" },
  { tier: "weak", presetId: "charger" },
  { tier: "middle", presetId: "leader-chaser" },
];

/**
 * The first names bots take. An owner's arena may need up to 511 bots (78-arena-seats.md), so
 * botNames goes on with "Splashy 2", "Bubbles 2" and so on after these.
 */
export const BOT_NAMES: readonly string[] = [
  "Splashy",
  "Bubbles",
  "Drizzle",
  "Puddle",
  "Ripple",
  "Misty",
  "Geyser",
  "Soaker",
  "Droplet",
  "Sprinkle",
  "Torrent",
  "Squirt",
  "Wavelet",
  "Fountain",
  "Rainy",
  "Spritz",
  "Gush",
  "Dewdrop",
  "Brook",
  "Mizzle",
  "Sploosh",
  "Drench",
  "Dribble",
  "Monsoon",
  "Lagoon",
  "Trickle",
  "Raindrop",
  "Seafoam",
  "Bubbly",
  "Hydro",
  "Showers",
  "Wetsy",
];

const strategyOf: ReadonlyMap<string, Strategy> = new Map(
  BOT_LINEUP.map((slot) => {
    const preset = PRESETS.find((p) => p.id === slot.presetId);
    // Checked at load, so a renamed preset stops the start instead of a game.
    if (preset === undefined) throw new Error(`The bot lineup names the preset "${slot.presetId}", which the engine does not have.`);
    return [slot.presetId, preset.strategy] as const;
  }),
);

/** The body colour fewest players have, the lowest number on a tie. */
function leastUsedColour(colours: readonly TankColour[]): TankColour {
  let best: TankColour = TANK_COLOURS[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const colour of TANK_COLOURS) {
    const count = colours.filter((c) => c === colour).length;
    if (count < bestCount) {
      best = colour;
      bestCount = count;
    }
  }
  return best;
}

/**
 * `count` bot names that no player in `taken` (lower case) has: BOT_NAMES first, then each of them
 * with 2, 3 and so on after it. The longest is 8 letters, so a number up to 9999 stays within
 * PLAYER_NAME_MAX (16), and a round of 32 names adds at least 32 - taken.size new ones.
 */
export function botNames(count: number, taken: ReadonlySet<string>): readonly string[] {
  const names: string[] = [];
  for (let round = 1; names.length < count; round++) {
    for (const base of BOT_NAMES) {
      const name = round === 1 ? base : `${base} ${round}`;
      if (!taken.has(name.toLowerCase())) names.push(name);
      if (names.length === count) break;
    }
  }
  return names;
}

/**
 * The bots that fill the arena up to seatsOf(settings).botsFillTo tanks (8, or 16 in the
 * tournament, or the owner's tank count), for an addBots event. Empty when the arena has that
 * many already or botFill is off. `newId` gives ids that cannot equal a player id.
 */
export function botsToFill(arena: Arena, newId: () => PlayerId): readonly BotSeat[] {
  const count = botsToAddAtStart(arena.settings, arena.players.length);
  const freeNames = botNames(count, new Set(arena.players.map((p) => p.name.toLowerCase())));
  const colours = arena.players.map((p) => p.look.colour);
  const bots: BotSeat[] = [];
  for (let i = 0; i < count; i++) {
    const slot = BOT_LINEUP[i % BOT_LINEUP.length];
    const name = freeNames[i];
    if (slot === undefined || name === undefined) throw new Error("botNames returned fewer names than asked.");
    const strategy = strategyOf.get(slot.presetId);
    if (strategy === undefined) throw new Error(`No strategy for the bot preset "${slot.presetId}".`);
    const colour = leastUsedColour(colours);
    colours.push(colour);
    bots.push({ playerId: newId(), name, strategy, look: plainTankLook(colour) });
  }
  return bots;
}
