// One finished test match, as two pages of the same pane. The board page: a 3, 2, 1
// countdown, then the turns play on their own on the board, which takes the room
// the controls leave; play, pause, speed and a scrubber control the replay, and
// beside a wide board the scoreboard. The result page ("See the result", any time):
// the place, what the tank did most, the points and the turn shown, paged; a switch at its
// top shows the statistics card instead (the turns of each rule, K2). The replay keeps
// playing while the result page shows.
// The parent gives it a new key for each run, so the playback starts over.

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { statsView, type BotId } from "@game/engine";
import { ArenaView } from "../board/ArenaView.tsx";
import { LegendButton } from "../board/BoardLegend.tsx";
import { hasUltimates } from "../board/ultimates/boardUltimates.ts";
import type { TankInfo } from "../board/props.ts";
import { Scoreboard } from "../board/Scoreboard.tsx";
import { UltimateLink } from "../catalogue/UltimateLink.tsx";
import { ArenaCondition } from "../monthly/ArenaCondition.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { MatchResult } from "./MatchResult.tsx";
import { DEFAULT_SPEED_ID, SPEED_MS, initialReplay, replayReducer, type SpeedId } from "./replay.ts";
import { ReplayControls } from "./ReplayControls.tsx";
import { SequenceNow } from "./SequenceNow.tsx";
import { matchStats, PLAYER_ID } from "./run.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { StatsCard } from "../stats/StatsCard.tsx";
import type { PracticeRun } from "./run.ts";

/**
 * Below this column width or height the replay controls take one row (ReplayControls, compact): the full controls
 * need about 220 px of height and a phone's or a short laptop window's pane left the board 17 to 105 px (2026-11-22).
 * 448 px is the width the full play row needs; 520 px leaves the board 300 px beside the full controls.
 */
const COMPACT_BELOW = { width: 448, height: 520 } as const;

/** Rows the scoreboard shows beside a wide board; it always includes the player. */
const SCOREBOARD_ROWS = 8;
const COUNTDOWN_SECONDS = 3;

export interface TestMatchProps {
  readonly run: PracticeRun;
  readonly tanks: ReadonlyMap<BotId, TankInfo>;
  onRunAgain(): void;
  /** Opens the test options; `opener` gets the focus back when they close. */
  onOptions(opener: HTMLElement): void;
}

export function TestMatch({ run, tanks, onRunAgain, onOptions }: TestMatchProps) {
  const m = useMessages();
  const p = m.practice;
  const [state, dispatch] = useReducer(replayReducer, run.ticks.length, initialReplay);
  const [speedId, setSpeedId] = useState<SpeedId>(DEFAULT_SPEED_ID);
  const [countdown, setCountdown] = useState<number | null>(COUNTDOWN_SECONDS);
  const [page, setPage] = useState<"board" | "result">("board");
  const [resultPart, setResultPart] = useState<"summary" | "stats">("summary");
  const stats = useMemo(() => statsView(matchStats(run), run.strategy), [run]);
  const column = useBoxSize<HTMLDivElement>();
  const tickMs = SPEED_MS[speedId];

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
      } else {
        setCountdown(null);
        dispatch({ type: "play" });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!state.playing) return;
    const timer = setInterval(() => dispatch({ type: "advance" }), tickMs);
    return () => clearInterval(timer);
  }, [state.playing, tickMs]);

  const tick = state.frame === 0 ? undefined : run.ticks[state.frame - 1];
  const snapshot = tick?.snapshot ?? run.spawn;
  const ultimates = hasUltimates(run.spawn);
  const ultimateState = ultimates ? snapshot.bots.find((bot) => bot.id === PLAYER_ID)?.ultimate : undefined;
  // Any control the player touches ends the countdown, so the player is never fighting the clock.
  const takeControl = () => setCountdown(null);

  if (page === "result") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-test-result="">
        <StepSheet
          title={p.resultTitle}
          onBack={() => setPage("board")}
          headerControl={
            <SegmentedControl
              legend={m.stats.parts.label}
              hideLegend
              size="sm"
              value={resultPart}
              onChange={setResultPart}
              options={[
                { value: "summary", label: m.stats.parts.summary },
                { value: "stats", label: m.stats.parts.stats },
              ]}
            />
          }
          action={
            <>
              <Button icon={<RotateCcw aria-hidden size={20} />} data-test-run="" onClick={onRunAgain}>
                {p.runAgain}
              </Button>
              <Button variant="secondary" icon={<SlidersHorizontal aria-hidden size={20} />} data-test-options="" onClick={(event) => onOptions(event.currentTarget)}>
                {p.options}
              </Button>
            </>
          }
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {resultPart === "summary" ? (
              <MatchResult run={run} frame={state.frame} tanks={tanks} />
            ) : (
              <div data-test-stats="" className="flex min-h-0 min-w-0 flex-1 flex-col">
                <StatsCard numbers={stats} rules={stats} />
              </div>
            )}
          </div>
        </StepSheet>
      </div>
    );
  }

  const compact = column.box !== null && (column.box.width < COMPACT_BELOW.width || column.box.height < COMPACT_BELOW.height);
  const legendInRow = compact && ultimates;
  const legend = <LegendButton layout={snapshot.layout?.id} ultimates={ultimates} />;

  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-3 fit:grid-rows-[minmax(0,1fr)] @3xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div ref={column.ref} className="flex min-h-0 min-w-0 flex-col gap-2">
        <ArenaView
          dataAttributes={{ "data-test-board": "" }}
          // With compact controls the legend sits in the ultimate's row, so the controls under the board keep one row.
          switchPlace={ultimates ? {
            kind: "row",
            lead: (
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <UltimateLink ultimate={run.strategy.ultimate} size={{ kind: "tile", state: ultimateState }} />
                  {/* The condition the match plays, which "random" drew (TestOptions); a tap says what it changes. */}
                  <ArenaCondition board={snapshot} short />
                </div>
                {legendInRow ? legend : null}
              </div>
            ),
          } : undefined}
          snapshot={snapshot}
          throws={tick?.throws ?? []}
          fires={tick?.fires ?? []}
          names={run.names}
          highlightId={PLAYER_ID}
          tickMs={tickMs}
          tanks={tanks}
          countdown={countdown}
          paused={!state.playing}
        />
        <SequenceNow run={run} frame={state.frame} />
        <ReplayControls
          playing={state.playing}
          frame={state.frame}
          lastFrame={state.lastFrame}
          speedId={speedId}
          onPlay={() => {
            takeControl();
            dispatch({ type: "play" });
          }}
          onPause={() => {
            takeControl();
            dispatch({ type: "pause" });
          }}
          onSeek={(frame) => {
            takeControl();
            dispatch({ type: "seek", frame });
          }}
          onSpeed={setSpeedId}
          compact={compact}
          extra={
            <>
              {legendInRow ? null : legend}
              <Button data-test-show-result="" onClick={() => setPage("result")}>
                {p.showResult}
              </Button>
            </>
          }
        />
      </div>
      <div className="hidden min-h-0 min-w-0 flex-col @3xl:flex">
        <Scoreboard snapshot={snapshot} names={run.names} highlightId={PLAYER_ID} maxRows={SCOREBOARD_ROWS} tanks={tanks} />
      </div>
    </div>
  );
}
