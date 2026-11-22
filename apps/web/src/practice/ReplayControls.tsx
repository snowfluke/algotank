// Play or pause, the turn, the speed, and a scrubber over every turn of the test
// match, small, so the board keeps most of the pane. In full: the scrubber, one row with
// play and the turn (and `extra`, the result button), then the speed as a switch.
// `compact` (a narrow or short pane, where the board shrank to a thumbnail, 2026-11-22):
// the scrubber, then one row with play as an icon, the speed as one button that steps to
// the next speed, and `extra`; the turn is the scrubber's spoken value there.

import { Gauge, Pause, Play, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
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
  /** One row under the scrubber, for a pane that cannot give the board room otherwise (TestMatch decides). */
  readonly compact: boolean;
}

export function ReplayControls(props: ReplayControlsProps) {
  const m = useMessages();
  const p = m.practice;
  const atEnd = props.frame >= props.lastFrame;
  const turnText = p.turnOf(props.frame, props.lastFrame);
  const play = props.playing
    ? { label: p.pause, icon: <Pause aria-hidden size={20} />, onClick: props.onPause }
    : { label: atEnd ? p.playAgain : p.play, icon: atEnd ? <RotateCcw aria-hidden size={20} /> : <Play aria-hidden size={20} />, onClick: props.onPlay };
  const nextSpeed = SPEED_IDS[(SPEED_IDS.indexOf(props.speedId) + 1) % SPEED_IDS.length] ?? SPEED_IDS[0];
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
      {props.compact ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <IconButton label={play.label} icon={play.icon} onClick={play.onClick} data-replay-play="" />
          <button
            type="button"
            aria-label={`${p.speed}: ${p.speeds[props.speedId]}`}
            data-replay-speed-step=""
            onClick={() => {
              playSound("tap");
              props.onSpeed(nextSpeed);
            }}
            className="press inline-flex min-h-11 min-w-0 items-center gap-2 rounded-[var(--radius-control)] border-2 border-b-4 border-line bg-panel px-3 font-display font-semibold text-ink [@media(hover:hover)]:hover:border-line-strong"
          >
            <Gauge aria-hidden size={20} className="shrink-0" />
            <span aria-hidden="true">{p.speeds[props.speedId]}</span>
          </button>
          {props.extra}
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="secondary" icon={play.icon} onClick={play.onClick} data-replay-play="">
              {play.label}
            </Button>
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
        </>
      )}
    </div>
  );
}
