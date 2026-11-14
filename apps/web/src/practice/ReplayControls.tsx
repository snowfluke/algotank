// Play or pause, the turn, the speed, and a scrubber over every turn of the test
// match. Compact, so the board keeps most of the pane: the scrubber, then one row
// with play and the turn (and `extra`, the result button), then the speed.

import { Pause, Play, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { SPEED_IDS, type SpeedId } from "./replay.ts";

export interface ReplayControlsProps {
  readonly playing: boolean;
  readonly frame: number;
  readonly lastFrame: number;
  readonly speedId: SpeedId;
  onPlay(): void;
  onPause(): void;
  onSeek(frame: number): void;
  onSpeed(id: SpeedId): void;
  /** A control at the end of the play row, such as "See the result". */
  readonly extra?: ReactNode;
}

export function ReplayControls(props: ReplayControlsProps) {
  const m = useMessages();
  const p = m.practice;
  const atEnd = props.frame >= props.lastFrame;
  const turnText = p.turnOf(props.frame, props.lastFrame);
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-2">
      <input
        type="range"
        min={0}
        max={props.lastFrame}
        step={1}
        value={props.frame}
        aria-label={p.turn}
        aria-valuetext={turnText}
        onChange={(event) => props.onSeek(Number(event.target.value))}
        className="min-h-11 w-full min-w-0 cursor-pointer accent-[var(--color-water)]"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {props.playing ? (
          <Button variant="secondary" icon={<Pause aria-hidden size={20} />} onClick={props.onPause}>
            {p.pause}
          </Button>
        ) : (
          <Button variant="secondary" icon={atEnd ? <RotateCcw aria-hidden size={20} /> : <Play aria-hidden size={20} />} onClick={props.onPlay}>
            {atEnd ? p.playAgain : p.play}
          </Button>
        )}
        <span aria-hidden="true" className="tabular min-w-0 flex-1 text-muted">
          {turnText}
        </span>
        {props.extra}
      </div>
      <SegmentedControl
        legend={p.speed}
        hideLegend
        size="sm"
        value={props.speedId}
        onChange={props.onSpeed}
        options={SPEED_IDS.map((id) => ({ value: id, label: p.speeds[id] }))}
      />
    </div>
  );
}
