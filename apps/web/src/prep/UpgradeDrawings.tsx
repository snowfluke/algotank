// The drawing on each upgrade card. Each one changes at every level, so a child sees
// what one more level does without reading (71-workshop-appeal.md, part B):
// - Range: a lane of squares, and the tank's water reaches exactly as many as throwRange
//   says; one more level is one more wet square. With secret rules the squares the round
//   gives are a "?" square, and only the squares the levels add are drawn wet.
// - Aim: the ring around the other tank where your shots land tightens with each level,
//   until every drop lands on the tank ("hits more").
// - Dodge: the jet aimed at your tank stays where it was, and your tank sits one step
//   further out of it per level, until the splash lands on the empty floor ("hit less").
// - Camouflage: a hunter looks for your tank. At 0 its sight lands on you; from level 1 a green cover hides you,
//   the hunter stands outside it and its sight stops at the edge; level 2's cover is tighter.

import { MAX_THROW_RANGE } from "@game/engine";
import { TankShape } from "../tank/TankShape.tsx";
import type { TankLook } from "../tank/look.ts";
import { centre, CELL, Floor, Jet, otherColours, Splash } from "./sceneParts.tsx";

const SVG_CLASS = "block size-full";

export function RangeDrawing({ look, level, range }: { readonly look: TankLook; readonly level: number; readonly range: number | null }) {
  const lane = MAX_THROW_RANGE;
  // Squares counted from the tank's own square (0) along the middle row; the jet ends on the last wet one.
  const unknownBase = range === null;
  const firstWet = unknownBase ? 2 : 1;
  const lastWet = unknownBase ? 1 + level : range;
  const row = centre(1);
  return (
    <svg viewBox={`-2 0 ${(lane + 1) * CELL + 4} 30`} aria-hidden="true" className={SVG_CLASS}>
      <Floor cols={lane + 1} rows={3} />
      {Array.from({ length: lane }, (_, i) => {
        const square = i + 1;
        const wet = square >= firstWet && square <= lastWet;
        return wet ? <rect key={square} x={square * CELL + 0.6} y={CELL + 0.6} width={CELL - 1.2} height={CELL - 1.2} rx={1.4} strokeWidth={0.5} style={{ fill: "var(--color-water-soft)", stroke: "var(--color-water-light)" }} /> : null;
      })}
      {unknownBase ? (
        <text x={centre(1)} y={row} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-display)" fontWeight={700} fontSize={6} style={{ fill: "var(--color-muted)" }}>
          ?
        </text>
      ) : null}
      {/* With secret rules the jet is dotted over the "?" square, then solid over the squares the levels add. */}
      {unknownBase ? <Jet x1={CELL - 0.5} y1={row} x2={centre(1) + 3} y2={row} dotted /> : null}
      {lastWet >= firstWet ? <Jet x1={unknownBase ? centre(1) + 3 : CELL - 0.5} y1={row} x2={centre(lastWet) - 1} y2={row} /> : null}
      {lastWet >= firstWet ? <Splash x={centre(lastWet) + 1} y={row} scale={0.85} /> : null}
      <g transform={`translate(${centre(0)} ${row}) scale(0.78)`}>
        <TankShape look={look} angle={0} self detail="simple" />
      </g>
    </svg>
  );
}

const AIM_RINGS = [13, 9.5, 6.5, 4.2] as const;

export function AimDrawing({ look, level }: { readonly look: TankLook; readonly level: number }) {
  const r = AIM_RINGS[Math.min(level, AIM_RINGS.length - 1)] ?? AIM_RINGS[0];
  const target = { x: 47, y: 15 };
  const drops = Array.from({ length: 5 }, (_, k) => {
    const a = ((-90 + 72 * k + 20) * Math.PI) / 180;
    return [target.x + Math.cos(a) * r * 0.78, target.y + Math.sin(a) * r * 0.78] as const;
  });
  return (
    <svg viewBox="0 0 64 30" aria-hidden="true" className={SVG_CLASS}>
      <Floor cols={6} rows={3} x={2} />
      <line x1={13} y1={15} x2={target.x - r} y2={target.y} strokeWidth={0.8} strokeDasharray="1.4 1.4" style={{ stroke: "var(--color-water)" }} />
      <g transform={`translate(${target.x} ${target.y}) scale(0.78)`}>
        <TankShape colour={otherColours(look)[0] ?? 2} angle={180} detail="simple" />
      </g>
      {/* The ring where shots land, with the four ticks of a sight. */}
      <circle cx={target.x} cy={target.y} r={r} fill="none" strokeWidth={0.9} strokeDasharray="2 1.2" style={{ stroke: "var(--color-water-deep)" }} />
      {[0, 90, 180, 270].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return <line key={deg} x1={target.x + Math.cos(a) * (r - 1.2)} y1={target.y + Math.sin(a) * (r - 1.2)} x2={target.x + Math.cos(a) * (r + 1.4)} y2={target.y + Math.sin(a) * (r + 1.4)} strokeWidth={0.9} strokeLinecap="round" style={{ stroke: "var(--color-water-deep)" }} />;
      })}
      {drops.map(([x, y]) => (
        <circle key={`${x.toFixed(1)},${y.toFixed(1)}`} cx={x} cy={y} r={1.1} strokeWidth={0.4} stroke="#ffffff" style={{ fill: "var(--color-water)" }} />
      ))}
      <g transform="translate(9 15) scale(0.78)">
        <TankShape look={look} angle={0} self detail="simple" />
      </g>
    </svg>
  );
}

/** How far the tank has stepped out of the jet's line at each level. */
const DODGE_STEPS = [0, 3.4, 6.8, 10] as const;

export function DodgeDrawing({ look, level }: { readonly look: TankLook; readonly level: number }) {
  const step = DODGE_STEPS[Math.min(level, DODGE_STEPS.length - 1)] ?? 0;
  const me = { x: 48, y: 15 + step };
  return (
    <svg viewBox="0 0 64 30" aria-hidden="true" className={SVG_CLASS}>
      <Floor cols={6} rows={3} x={2} />
      <Jet x1={13} y1={15} x2={44} y2={15} />
      {step > 0 ? (
        <>
          {/* Where the tank stood: the jet still lands there. */}
          <rect x={44} y={11} width={8} height={8} rx={2} fill="none" strokeWidth={0.7} strokeDasharray="1.4 1.2" style={{ stroke: "var(--color-muted)" }} />
          <line x1={me.x - 5} y1={me.y - 3} x2={me.x - 5} y2={me.y - 3 - Math.min(step, 4)} strokeWidth={0.8} strokeLinecap="round" style={{ stroke: "var(--color-muted)" }} />
          <line x1={me.x + 5} y1={me.y - 3} x2={me.x + 5} y2={me.y - 3 - Math.min(step, 4)} strokeWidth={0.8} strokeLinecap="round" style={{ stroke: "var(--color-muted)" }} />
        </>
      ) : null}
      <g transform={`translate(${me.x} ${me.y}) scale(0.78)`}>
        <TankShape look={look} angle={180} self detail="simple" />
      </g>
      <Splash x={45} y={15} scale={0.9} />
      <g transform="translate(9 15) scale(0.78)">
        <TankShape colour={otherColours(look)[0] ?? 2} angle={0} detail="simple" />
      </g>
    </svg>
  );
}

/**
 * The cover's right edge at each level, on the same six-square scene as Aim and Dodge: the hunter stands outside it
 * at 1 and 2, and level 2's cover is tighter. The sentence under the drawing gives the real squares (NOTICE).
 */
const COVER_EDGE = [0, 44, 30] as const;
const LEAVES = [[-3.6, -3.4, 1.9], [3.4, -3.6, 1.7], [-4.2, 3, 1.6], [4, 3.2, 1.5]] as const;
/** Level 2 adds leaves, so the tighter cover also looks like more hiding. */
const MORE_LEAVES = [[0.2, -4.6, 1.7], [-0.4, 4.6, 1.6], [-5.4, -0.2, 1.4], [5.2, 0.2, 1.4]] as const;

export function CamouflageDrawing({ look, level }: { readonly look: TankLook; readonly level: number }) {
  const hidden = level > 0;
  const edge = COVER_EDGE[Math.min(level, COVER_EDGE.length - 1)] ?? 0;
  const me = { x: 9, y: 15 };
  const hunter = { x: 56, y: 15 };
  // The hunter's line of sight: it reaches your tank, or stops at the cover's edge.
  const sightEnd = hidden ? edge + 1.5 : me.x + 7;
  return (
    <svg viewBox="0 0 64 30" aria-hidden="true" className={SVG_CLASS}>
      <Floor cols={6} rows={3} x={2} />
      {hidden ? (
        <rect x={2.6} y={0.6} width={edge - 2.6} height={28.8} rx={3} strokeWidth={0.7} strokeDasharray="1.6 1.2" style={{ fill: "var(--color-arena-meadow-floor)", stroke: "var(--color-arena-meadow-wall)" }} data-camouflage-cover={level} />
      ) : null}
      <line x1={hunter.x - 5} y1={hunter.y} x2={sightEnd} y2={me.y} strokeWidth={0.8} strokeDasharray="1.4 1.4" strokeLinecap="round" style={{ stroke: hidden ? "var(--color-muted)" : "var(--color-hit)" }} />
      {hidden ? (
        <text x={sightEnd - 1} y={me.y - 3.5} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={700} fontSize={6} style={{ fill: "var(--color-muted)" }}>?</text>
      ) : null}
      <g transform={`translate(${me.x} ${me.y}) scale(0.78)`} opacity={hidden ? 0.8 : 1}>
        <TankShape look={look} angle={0} self detail="simple" />
      </g>
      {hidden ? (
        [...LEAVES, ...(level >= 2 ? MORE_LEAVES : [])].map(([dx, dy, r]) => <circle key={`${dx},${dy}`} cx={me.x + dx} cy={me.y + dy} r={r} strokeWidth={0.4} style={{ fill: "var(--color-tank-4)", stroke: "var(--color-tank-4-dark)" }} />)
      ) : (
        // Spotted: the hunter's sight sits on your tank.
        <g fill="none" strokeWidth={0.8} style={{ stroke: "var(--color-hit)" }}>
          <circle cx={me.x} cy={me.y} r={6.4} strokeDasharray="2 1.2" />
          {[0, 90, 180, 270].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return <line key={deg} x1={me.x + Math.cos(a) * 5.2} y1={me.y + Math.sin(a) * 5.2} x2={me.x + Math.cos(a) * 7.8} y2={me.y + Math.sin(a) * 7.8} strokeLinecap="round" />;
          })}
        </g>
      )}
      <g transform={`translate(${hunter.x} ${hunter.y}) scale(0.78)`}>
        <TankShape colour={otherColours(look)[0] ?? 2} angle={180} detail="simple" />
      </g>
    </svg>
  );
}
