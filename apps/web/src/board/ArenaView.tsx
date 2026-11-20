import { Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BotId } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { Box } from "../ui/fitList.ts";
import { useFitLayout } from "../ui/layout.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { ArenaBoard } from "./ArenaBoard.tsx";
import { bestOrientation, rotateBot, rotateSnapshot } from "./boardOrientation.ts";
import { followWindow, WALL_SQUARES, wholeArenaCellPx, ZOOM_SQUARES, zoomCellPx } from "./camera.ts";
import { boardAspect, fittedSize } from "./FittedBoard.tsx";
import type { ArenaBoardProps } from "./props.ts";
import { rotateFires } from "./ultimates/boardUltimates.ts";
import { useFollowTarget } from "./useFollowTarget.ts";

type Choice = "follow" | "whole";

export interface FollowSwitch {
  readonly choice: Choice;
  onChoice(next: Choice): void;
}

/** A row reserves the switch's height. A slot puts it beside controls that already take up that space. */
export type SwitchPlace = { readonly kind: "row"; readonly lead: ReactNode } | { readonly kind: "slot"; readonly element: HTMLElement | null };

export interface ArenaViewProps extends Omit<ArenaBoardProps, "camera" | "drawingKey" | "terrainTurned" | "focusId" | "onTankTap" | "listenerId"> {
  readonly switchPlace?: SwitchPlace | undefined;
  /** A page can hold the choice so it survives a visit to another pane. */
  readonly followSwitch?: FollowSwitch;
  readonly defaultChoice?: Choice;
  readonly wholeLabel?: string;
  readonly wholeOnly?: boolean;
  /** A layout that divides space between the board and other panes can supply the board's available box. */
  readonly fixedBox?: Box | null;
  readonly stageOverlay?: ReactNode;
  readonly dataAttributes?: Readonly<Record<`data-${string}`, string>>;
}

interface ArenaCameraSwitchProps extends FollowSwitch {
  readonly ownTank: boolean;
  readonly followedName: string | undefined;
  readonly wholeLabel: string | undefined;
  onReturn(): void;
}

export function ArenaCameraSwitch({ choice, onChoice, ownTank, followedName, wholeLabel, onReturn }: ArenaCameraSwitchProps) {
  const m = useMessages().board.camera;
  // Longer names can wrap and make the switch taller, taking room away from the board.
  const chars = followedName === undefined ? [] : [...followedName];
  const followLabel = chars.length > 10 ? `${chars.slice(0, 9).join("")}…` : followedName ?? (ownTank ? m.mine : m.leader);
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // An already selected radio sends no change, so a click on it returns to the default tank.
    if (followedName !== undefined && event.target instanceof Element && event.target.closest("label")?.querySelector('input[value="follow"]')) onReturn();
  };

  return (
    <div data-camera-switch="" data-follows-other={followedName === undefined ? undefined : "true"} className="shrink-0" onClick={onClick}>
      <SegmentedControl
        legend={m.legend}
        hideLegend
        size="sm"
        value={choice}
        onChange={onChoice}
        options={[
          { value: "whole", label: wholeLabel ?? m.whole },
          { value: "follow", label: followLabel },
        ]}
      />
    </div>
  );
}

export function ArenaView({
  switchPlace, followSwitch, defaultChoice = "whole", wholeLabel, wholeOnly = false,
  fixedBox, stageOverlay, dataAttributes, ...props
}: ArenaViewProps) {
  const m = useMessages().board.camera;
  const fitLayout = useFitLayout();
  const { ref, box: measured } = useBoxSize<HTMLDivElement>();
  // Focus mode (owner, 2026-11-20): the board fills the screen over the page and shows the whole arena; Escape leaves.
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    const overlay = ref.current;
    if (!focusMode || overlay === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    // The page under the board cannot be reached while it fills the screen: every element beside the board's
    // ancestors is inert until focus mode ends.
    const made: Element[] = [];
    for (let node: Element = overlay; node.parentElement !== null && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.hasAttribute("inert")) continue;
        sibling.setAttribute("inert", "");
        made.push(sibling);
      }
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      for (const element of made) element.removeAttribute("inert");
    };
  }, [focusMode, ref]);
  const fit = focusMode || fixedBox !== undefined || fitLayout;
  const box = focusMode || fixedBox === undefined ? measured : fixedBox;
  const { snapshot, highlightId, tanks, fires, tunnels, names } = props;
  const [localChoice, setLocalChoice] = useState<Choice>(defaultChoice);
  const [focusId, setFocusId] = useState<BotId | null>(null);
  const choice = followSwitch?.choice ?? localChoice;

  // In a scrolling pane the board's shape sets its own height, so the measured height cannot choose the orientation.
  const orientation = fit ? bestOrientation(box, snapshot) : "sideways";
  const turned = orientation === "upright";
  const shown = useMemo(() => turned ? rotateSnapshot(snapshot) : snapshot, [snapshot, turned]);
  const shownFires = useMemo(
    () => turned && fires !== undefined ? rotateFires(fires, snapshot.height) : fires,
    [fires, snapshot.height, turned],
  );
  // A shrink can clip a departing tunnel mouth. Showing it would require keeping the old floor until the tank rises.
  const shownTunnels = useMemo(
    () => turned ? tunnels?.map((tunnel) => tunnel.kind === "enter" ? tunnel : { ...tunnel, from: rotateBot(tunnel.from, snapshot.height) }) : tunnels,
    [tunnels, snapshot.height, turned],
  );

  const arena = { width: shown.width, height: shown.height };
  const sizingBox = box === null || fit ? box : { width: box.width, height: Number.POSITIVE_INFINITY };
  const cellPx = sizingBox === null ? 0 : zoomCellPx(sizingBox);
  const offered = !focusMode && !wholeOnly && sizingBox !== null && cellPx > wholeArenaCellPx(sizingBox, arena);
  // A square pane gives zoom its best chance. Reserve a row when it can help, so the board's height cannot toggle the switch.
  const reserveSwitch = fit && !focusMode && !wholeOnly && Math.max(arena.width, arena.height) + 2 * WALL_SQUARES > ZOOM_SQUARES;
  const zoomed = offered && choice === "follow";
  const focused = zoomed && focusId !== null ? shown.bots.find((bot) => bot.id === focusId) : undefined;
  const fallback = useFollowTarget(shown.bots, highlightId, zoomed);
  const target = focused ?? fallback;
  const camera = box !== null && target !== undefined ? followWindow(box, arena, target.x, target.y, cellPx) : null;
  const followsOther = focused !== undefined && focused.id !== highlightId;
  const onTankTap = useCallback((id: BotId) => setFocusId(id === highlightId ? null : id), [highlightId]);
  const onChoice = (next: Choice) => {
    setFocusId(null);
    (followSwitch?.onChoice ?? setLocalChoice)(next);
  };

  const ratio = boardAspect(arena.width, arena.height);
  const whole = camera === null && fit && box !== null ? fittedSize(box, ratio) : null;
  const boardStyle =
    camera !== null && box !== null
      ? { width: `${box.width}px`, height: `${box.height}px` }
      : whole !== null
        ? { width: `${whole.width}px`, height: `${whole.height}px` }
        : { aspectRatio: `${ratio}`, width: fit ? "100%" : `min(100%, calc(80dvh * ${ratio}))` };
  // A quarter turn uses the bottom edge as its origin. If that edge moves, old positions no longer describe the same squares.
  const boardKey = turned ? `${orientation}-${snapshot.height}` : orientation;

  const cameraSwitch = offered ? (
    <ArenaCameraSwitch
      choice={choice}
      onChoice={onChoice}
      ownTank={highlightId !== null}
      followedName={followsOther ? names[focused.id] ?? focused.id : undefined}
      wholeLabel={wholeLabel}
      onReturn={() => setFocusId(null)}
    />
  ) : null;

  return (
    <>
      {switchPlace === undefined ? (
        reserveSwitch ? <div className="min-h-[3.25rem] shrink-0">{cameraSwitch}</div> : cameraSwitch
      ) : switchPlace.kind === "row" ? (
        <div data-camera-switch-row="" className="flex min-h-[3.25rem] min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
          <div className="min-w-0 flex-1">{switchPlace.lead}</div>
          {cameraSwitch}
        </div>
      ) : switchPlace.element !== null && cameraSwitch !== null ? createPortal(cameraSwitch, switchPlace.element) : null}
      {/* Keep the observed box and the drawing mounted when the camera changes, so a switch preserves turn sounds and tank motion. */}
      <div
        ref={ref}
        className={focusMode ? "fixed inset-0 z-[60] flex min-h-0 min-w-0 items-center justify-center bg-ground p-2" : "relative flex min-h-0 min-w-0 justify-center fit:flex-1 fit:items-center"}
        style={!fit && camera !== null ? { height: "min(80dvh, 100vw)" } : undefined}
        {...(focusMode ? { role: "dialog", "aria-modal": true, "aria-label": m.focus } : {})}
        {...dataAttributes}
        data-arena-view=""
        data-camera={camera === null ? "whole" : highlightId === null ? "leader" : "mine"}
        data-orientation={orientation}
      >
        <div className="relative min-w-0" style={boardStyle}>
          <ArenaBoard
            {...props}
            drawingKey={boardKey}
            snapshot={shown}
            terrainTurned={turned}
            {...(shownFires === undefined ? {} : { fires: shownFires })}
            {...(shownTunnels === undefined ? {} : { tunnels: shownTunnels })}
            {...(followsOther ? { listenerId: focused.id } : {})}
            camera={camera}
            focusId={target?.id ?? null}
            {...(zoomed ? { onTankTap } : {})}
          />
        {/* Faint until the pointer or the keyboard reaches it, so it never hides a tank for long. */}
        <button
          type="button"
          aria-label={focusMode ? m.leaveFocus : m.focus}
          title={focusMode ? m.leaveFocus : m.focus}
          aria-pressed={focusMode}
          data-board-focus=""
          onClick={() => setFocusMode(!focusMode)}
          className="press absolute right-2 bottom-2 z-10 flex size-11 items-center justify-center rounded-full bg-panel/70 text-ink opacity-60 shadow-[var(--shadow-raised)] focus-visible:opacity-100 [@media(hover:hover)]:hover:opacity-100"
        >
          {focusMode ? <Minimize2 aria-hidden size={20} /> : <Maximize2 aria-hidden size={20} />}
        </button>
        </div>
        {stageOverlay}
      </div>
    </>
  );
}
