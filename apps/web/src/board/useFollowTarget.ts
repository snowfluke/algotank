// The tank a follow window centres on: the viewer's own tank, or for a viewer without
// a tank the leader (camera.ts, leaderTarget), which stays while it still leads so a tie
// does not make the window jump.

import { useRef } from "react";
import type { PublicBot } from "@game/arena";
import type { BotId } from "@game/engine";
import { leaderTarget } from "./camera.ts";

/** The bot to follow while `active`, or undefined when no window shows or the tank is not in the snapshot. */
export function useFollowTarget(bots: readonly PublicBot[], highlightId: BotId | null, active: boolean): PublicBot | undefined {
  const leader = useRef<BotId | null>(null);
  if (!active) return undefined;
  const targetId = highlightId ?? leaderTarget(bots, leader.current);
  if (highlightId === null) leader.current = targetId;
  return targetId === null ? undefined : bots.find((bot) => bot.id === targetId);
}
