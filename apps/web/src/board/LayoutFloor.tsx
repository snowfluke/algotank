// Hybrid floor and legend swatches share the same SVG shapes (87-hybrid-arenas.md).
// Area positions stay in game coordinates. On an upright phone the floor turns
// with the board, while tank labels and water bars stay upright.

import { memo, useId } from "react";
import { areasOf, type ArenaLayout, type AreaRuleSetId } from "@game/engine";
import { AREA_GROUNDS, groundMarkSample, groundMarksPath, marksFilled } from "./arenaGround.ts";
import { CELL, gridLinePath } from "./boardHelpers.ts";

export const AreaGround = memo(function AreaGround({ width, height, set, swatch = false }: {
  readonly width: number;
  readonly height: number;
  readonly set: AreaRuleSetId;
  readonly swatch?: boolean;
}) {
  const ground = AREA_GROUNDS[set];
  const w = width * CELL;
  const h = height * CELL;
  const marks = swatch ? groundMarkSample(ground.marks) : groundMarksPath(width, height, set, ground);
  const filled = marksFilled(ground.marks);
  return (
    <g>
      <rect width={w} height={h} style={{ fill: ground.floor }} />
      {set === "sharp-eyes" ? (
        <>
          <path d={`M0 ${h}L2.6 ${h - 3.3}H${w - 3.3}V2L${w} 0V${h}Z`} style={{ fill: ground.wall }} />
          <path d={`M0 0H${w}L${w - 3.3} 2H2.6V${h - 3.3}L0 ${h}Z`} style={{ fill: ground.mark }} />
        </>
      ) : null}
      {marks === "" ? null : (
        <path d={marks} strokeWidth={filled ? undefined : 0.55} strokeLinecap="round" strokeLinejoin="round" style={filled ? { fill: ground.mark } : { fill: "none", stroke: ground.mark }} />
      )}
      {swatch ? null : <path d={gridLinePath(width, height)} strokeWidth={ground.gridWidth} fill="none" style={{ stroke: ground.grid }} />}
    </g>
  );
});

export const LayoutFloor = memo(function LayoutFloor({ layout, width, height, turned }: {
  readonly layout: ArenaLayout;
  readonly width: number;
  readonly height: number;
  readonly turned: boolean;
}) {
  const areas = areasOf(layout, { width, height });
  const clipBase = useId().replace(/:/g, "");
  return (
    <g data-arena-layout={layout.id} transform={turned ? `translate(${height * CELL} 0) rotate(90)` : undefined}>
      {areas.map(({ x, y, width: w, height: h, ruleSetId }) => (
        <g key={`${x},${y}`} data-arena-area={ruleSetId}>
          {/* A clip path, not a nested <svg>: the no-scroll audit reads a nested svg inside the board's svg as cut. */}
          <clipPath id={`${clipBase}-${x}-${y}`}>
            <rect x={0} y={0} width={w * CELL} height={h * CELL} />
          </clipPath>
          <g transform={`translate(${x * CELL} ${y * CELL})`} clipPath={`url(#${clipBase}-${x}-${y})`}>
            <AreaGround width={w} height={h} set={ruleSetId} />
          </g>
          <rect data-area-edge="" x={x * CELL} y={y * CELL} width={w * CELL} height={h * CELL} fill="none" strokeWidth={0.85} style={{ stroke: "var(--color-arena-area-edge)" }} />
        </g>
      ))}
    </g>
  );
});
