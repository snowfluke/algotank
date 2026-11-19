// The water gauge of one tank: a bar in the strip under the tank, inside its
// square. A tank with too little water to shoot shows it in two ways besides
// colour: the fill ends before the line, and the track is dashed.

import type { RoundRules } from "@game/engine";
import { CELL, gaugeShape } from "./boardHelpers.ts";

const GAUGE_WIDTH = 7.6;
const GAUGE_HEIGHT = 1.5;
/** Squares too small for labels need a thicker bar to be seen at all. */
const SMALL_GAUGE_HEIGHT = 2;
const LINE_OVERHANG = 0.35;
/** Space between the bar's lower end and the edge of the square. */
const EDGE_GAP = 0.2;

interface WaterGaugeProps {
  readonly water: number;
  readonly rules: RoundRules;
  readonly capacity?: number;
  /** True when squares are too small for labels. */
  readonly small: boolean;
}

/** Drawn around the centre of the tank's square. */
export function WaterGauge({ water, rules, capacity, small }: WaterGaugeProps) {
  const height = small ? SMALL_GAUGE_HEIGHT : GAUGE_HEIGHT;
  const shape = gaugeShape(water, GAUGE_WIDTH, rules, capacity);
  const top = CELL / 2 - EDGE_GAP - LINE_OVERHANG - height;
  const left = -GAUGE_WIDTH / 2;
  const radius = height / 2;
  return (
    <g data-water={water} data-can-throw={shape.canThrow ? "true" : "false"} style={{ pointerEvents: "none" }}>
      <rect x={left} y={top} width={GAUGE_WIDTH} height={height} rx={radius} style={{ fill: "var(--color-panel)" }} />
      {shape.fillWidth > 0 ? (
        <rect
          x={left}
          y={top}
          width={shape.fillWidth}
          height={height}
          rx={Math.min(radius, shape.fillWidth / 2)}
          style={{ fill: shape.canThrow ? "var(--color-water)" : "var(--color-hit)" }}
        />
      ) : null}
      <rect
        x={left}
        y={top}
        width={GAUGE_WIDTH}
        height={height}
        rx={radius}
        fill="none"
        strokeWidth={0.35}
        strokeDasharray={shape.canThrow ? undefined : "0.9 0.5"}
        style={{ stroke: shape.canThrow ? "var(--color-tank-outline)" : "var(--color-hit)" }}
      />
      <line
        x1={left + shape.tickAt}
        x2={left + shape.tickAt}
        y1={top - LINE_OVERHANG}
        y2={top + height + LINE_OVERHANG}
        strokeWidth={0.45}
        style={{ stroke: "var(--color-ink)" }}
      />
    </g>
  );
}
