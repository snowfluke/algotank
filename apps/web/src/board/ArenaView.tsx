// The arena board in a pane of any size, with the follow camera of a big arena
// (board/camera.ts). Where the whole arena gives a square under 22 px, the pane
// shows a window around the viewer's tank (or, for a viewer without a tank, the
// leader) at 28 px per square, a map of the whole arena in a corner, and a switch
// to the whole arena. Otherwise it shows the whole arena as large as the box allows,
// centred, as board/FittedBoard.tsx does.
//
// Both views keep the same element tree, so a switch never mounts the board again:
// the board's turn sounds and turning angles live in it.

import { useMemo, useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useFitLayout } from "../ui/layout.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { ArenaBoard } from "./ArenaBoard.tsx";
import { tankLooks } from "./boardHelpers.ts";
import { followWindow, needsFollowCamera, type CameraMode } from "./camera.ts";
import { boardAspect, fittedSize } from "./FittedBoard.tsx";
import { OverviewMap, overviewWidth } from "./OverviewMap.tsx";
import type { ArenaBoardProps } from "./props.ts";
import { useFollowTarget } from "./useFollowTarget.ts";

export type ArenaViewProps = Omit<ArenaBoardProps, "camera">;

type Choice = "follow" | "whole";

export function ArenaView(props: ArenaViewProps) {
  const m = useMessages();
  const fit = useFitLayout();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const { snapshot, highlightId, tanks } = props;
  const arena = { width: snapshot.width, height: snapshot.height };
  const ratio = boardAspect(arena.width, arena.height);
  const [choice, setChoice] = useState<Choice>("follow");
  const looks = useMemo(() => tankLooks(snapshot.bots, tanks), [snapshot.bots, tanks]);

  // Outside the fixed-height layout the board takes the width and its shape gives the height, so only the width decides.
  const available = box !== null && needsFollowCamera(fit ? box : { width: box.width, height: Number.POSITIVE_INFINITY }, arena);
  const follows: CameraMode = highlightId === null ? "leader" : "mine";
  const target = useFollowTarget(snapshot.bots, highlightId, available && choice === "follow");
  const camera = box !== null && target !== undefined ? followWindow(box, arena, target.x, target.y) : null;
  const mode: CameraMode = camera === null ? "whole" : follows;

  const whole = camera === null && fit && box !== null ? fittedSize(box, ratio) : null;
  const boardStyle =
    camera !== null && box !== null
      ? { width: `${box.width}px`, height: `${box.height}px` }
      : whole !== null
        ? { width: `${whole.width}px`, height: `${whole.height}px` }
        : { aspectRatio: `${ratio}`, width: fit ? "100%" : `min(100%, calc(80dvh * ${ratio}))` };

  return (
    <>
      {available ? (
        <div className="shrink-0" data-camera-switch="">
          <SegmentedControl
            legend={m.board.camera.legend}
            hideLegend
            size="sm"
            value={choice}
            onChange={setChoice}
            options={[
              { value: "follow", label: follows === "mine" ? m.board.camera.mine : m.board.camera.leader },
              { value: "whole", label: m.board.camera.whole },
            ]}
          />
        </div>
      ) : null}
      {/* The same element in every view, so the size observer keeps watching it. A window outside the fixed-height layout gets a height of its own. */}
      <div
        ref={ref}
        data-camera={mode}
        className="flex min-h-0 min-w-0 justify-center fit:flex-1 fit:items-center"
        style={!fit && camera !== null ? { height: "min(80dvh, 100vw)" } : undefined}
      >
        <div className="relative min-w-0" style={boardStyle}>
          <ArenaBoard {...props} camera={camera} />
          {camera === null || box === null ? null : (
            <div className="pointer-events-none absolute right-2 bottom-2">
              <OverviewMap arena={arena} bots={snapshot.bots} looks={looks} highlightId={highlightId} view={camera} width={overviewWidth(box.width)} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
