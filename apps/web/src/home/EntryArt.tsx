// The small drawings on the five home cards, made of tanks on a patch of arena
// floor so each card shows the game and not a stock icon. Decorative: the card's
// title names the choice. The public arenas' tiles (publicplay/ArenaArt.tsx) draw
// with the same tile and tank.

import type { ReactNode } from "react";
import { ItemShape } from "../board/itemShapes.tsx";
import { TankShape } from "../tank/TankShape.tsx";
import type { TankColour } from "../tank/colours.ts";

export function Tile({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="block size-full">
      <rect width={64} height={64} rx={14} style={{ fill: "var(--color-arena-floor)" }} />
      {children}
    </svg>
  );
}

interface PlacedTank {
  readonly colour: TankColour;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly scale: number;
  readonly self?: boolean;
}

export function Tank({ colour, x, y, angle, scale, self = false }: PlacedTank) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <TankShape colour={colour} angle={angle} self={self} detail="full" />
    </g>
  );
}

/** Your tank squirts at another while a third watches. */
export function PlayNowArt() {
  return (
    <Tile>
      <path d="M 26 39 Q 36 33 43 27" fill="none" strokeWidth={2.6} strokeLinecap="round" style={{ stroke: "var(--color-water)" }} />
      <Tank colour={2} x={47} y={22} angle={150} scale={1.5} />
      <Tank colour={3} x={47} y={49} angle={200} scale={1.3} />
      <Tank colour={1} x={18} y={42} angle={-35} scale={1.6} self />
    </Tile>
  );
}

/** A tank rolls toward an open square that waits for it. */
export function JoinArt() {
  return (
    <Tile>
      <rect x={39} y={21} width={20} height={20} rx={5} fill="none" strokeWidth={2} strokeDasharray="4 3" style={{ stroke: "var(--color-water)" }} />
      <g strokeWidth={2} strokeLinecap="round" style={{ stroke: "var(--color-line-strong)" }}>
        <line x1={4} y1={26} x2={10} y2={26} />
        <line x1={2} y1={31} x2={9} y2={31} />
        <line x1={4} y1={36} x2={10} y2={36} />
      </g>
      <Tank colour={4} x={23} y={31} angle={0} scale={1.75} />
    </Tile>
  );
}

/** Four friends' tanks face each other. */
export function PrivateArenaArt() {
  return (
    <Tile>
      <Tank colour={1} x={18} y={18} angle={45} scale={1.55} self />
      <Tank colour={6} x={46} y={18} angle={135} scale={1.55} />
      <Tank colour={5} x={18} y={46} angle={-45} scale={1.55} />
      <Tank colour={3} x={46} y={46} angle={-135} scale={1.55} />
    </Tile>
  );
}

/** A big screen on a stand, with tanks on it. */
export function PresenterArenaArt() {
  return (
    <Tile>
      <rect x={7} y={8} width={50} height={34} rx={4} style={{ fill: "var(--color-ink)" }} />
      <rect x={10} y={11} width={44} height={28} rx={2} style={{ fill: "var(--color-arena-floor)" }} />
      <Tank colour={2} x={20} y={19} angle={20} scale={0.8} />
      <Tank colour={4} x={42} y={20} angle={160} scale={0.8} />
      <Tank colour={5} x={24} y={31} angle={-20} scale={0.8} />
      <Tank colour={7} x={43} y={32} angle={200} scale={0.8} />
      <rect x={29} y={42} width={6} height={8} style={{ fill: "var(--color-ink)" }} />
      <rect x={19} y={50} width={26} height={4} rx={2} style={{ fill: "var(--color-ink)" }} />
    </Tile>
  );
}

/** A tank on a small stand in the workshop, with a second one waiting beside it. */
export function WorkshopArt() {
  return (
    <Tile>
      <rect x={10} y={40} width={30} height={6} rx={3} style={{ fill: "var(--color-line-strong)" }} />
      <rect x={14} y={46} width={4} height={9} rx={1} style={{ fill: "var(--color-line-strong)" }} />
      <rect x={32} y={46} width={4} height={9} rx={1} style={{ fill: "var(--color-line-strong)" }} />
      <Tank colour={5} x={25} y={28} angle={-90} scale={1.7} self />
      <Tank colour={4} x={50} y={42} angle={-120} scale={1.2} />
    </Tile>
  );
}

/** The catalogue: a tank among the four items it can meet. */
export function CatalogueArt() {
  return (
    <Tile>
      <g transform="translate(14 14) scale(2.2)">
        <ItemShape kind="bucket" />
      </g>
      <g transform="translate(50 14) scale(2.2)">
        <ItemShape kind="umbrella" />
      </g>
      <g transform="translate(14 50) scale(2.2)">
        <ItemShape kind="pinwheel" />
      </g>
      <g transform="translate(50 50) scale(2.2)">
        <ItemShape kind="mudBall" />
      </g>
      <Tank colour={3} x={32} y={32} angle={-30} scale={1.45} self />
    </Tile>
  );
}
