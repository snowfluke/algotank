// A toy water tank seen from above, as an SVG <g>. Use it inside your own <svg>
// (the arena board, the home scene); use TankBadge for a standalone tank in
// lists, headers and cards.
//
// Geometry: a 10 by 10 unit box centred on 0,0, facing east at angle 0. Scale it
// with a transform on a parent <g>. The plate reaches 5.4 units and the "you" ring
// 6 units from the centre, so leave that much room around a tank with either.
//
// Detail levels (69-tank-identity.md, "Drawing"):
// | Level  | Hull                    | Hatch                                  | Plate |
// |--------|-------------------------|----------------------------------------|-------|
// | full   | colour and pattern      | the icon, or the letters, on white     | yes   |
// | simple | colour, thicker lines   | a dot of the second colour, or letters | yes   |
// | tiny   | colour, thicker lines   | none                                   | yes   |
//
// The board draws the plate and the hatch itself (they must not turn with the hull),
// from the parts exported here, so the board and a badge look the same.

import type { ReactNode } from "react";
import { ICON_STROKE, TANK_ICON_GEOMETRY } from "./icons.ts";
import { plainTankLook, type TankLook } from "./look.ts";
import { HULL, SKIN_GEOMETRY } from "./skins.ts";
import { tankColourDarkVar, tankColourVar, type TankColour } from "./colours.ts";

export type TankDetail = "full" | "simple" | "tiny";

/** A tank is painted from a whole look, or from a hull colour alone for callers that have nothing else. */
export type TankPaint = { readonly look: TankLook; readonly colour?: never } | { readonly colour: TankColour; readonly look?: never };

function paintedLook(paint: TankPaint): TankLook {
  return paint.look ?? plainTankLook(paint.colour);
}

export type TankShapeProps = TankPaint & {
  /** Adds the "you" ring: an orange double ring with a white and ink casing that reads by its shape too. */
  readonly self?: boolean;
  /** One or two characters shown upright on the turret hatch, for example initials. An icon in the look wins. */
  readonly label?: string;
  readonly detail?: TankDetail;
  /** Heading in degrees, clockwise from east (90 faces down). The plate, icon and label stay upright. */
  readonly angle?: number;
};

const OUTLINE = "var(--color-tank-outline)";
/** Where the turret sits along the hull. The board places the hatch here too. */
export const TURRET_X = -1.15;
const TURRET_R = { full: 2.05, simple: 2.4, tiny: 2.4 } as const;
/** The white hatch that carries an icon or letters. */
const HATCH_R = 1.75;
const TREAD_XS = [-3, -1.5, 0, 1.5, 3];
/** Half the side of the plate; under the "you" ring's radius at the edges, so the ring sits on the plate's rim. */
const PLATE_HALF = 5.4;
const PLATE_RADIUS = 2.3;
/** The 24-unit icon grid fits inside the hatch with a small rim. */
const ICON_SCALE = 0.125;

/** Paint helpers: SVG presentation attributes do not read var(), so colours go through style. */
const fill = (value: string) => ({ fill: value });

export function TankPlate({ colour, round = false }: { readonly colour: TankColour; readonly round?: boolean }) {
  // A round plate turns with a tank without changing (the board's crowd symbols); a square one must stay upright.
  return round ? (
    <circle r={PLATE_HALF} strokeWidth={0.35} style={{ ...fill(tankColourVar(colour)), stroke: tankColourDarkVar(colour) }} />
  ) : (
    <rect
      x={-PLATE_HALF}
      y={-PLATE_HALF}
      width={PLATE_HALF * 2}
      height={PLATE_HALF * 2}
      rx={PLATE_RADIUS}
      strokeWidth={0.35}
      style={{ ...fill(tankColourVar(colour)), stroke: tankColourDarkVar(colour) }}
    />
  );
}

function SelfRing({ detail }: { readonly detail: TankDetail }) {
  // Thicker below full detail, where the ring sits on a plate of a 22 to 40 px square and must still be found at a glance.
  const width = detail === "full" ? 0.7 : 1.3;
  return (
    <g fill="none">
      {/* An ink edge and a white casing keep the ring visible on every plate and hull: orange, white and black included. */}
      <circle r={5.5} strokeWidth={width + 1.3} style={{ stroke: "var(--color-ink)" }} />
      <circle r={5.5} strokeWidth={width + 0.75} stroke="#ffffff" />
      <circle r={5.5} strokeWidth={width} style={{ stroke: "var(--color-self)" }} />
      {/* A second, dashed ring: the "you" mark is a shape, not only a colour. */}
      {detail === "full" ? <circle r={4.7} strokeWidth={0.3} strokeDasharray="0.6 0.5" style={{ stroke: "var(--color-self)" }} /> : null}
    </g>
  );
}

function Pattern({ look }: { readonly look: TankLook }) {
  const geometry = SKIN_GEOMETRY[look.skin];
  const colour = tankColourVar(look.second);
  return (
    <g aria-hidden="true">
      {geometry.fill === "" ? null : <path d={geometry.fill} stroke="none" style={fill(colour)} />}
      {geometry.line === null ? null : (
        <path d={geometry.line.d} fill="none" strokeWidth={geometry.line.width} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: colour }} />
      )}
    </g>
  );
}

export interface TankHullProps {
  readonly look: TankLook;
  readonly detail: TankDetail;
  /** True when TankHatch draws a large hatch on the turret, so the hull leaves out its own small one. */
  readonly hatched: boolean;
}

/** The part of the tank that turns: tracks, hull, pattern, barrel and turret. */
export function TankHull({ look, detail, hatched }: TankHullProps) {
  const hull = tankColourVar(look.colour);
  const dark = tankColourDarkVar(look.colour);
  const full = detail === "full";
  const stroke = full ? 0.35 : 0.5;
  const patterned = full && look.skin !== "plain";
  return (
    <g stroke={OUTLINE} strokeWidth={stroke} strokeLinejoin="round">
      {/* Tracks */}
      <rect x={-4.4} y={-4.6} width={8.6} height={2.5} rx={1.25} style={fill(dark)} />
      <rect x={-4.4} y={2.1} width={8.6} height={2.5} rx={1.25} style={fill(dark)} />
      {full ? (
        <g stroke="#ffffff" strokeOpacity={0.4} strokeWidth={0.32} strokeLinecap="round">
          {TREAD_XS.map((x) => (
            <g key={x}>
              <line x1={x} y1={-4.05} x2={x} y2={-2.65} />
              <line x1={x} y1={2.65} x2={x} y2={4.05} />
            </g>
          ))}
        </g>
      ) : null}
      {/* Hull, then the pattern, then the hull's outline again, so the pattern's ends sit under a clean edge. */}
      <rect x={HULL.x} y={HULL.y} width={HULL.width} height={HULL.height} rx={HULL.radius} style={fill(hull)} />
      {patterned ? <Pattern look={look} /> : null}
      {patterned ? <rect x={HULL.x} y={HULL.y} width={HULL.width} height={HULL.height} rx={HULL.radius} fill="none" /> : null}
      {full && !patterned ? <path d="M -2.5 -2.15 H 1.6" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={0.55} strokeLinecap="round" /> : null}
      {/* Barrel and the water nozzle at its tip */}
      <rect x={0.4} y={full ? -0.6 : -0.8} width={4} height={full ? 1.2 : 1.6} rx={0.55} style={fill(dark)} />
      <rect x={3.95} y={-1.05} width={1.05} height={2.1} rx={0.5} style={fill("var(--color-water)")} />
      {/* Turret, and the small empty hatch of a tank without an icon or letters */}
      <circle cx={TURRET_X} r={TURRET_R[detail]} style={fill(hull)} />
      {full && !hatched ? <circle cx={TURRET_X} r={0.95} fill="#ffffff" stroke={dark} strokeWidth={0.25} /> : null}
    </g>
  );
}

export function TankIconDrawing({ look }: { readonly look: TankLook }) {
  if (look.icon === null) return null;
  const icon = TANK_ICON_GEOMETRY[look.icon];
  return (
    <g transform={`scale(${ICON_SCALE}) translate(-12 -12)`} strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--color-ink)" }}>
      {icon.shapes.map((d) => (
        <path key={d} d={d} style={fill(tankColourVar(look.second))} />
      ))}
      {icon.lines.map((d) => (
        <path key={d} d={d} fill="none" />
      ))}
      {icon.dots.map(([x, y, r]) => (
        <circle key={`${x} ${y}`} cx={x} cy={y} r={r} stroke="none" style={fill("var(--color-ink)")} />
      ))}
    </g>
  );
}

/** What the hatch shows at this detail, or null when the hull's own small hatch is enough. */
export function hatchContent(look: TankLook, label: string | undefined, detail: TankDetail): "icon" | "dot" | "letters" | null {
  if (detail === "tiny") return null;
  if (look.icon !== null) return detail === "full" ? "icon" : "dot";
  return label !== undefined && label !== "" ? "letters" : null;
}

export interface TankHatchProps {
  readonly look: TankLook;
  readonly label?: string | undefined;
  readonly detail: TankDetail;
}

/** The upright part on the turret, drawn at 0,0: the caller moves it to the turret and keeps it from turning. */
export function TankHatch({ look, label, detail }: TankHatchProps): ReactNode {
  const content = hatchContent(look, label, detail);
  if (content === null) return null;
  if (content === "dot") {
    return <circle r={1.25} strokeWidth={0.45} aria-hidden="true" style={{ ...fill(tankColourVar(look.second)), stroke: "#ffffff" }} />;
  }
  const text = (label ?? "").slice(0, 2);
  return (
    <g aria-hidden="true">
      {detail === "full" ? <circle r={HATCH_R} strokeWidth={0.25} style={{ fill: "#ffffff", stroke: tankColourDarkVar(look.colour) }} /> : null}
      {content === "icon" ? (
        <TankIconDrawing look={look} />
      ) : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-display)"
          fontWeight={700}
          fontSize={text.length === 2 ? 1.9 : 2.5}
          // In "simple" there is no white hatch, so the letters get a white halo instead.
          strokeWidth={detail === "simple" ? 0.55 : 0}
          paintOrder="stroke"
          style={{ fill: "var(--color-ink)", stroke: "#ffffff" }}
        >
          {text}
        </text>
      )}
    </g>
  );
}

export function TankShape({ self = false, label, detail = "full", angle = 0, ...paint }: TankShapeProps) {
  const look = paintedLook(paint as TankPaint);
  const radians = (angle * Math.PI) / 180;
  // The hatch is drawn outside the rotated group, so an icon or a label never turns upside down.
  const hatchX = TURRET_X * Math.cos(radians);
  const hatchY = TURRET_X * Math.sin(radians);
  const hatched = hatchContent(look, label, detail) !== null;
  return (
    <g>
      {look.plate === null ? null : <TankPlate colour={look.plate} />}
      {detail === "full" && look.plate === null ? <ellipse cx={0.35} cy={0.7} rx={4.9} ry={4.7} fill="#1b2733" fillOpacity={0.14} /> : null}
      {self ? <SelfRing detail={detail} /> : null}
      <g transform={angle === 0 ? undefined : `rotate(${angle})`}>
        <TankHull look={look} detail={detail} hatched={hatched} />
      </g>
      {hatched ? (
        <g transform={`translate(${hatchX} ${hatchY})`}>
          <TankHatch look={look} label={label} detail={detail} />
        </g>
      ) : null}
    </g>
  );
}
