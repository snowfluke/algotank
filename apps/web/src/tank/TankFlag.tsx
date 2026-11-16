// A tank's flag (owner, 2026-11-16): a waving flag on a thin pole at the back corner of the
// tank, trailing behind it. Drawn in the tank's own geometry (TankShape.tsx: a 10 by 10 box
// facing east), so it turns with the hull. The board draws a tank at TANK_SCALE 0.8 of a
// square, so the flag's tail at x = -6.1 stays inside the tank's own square.
//
// The cloth keeps its first colour on top: when the tank faces partly west, or straight down,
// it flips over its own middle line (flagFlipped). Turning the whole flag with the tank showed a
// red-over-white flag as white-over-red on a tank driving west.
//
// Patterns (FLAG_PATTERNS in @game/arena), each in the flag's two colours:
// | plain    | first only                            |
// | bands    | first over second                     |
// | halves   | first at the pole, second at the tail |
// | stripe   | a second stripe across first          |
// | dot      | a second dot on first                 |
// | diagonal | first in the corner at the pole's top |

import { useId, type ReactNode } from "react";
import type { TankFlag } from "@game/arena";
import { tankColourVar } from "./colours.ts";

const OUTLINE = "var(--color-tank-outline)";
const POLE = { x: -3, y: 0.9 } as const;
/** The cloth, from the pole back to the tail, with a gentle wave on its top and bottom edges. */
const CLOTH = "M -3 0.9 C -3.9 0.55 -5.1 1.25 -6.1 0.95 L -6.1 3.15 C -5.1 3.45 -3.9 2.75 -3 3.1 Z";
/** The cloth's middle line, which a flip mirrors it over. */
const MIDDLE_Y = 2;
/** The flag alone, as a view box: the cloth and the pole with a small rim (mytank/Swatches.tsx). */
export const FLAG_VIEW_BOX = "-6.45 0.2 4.1 3.6";
/** A box that covers the cloth, for the pattern parts that the cloth's outline clips. */
const BOX = { x: -6.5, y: 0.2, width: 3.9, height: 3.6 } as const;

/**
 * True when the cloth must flip so its first colour stays on top. `heading` is in degrees,
 * clockwise from east, and may be any number (the board's angles grow past 360 as tanks turn).
 * The cloth's top points up on screen while the tank faces east of north-south; facing straight
 * up or down, the top points left (up) or right (down), and only right flips, so a flag
 * travelling vertically reads like one hung on a wall.
 */
export function flagFlipped(heading: number): boolean {
  const radians = (heading * Math.PI) / 180;
  const up = Math.cos(radians);
  if (Math.abs(up) > 1e-6) return up < 0;
  return Math.sin(radians) > 0;
}

function patternParts(flag: TankFlag): ReactNode {
  const first = tankColourVar(flag.first);
  const second = tankColourVar(flag.second);
  const base = <rect x={BOX.x} y={BOX.y} width={BOX.width} height={BOX.height} style={{ fill: first }} />;
  switch (flag.pattern) {
    case "plain":
      return base;
    case "bands":
      return (
        <>
          {base}
          <rect x={BOX.x} y={MIDDLE_Y} width={BOX.width} height={BOX.y + BOX.height - MIDDLE_Y} style={{ fill: second }} />
        </>
      );
    case "halves":
      return (
        <>
          {base}
          <rect x={BOX.x} y={BOX.y} width={1.95} height={BOX.height} style={{ fill: second }} />
        </>
      );
    case "stripe":
      return (
        <>
          {base}
          <rect x={BOX.x} y={MIDDLE_Y - 0.33} width={BOX.width} height={0.66} style={{ fill: second }} />
        </>
      );
    case "dot":
      return (
        <>
          {base}
          <circle cx={-4.55} cy={MIDDLE_Y} r={0.7} style={{ fill: second }} />
        </>
      );
    case "diagonal":
      return (
        <>
          <rect x={BOX.x} y={BOX.y} width={BOX.width} height={BOX.height} style={{ fill: second }} />
          <path d={`M ${BOX.x} ${BOX.y} H ${BOX.x + BOX.width} V ${BOX.y + BOX.height} Z`} style={{ fill: first }} />
        </>
      );
  }
}

export interface TankFlagDrawingProps {
  readonly flag: TankFlag;
  /** The tank's heading in degrees, for the flip. */
  readonly heading: number;
  /** A thicker outline where the tank is drawn small ("simple"). */
  readonly bold: boolean;
  /**
   * For the editor's turning tank (mytank/LiveTank.tsx): the flip follows its CSS turn, which
   * starts facing up (index.css, .flag-turn-flip), instead of `heading`.
   */
  readonly turning?: boolean;
}

/** The flag in tank coordinates: draw it inside the group that turns the hull. */
export function TankFlagDrawing({ flag, heading, bold, turning = false }: TankFlagDrawingProps) {
  const clipId = `flag-${useId().replace(/:/g, "")}`;
  const stroke = bold ? 0.45 : 0.3;
  return (
    <g data-flag={flag.pattern} aria-hidden="true">
      <g className={turning ? "flag-turn-flip" : undefined} transform={!turning && flagFlipped(heading) ? `translate(0 ${2 * MIDDLE_Y}) scale(1 -1)` : undefined}>
        <clipPath id={clipId}>
          <path d={CLOTH} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>{patternParts(flag)}</g>
        <path d={CLOTH} fill="none" strokeWidth={stroke} strokeLinejoin="round" style={{ stroke: OUTLINE }} />
      </g>
      <circle cx={POLE.x} cy={POLE.y} r={bold ? 0.5 : 0.42} style={{ fill: OUTLINE }} />
    </g>
  );
}
