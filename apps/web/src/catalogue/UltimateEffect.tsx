// The catalogue's drawings of the ultimates (owner, 2026-11-17: "activation should make the floor
// glow, and the effect should be animated"). The game does not have ultimates yet, so these draw
// the plan on the catalogue's board, in board units (CELL per square), through the board's two
// layers: `underlay` on the ground under the tanks, `overlay` over the tanks.
//
// Every ultimate starts with the same cue, so a child learns it: the tank's square lights up gold,
// gold rings spread over the floor and sparks rise (`charge`). While an ultimate acts, its square
// keeps a soft gold light (`aura`). Then each ultimate has its own effect; the jets, splashes, mud
// and umbrella are the board's own drawings, so an ultimate looks like part of the same game.
//
// Each step's drawing is new (ScenePlayer keys it by the turn), so its animation plays once per
// step. The timings are parts of the step's length (--step). Without motion (prefers-reduced-motion)
// nothing moves, and every drawing shows its peak: the jets drawn, the dome open, the mud in the air.
//
// Avoid the characters & < > and quotes in the CSS text: React escapes them inside a style element.

import type { CSSProperties, ReactNode } from "react";
import type { ItemKind } from "@game/engine";
import { CELL, cellCenter, type Point } from "../board/boardHelpers.ts";
import { JetShape, Puff, Splash } from "../board/boardShapes.tsx";
import { HeldBadge, ItemShape, MudSplats, OpenUmbrella } from "../board/itemShapes.tsx";

export interface Square {
  readonly x: number;
  readonly y: number;
}

/** What one step of an ultimate's scene draws. */
export type UltimateEffect =
  | { readonly kind: "charge"; readonly at: Square }
  | { readonly kind: "aura"; readonly at: Square }
  | { readonly kind: "dash"; readonly from: Square; readonly to: Square }
  /** `fresh`: the smoke rolls in on this step; otherwise it hangs there. */
  | { readonly kind: "smoke"; readonly at: Square; readonly fresh: boolean }
  /** `tanks`: the squares around `at` with a tank on them, which get a splash; the others get a puff. */
  | { readonly kind: "splash"; readonly at: Square; readonly tanks: readonly Square[] }
  | { readonly kind: "fullTank"; readonly at: Square }
  /** A shot that used no water: a ring of water around the shooter. */
  | { readonly kind: "freeShot"; readonly at: Square }
  /** The ball lands on `to` and its mud covers every square within `reach` of it. */
  | { readonly kind: "mudBomb"; readonly from: Square; readonly to: Square; readonly reach: number }
  /** The mud a mud bomb left, after it landed. */
  | { readonly kind: "mudPatch"; readonly at: Square; readonly reach: number }
  | { readonly kind: "whirlwind"; readonly at: Square; readonly reach: number }
  /**
   * `facing`: the side the dome covers (owner, 2026-11-17: front only, so it differs from smoke). `fresh`: it opens on
   * this step. `shooters`: squares whose shot ripples on the dome. `left`: the blocks it still has, drawn on a badge.
   */
  | { readonly kind: "bigUmbrella"; readonly at: Square; readonly facing: "N" | "E" | "S" | "W"; readonly fresh: boolean; readonly shooters: readonly Square[]; readonly left: number }
  | { readonly kind: "magnet"; readonly at: Square; readonly items: readonly { readonly kind: ItemKind; readonly from: Square }[] }
  /** The items a magnet stacked on the tank, first to be used first. The board draws one held item; this draws the stack. */
  | { readonly kind: "stack"; readonly at: Square; readonly items: readonly ItemKind[]; readonly fresh: boolean };

const GOLD = "var(--color-guide)";
const GOLD_DEEP = "var(--color-guide-deep)";
const WATER = "var(--color-water)";
const SMOKE = "var(--color-panel)";
const SMOKE_EDGE = "var(--color-line-strong)";
const STAR = "M0 -1.1L0.3 -0.3L1.1 0L0.3 0.3L0 1.1L-0.3 0.3L-1.1 0L-0.3 -0.3Z";

const NEIGHBOURS: readonly Square[] = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => (dx === 0 && dy === 0 ? [] : [{ x: dx, y: dy }])));

const EFFECT_CSS = `
.ue-a { transform-box: fill-box; transform-origin: center; }
.ue-ripple { opacity: 0.55; transform: scale(1.7); }
.ue-rise { opacity: 0.9; }
.ue-smoke-puff { opacity: 0.88; }
.ue-pull { transform: translate(calc(var(--dx) * 0.6), calc(var(--dy) * 0.6)) scale(0.8); }
.ue-lob-x { transform: translateX(calc(var(--dx) * 0.55)); }
.ue-lob-y { transform: translateY(-7px); }
.ue-fling { transform: translate(var(--dx), var(--dy)); }
@media (prefers-reduced-motion: no-preference) {
  .ue-glow { animation: ue-glow var(--step) ease-out both; }
  .ue-aura { animation: ue-aura calc(var(--step) * 1.6) ease-in-out infinite alternate; }
  .ue-ripple { animation: ue-ripple calc(var(--step) * 0.85) cubic-bezier(0.2, 0.7, 0.3, 1) both; animation-delay: var(--d, 0ms); }
  .ue-halo { animation: ue-halo calc(var(--step) * 0.6) ease-out both; animation-delay: var(--d, 0ms); }
  .ue-rise { animation: ue-rise calc(var(--step) * 0.8) ease-out both; animation-delay: var(--d, 0ms); }
  .ue-streak { animation: ue-streak calc(var(--step) * 0.7) ease-out both; animation-delay: var(--d, 0ms); }
  .ue-dust { animation: ue-dust calc(var(--step) * 0.7) ease-out both; animation-delay: var(--d, 0ms); }
  .ue-smoke-in { animation: ue-smoke-in calc(var(--step) * 0.5) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: var(--d, 0ms); }
  .ue-smoke-drift { animation: ue-smoke-drift calc(var(--step) * 1.2) ease-in-out infinite alternate; animation-delay: var(--d, 0ms); }
  .ue-jet { animation: ue-jet calc(var(--step) * 0.3) ease-out both; }
  .ue-in { animation: ue-pop calc(var(--step) * 0.3) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: var(--d, 0ms); }
  .ue-pop { animation: ue-pop calc(var(--step) * 0.45) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: calc(var(--step) * 0.25); }
  .ue-wave { animation: ue-wave calc(var(--step) * 0.7) ease-out both; animation-delay: calc(var(--step) * 0.1); }
  .ue-suck { animation: ue-suck calc(var(--step) * 0.55) ease-in both; animation-delay: var(--d, 0ms); }
  .ue-lob-x { animation: ue-lob-x calc(var(--step) * 0.5) linear both; }
  .ue-lob-y { animation: ue-lob-y calc(var(--step) * 0.5) linear both; }
  .ue-splat { animation: ue-pop calc(var(--step) * 0.4) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: calc(var(--step) * 0.48); }
  .ue-patch { animation: ue-patch calc(var(--step) * 0.35) ease-out both; animation-delay: calc(var(--step) * 0.48); }
  .ue-fling { animation: ue-fling calc(var(--step) * 0.3) ease-out both; animation-delay: calc(var(--step) * 0.48); }
  .ue-spin { animation: ue-spin calc(var(--step) * 0.9) cubic-bezier(0.3, 0.6, 0.4, 1) both; }
  .ue-area { animation: ue-area calc(var(--step) * 0.9) ease-out both; }
  .ue-open { animation: ue-open calc(var(--step) * 0.45) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .ue-bob { animation: ue-bob calc(var(--step) * 1.2) ease-in-out infinite alternate; }
  .ue-field { animation: ue-field calc(var(--step) * 0.5) linear infinite; }
  .ue-pull { animation: ue-pull calc(var(--step) * 0.7) cubic-bezier(0.5, 0, 0.75, 0) both; animation-delay: var(--d, 0ms); }
}
@keyframes ue-glow { 0% { opacity: 0; } 35% { opacity: 0.9; } 100% { opacity: 0.55; } }
@keyframes ue-aura { from { opacity: 0.3; } to { opacity: 0.5; } }
@keyframes ue-ripple { 0% { transform: scale(0.3); opacity: 1; } 100% { transform: scale(3.4); opacity: 0; } }
@keyframes ue-halo { 0% { transform: scale(0.6); opacity: 0; } 30% { opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
@keyframes ue-rise { 0% { transform: translateY(2px) scale(0.4); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-9px) scale(1); opacity: 0; } }
@keyframes ue-streak { 0% { stroke-dashoffset: 1; opacity: 1; } 60% { stroke-dashoffset: 0; opacity: 0.9; } 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes ue-dust { 0% { transform: scale(0.3); opacity: 0.9; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes ue-smoke-in { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 0.88; } }
@keyframes ue-smoke-drift { from { transform: translate(-0.6px, 0.3px) scale(0.95); } to { transform: translate(0.6px, -0.4px) scale(1.06); } }
@keyframes ue-jet { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes ue-pop { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes ue-wave { 0% { transform: scale(0.4); opacity: 0.9; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes ue-suck { 0% { transform: translate(var(--dx), var(--dy)) scale(1.2); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(0, 0) scale(0.3); opacity: 0.2; } }
@keyframes ue-lob-x { from { transform: translateX(0); } to { transform: translateX(var(--dx)); } }
@keyframes ue-lob-y { 0% { transform: translateY(0); animation-timing-function: ease-out; } 50% { transform: translateY(-9px); animation-timing-function: ease-in; } 100% { transform: translateY(0); } }
@keyframes ue-patch { 0% { transform: scale(0.2); opacity: 0; } 100% { transform: scale(1); opacity: 0.5; } }
@keyframes ue-fling { 0% { transform: translate(0, 0) scale(0.4); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 1; } }
@keyframes ue-spin { 0% { transform: rotate(0deg) scale(0.2); opacity: 0; } 25% { opacity: 1; } 100% { transform: rotate(540deg) scale(1); opacity: 0.85; } }
@keyframes ue-area { 0% { opacity: 0; } 100% { opacity: 0.35; } }
@keyframes ue-open { 0% { transform: scale(0.15, 0.4); } 100% { transform: scale(1); } }
@keyframes ue-bob { from { transform: translateY(0); } to { transform: translateY(-0.6px); } }
@keyframes ue-field { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 3; } }
@keyframes ue-pull { 0% { transform: translate(0, 0); opacity: 1; } 85% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(0.4); opacity: 0; } }
`;

const vars = (values: Record<string, string | number>): CSSProperties => values as CSSProperties;
const delay = (stepParts: number): string => `calc(var(--step) * ${stepParts})`;

function at(square: Square): Point {
  return cellCenter(square.x, square.y);
}

/** The shared start of every ultimate, under the tanks: the square lights up and rings spread. */
function ChargeFloor({ square }: { readonly square: Square }) {
  const c = at(square);
  return (
    <g>
      {/* Wider than the tank, so the light shows around it. */}
      <circle className="ue-a ue-glow" cx={c.x} cy={c.y} r={7.2} opacity={0.55} style={{ fill: GOLD }} />
      {[0, 0.35].map((part) => (
        <circle key={part} className="ue-a ue-ripple" cx={c.x} cy={c.y} r={5} fill="none" strokeWidth={1} style={{ stroke: GOLD_DEEP, ...vars({ "--d": delay(part) }) }} />
      ))}
    </g>
  );
}

/** The shared start, over the tank: a gold ring and sparks that rise. */
function ChargeSparks({ square }: { readonly square: Square }) {
  const c = at(square);
  return (
    <g>
      <circle className="ue-a ue-halo" cx={c.x} cy={c.y} r={6} fill="none" strokeWidth={0.9} opacity={0.8} style={{ stroke: GOLD }} />
      {[-4, -2.2, 0, 2.2, 4].map((dx, i) => (
        // The position sits on a group of its own, because the animation's transform replaces the element's.
        <g key={dx} transform={`translate(${c.x + dx} ${c.y - 3 + (i % 2) * 2})`}>
          <path className="ue-a ue-rise" d={STAR} transform="scale(1.3)" strokeWidth={0.2} style={{ fill: GOLD, stroke: GOLD_DEEP, ...vars({ "--d": delay(0.08 * i) }) }} />
        </g>
      ))}
    </g>
  );
}

function Aura({ square }: { readonly square: Square }) {
  const c = at(square);
  return <circle className="ue-aura" cx={c.x} cy={c.y} r={6.8} opacity={0.4} style={{ fill: GOLD }} />;
}

/** Dash, under the tanks: three speed lines along the path. */
function DashStreaks({ from, to }: { readonly from: Square; readonly to: Square }) {
  const a = at(from);
  const b = at(to);
  return (
    <g fill="none" strokeLinecap="round" strokeDasharray="1 2">
      {[-2.6, 0, 2.6].map((offset, i) => (
        <path
          key={offset}
          className="ue-streak"
          d={`M${a.x} ${a.y + offset}L${b.x - 3} ${b.y + offset}`}
          pathLength={1}
          strokeWidth={offset === 0 ? 1.2 : 0.7}
          opacity={0.7}
          style={{ stroke: GOLD_DEEP, ...vars({ "--d": delay(0.05 * i) }) }}
        />
      ))}
    </g>
  );
}

/** Dash, over the tanks: dust where the tank left. */
function DashDust({ from }: { readonly from: Square }) {
  const c = at(from);
  return (
    <g>
      {[
        { x: -3, y: -2.5, r: 1.8 },
        { x: -4, y: 1, r: 2.2 },
        { x: -2, y: 3, r: 1.5 },
      ].map((puff, i) => (
        <circle key={i} className="ue-a ue-dust" cx={c.x + puff.x} cy={c.y + puff.y} r={puff.r} opacity={0.5} strokeWidth={0.3} style={{ fill: SMOKE, stroke: SMOKE_EDGE, ...vars({ "--d": delay(0.06 * i) }) }} />
      ))}
    </g>
  );
}

const SMOKE_PUFFS = [
  { x: -3.6, y: -2.4, r: 3 },
  { x: 2.8, y: -3, r: 3.3 },
  { x: 4, y: 1.8, r: 2.8 },
  { x: -0.4, y: 3.4, r: 3.1 },
  { x: -4.2, y: 1.6, r: 2.6 },
  { x: 0.2, y: -0.4, r: 2.4 },
] as const;

function Smoke({ square, fresh }: { readonly square: Square; readonly fresh: boolean }) {
  const c = at(square);
  return (
    <g>
      {SMOKE_PUFFS.map((puff, i) => (
        <g key={i} className={`ue-a ${fresh ? "ue-smoke-in" : "ue-smoke-drift"}`} style={vars({ "--d": delay(0.05 * i) })}>
          <circle className="ue-smoke-puff" cx={c.x + puff.x} cy={c.y + puff.y} r={puff.r} strokeWidth={0.35} style={{ fill: SMOKE, stroke: SMOKE_EDGE }} />
        </g>
      ))}
    </g>
  );
}

/** Splash ring: a jet to each of the 8 squares around the tank, a splash on each tank and a puff on each empty square. */
function SplashRing({ square, tanks }: { readonly square: Square; readonly tanks: readonly Square[] }) {
  const c = at(square);
  return (
    <g>
      <circle className="ue-a ue-wave" cx={c.x} cy={c.y} r={6} fill="none" strokeWidth={0.8} opacity={0} style={{ stroke: WATER }} />
      {NEIGHBOURS.map((step) => {
        const target = { x: square.x + step.x, y: square.y + step.y };
        const end = at(target);
        const tank = tanks.some((t) => t.x === target.x && t.y === target.y);
        // The jet starts at the tank's edge and stops short of the target's middle, as the board's jets do.
        const from = { x: c.x + step.x * 3, y: c.y + step.y * 3 };
        const to = { x: end.x - step.x * 2.4, y: end.y - step.y * 2.4 };
        const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        return (
          <g key={`${step.x},${step.y}`}>
            <JetShape jet={{ from, control, to }} motion="ue-jet" />
            <g transform={`translate(${end.x} ${end.y})`}>
              <g className="ue-a ue-pop">{tank ? <Splash /> : <Puff />}</g>
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** Full tank: drops of water fly in from all around, and a ring of water closes on the tank. */
function FullTank({ square }: { readonly square: Square }) {
  const c = at(square);
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dx = Math.cos(angle) * 9;
        const dy = Math.sin(angle) * 9;
        return (
          <g key={i} transform={`translate(${c.x} ${c.y})`}>
            <circle className="ue-suck" r={1.1} strokeWidth={0.25} style={{ fill: WATER, stroke: "white", ...vars({ "--dx": `${dx.toFixed(2)}px`, "--dy": `${dy.toFixed(2)}px`, "--d": delay(0.04 * i) }) }} />
          </g>
        );
      })}
      <circle className="ue-a ue-halo" cx={c.x} cy={c.y} r={5.5} fill="none" strokeWidth={1.2} opacity={0.8} style={{ stroke: WATER, ...vars({ "--d": delay(0.45) }) }} />
    </g>
  );
}

function FreeShot({ square }: { readonly square: Square }) {
  const c = at(square);
  return <circle className="ue-a ue-halo" cx={c.x} cy={c.y} r={5.5} fill="none" strokeWidth={1.1} opacity={0.8} style={{ stroke: WATER }} />;
}

/** The squares within `reach` of `square`, on the board. */
function areaRect(square: Square, reach: number, board: { readonly width: number; readonly height: number }) {
  const x0 = Math.max(0, square.x - reach);
  const y0 = Math.max(0, square.y - reach);
  const x1 = Math.min(board.width - 1, square.x + reach);
  const y1 = Math.min(board.height - 1, square.y + reach);
  return { x: x0 * CELL, y: y0 * CELL, width: (x1 - x0 + 1) * CELL, height: (y1 - y0 + 1) * CELL };
}

/** Mud bomb, under the tanks: the patch of mud it leaves; `fresh` spreads it when the ball lands. */
function MudPatch({ square, reach, board, fresh }: { readonly square: Square; readonly reach: number; readonly board: { readonly width: number; readonly height: number }; readonly fresh: boolean }) {
  const r = areaRect(square, reach, board);
  return <rect className={fresh ? "ue-a ue-patch" : undefined} x={r.x + 0.8} y={r.y + 0.8} width={r.width - 1.6} height={r.height - 1.6} rx={4} opacity={0.5} strokeWidth={0.5} style={{ fill: "var(--color-tank-10)", stroke: "var(--color-tank-10-dark)" }} />;
}

/** Mud bomb: a mud ball flies over in an arc, bursts on the tank it lands on and flings mud over every square around it. */
function MudBomb({ from, to, reach }: { readonly from: Square; readonly to: Square; readonly reach: number }) {
  const a = at(from);
  const b = at(to);
  const fling = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => (dx === 0 && dy === 0 ? [] : [{ dx: dx * reach * CELL, dy: dy * reach * CELL }])));
  return (
    <g>
      <g transform={`translate(${b.x} ${b.y})`}>
        {fling.map((drop) => (
          <circle key={`${drop.dx},${drop.dy}`} className="ue-fling" r={1.3} strokeWidth={0.3} style={{ fill: "var(--color-tank-10)", stroke: "var(--color-tank-10-dark)", ...vars({ "--dx": `${drop.dx}px`, "--dy": `${drop.dy}px` }) }} />
        ))}
      </g>
      <g transform={`translate(${a.x} ${a.y})`}>
        <g className="ue-lob-x" style={vars({ "--dx": `${b.x - a.x}px` })}>
          <g className="ue-lob-y">
            <g transform="scale(0.75)">
              <ItemShape kind="mudBall" />
            </g>
          </g>
        </g>
      </g>
      <g transform={`translate(${b.x} ${b.y})`}>
        <g className="ue-a ue-splat">
          <g transform="scale(1.5)">
            <MudSplats />
          </g>
        </g>
      </g>
    </g>
  );
}

/** Whirlwind, under the tanks: the squares it reaches darken a little. */
function WhirlwindArea({ square, reach, width, height }: { readonly square: Square; readonly reach: number; readonly width: number; readonly height: number }) {
  const x0 = Math.max(0, square.x - reach);
  const y0 = Math.max(0, square.y - reach);
  const x1 = Math.min(width - 1, square.x + reach);
  const y1 = Math.min(height - 1, square.y + reach);
  return <rect className="ue-area" x={x0 * CELL} y={y0 * CELL} width={(x1 - x0 + 1) * CELL} height={(y1 - y0 + 1) * CELL} rx={2} opacity={0.35} style={{ fill: "var(--color-water-light)" }} />;
}

/** Whirlwind, over the tanks: three arms of wind spin out from the tank to its reach. */
function Whirlwind({ square, reach }: { readonly square: Square; readonly reach: number }) {
  const c = at(square);
  const r = (reach + 0.4) * CELL;
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <g className="ue-a ue-spin" opacity={0.85}>
        {/* An empty circle as wide as the arms, so the spin turns about the tank. */}
        <circle r={r} fill="none" />
        {[0, 120, 240].map((angle) => (
          <g key={angle} transform={`rotate(${angle})`} fill="none" strokeLinecap="round">
            <path d={`M2 0Q${r * 0.5} ${-r * 0.15} ${r * 0.75} ${r * 0.45}`} strokeWidth={1.4} style={{ stroke: "var(--color-water-light)" }} />
            <path d={`M2 0Q${r * 0.5} ${-r * 0.15} ${r * 0.75} ${r * 0.45}`} strokeWidth={0.5} style={{ stroke: "var(--color-water-deep)" }} />
            <path d={`M${r * 0.35} ${r * 0.35}Q${r * 0.7} ${r * 0.2} ${r * 0.95} ${r * 0.6}`} strokeWidth={0.5} style={{ stroke: "var(--color-water-deep)" }} />
          </g>
        ))}
      </g>
    </g>
  );
}

const FACING_ANGLE = { N: 0, E: 90, S: 180, W: -90 } as const;

/** Big umbrella: a dome twice the size of the item's opens on the side the tank faces, which it covers; each blocked shot ripples on it. */
function BigUmbrella({ square, facing, fresh, shooters, left }: { readonly square: Square; readonly facing: keyof typeof FACING_ANGLE; readonly fresh: boolean; readonly shooters: readonly Square[]; readonly left: number }) {
  const c = at(square);
  return (
    <g>
      {/* The dome is drawn facing up, so it turns to the tank's front and sits a little ahead of the tank. */}
      <g transform={`translate(${c.x} ${c.y}) rotate(${FACING_ANGLE[facing]}) translate(0 -3.2)`}>
        <g className={`ue-a ${fresh ? "ue-open" : "ue-bob"}`}>
          <g transform="scale(1.9)" opacity={0.92}>
            <OpenUmbrella />
          </g>
        </g>
      </g>
      {shooters.map((shooter) => {
        const s = at(shooter);
        const length = Math.hypot(s.x - c.x, s.y - c.y);
        const rim = { x: c.x + ((s.x - c.x) / length) * 8, y: c.y + ((s.y - c.y) / length) * 8 };
        return <circle key={`${shooter.x},${shooter.y}`} className="ue-a ue-halo" cx={rim.x} cy={rim.y} r={2} fill="none" strokeWidth={0.8} style={{ stroke: WATER, ...vars({ "--d": delay(0.25) }) }} />;
      })}
      {/* The blocks left, on a badge above the tank, so a child can count them down. Keyed by the count, so it pops when it drops. */}
      <g key={left} transform={`translate(${c.x + 3.6} ${c.y - 4.6})`}>
        <g className="ue-a ue-in" style={vars({ "--d": delay(0.2) })}>
          <circle r={2.4} strokeWidth={0.35} style={{ fill: "white", stroke: "var(--color-tank-5-dark)" }} />
          <text y={1.15} textAnchor="middle" fontSize={3.2} fontWeight={700} style={{ fill: "var(--color-tank-5-dark)", fontFamily: "var(--font-display)" }}>
            {left}
          </text>
        </g>
      </g>
    </g>
  );
}

/** Magnet, under the tanks: rings of pull that run in toward the tank. */
function MagnetField({ square }: { readonly square: Square }) {
  const c = at(square);
  return (
    <g fill="none" strokeDasharray="1.2 1.8" opacity={0.75}>
      {[9, 16, 23].map((r) => (
        <circle key={r} className="ue-field" cx={c.x} cy={c.y} r={r} strokeWidth={0.7} style={{ stroke: "var(--color-hit)" }} />
      ))}
    </g>
  );
}

/** Magnet, over the tanks: each item slides to the tank and goes in. */
function MagnetPull({ square, items }: { readonly square: Square; readonly items: readonly { readonly kind: ItemKind; readonly from: Square }[] }) {
  const c = at(square);
  return (
    <g>
      {items.map((item, i) => {
        const p = at(item.from);
        return (
          <g key={`${item.from.x},${item.from.y}`} transform={`translate(${p.x} ${p.y})`}>
            <g className="ue-pull" style={vars({ "--dx": `${c.x - p.x}px`, "--dy": `${c.y - p.y}px`, "--d": delay(0.08 * i) })}>
              <ItemShape kind={item.kind} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** The held items as a column down the tank's left side, first to be used on top, clear of the crown above. `fresh`: they pop in one by one. */
function Stack({ square, items, fresh }: { readonly square: Square; readonly items: readonly ItemKind[]; readonly fresh: boolean }) {
  const c = at(square);
  return (
    <g transform={`translate(${c.x - 5.6} ${c.y - 3.6})`}>
      {items.map((kind, i) => (
        <g key={i} transform={`translate(0 ${i * 3.6})`}>
          <g className={fresh ? "ue-a ue-in" : undefined} style={vars({ "--d": delay(0.12 * i) })}>
            <g transform="scale(0.8)">
              <HeldBadge kind={kind} />
            </g>
          </g>
        </g>
      ))}
    </g>
  );
}

/** The two layers of one step. `stepMs` is the step's length, so every timing follows it. */
export function ultimateLayers(effects: readonly UltimateEffect[], board: { readonly width: number; readonly height: number }, stepMs: number): { underlay: ReactNode; overlay: ReactNode } {
  if (effects.length === 0) return { underlay: null, overlay: null };
  const style = vars({ "--step": `${stepMs}ms` });
  const under: ReactNode[] = [];
  const over: ReactNode[] = [];
  effects.forEach((effect, i) => {
    switch (effect.kind) {
      case "charge":
        under.push(<ChargeFloor key={i} square={effect.at} />);
        over.push(<ChargeSparks key={i} square={effect.at} />);
        return;
      case "aura":
        under.push(<Aura key={i} square={effect.at} />);
        return;
      case "dash":
        under.push(<DashStreaks key={i} from={effect.from} to={effect.to} />);
        over.push(<DashDust key={i} from={effect.from} />);
        return;
      case "smoke":
        over.push(<Smoke key={i} square={effect.at} fresh={effect.fresh} />);
        return;
      case "splash":
        over.push(<SplashRing key={i} square={effect.at} tanks={effect.tanks} />);
        return;
      case "fullTank":
        over.push(<FullTank key={i} square={effect.at} />);
        return;
      case "freeShot":
        over.push(<FreeShot key={i} square={effect.at} />);
        return;
      case "mudPatch":
        under.push(<MudPatch key={i} square={effect.at} reach={effect.reach} board={board} fresh={false} />);
        return;
      case "mudBomb":
        under.push(<MudPatch key={`patch-${i}`} square={effect.to} reach={effect.reach} board={board} fresh />);
        over.push(<MudBomb key={i} from={effect.from} to={effect.to} reach={effect.reach} />);
        return;
      case "whirlwind":
        under.push(<WhirlwindArea key={i} square={effect.at} reach={effect.reach} width={board.width} height={board.height} />);
        over.push(<Whirlwind key={i} square={effect.at} reach={effect.reach} />);
        return;
      case "bigUmbrella":
        over.push(<BigUmbrella key={i} square={effect.at} facing={effect.facing} fresh={effect.fresh} shooters={effect.shooters} left={effect.left} />);
        return;
      case "magnet":
        under.push(<MagnetField key={i} square={effect.at} />);
        over.push(<MagnetPull key={i} square={effect.at} items={effect.items} />);
        return;
      case "stack":
        over.push(<Stack key={i} square={effect.at} items={effect.items} fresh={effect.fresh} />);
        return;
    }
  });
  return {
    underlay: (
      <g aria-hidden="true" style={style}>
        {under}
      </g>
    ),
    overlay: (
      <g aria-hidden="true" style={style}>
        <style>{EFFECT_CSS}</style>
        {over}
      </g>
    ),
  };
}
