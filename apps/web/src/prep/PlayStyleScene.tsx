// A small arena scene for each play style that acts the style out in a loop of 3.2 s
// (71-workshop-appeal.md, part A), so a child who sees only the drawing can tell two
// styles apart:
// | Style          | The loop                                                                  |
// |----------------|---------------------------------------------------------------------------|
// | Evader         | a tank aims at you (dashed red line); you step out of it, then shoot a tank that looks away |
// | Leader chaser  | you drive past a near tank to the tank with the star, and shoot it         |
// | Dry hunter     | you drive past a full tank to the tank whose gauge blinks empty, and shoot |
// | Ambusher       | you back away, your gauge fills, you run at the nearest tank and shoot from one square |
// | Picker         | the same refill, then you run past the full tank to the dry one           |
// | Sneak          | the same refill, then you creep round behind a tank that faces away        |
// | Charger        | you drive straight at the tank ahead, shooting all the way                |
// | Wanderer       | you turn and roll about; when a tank happens to be in front, you shoot     |
//
// The markup is the still frame (the moment of the shot), as the scenes were before they
// moved. Motion is added only to the one scene marked `live` (the card under the pointer
// or focus, the chosen one, or the carousel's slide) and only under
// prefers-reduced-motion: no-preference, so reduced motion and every other card show the
// still frame. Decorative: the card's name and sentence say the same in words.
//
// Avoid the characters & < > and quotes in the CSS text: React escapes them inside a
// style element, and the escaped text is not valid CSS.

import type { ReactElement } from "react";
import type { PresetId } from "@game/engine";
import { TankShape } from "../tank/TankShape.tsx";
import type { TankColour } from "../tank/colours.ts";
import type { TankLook } from "../tank/look.ts";
import { centre, Floor, Gauge, Jet, otherColours, Splash } from "./sceneParts.tsx";

const COLS = 5;
const ROWS = 3;
const TANK_SCALE = 0.8;
const SCENE_LOOP_MS = 3200;

const SCENE_CSS = `
.ps-anim { transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: no-preference) {
  .ps-live .ps-move, .ps-live .ps-jet, .ps-live .ps-splash, .ps-live .ps-hit, .ps-live .ps-fill, .ps-live .ps-blink, .ps-live .ps-aim, .ps-live .ps-trail {
    animation-duration: ${SCENE_LOOP_MS}ms; animation-iteration-count: infinite; animation-fill-mode: both; animation-timing-function: ease-in-out;
    animation-delay: var(--phase, 0ms);
  }
  .ps-live .ps-jet { animation-name: ps-jet; animation-timing-function: linear; }
  .ps-live .ps-splash { animation-name: ps-splash; animation-timing-function: ease-out; }
  .ps-live .ps-hit { animation-name: ps-hit; }
  .ps-live .ps-fill { animation-name: ps-fill; }
  .ps-live .ps-blink { animation-name: ps-blink; animation-duration: 800ms; }
  .ps-live .ps-aim { animation-name: ps-aim; }
  .ps-live .ps-trail { animation-name: ps-trail; }
  .ps-live .ps-evader { animation-name: ps-evader; }
  .ps-live .ps-chaser { animation-name: ps-chaser; }
  .ps-live .ps-hunter { animation-name: ps-hunter; }
  .ps-live .ps-ambusher { animation-name: ps-ambusher; }
  .ps-live .ps-picker { animation-name: ps-picker; }
  .ps-live .ps-sneak { animation-name: ps-sneak; }
  .ps-live .ps-charger { animation-name: ps-charger; animation-timing-function: linear; }
  .ps-live .ps-charger-jet { animation-name: ps-charger-jet; }
  .ps-live .ps-wander { animation-name: ps-wander; }
  .ps-live .ps-wander-turn { animation-name: ps-wander-turn; }
}
@keyframes ps-jet { 0%, 44% { opacity: 0; stroke-dashoffset: var(--len); } 46% { opacity: 1; } 54% { opacity: 1; stroke-dashoffset: 0; } 64% { opacity: 1; } 72%, 100% { opacity: 0; stroke-dashoffset: 0; } }
@keyframes ps-splash { 0%, 52% { opacity: 0; transform: scale(0.3); } 58% { opacity: 1; transform: scale(1); } 74%, 100% { opacity: 0; transform: scale(1.35); } }
@keyframes ps-hit { 0%, 53% { transform: none; } 57% { transform: rotate(-10deg); } 62% { transform: rotate(7deg); } 68%, 100% { transform: none; } }
@keyframes ps-fill { 0%, 22% { transform: scaleX(0.15); } 52% { transform: scaleX(1); } 78% { transform: scaleX(1); } 86%, 100% { transform: scaleX(0.4); } }
@keyframes ps-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes ps-aim { 0%, 30% { opacity: 1; } 42%, 100% { opacity: 0; } }
@keyframes ps-trail { 0%, 30% { opacity: 0; } 40%, 70% { opacity: 1; } 80%, 100% { opacity: 0; } }
@keyframes ps-evader { 0%, 22% { transform: translate(0, 10px); } 38%, 90% { transform: none; } 100% { transform: translate(0, 10px); } }
@keyframes ps-chaser { 0% { transform: translate(-30px, 10px); } 15% { transform: translate(-20px, 10px); } 30% { transform: translate(-10px, 3px); } 42%, 88% { transform: none; } 100% { transform: translate(-30px, 10px); } }
@keyframes ps-hunter { 0% { transform: translate(-30px, -10px); } 20% { transform: translate(-20px, -10px); } 42%, 88% { transform: none; } 100% { transform: translate(-30px, -10px); } }
@keyframes ps-ambusher { 0% { transform: none; } 22%, 52% { transform: translate(-20px, 0); } 64%, 92% { transform: none; } 100% { transform: none; } }
@keyframes ps-picker { 0% { transform: translate(-20px, -10px); } 12%, 52% { transform: translate(-30px, -10px); } 60% { transform: translate(-15px, -5px); } 68%, 92% { transform: none; } 100% { transform: translate(-20px, -10px); } }
@keyframes ps-sneak { 0%, 8% { transform: translate(-10px, 0); } 20%, 48% { transform: translate(-20px, 0); } 56% { transform: translate(-20px, -10px); } 62% { transform: translate(-10px, -10px); } 70%, 92% { transform: none; } 100% { transform: translate(-10px, 0); } }
@keyframes ps-charger { 0% { transform: translate(-20px, 0); } 70%, 90% { transform: none; } 100% { transform: translate(-20px, 0); } }
@keyframes ps-charger-jet { 0%, 8% { opacity: 0; } 12%, 20% { opacity: 1; } 26%, 36% { opacity: 0; } 40%, 48% { opacity: 1; } 54%, 64% { opacity: 0; } 68%, 82% { opacity: 1; } 88%, 100% { opacity: 0; } }
@keyframes ps-wander { 0% { transform: translate(-10px, 10px); } 14% { transform: translate(-10px, 0); } 26% { transform: translate(-10px, -10px); } 38%, 44% { transform: translate(0, -10px); } 50%, 84% { transform: none; } 100% { transform: translate(-10px, 10px); } }
@keyframes ps-wander-turn { 0%, 8% { transform: rotate(-90deg); } 18%, 30% { transform: rotate(-90deg); } 34%, 40% { transform: rotate(0deg); } 46% { transform: rotate(90deg); } 52%, 84% { transform: rotate(0deg); } 92% { transform: rotate(90deg); } 100% { transform: rotate(-90deg); } }
`;

const at = (x: number, y: number) => `translate(${centre(x)} ${centre(y)}) scale(${TANK_SCALE})`;

/** A tank of the scene. `move` is the class of the group that carries its loop; `hit` makes it wobble when the shot lands. */
function Tank(props: { readonly x: number; readonly y: number; readonly angle: number; readonly look?: TankLook; readonly colour?: TankColour; readonly move?: string; readonly turn?: string; readonly hit?: boolean; readonly phase?: number }) {
  const style = props.phase === undefined ? undefined : { ["--phase" as string]: `${props.phase}ms` };
  const shape = props.look !== undefined ? <TankShape look={props.look} angle={props.angle} self detail="simple" /> : <TankShape colour={props.colour ?? 2} angle={props.angle} detail="simple" />;
  return (
    <g transform={at(props.x, props.y)}>
      <g className={props.move === undefined ? undefined : `ps-anim ps-move ${props.move}`}>
        <g className={props.hit === true ? "ps-anim ps-hit" : props.turn === undefined ? undefined : `ps-anim ps-move ${props.turn}`} style={style}>
          {shape}
        </g>
      </g>
    </g>
  );
}

function Shot({ from, to, phase }: { readonly from: readonly [number, number]; readonly to: readonly [number, number]; readonly phase?: number }) {
  const style = phase === undefined ? undefined : { ["--phase" as string]: `${phase}ms` };
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const [x1, y1] = [centre(from[0]) + ux * 4.5, centre(from[1]) + uy * 4.5];
  const [x2, y2] = [centre(to[0]) - ux * 3.5, centre(to[1]) - uy * 3.5];
  return (
    <g style={style}>
      <Jet x1={x1} y1={y1} x2={x2} y2={y2} className="ps-jet" />
      <Splash x={centre(to[0])} y={centre(to[1])} className="ps-anim ps-splash" scale={0.8} />
    </g>
  );
}

/** A water gauge under a tank of the scene: 0 to 1 full. `fill` animates it filling; `blink` makes an almost empty one blink. */
function TankGauge({ x, y, water, move, fill, blink }: { readonly x: number; readonly y: number; readonly water: number; readonly move?: string; readonly fill?: boolean; readonly blink?: boolean }) {
  return (
    <g transform={`translate(${centre(x)} ${centre(y)})`}>
      <g className={move === undefined ? undefined : `ps-anim ps-move ${move}`}>
        <g className={blink === true ? "ps-blink" : undefined}>
          {/* Under the tank, or above it on the bottom row, so it stays inside the drawing. */}
          <Gauge x={0} y={y === ROWS - 1 ? -6.2 : 4.4} water={water} {...(fill === true ? { fillClassName: "ps-fill" } : {})} />
        </g>
      </g>
    </g>
  );
}

function Star({ x, y }: { readonly x: number; readonly y: number }) {
  const cx = centre(x) + 4;
  const cy = centre(y) - 4;
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? 2.6 : 1.1;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return <polygon points={points} style={{ fill: "var(--color-tank-3)", stroke: "var(--color-tank-outline)", strokeWidth: 0.4, strokeLinejoin: "round" }} />;
}

/** The shot of a sneak, a refill, an ambush: later in the loop, after the refill. */
const LATE_SHOT_MS = 800;

function scene(style: PresetId, look: TankLook): ReactElement {
  const [a, b] = otherColours(look);
  switch (style) {
    case "evader":
      return (
        <>
          {/* The tank on the right aims along the row where you stood. */}
          <line x1={centre(4) - 4} y1={centre(1)} x2={centre(1) - 4} y2={centre(1)} className="ps-aim" strokeWidth={0.9} strokeDasharray="1.6 1.4" style={{ stroke: "var(--color-hit)" }} />
          <Tank x={4} y={1} angle={180} colour={a ?? 2} />
          <Tank x={4} y={0} angle={90} colour={b ?? 4} hit />
          <Shot from={[1, 0]} to={[4, 0]} />
          <Tank x={1} y={0} angle={0} look={look} move="ps-evader" />
        </>
      );
    case "leader-chaser":
      return (
        <>
          <Tank x={1} y={0} angle={45} colour={b ?? 4} />
          <Tank x={4} y={1} angle={180} colour={a ?? 2} hit />
          <Star x={4} y={1} />
          <Shot from={[3, 1]} to={[4, 1]} />
          <Tank x={3} y={1} angle={-20} look={look} move="ps-chaser" />
        </>
      );
    case "dry-hunter":
      return (
        <>
          <Tank x={2} y={0} angle={180} colour={b ?? 4} />
          <TankGauge x={2} y={0} water={1} />
          <Tank x={4} y={2} angle={180} colour={a ?? 2} hit />
          <TankGauge x={4} y={2} water={0.12} blink />
          <Shot from={[3, 2]} to={[4, 2]} />
          <Tank x={3} y={2} angle={0} look={look} move="ps-hunter" />
          <TankGauge x={3} y={2} water={0.8} move="ps-hunter" />
        </>
      );
    case "ambusher":
      return (
        <>
          <Tank x={3} y={1} angle={180} colour={a ?? 2} hit phase={LATE_SHOT_MS} />
          <Shot from={[2, 1]} to={[3, 1]} phase={LATE_SHOT_MS} />
          <Tank x={2} y={1} angle={0} look={look} move="ps-ambusher" />
          <TankGauge x={2} y={1} water={1} move="ps-ambusher" fill />
        </>
      );
    case "picker":
      return (
        <>
          <Tank x={2} y={0} angle={180} colour={b ?? 4} />
          <TankGauge x={2} y={0} water={1} />
          <Tank x={4} y={2} angle={180} colour={a ?? 2} hit phase={LATE_SHOT_MS} />
          <TankGauge x={4} y={2} water={0.15} />
          <Shot from={[3, 2]} to={[4, 2]} phase={LATE_SHOT_MS} />
          <Tank x={3} y={2} angle={0} look={look} move="ps-picker" />
          <TankGauge x={3} y={2} water={1} move="ps-picker" fill />
        </>
      );
    case "backstabber":
      return (
        <>
          {/* The way round: over the row, then down behind the tank that faces away. */}
          <polyline points={`${centre(1)},${centre(1)} ${centre(1)},${centre(0)} ${centre(2)},${centre(0)} ${centre(2)},${centre(1) - 3}`} className="ps-trail" fill="none" strokeWidth={0.9} strokeDasharray="1.4 1.4" strokeLinecap="round" style={{ stroke: "var(--color-muted)" }} />
          <Tank x={3} y={1} angle={0} colour={a ?? 2} hit phase={LATE_SHOT_MS} />
          <Tank x={4} y={2} angle={180} colour={b ?? 4} />
          <Shot from={[2, 1]} to={[3, 1]} phase={LATE_SHOT_MS} />
          <Tank x={2} y={1} angle={0} look={look} move="ps-sneak" />
          <TankGauge x={2} y={1} water={1} move="ps-sneak" fill />
        </>
      );
    case "charger":
      return (
        <>
          <Tank x={4} y={1} angle={180} colour={a ?? 2} />
          <g className="ps-charger-jet ps-move">
            <g className="ps-anim ps-move ps-charger">
              <Jet x1={centre(2) + 4.5} y1={centre(1)} x2={centre(4) - 4} y2={centre(1)} />
            </g>
          </g>
          <Tank x={2} y={1} angle={0} look={look} move="ps-charger" />
        </>
      );
    case "random-walker":
      return (
        <>
          {/* Where it rolled about. */}
          <polyline points={`${centre(1)},${centre(2)} ${centre(1)},${centre(0)} ${centre(2)},${centre(0)} ${centre(2)},${centre(1)}`} fill="none" strokeWidth={0.8} strokeDasharray="1.2 1.6" strokeLinecap="round" style={{ stroke: "var(--color-muted)" }} />
          <Tank x={4} y={1} angle={180} colour={a ?? 2} hit phase={600} />
          <Shot from={[2, 1]} to={[4, 1]} phase={600} />
          <Tank x={2} y={1} angle={0} look={look} move="ps-wander" turn="ps-wander-turn" />
        </>
      );
  }
}

/** `live` makes this the one scene that moves. `fill` lets the drawing take the box it is given, keeping its shape. */
export function PlayStyleScene({ style, look, live = false, fill = false }: { readonly style: PresetId; readonly look: TankLook; readonly live?: boolean; readonly fill?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${COLS * 10} ${ROWS * 10}`}
      {...(fill ? {} : { width: 100, height: 60 })}
      aria-hidden="true"
      data-scene={style}
      data-scene-live={live ? "" : undefined}
      className={`${fill ? "block size-full min-h-0" : "block shrink-0"} ${live ? "ps-live" : ""}`}
    >
      <style>{SCENE_CSS}</style>
      <Floor cols={COLS} rows={ROWS} />
      {scene(style, look)}
    </svg>
  );
}
