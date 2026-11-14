// The board at any pane size: as large as the box allows, with the board's own
// shape, centred. The wrapper is sized to the drawn board (not the whole box), so
// the countdown overlay and the corners of the board line up with what the viewer sees.
//
// In the fixed-height layout (`fit:`) the box is the space the pane leaves (a flex
// item with min-h-0); it is measured. Outside it (a phone held sideways, enlarged
// text, a server render) the pane has no height of its own, so the board takes the
// width and its shape gives the height, capped at 80% of the viewport height.

import type { ReactNode } from "react";
import type { Box } from "../ui/fitList.ts";
import { useFitLayout } from "../ui/layout.ts";
import { useBoxSize } from "../ui/useBoxSize.ts";

/** The board's wall adds 0.3 of a square on each side. */
const WALL_SQUARES = 0.6;

/** Width over height of a board of `width` by `height` squares, wall included. */
export function boardAspect(width: number, height: number): number {
  return (width + WALL_SQUARES) / (height + WALL_SQUARES);
}

/** The largest whole-pixel box of shape `ratio` (width / height) inside `box`. */
export function fittedSize(box: Box, ratio: number): Box {
  if (box.width <= 0 || box.height <= 0 || !(ratio > 0)) return { width: 0, height: 0 };
  const width = Math.floor(Math.min(box.width, box.height * ratio));
  return { width, height: Math.floor(width / ratio) };
}

export interface FittedBoardProps {
  /** Width over height of the board, from `boardAspect`. */
  readonly ratio: number;
  /** The board (ArenaBoard). It fills the wrapper. */
  readonly children: ReactNode;
  /** Extra attributes for the audit, such as data-test-board. */
  readonly dataAttributes?: Readonly<Record<`data-${string}`, string>>;
}

export function FittedBoard({ ratio, children, dataAttributes }: FittedBoardProps) {
  const fit = useFitLayout();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const size = fit && box !== null ? fittedSize(box, ratio) : null;
  return (
    // The same element in both layouts, so the size observer keeps watching it when the layout changes.
    <div ref={ref} className="flex min-h-0 min-w-0 justify-center fit:flex-1 fit:items-center" {...dataAttributes}>
      <div
        className="relative min-w-0"
        style={
          size === null
            ? { aspectRatio: `${ratio}`, width: fit ? "100%" : `min(100%, calc(80dvh * ${ratio}))` }
            : { width: `${size.width}px`, height: `${size.height}px` }
        }
      >
        {children}
      </div>
    </div>
  );
}
