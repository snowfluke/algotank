// The small pictures inside the editor's choices and part tabs: a colour, a pattern on
// a hull-shaped panel, a plate, an icon on a white hatch, and "none". Each is an SVG
// that fills the box it is given.

import type { FlagCountry } from "@game/arena";
import { flagUrl } from "../tank/TankFlag.tsx";
import { TankPlate, TankIconDrawing } from "../tank/TankShape.tsx";
import { tankColourVar, type TankColour } from "../tank/colours.ts";
import { SKIN_GEOMETRY, HULL } from "../tank/skins.ts";
import type { TankLook } from "../tank/look.ts";

const SVG_CLASS = "block size-full";

export function ColourSwatch({ colour }: { readonly colour: TankColour }) {
  return (
    <svg viewBox="-6 -6 12 12" aria-hidden="true" className={SVG_CLASS}>
      <circle r={5} strokeWidth={0.5} style={{ fill: tankColourVar(colour), stroke: "var(--color-tank-outline)" }} />
    </svg>
  );
}

/** The hull's panel alone, in the look's colours, so a pattern shows whole (on the tank the turret hides half). */
export function PatternSwatch({ look }: { readonly look: TankLook }) {
  const geometry = SKIN_GEOMETRY[look.skin];
  const second = tankColourVar(look.second);
  return (
    <svg viewBox={`${HULL.x - 0.3} ${HULL.y - 0.3} ${HULL.width + 0.6} ${HULL.height + 0.6}`} aria-hidden="true" className={SVG_CLASS}>
      <rect x={HULL.x} y={HULL.y} width={HULL.width} height={HULL.height} rx={HULL.radius} style={{ fill: tankColourVar(look.colour) }} />
      {geometry.fill === "" ? null : <path d={geometry.fill} style={{ fill: second }} />}
      {geometry.line === null ? null : (
        <path d={geometry.line.d} fill="none" strokeWidth={geometry.line.width} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: second }} />
      )}
      <rect x={HULL.x} y={HULL.y} width={HULL.width} height={HULL.height} rx={HULL.radius} fill="none" strokeWidth={0.35} style={{ stroke: "var(--color-tank-outline)" }} />
    </svg>
  );
}

export function PlateSwatch({ colour }: { readonly colour: TankColour }) {
  return (
    <svg viewBox="-6 -6 12 12" aria-hidden="true" className={SVG_CLASS}>
      <TankPlate colour={colour} />
    </svg>
  );
}

/** The icon on a white disc, filled with the look's second colour as on the tank. */
export function IconSwatch({ look }: { readonly look: TankLook }) {
  return (
    <svg viewBox="-2.1 -2.1 4.2 4.2" aria-hidden="true" className={SVG_CLASS}>
      <circle r={2} strokeWidth={0.12} style={{ fill: "var(--color-panel)", stroke: "var(--color-line-strong)" }} />
      <g transform="scale(1.15)">
        <TankIconDrawing look={look} />
      </g>
    </svg>
  );
}

/**
 * A country's flag as a flat picture, not as it flies on the tank: there the pole side mirrors
 * it, and a picker of mirrored flags would show text and emblems backwards. Lazy, because the
 * picker can list many countries at once.
 */
export function FlagSwatch({ country }: { readonly country: FlagCountry }) {
  return <img src={flagUrl(country)} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full max-w-full rounded-[2px] object-cover shadow-[0_0_0_1px_var(--color-line-strong)]" />;
}

/** "None": a dashed outline of the space, so it reads as empty and not as white. */
export function NoneSwatch() {
  return (
    <svg viewBox="-6 -6 12 12" aria-hidden="true" className={SVG_CLASS}>
      <rect x={-5} y={-5} width={10} height={10} rx={2.3} fill="none" strokeWidth={0.5} strokeDasharray="1.2 1" style={{ stroke: "var(--color-muted)" }} />
      <path d="M-3 3L3 -3" strokeWidth={0.5} strokeLinecap="round" style={{ stroke: "var(--color-muted)" }} />
    </svg>
  );
}
