// Reads the water side of a turn: which throw a bot made.

import type { BotId, ThrowEvent } from "@game/engine";

/** What a bot's throw did on a tick, or null when the bot did not throw. */
export function throwOf(throws: readonly ThrowEvent[], botId: BotId): ThrowEvent | null {
  return throws.find((event) => event.throwerId === botId) ?? null;
}
