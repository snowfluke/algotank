// The monthly board in the box its pane leaves, as large as the box allows:
// - It turns a wide board a quarter when that gives larger squares (board/boardOrientation.ts),
//   which a phone held upright nearly always does.
// - Where even the best orientation gives a square under 22 px, a switch offers a window around
//   the viewer's tank (the leader for a visitor), as a room's arena view does (board/ArenaView.tsx).
//   The board starts whole, so nobody's view changes without a tap.
// - The switch stands in a row of its own that is always there on a phone, empty when no switch
//   is needed, so the board does not move when a reshuffle or a new tank changes the board's size.
//   No map of the whole arena is drawn: it would sit over the window's corner, and "Whole arena"
//   is one tap away.

import { useMemo, type ReactNode } from "react";
import type { PublicSnapshot } from "@game/arena";
import type { BotId, ThrowEvent } from "@game/engine";
import { ArenaBoard } from "../board/ArenaBoard.tsx";
import { bestOrientation, rotateSnapshot } from "../board/boardOrientation.ts";
import { followWindow, needsFollowCamera, type CameraMode } from "../board/camera.ts";
import { boardAspect, fittedSize } from "../board/FittedBoard.tsx";
import type { TankInfo } from "../board/props.ts";
import { useFollowTarget } from "../board/useFollowTarget.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useFitLayout } from "../ui/layout.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";

type Choice = "follow" | "whole";

/**
 * The phone's switch between the whole arena and the follow window. Its choice lives in the page
 * (MonthlyView.tsx, PhoneLayout), so it outlasts a visit to another tab. Null on a laptop, whose
 * board takes the whole pane and has no switch row.
 */
export interface FollowSwitch {
  readonly choice: Choice;
  onChoice(next: Choice): void;
}

/**
 * The phone's row over the board: the owner's place (`lead`, null for a visitor) and the switch,
 * on one line (owner, 2026-11-16). The row is always there on a phone, so the board does not move
 * when the switch comes or goes.
 */
export interface BoardRow {
  readonly lead: ReactNode;
  readonly follow: FollowSwitch;
}

export interface MonthlyBoardProps {
  readonly snapshot: PublicSnapshot;
  readonly throws: readonly ThrowEvent[];
  readonly names: Readonly<Record<BotId, string>>;
  /** The owner's tank in this league, or null. */
  readonly highlightId: BotId | null;
  readonly tickMs: number;
  readonly tanks: ReadonlyMap<BotId, TankInfo>;
  /** Drawn over the board's area, the board and the space around it (the midnight notice, "Reshuffled"). */
  readonly overlay: ReactNode;
  /** Null on a laptop, whose board takes the whole pane. */
  readonly row: BoardRow | null;
}

export function MonthlyBoard({ snapshot, throws, names, highlightId, tickMs, tanks, overlay, row }: MonthlyBoardProps) {
  const m = useMessages();
  const fit = useFitLayout();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const choice: Choice = row?.follow.choice ?? "whole";

  // Outside the fixed-height layout the board takes the width and its shape gives the height, so the box says nothing about height.
  const orientation = fit ? bestOrientation(box, snapshot) : "sideways";
  const shown = useMemo(() => (orientation === "upright" ? rotateSnapshot(snapshot) : snapshot), [snapshot, orientation]);
  const arena = { width: shown.width, height: shown.height };
  const offered = box !== null && needsFollowCamera(fit ? box : { width: box.width, height: Number.POSITIVE_INFINITY }, arena);
  const follows: CameraMode = highlightId === null ? "leader" : "mine";
  const target = useFollowTarget(shown.bots, highlightId, offered && choice === "follow");
  const camera = box !== null && target !== undefined ? followWindow(box, arena, target.x, target.y) : null;

  const ratio = boardAspect(arena.width, arena.height);
  const whole = camera === null && fit && box !== null ? fittedSize(box, ratio) : null;
  const boardStyle =
    camera !== null && box !== null
      ? { width: `${box.width}px`, height: `${box.height}px` }
      : whole !== null
        ? { width: `${whole.width}px`, height: `${whole.height}px` }
        : { aspectRatio: `${ratio}`, width: fit ? "100%" : `min(100%, calc(80dvh * ${ratio}))` };

  return (
    <>
      {row !== null ? (
        <div data-camera-switch-row="" className="flex min-h-[3.25rem] min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
          <div className="min-w-0 flex-1">{row.lead}</div>
          {offered ? (
            <div data-camera-switch="" className="shrink-0">
              <SegmentedControl
                legend={m.board.camera.legend}
                hideLegend
                size="sm"
                value={choice}
                onChange={row.follow.onChoice}
                options={[
                  { value: "whole", label: m.monthly.wholeArena },
                  { value: "follow", label: follows === "mine" ? m.board.camera.mine : m.board.camera.leader },
                ]}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {/* The same element in every view, so the size observer keeps watching it. A window outside the fixed-height layout gets a height of its own. */}
      <div
        ref={ref}
        data-monthly-board=""
        data-camera={camera === null ? "whole" : follows}
        data-orientation={orientation}
        className="relative flex min-h-0 min-w-0 justify-center fit:flex-1 fit:items-center"
        style={!fit && camera !== null ? { height: "min(80dvh, 100vw)" } : undefined}
      >
        <div className="relative min-w-0" style={boardStyle}>
          {/* A new orientation starts a new board: tanks would otherwise glide across it and spin a quarter. */}
          <ArenaBoard key={orientation} snapshot={shown} throws={throws} names={names} highlightId={highlightId} tickMs={tickMs} tanks={tanks} camera={camera} />
        </div>
        {/* Over the board's whole area, not only the board: a small board on a short phone cut the midnight notice. */}
        {overlay}
      </div>
    </>
  );
}
