// The cut line, as one bot sees it. A cut round keeps `survivorsAfterRound` bots.
// A grand final keeps one, the winner, so the same rule gives the lead over
// second place to the leader and the gap to the leader to everyone else.
// A decision cannot draw for the real tie-break, so a tie in points counts as no
// margin at all, which is what the tied bot should assume.

import type { BotState, Snapshot } from "../types.ts";
import { indexOf } from "./snapshot-index.ts";

/**
 * The score of the bot across the cut line from `bot`, or null when no bot is
 * across it (the cut keeps everyone).
 * A bot inside has the best outsider across the line, a bot outside has the
 * worst insider. Both are the k-th best score among the other bots, where k is
 * the number of survivors.
 */
export function scoreAcrossCut(snapshot: Snapshot, bot: BotState): number | null {
  const k = (snapshot.survivorsAfterRound ?? 1) - 1;
  // The scores are sorted once per snapshot. "The others" are all scores minus one copy
  // of this bot's: when that copy sits after place k, place k is unchanged, else it moves up by one.
  const index = indexOf(snapshot);
  const all = index.scoresHighFirst;
  const placed = index.botById(bot.id);
  if (placed === undefined) return all[k] ?? null;
  const own = all.indexOf(placed.score);
  return (k < own ? all[k] : all[k + 1]) ?? null;
}

/**
 * Points between `bot` and the cut line: positive when inside, with the lead over
 * the best outsider, and negative when outside. Infinity when nobody is across the line.
 */
export function cutMargin(snapshot: Snapshot, bot: BotState): number {
  const across = scoreAcrossCut(snapshot, bot);
  return across === null ? Number.POSITIVE_INFINITY : bot.score - across;
}
