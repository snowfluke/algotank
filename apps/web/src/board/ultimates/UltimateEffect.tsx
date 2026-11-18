// The catalogue and every live board draw ultimates from the same fires (85-ultimates.md).
// The floor lights up first (owner, 2026-11-17). Most effects stay below the tanks, and
// the board always paints the gauges and names last.

import type { CSSProperties } from "react";
import type { PublicBot } from "@game/arena";
import { ULTIMATE_RULES, directionDegreesFromNorth, type BotId, type ItemKind, type SplashSquare, type UltimateFire } from "@game/engine";
import { CELL, cellCenter, shotShape, type ArenaBounds, type Point } from "../boardHelpers.ts";
import { JetShape, Puff, Splash } from "../boardShapes.tsx";
import { DizzyStars, HeldBadge, ItemShape, MudPuddle, MudSplats, OpenUmbrella } from "../itemShapes.tsx";

type Square = UltimateFire["at"];

const GOLD = "var(--color-guide)";
const GOLD_DEEP = "var(--color-guide-deep)";
const WATER = "var(--color-water)";
const SMOKE = "var(--color-panel)";
const SMOKE_EDGE = "var(--color-line-strong)";
const STAR = "M0 -1.1L0.3 -0.3L1.1 0L0.3 0.3L0 1.1L-0.3 0.3L-1.1 0L-0.3 -0.3Z";

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

function ReadyAura() {
  return <circle data-ultimate-ready="" r={6.2} opacity={0.32} style={{ fill: GOLD }} />;
}

/** Dash: dust where the tank left. */
function DashDust({ from }: { readonly from: Square }) {
  const c = at(from);
  return (
    <g>
      {[
        { x: -3, y: -2.5, r: 1.8 },
        { x: -4, y: 1, r: 2.2 },
        { x: -2, y: 3, r: 1.5 },
      ].map((puff, i) => (
        <circle key={i} className="ue-a ue-dust" cx={c.x + puff.x} cy={c.y + puff.y} r={puff.r} opacity={0.5} strokeWidth={0.3} style={{ fill: SMOKE, stroke: SMOKE_EDGE, ...vars({ "--d": delay(0.17 + 0.06 * i) }) }} />
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

function Smoke({ fresh }: { readonly fresh: boolean }) {
  return (
    <g data-ultimate-active="smoke" opacity={0.75}>
      {SMOKE_PUFFS.map((puff, i) => (
        <g key={i} className={`ue-a ${fresh ? "ue-smoke-in" : ""}`} style={vars({ "--d": delay(0.17 + 0.05 * i) })}>
          <circle className="ue-smoke-puff" cx={puff.x} cy={puff.y} r={puff.r} strokeWidth={0.35} style={{ fill: SMOKE, stroke: SMOKE_EDGE }} />
        </g>
      ))}
    </g>
  );
}

/** Full tank: drops of water fly in from all around, and a ring of water closes on the tank. */
function FullTank({ square }: { readonly square: Square }) {
  const c = at(square);
  return (
    <g data-ultimate-refill="">
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dx = Math.cos(angle) * 9;
        const dy = Math.sin(angle) * 9;
        return (
          <g key={i} transform={`translate(${c.x} ${c.y})`}>
            <circle className="ue-suck" r={1.1} strokeWidth={0.25} style={{ fill: WATER, stroke: "var(--color-panel)", ...vars({ "--dx": `${dx.toFixed(2)}px`, "--dy": `${dy.toFixed(2)}px`, "--d": delay(0.17 + 0.04 * i) }) }} />
          </g>
        );
      })}
      <circle className="ue-a ue-halo" cx={c.x} cy={c.y} r={5.9} fill="none" strokeWidth={1.2} opacity={0.8} style={{ stroke: WATER, ...vars({ "--d": delay(0.45) }) }} />
    </g>
  );
}

/** Mud bomb: a mud ball flies over in an arc, bursts on the tank it lands on and flings mud over every square around it. */
function MudBomb({ from, to, area }: { readonly from: Square; readonly to: Square; readonly area: readonly Square[] }) {
  const a = at(from);
  const b = at(to);
  const fling = area.map((cell) => ({ dx: (cell.x - to.x) * CELL, dy: (cell.y - to.y) * CELL }));
  return (
    <g data-ultimate-lob="">
      <g transform={`translate(${b.x} ${b.y})`}>
        {fling.map((drop) => (
          <circle key={`${drop.dx},${drop.dy}`} className="ue-fling" r={1.3} strokeWidth={0.3} style={{ fill: "var(--color-tank-10)", stroke: "var(--color-tank-10-dark)", ...vars({ "--dx": `${drop.dx}px`, "--dy": `${drop.dy}px` }) }} />
        ))}
      </g>
      <g transform={`translate(${a.x} ${a.y})`}>
        <g className="ue-lob-x" style={vars({ "--dx": `${b.x - a.x}px`, "--dy": `${b.y - a.y}px` })}>
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

/** Whirlwind, over the tanks: three arms of wind spin out from the tank to its reach. */
function Whirlwind({ square, reach }: { readonly square: Square; readonly reach: number }) {
  const c = at(square);
  const r = (reach + 0.4) * CELL;
  return (
    <g transform={`translate(${c.x} ${c.y})`} data-ultimate-wind="">
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
          <g key={`${item.from.x},${item.from.y}`} data-ultimate-pull={item.kind} transform={`translate(${p.x} ${p.y})`}>
            <g className="ue-pull" style={vars({ "--dx": `${c.x - p.x}px`, "--dy": `${c.y - p.y}px`, "--d": delay(0.17 + 0.04 * i) })}>
              <ItemShape kind={item.kind} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** The dash can go in any of the eight directions, and can stop without moving. */
function DashPath({ from, path }: { readonly from: Square; readonly path: readonly Square[] }) {
  const end = path.at(-1);
  if (end === undefined) return null;
  const start = at(from);
  const last = at(end);
  const angle = Math.atan2(last.y - start.y, last.x - start.x) * 180 / Math.PI;
  const length = Math.hypot(last.x - start.x, last.y - start.y);
  return (
    <g data-ultimate-path="" transform={`translate(${start.x} ${start.y}) rotate(${angle})`} fill="none" strokeLinecap="round">
      {[-2.6, 0, 2.6].map((y) => (
        <path key={y} className="ue-streak" d={`M0 ${y}H${length}`} pathLength={1} strokeDasharray="0.22 0.09" strokeWidth={y === 0 ? 1.2 : 0.7} style={{ stroke: GOLD_DEEP }} />
      ))}
    </g>
  );
}

/** The ram uses the shot's distance from the path's end, before the target may move again. */
function Ram({ fire, shooter, board }: { readonly fire: Extract<UltimateFire, { kind: "dash" }>; readonly shooter: PublicBot; readonly board: ArenaBounds }) {
  const { shot } = fire;
  if (shot.outcome === "empty" || shot.outcome === "dry") return null;
  const end = fire.path.at(-1) ?? fire.at;
  const shape = shotShape({ ...shooter, ...end }, shot, board);
  if (shape.kind === "dry" || shape.kind === "empty") return null;
  const mark = shape.kind === "hit" ? shape.splash : shape.jet.to;
  return (
    <g className="ue-ram" data-ultimate-ram={shot.outcome} data-ultimate-target={shot.targetId}>
      <path d={`M${shape.jet.from.x} ${shape.jet.from.y}L${shape.jet.to.x} ${shape.jet.to.y}`} strokeWidth={0.9} strokeDasharray="1.6 1" style={{ stroke: GOLD_DEEP }} />
      <g transform={`translate(${mark.x} ${mark.y})`}>
        {shape.kind === "hit" ? (
          <g style={{ fill: GOLD, stroke: GOLD_DEEP }} strokeWidth={0.22}>
            <path d={STAR} transform="scale(3)" />
            <path d={STAR} transform="translate(2 -2.8) scale(1.2)" />
          </g>
        ) : shape.kind === "blocked" ? (
          <g transform={`rotate(${shape.angle}) translate(0 2) scale(0.6)`}><OpenUmbrella /></g>
        ) : <Puff />}
      </g>
    </g>
  );
}

/** Empty, blocked and missed squares have their own marks, even when a tank was in the ring. */
function SplashRing({ from, squares }: { readonly from: Square; readonly squares: readonly SplashSquare[] }) {
  const c = at(from);
  return (
    <g>
      <circle className="ue-a ue-wave" cx={c.x} cy={c.y} r={6} fill="none" strokeWidth={0.8} opacity={0.5} style={{ stroke: WATER }} />
      {squares.map((square) => {
        const end = at(square);
        const dx = square.x - from.x;
        const dy = square.y - from.y;
        const missed = square.outcome === "miss" || square.outcome === "dodged";
        const blocked = square.outcome === "blocked";
        const start = { x: c.x + dx * 3, y: c.y + dy * 3 };
        const stop = blocked ? -4 : missed ? 2.4 : 0;
        const to = { x: end.x + dx * stop, y: end.y + dy * stop };
        const control = { x: (start.x + to.x) / 2, y: (start.y + to.y) / 2 - (missed ? 3 : 0) };
        const angle = Math.atan2(-dx, dy) * 180 / Math.PI;
        return (
          <g key={`${square.x},${square.y}`} data-ultimate-splash={square.outcome} data-ultimate-target={square.targetId}>
            <JetShape jet={{ from: start, control, to }} />
            <g transform={`translate(${to.x} ${to.y})`}>
              <g className="ue-a ue-pop">
                {square.outcome === "hit" ? <Splash /> : blocked ? (
                  <g transform={`rotate(${angle}) translate(0 2) scale(0.55)`}><OpenUmbrella /></g>
                ) : <Puff />}
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
}

function AffectedArea({ area, kind }: { readonly area: readonly Square[]; readonly kind: "mudBomb" | "whirlwind" }) {
  const mud = kind === "mudBomb";
  return (
    <g data-ultimate-area={kind} className={mud ? "ue-a ue-patch" : undefined} opacity={0.5}>
      {area.map(({ x, y }) => (
        <rect key={`${x},${y}`} x={x * CELL + 0.35} y={y * CELL + 0.35} width={CELL - 0.7} height={CELL - 0.7} rx={1.5}
          style={{ fill: mud ? "var(--color-tank-10)" : "var(--color-water-light)" }} />
      ))}
    </g>
  );
}

function CaughtTanks({ kind, affected, bots }: {
  readonly kind: "mudBomb" | "whirlwind";
  readonly affected: readonly BotId[];
  readonly bots: ReadonlyMap<BotId, PublicBot>;
}) {
  return affected.map((id) => {
    const bot = bots.get(id);
    if (bot === undefined) return null;
    const c = at(bot);
    return (
      <g key={id} data-ultimate-caught={id} transform={`translate(${c.x} ${c.y})`}>
        <g className={kind === "mudBomb" ? "ue-a ue-splat" : "ue-a ue-pop"}>
          {kind === "mudBomb" ? <MudPuddle /> : <DizzyStars />}
        </g>
      </g>
    );
  });
}

/** Transient art stays in the square of the fire. Persistent art follows the tank separately. */
export function UltimateFireDrawing({ fire, bots, board, layer }: {
  readonly fire: UltimateFire;
  readonly bots: ReadonlyMap<BotId, PublicBot>;
  readonly board: ArenaBounds;
  readonly layer: "floor" | "over";
}) {
  const floor = layer === "floor";
  const source = bots.get(fire.botId);
  return (
    <g data-ultimate-fire={floor ? fire.kind : undefined} data-ultimate-source={fire.botId}>
      {floor ? <ChargeFloor square={fire.at} /> : <ChargeSparks square={fire.at} />}
      <g className="ue-fire">
        {fire.kind === "dash" && floor ? <><DashPath from={fire.at} path={fire.path} /><DashDust from={fire.at} /></> : null}
        {fire.kind === "splash" && floor ? <SplashRing from={fire.at} squares={fire.squares} /> : null}
        {fire.kind === "fullTank" && floor ? <FullTank square={fire.at} /> : null}
        {fire.kind === "mudBomb" && fire.center !== null ? (floor ? (
          <><AffectedArea kind={fire.kind} area={fire.area} /><CaughtTanks kind={fire.kind} affected={fire.affected} bots={bots} /></>
        ) : <MudBomb from={fire.at} to={fire.center} area={fire.area} />) : null}
        {fire.kind === "whirlwind" && floor ? (
          <><AffectedArea kind={fire.kind} area={fire.area} /><Whirlwind square={fire.at} reach={ULTIMATE_RULES.whirlwind.reach} /><CaughtTanks kind={fire.kind} affected={fire.affected} bots={bots} /></>
        ) : null}
        {fire.kind === "magnet" && fire.items.length > 0 ? (
          floor ? <MagnetField square={fire.at} /> : <MagnetPull square={fire.at} items={fire.items} />
        ) : null}
      </g>
      {fire.kind === "dash" && !floor && source !== undefined ? <Ram fire={fire} shooter={source} board={board} /> : null}
    </g>
  );
}

/** The arc spans the front and both sides (owner, 2026-11-18). The dome and smoke sit below the hull. */
export function TankUltimateFloor({ bot, fire, motion }: { readonly bot: PublicBot; readonly fire: UltimateFire | undefined; readonly motion: string }) {
  const active = bot.ultimateEffect?.kind;
  const smoke = active === "smoke" || fire?.kind === "smoke";
  const umbrella = active === "bigUmbrella" || fire?.kind === "bigUmbrella";
  const ready = bot.ultimate?.kind === "ready";
  if (!smoke && !umbrella && !ready) return null;
  const c = at(bot);
  return (
    <g className={motion} style={{ transform: `translate(${c.x}px, ${c.y}px)` }} data-ultimate-tank={bot.id}>
      {ready ? <ReadyAura /> : null}
      {smoke ? <Smoke key={fire?.kind === "smoke" ? "fresh" : "active"} fresh={fire?.kind === "smoke"} /> : null}
      {umbrella ? (
        <g data-ultimate-active="bigUmbrella" transform={`rotate(${directionDegreesFromNorth(bot.direction)})`}>
          <g className={fire?.kind === "bigUmbrella" ? "ue-a ue-open" : undefined}>
            <path d="M-5.9 0 A5.9 5.9 0 0 1 5.9 0" fill="none" strokeWidth={1.2} style={{ stroke: "var(--color-tank-5)" }} />
            <g transform="translate(0 -4) scale(1.15)" opacity={0.85}><OpenUmbrella /></g>
          </g>
        </g>
      ) : null}
    </g>
  );
}

export function UltimateBadges({ bot, pulled }: { readonly bot: PublicBot; readonly pulled: number }) {
  const waiting = bot.itemsWaiting;
  // Magnet adds to the end of the hand (85-ultimates.md), so old badges stay visible during a pull.
  const firstNew = (waiting?.length ?? 0) - pulled;
  return (
    <>
      {bot.ultimateEffect?.kind === "bigUmbrella" ? (
        <g transform="translate(3.5 -3.4)" data-ultimate-blocks={bot.ultimateEffect.blocksLeft}>
          <circle r={1.9} strokeWidth={0.35} style={{ fill: "var(--color-panel)", stroke: "var(--color-tank-5-dark)" }} />
          <text y={1} textAnchor="middle" fontSize={2.9} fontWeight={700} style={{ fill: "var(--color-ink)", fontFamily: "var(--font-display)" }}>
            {bot.ultimateEffect.blocksLeft}
          </text>
        </g>
      ) : null}
      {waiting === undefined ? null : (
        <g data-ultimate-stack="">
          {waiting.map((kind, index) => kind === undefined ? null : (
            <g key={index} className={index >= firstNew ? "ue-held" : undefined} data-waiting-item={kind} transform={`translate(-3.7 ${-0.2 + index * 2.8}) scale(0.56)`}>
              <HeldBadge kind={kind} />
            </g>
          ))}
        </g>
      )}
    </>
  );
}
