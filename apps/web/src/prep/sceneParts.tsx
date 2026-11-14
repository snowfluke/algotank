// The small arena pieces that the preparation drawings share (the play style scenes and
// the upgrade cards): the sandy floor with its squares, a water jet, a splash, a water
// gauge, and the hull colours of the other tanks. All of it is decoration inside an
// <svg aria-hidden>; the words next to each drawing say the same.

import { TANK_COLOURS, type TankColour } from "../tank/colours.ts";
import type { TankLook } from "../tank/look.ts";

/** One square of every drawing, in SVG units. */
export const CELL = 10;

export const centre = (n: number) => n * CELL + CELL / 2;

/** Hull colours for the other tanks of a drawing, never the player's own, in a fixed order so a drawing does not change between renders. */
export function otherColours(look: TankLook): readonly TankColour[] {
  // Red, green and purple first: they stand apart from each other and from most "you" colours.
  const preferred: readonly TankColour[] = [2, 4, 5, 8, 6, 10, 7, 9, 12, 1, 3, 11];
  return preferred.filter((colour) => colour !== look.colour && TANK_COLOURS.includes(colour));
}

export function Floor({ cols, rows, x = 0, y = 0 }: { readonly cols: number; readonly rows: number; readonly x?: number; readonly y?: number }) {
  const width = cols * CELL;
  const height = rows * CELL;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={width} height={height} rx={2.5} style={{ fill: "var(--color-arena-floor)" }} />
      <g style={{ stroke: "var(--color-arena-grid)" }} strokeWidth={0.4}>
        {Array.from({ length: cols - 1 }, (_, i) => (
          <line key={`c${i}`} x1={(i + 1) * CELL} y1={0} x2={(i + 1) * CELL} y2={height} />
        ))}
        {Array.from({ length: rows - 1 }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={(i + 1) * CELL} x2={width} y2={(i + 1) * CELL} />
        ))}
      </g>
    </g>
  );
}

/** A water jet from one point to another, with a light core so it reads as water on the sand. */
export function Jet({ x1, y1, x2, y2, className, dotted = false }: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly className?: string; readonly dotted?: boolean }) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return (
    // --len lets an animated scene draw the jet from the shooter outward (stroke-dashoffset).
    <g className={className} strokeLinecap="round" fill="none" strokeDasharray={dotted ? "0.6 2.2" : `${length} ${length + 10}`} style={{ ["--len" as string]: length }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={dotted ? 1.4 : 2.4} style={{ stroke: "var(--color-water)" }} />
      {dotted ? null : <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={0.7} stroke="#ffffff" strokeOpacity={0.7} />}
    </g>
  );
}

const DROPS: readonly (readonly [number, number])[] = [
  [-3.6, -2.6],
  [-1, -4.2],
  [2.8, -3.3],
  [-3.8, 2.1],
  [0.6, 4.1],
  [3.4, 2.3],
];

/** A splash where a shot lands. `className` carries its motion in an animated scene. */
export function Splash({ x, y, className, scale = 1 }: { readonly x: number; readonly y: number; readonly className?: string; readonly scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={className}>
        <circle r={2.8} fill="none" strokeWidth={0.8} style={{ stroke: "var(--color-water)" }} />
        {DROPS.map(([dx, dy]) => (
          <circle key={`${dx},${dy}`} cx={dx} cy={dy} r={0.8} style={{ fill: "var(--color-water)" }} />
        ))}
      </g>
    </g>
  );
}

/** A water gauge under a tank, 0 to 1 full. The fill's own class can carry a filling motion. */
export function Gauge({ x, y, water, fillClassName }: { readonly x: number; readonly y: number; readonly water: number; readonly fillClassName?: string }) {
  const width = 7.5;
  return (
    <g transform={`translate(${x - width / 2} ${y})`}>
      <rect width={width} height={1.8} rx={0.9} style={{ fill: "var(--color-panel)", stroke: "var(--color-tank-outline)", strokeWidth: 0.35 }} />
      <rect width={width} height={1.8} rx={0.9} className={fillClassName} transform={`scale(${water} 1)`} style={{ fill: "var(--color-water)", transformBox: "fill-box", transformOrigin: "left center" }} />
    </g>
  );
}
