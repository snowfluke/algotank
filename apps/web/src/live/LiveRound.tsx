// A running round on the big screen page (screen/ScreenPage.tsx), which has no tank
// of its own. On a projector the board fills the height beside a ranking that shows
// the top places, the places around the cut line and a count of the rest. A narrow
// window (a phone that opens the screen link) scrolls: the round and its clock, the
// board with the legend (a big arena follows the leader, board/ArenaView.tsx), then
// the ranking. The room's own panes are in live/panes.tsx.

import { useMemo, type ReactNode } from "react";
import type { PublicArena, PublicSnapshot } from "@game/arena";
import type { RuleSetId, ThrowEvent, UltimateFire } from "@game/engine";
import { ArenaView, type ArenaViewProps } from "../board/ArenaView.tsx";
import { LegendButton } from "../board/BoardLegend.tsx";
import { hasUltimates } from "../board/ultimates/boardUltimates.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useMusicCondition } from "../sound/music.ts";
import { LiveRanking } from "../standings/StandingsTable.tsx";
import { liveRanking, playerNames, tankInfos } from "../standings/standings.ts";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { formatClock, timeLeftMs } from "./clock.ts";
import { roundHeading } from "./roundHeading.ts";
import { useSecondsUntil } from "./countdown.ts";
import { SCREEN_GAP_PX, SCREEN_RANKING_FIT, screenBoardBox } from "./scoreboardColumns.ts";

interface RunningPhase {
  readonly round: number;
  readonly isFinal: boolean;
  readonly ruleSetId: RuleSetId;
  readonly survivorsAfterRound: number | null;
}

interface LiveRoundProps {
  readonly arena: PublicArena;
  readonly phase: RunningPhase;
  /** Null until the first snapshot of this round arrives. */
  readonly snapshot: PublicSnapshot | null;
  readonly throws: readonly ThrowEvent[];
  readonly fires?: readonly UltimateFire[];
  readonly roundSpawn?: PublicSnapshot | null;
  /** "screen" on a projector (fixed height), "narrow" in a window that scrolls. */
  readonly layout: "screen" | "narrow";
  /** When the first turn plays, from the stream state's `firstTurnAt`. Without it no countdown shows. */
  readonly firstTurnAt?: number | null;
}

export function LiveRound({ arena, phase, snapshot, throws, fires = [], roundSpawn, layout, firstTurnAt = null }: LiveRoundProps) {
  const m = useMessages();
  useMusicCondition(snapshot?.ruleSetId ?? null);
  const isScreen = layout === "screen";
  const { tickMs } = arena.settings;
  // One names record and one colour map per player list, so the board derives its labels once and not on every turn.
  const names = useMemo(() => playerNames(arena), [arena]);
  const tanks = useMemo(() => tankInfos(arena), [arena]);
  const countdown = useSecondsUntil(firstTurnAt);
  const counting = countdown !== null && snapshot !== null && snapshot.tick === 0;

  const heading = roundHeading(phase, arena.settings.ruleSetMode !== "standard", m);
  const clock = snapshot === null ? null : formatClock(timeLeftMs(snapshot, tickMs));

  const header = (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-1">
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <h1 className="text-heading [overflow-wrap:anywhere]">{heading}</h1>
        {isScreen ? <p className="text-muted [overflow-wrap:anywhere]">{m.vocabulary.roundRules[phase.ruleSetId].summary}</p> : null}
      </div>
      {clock === null ? null : (
        <p className="flex shrink-0 flex-col items-end">
          <span className="text-caption font-semibold text-muted">{m.live.timeLeft}</span>
          <time className="font-display text-heading font-bold leading-none">{clock}</time>
        </p>
      )}
    </header>
  );

  if (snapshot === null) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="animate-pulse-soft text-lead text-muted">{m.live.starting}</p>
      </div>
    );
  }

  const ranking = liveRanking(arena, snapshot);
  const boardProps = { snapshot, throws, fires, names, highlightId: null, tickMs, tanks, countdown: counting ? countdown : null } as const;
  // Before the first turn every tank ties at 0, so the tie note would only add noise.
  const rankingNote = phase.isFinal ? m.results.table.finalRule : ranking.tieAtCut && snapshot.tick > 0 ? m.results.table.tieAtCut : null;

  if (isScreen) {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
        {header}
        <ScreenArea board={boardProps} label={m.results.table.live} note={rankingNote}>
          <LiveRanking ranking={ranking} highlightId={null} fit={SCREEN_RANKING_FIT} />
        </ScreenArea>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {header}
      <div className="flex min-w-0 justify-end">
        <LegendButton layout={snapshot.layout?.id} ultimates={hasUltimates(roundSpawn ?? snapshot)} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <ArenaView {...boardProps} defaultChoice="follow" />
      </div>
      <section className="flex min-w-0 flex-col gap-2" aria-labelledby="live-ranking-heading">
        <h2 id="live-ranking-heading" className="text-title">
          {m.results.table.live}
        </h2>
        {rankingNote === null ? null : <p className="text-caption text-muted">{rankingNote}</p>}
        <LiveRanking ranking={ranking} highlightId={null} />
      </section>
    </div>
  );
}

function ScreenArea({ board, label, note, children }: { board: ArenaViewProps; label: string; note: string | null; children: ReactNode }) {
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const boardBox = box === null ? null : screenBoardBox(box);
  return (
    <div
      ref={ref}
      className="grid min-h-0 items-start"
      style={{ columnGap: `${SCREEN_GAP_PX}px`, gridTemplateColumns: boardBox === null ? "minmax(0, 1fr) minmax(0, 1fr)" : "auto minmax(0, 1fr)" }}
    >
      <ArenaView {...board} wholeOnly fixedBox={boardBox} />
      <section className="flex min-h-0 min-w-0 flex-col gap-2 self-stretch" aria-label={label}>
        {note === null ? null : <p className="text-caption text-muted">{note}</p>}
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </div>
  );
}
