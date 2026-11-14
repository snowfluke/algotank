// The room's "My tank" pane after a round (docs/specs/revamp/81-metrics.md, K2): the player's
// statistics card from their own stream (stream/streamState.ts `ownStats`). In a break it shows
// the round that ended; at the end of a game the whole game's numbers, with the rules of the
// last round the tank played, because the player may change rules between rounds.

import type { OwnStats } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { StatsCard } from "./StatsCard.tsx";

export interface OwnStatsPaneProps {
  readonly stats: OwnStats;
  /** True when the game is over: the card then sums the game. */
  readonly gameOver: boolean;
}

export function OwnStatsPane({ stats, gameOver }: OwnStatsPaneProps) {
  const s = useMessages().stats;
  // The game's numbers equal the round's when the tank played one round, so the rules need no "last round" then.
  const severalRounds = stats.gameTotal.turns > stats.last.turns;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <StatsCard
        heading={gameOver ? s.game : s.round(stats.round)}
        numbers={gameOver ? stats.gameTotal : stats.last}
        rules={stats.last}
        {...(gameOver && severalRounds ? { rulesHeading: s.rulesHeadingLastRound } : {})}
      />
    </div>
  );
}
