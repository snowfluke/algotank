// A tank's flag (owner, 2026-11-16): a waving flag on a thin pole at the back corner of the
// tank, trailing behind it. Drawn in the tank's own geometry (TankShape.tsx: a 10 by 10 box
// facing east), so it turns with the hull. The board draws a tank at TANK_SCALE 0.8 of a
// square, so the flag's tail at x = -6.1 stays inside the tank's own square.
//
// The cloth keeps its top edge up: when the tank faces partly west, or straight down, it flips
// over its own middle line (flagFlipped). Turning the whole flag with the tank showed the red
// and white flag of Indonesia as the flag of Poland on a tank driving west.
//
// The cloth shows the country's flag (FLAG_COUNTRIES in @game/arena), drawn from
// public/flags/<code>.svg and clipped to the cloth's wavy outline. A flipped cloth shows the
// flag as from its back, as a real flag looks from the other side, with its top still on top.

import { useId } from "react";
import { useTurnPhase } from "./turnPhase.ts";
import type { FlagCountry } from "@game/arena";
import { assetUrl } from "../offline/target.ts";

const OUTLINE = "var(--color-tank-outline)";
const POLE = { x: -3, y: 0.9 } as const;
/** The cloth, from the pole back to the tail, with a gentle wave on its top and bottom edges. */
const CLOTH = "M -3 0.9 C -3.9 0.55 -5.1 1.25 -6.1 0.95 L -6.1 3.15 C -5.1 3.45 -3.9 2.75 -3 3.1 Z";
/** The cloth's middle line, which a flip mirrors it over. */
const MIDDLE_Y = 2;
/** The box the flag picture fills, a little past the cloth's waves so the clip finds no gap. */
const CLOTH_LEFT = -6.1;
const CLOTH_TOP = 0.45;
const CLOTH_BOTTOM = 3.55;

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

/** The URL of a country's flag picture (apps/web/public/flags, one per FLAG_COUNTRIES code). */
export function flagUrl(country: FlagCountry): string {
  return assetUrl(`/flags/${country}.svg`);
}

export interface TankFlagDrawingProps {
  readonly country: FlagCountry;
  /** The tank's heading in degrees, for the flip. */
  readonly heading: number;
  /** A thicker outline where the tank is drawn small ("simple"). */
  readonly bold: boolean;
  /**
   * For the editor's turning tank (mytank/LiveTank.tsx): the flip follows its CSS turn, which
   * starts facing up (index.css, .flag-turn-flip), instead of `heading`, and the cloth waves.
   * On the board the cloth is a flat rectangle: a clip path on every moving tank cost some 40% of
   * a phone's main thread with 42 flags (measured 2026-11-16), and at 6 to 10 px the wave does not show.
   */
  readonly turning?: boolean;
}

/** The flat cloth of the board: the cloth's box at the pole, with no clip. */
const FLAT = { y: POLE.y, height: 2 * (MIDDLE_Y - POLE.y) } as const;

/** The flag in tank coordinates: draw it inside the group that turns the hull. */
export function TankFlagDrawing({ country, heading, bold, turning = false }: TankFlagDrawingProps) {
  const clipId = `flag-${useId().replace(/:/g, "")}`;
  // Only the editor's turning tank animates; its flip joins the hull's turn in step (turnPhase.ts).
  const turn = useTurnPhase();
  const stroke = bold ? 0.45 : 0.3;
  return (
    <g data-flag={country} aria-hidden="true">
      {turning ? null : (
        <g transform={flagFlipped(heading) ? `translate(0 ${2 * MIDDLE_Y}) scale(1 -1)` : undefined}>
          {/* Mirrored, so the flag's pole side (its hoist) is at the pole, which stands at the cloth's right end. */}
          <image href={flagUrl(country)} x={CLOTH_LEFT} y={FLAT.y} width={POLE.x - CLOTH_LEFT} height={FLAT.height} preserveAspectRatio="none" transform={`translate(${CLOTH_LEFT + POLE.x} 0) scale(-1 1)`} />
          <rect x={CLOTH_LEFT} y={FLAT.y} width={POLE.x - CLOTH_LEFT} height={FLAT.height} fill="none" strokeWidth={stroke} strokeLinejoin="round" style={{ stroke: OUTLINE }} />
        </g>
      )}
      {!turning ? null : (
      <g className="flag-turn-flip" style={turn}>
        <clipPath id={clipId}>
          <path d={CLOTH} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          {/* Mirrored, so the flag's pole side (its hoist) is at the pole, which stands at the cloth's right end. */}
          <g transform={`translate(${CLOTH_LEFT + POLE.x} 0) scale(-1 1)`}>
            <image href={flagUrl(country)} x={CLOTH_LEFT} y={CLOTH_TOP} width={POLE.x - CLOTH_LEFT} height={CLOTH_BOTTOM - CLOTH_TOP} preserveAspectRatio="none" />
          </g>
        </g>
        <path d={CLOTH} fill="none" strokeWidth={stroke} strokeLinejoin="round" style={{ stroke: OUTLINE }} />
      </g>
      )}
      <circle cx={POLE.x} cy={POLE.y} r={bold ? 0.5 : 0.42} style={{ fill: OUTLINE }} />
    </g>
  );
}
