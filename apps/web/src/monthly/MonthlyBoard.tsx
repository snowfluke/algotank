// The monthly board in the box its pane leaves, as large as the box allows:
// - It turns a wide board a quarter when that gives larger squares (board/boardOrientation.ts),
//   which a phone held upright nearly always does.
// - Wherever a zoomed view shows the board closer (ZOOM_SQUARES across the short side, camera.ts),
//   on a phone or a laptop, a switch offers it around the viewer's tank (the leader for a visitor);
//   a tap on a tank there follows that tank (owner, 2026-11-17). The board starts whole, so
//   nobody's view changes without a tap.
// - On a phone the switch stands in a row of its own that is always there, empty when no switch is
//   needed, so the board's box stays put when weather, a reshuffle or a new tank changes its size. On a
//   laptop it stands in the header beside the clock and the condition, so the board keeps its height.
//   No map of the whole arena is drawn: it would sit over the window's corner, and "Whole arena"
//   is one tap away.

import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PublicSnapshot } from "@game/arena";
import type { BotId, ThrowEvent } from "@game/engine";
import { ArenaBoard } from "../board/ArenaBoard.tsx";
import { bestOrientation, rotateBot, rotateSnapshot } from "../board/boardOrientation.ts";
import { followWindow, wholeArenaCellPx, zoomCellPx, type CameraMode } from "../board/camera.ts";
import { boardAspect, fittedSize } from "../board/FittedBoard.tsx";
import type { TankInfo, TankTunnel } from "../board/props.ts";
import { useFollowTarget } from "../board/useFollowTarget.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useFitLayout } from "../ui/layout.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";

type Choice = "follow" | "whole";

/** Longest name the switch shows in full: a longer one wrapped in its segment and made the switch taller. */
const SWITCH_NAME_CHARS = 10;

function shortName(name: string): string {
  const chars = [...name];
  return chars.length <= SWITCH_NAME_CHARS ? name : `${chars.slice(0, SWITCH_NAME_CHARS - 1).join("")}…`;
}

/**
 * The switch between the whole arena and the zoomed view. Its choice lives in the page
 * (MonthlyView.tsx, PhoneLayout and PresenterLayout), so it outlasts a visit to another tab.
 */
export interface FollowSwitch {
  readonly choice: Choice;
  onChoice(next: Choice): void;
}

/**
 * Where the switch stands:
 * - "row": the phone's row over the board, with the owner's place (`lead`, null for a visitor) on
 *   the same line (owner, 2026-11-16). The row is always there, so the board does not move when the
 *   switch comes or goes.
 * - "slot": an element in the laptop's header, beside the clock and the condition (owner,
 *   2026-11-17: a row over the board made the board smaller). Null until the header has drawn it.
 */
export type SwitchPlace = { readonly kind: "row"; readonly lead: ReactNode } | { readonly kind: "slot"; readonly element: HTMLElement | null };

export interface BoardRow {
  readonly place: SwitchPlace;
  readonly follow: FollowSwitch;
}

export interface MonthlyBoardProps {
  readonly snapshot: PublicSnapshot;
  readonly throws: readonly ThrowEvent[];
  readonly tunnels: readonly TankTunnel[];
  readonly names: Readonly<Record<BotId, string>>;
  /** The owner's tank in this league, or null. */
  readonly highlightId: BotId | null;
  readonly tickMs: number;
  readonly tanks: ReadonlyMap<BotId, TankInfo>;
  /** Drawn over the board's area, including the space around the board. */
  readonly overlay: ReactNode;
  readonly row: BoardRow;
  /** The game masters' tanks, which leave tread marks (board/tankTrail.ts). */
  readonly trailIds: ReadonlySet<BotId>;
}

export function MonthlyBoard({ snapshot, throws, tunnels, names, highlightId, tickMs, tanks, overlay, row, trailIds }: MonthlyBoardProps) {
  const m = useMessages();
  const fit = useFitLayout();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const choice: Choice = row.follow.choice;

  // Outside the fixed-height layout the board takes the width and its shape gives the height, so the box says nothing about height.
  const orientation = fit ? bestOrientation(box, snapshot) : "sideways";
  const shown = useMemo(() => (orientation === "upright" ? rotateSnapshot(snapshot) : snapshot), [snapshot, orientation]);
  // ponytail: a shrink clips the old tunnel mouth with the removed floor. Keeping the sink
  // visible there would need the old floor to stay briefly while the tank rises on the new one.
  const shownTunnels = useMemo(
    () => orientation === "upright" ? tunnels.map((tunnel) => tunnel.kind === "enter" ? tunnel : { ...tunnel, from: rotateBot(tunnel.from, snapshot.height) }) : tunnels,
    [tunnels, orientation, snapshot.height],
  );
  const arena = { width: shown.width, height: shown.height };
  // The zoomed view (ZOOM_SQUARES across the short side, camera.ts) is offered wherever it shows the board closer than
  // the whole view does, on a phone or a laptop (owner, 2026-11-17). Outside the fixed-height layout only the width counts.
  const measuredBox = box === null ? null : fit ? box : { width: box.width, height: Number.POSITIVE_INFINITY };
  const offered = measuredBox !== null && zoomCellPx(measuredBox) > wholeArenaCellPx(measuredBox, arena);
  const follows: CameraMode = highlightId === null ? "leader" : "mine";
  const zoomed = offered && choice === "follow";
  // A tap on a tank in the zoomed view follows that tank; a tap on the own tank, or a switch to the whole view, ends it.
  const [focusId, setFocusId] = useState<BotId | null>(null);
  const focused = zoomed && focusId !== null ? shown.bots.find((bot) => bot.id === focusId) : undefined;
  const fallback = useFollowTarget(shown.bots, highlightId, zoomed);
  const target = focused ?? fallback;
  const camera = measuredBox !== null && target !== undefined ? followWindow(box ?? measuredBox, arena, target.x, target.y, zoomCellPx(measuredBox)) : null;
  const onTankTap = useCallback((id: BotId) => setFocusId(id === highlightId ? null : id), [highlightId]);
  const onChoice = (next: Choice) => {
    setFocusId(null);
    row.follow.onChoice(next);
  };
  // While another tank is followed, the switch names it, and a tap on that segment goes back to the owner's tank
  // (the leader for a visitor): a radio that is already chosen sends no change, so the click is caught here.
  const followsOther = focused !== undefined && focused.id !== highlightId;
  const onSwitchClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (followsOther && event.target instanceof Element && event.target.closest("label")?.querySelector('input[value="follow"]')) setFocusId(null);
  };
  const followLabel = followsOther ? shortName(names[focused.id] ?? focused.id) : follows === "mine" ? m.board.camera.mine : m.board.camera.leader;

  const ratio = boardAspect(arena.width, arena.height);
  // A quarter turn puts the bottom edge at the picture's left. When that edge moves, start
  // the drawing again so the tanks do not glide across squares they never crossed.
  const boardKey = orientation === "upright" ? `${orientation}-${snapshot.height}` : orientation;
  const whole = camera === null && fit && box !== null ? fittedSize(box, ratio) : null;
  const boardStyle =
    camera !== null && box !== null
      ? { width: `${box.width}px`, height: `${box.height}px` }
      : whole !== null
        ? { width: `${whole.width}px`, height: `${whole.height}px` }
        : { aspectRatio: `${ratio}`, width: fit ? "100%" : `min(100%, calc(80dvh * ${ratio}))` };

  const cameraSwitch = offered ? (
    <div data-camera-switch="" data-follows-other={followsOther ? "true" : undefined} className="shrink-0" onClick={onSwitchClick}>
      <SegmentedControl
        legend={m.board.camera.legend}
        hideLegend
        size="sm"
        value={choice}
        onChange={onChoice}
        options={[
          { value: "whole", label: m.monthly.wholeArena },
          { value: "follow", label: followLabel },
        ]}
      />
    </div>
  ) : null;
  const { place } = row;

  return (
    <>
      {place.kind === "row" ? (
        <div data-camera-switch-row="" className="flex min-h-[3.25rem] min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
          <div className="min-w-0 flex-1">{place.lead}</div>
          {cameraSwitch}
        </div>
      ) : place.element !== null && cameraSwitch !== null ? (
        createPortal(cameraSwitch, place.element)
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
          <ArenaBoard key={boardKey} snapshot={shown} terrainTurned={orientation === "upright"} throws={throws} tunnels={shownTunnels} names={names} highlightId={highlightId} tickMs={tickMs} tanks={tanks} camera={camera} trailIds={trailIds} focusId={zoomed ? (target?.id ?? null) : null} {...(zoomed ? { onTankTap } : {})} />
        </div>
        {/* Over the board's whole area, not only the board: a small board on a short phone cut the midnight notice. */}
        {overlay}
      </div>
    </>
  );
}
