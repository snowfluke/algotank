// The arena: a floor inside a wall, whose ground follows the round's condition
// (arenaGround.ts: sand, dry clay, meadow, stone courtyard, firing range, wet sand), one toy tank per player, and the shots
// of the turn as water jets. A hit splashes the target, shakes it and pops a "+1"
// over the shooter; a miss is a lob that lands in a puff past the target; a dry
// shot is three drops at the nozzle. Every effect is keyed by the turn, so it plays
// once and returns to rest. The gauge under each tank is drawn last, so no effect
// ever covers it.
//
// Items (docs/specs/revamp/84-items.md, itemShapes.tsx) lie on the floor under the jets
// and tanks. A tank shows the item it holds on a white disc at its top-left corner, mud
// under and on its treads while it is stuck, and stars around it while it is dizzy. A
// blocked throw opens the target's umbrella toward the jet, with no "+1" and no wobble,
// and a hit with a bucket pops "+2". In a crowd only the viewer's tank shows these marks.
//
// A hover or a tap on a tank shows its name in a pill over it for a moment (tankPeek.ts).
// A tank's flag (tank/TankFlag.tsx) turns with its hull; a crowd leaves the flags out.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { memo, useEffect, useId, useMemo, useRef } from "react";
import type { PublicBot } from "@game/arena";
import { canThrow, rulesOf } from "@game/engine";
import type { BotId, RuleSetId, ThrowEvent } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { duckMusicUnder } from "../sound/music.ts";
import { playSound } from "../sound/player.ts";
import { plainTankLook, type TankLook } from "../tank/look.ts";
import { TankHatch, TankPlate, TankShape, TURRET_X, hatchContent } from "../tank/TankShape.tsx";
import { Countdown } from "../ui/Countdown.tsx";
import { ARENA_MOTION_CSS } from "./arenaMotion.ts";
import { botLabels } from "./botLabels.ts";
import { ARENA_GROUNDS, groundMarksPath, marksFilled } from "./arenaGround.ts";
import { CULL_MARGIN, inWindow } from "./camera.ts";
import { nextTrail, stepAngle, TRAIL_OPACITY, type TrailState } from "./tankTrail.ts";
import {
  CELL,
  TANK_LIFT,
  TANK_SCALE,
  boardDetail,
  cellCenter,
  directionDegrees,
  displayName,
  gridLinePath,
  leaderId,
  shotShape,
  tankCenter,
  tankLooks,
  unwrapAngle,
  youMarkerBelow,
} from "./boardHelpers.ts";
import type { ShotShape } from "./boardHelpers.ts";
import { Crown, DryDrops, JetShape, Puff, Splash } from "./boardShapes.tsx";
import { DizzyStars, HeldBadge, ItemShape, MudPuddle, MudSplats, OpenUmbrella } from "./itemShapes.tsx";
import type { ArenaBoardProps } from "./props.ts";
import { countdownSound, playsTurnSounds, turnSounds } from "./turnSounds.ts";
import { botAtPoint, nameTagSpot, useTankPeek, type BoardView } from "./tankPeek.ts";
import { useCellPixels } from "./useCellPixels.ts";
import { WaterGauge } from "./WaterGauge.tsx";

/**
 * Opacity of a tank the zoomed view does not follow: a little dimmer, and brighter than a fading
 * item (0.6). At 0.7 the floor's marks showed through a tank.
 */
const DIM_OPACITY = 0.8;

/**
 * Each trail tank's trail, moved on once per turn: a render for another reason (the camera, a poll) keeps it.
 * A board turned to the other orientation is a new board (MonthlyBoard.tsx), so its trails start again.
 */
function useTrails(bots: readonly PublicBot[], tick: number, trailIds: ReadonlySet<BotId> | undefined): ReadonlyMap<BotId, TrailState> {
  const state = useRef<{ tick: number; trails: ReadonlyMap<BotId, TrailState> }>({ tick: -1, trails: new Map() });
  if (trailIds === undefined || trailIds.size === 0) return NO_TRAILS;
  if (state.current.tick !== tick) {
    const next = new Map<BotId, TrailState>();
    for (const id of trailIds) {
      const bot = bots.find((b) => b.id === id);
      if (bot !== undefined) next.set(id, nextTrail(state.current.trails.get(id), { x: bot.x, y: bot.y }));
    }
    state.current = { tick, trails: next };
  }
  return state.current.trails;
}

const NO_TRAILS: ReadonlyMap<BotId, TrailState> = new Map();

/** Thickness of the wall around the floor, in board units (a square is 10). */
export const WALL = 3;
/** Effects last about one turn, but never so short that a fast replay shows only a flicker, nor so long that a slow one lingers. */
export const FX_MIN_MS = 260;
export const FX_MAX_MS = 900;
/** Smallest on-screen size of the "+1" and the "You" marker, in CSS pixels, so they stay readable at 64 tanks. */
const PLUS_MIN_PX = 11;
/** Where squares are too small for labels, the viewer's own tank is drawn this much larger, so it is found at once. */
const SMALL_SELF_GROW = 1.5;
/** The plate fills this share of its square, so plates on neighbouring squares stay apart. */
const PLATE_SCALE = 0.88;
/** In a crowd (a big arena seen whole) the viewer's tank is drawn at least this many CSS px wide, so it is found at once. */
const CROWD_SELF_MIN_PX = 20;
const YOU_MIN_PX = 15;
/** Smallest on-screen size of a tank's name on a hover or a tap, in CSS pixels. */
const NAME_MIN_PX = 14;
/** An item blinks in its last turns on the board, so a viewer sees that it is about to go. */
const ITEM_FADE_TURNS = 5;
/** Where the disc of a held item sits on the tank's square, and its size. */
const BADGE_AT = { x: -3.5, y: -3.3 } as const;
const BADGE_SCALE = 0.85;
/** The open umbrella of a blocked throw is drawn at this share of its size, so it covers only the front of the tank. */
const UMBRELLA_SCALE = 0.75;

const FALLBACK_LOOK: TankLook = plainTankLook(1);

/** The key of a crowd drawing: the hull colour and the plate, the only parts the tiny level shows. */
function paintKey(look: TankLook): string {
  return `${look.colour}-${look.plate ?? 0}`;
}

/** The hull and plate pairs in the round, one per key. */
function crowdPaints(bots: readonly PublicBot[], looks: ReadonlyMap<BotId, TankLook>): { key: string; look: TankLook }[] {
  const paints = new Map<string, TankLook>();
  for (const bot of bots) {
    const look = looks.get(bot.id) ?? FALLBACK_LOOK;
    const key = paintKey(look);
    if (!paints.has(key)) paints.set(key, look);
  }
  return [...paints].map(([key, look]) => ({ key, look }));
}

/**
 * Keeps one unwrapped angle per tank so a turn from west to north takes the short
 * way round. The write during render is repeatable: a second render of the same
 * snapshot reads the stored angle and computes the same value.
 */
function useTurnAngles(bots: readonly PublicBot[]): ReadonlyMap<BotId, number> {
  const stored = useRef(new Map<BotId, number>());
  for (const bot of bots) {
    const target = directionDegrees(bot.direction);
    const previous = stored.current.get(bot.id);
    stored.current.set(bot.id, previous === undefined ? target : unwrapAngle(previous, target));
  }
  return stored.current;
}

/** Plays the turn's sounds when a live board moves on by exactly one turn, and the countdown's beeps. `ownId` is the viewer's tank, whose events alone make sound. */
function useBoardSounds(tick: number, throws: readonly ThrowEvent[], ownId: BotId | null, paused: boolean, countdown: number | null): void {
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    const previous = lastTick.current;
    // A new throws array for the same turn (a parent render) must not play the turn twice.
    if (previous === tick) return;
    lastTick.current = tick;
    if (paused || !playsTurnSounds(previous, tick)) return;
    for (const sound of turnSounds(throws, ownId)) {
      // The music dips under the viewer's own tank's sounds; a viewer without a tank hears every tank, so no dip there.
      if (playSound(sound) && ownId !== null) duckMusicUnder(sound);
    }
  }, [tick, throws, ownId, paused]);

  const lastCountdown = useRef<number | null>(null);
  useEffect(() => {
    const sound = countdownSound(lastCountdown.current, countdown);
    lastCountdown.current = countdown;
    if (sound !== null) playSound(sound);
  }, [countdown]);
}

/** The viewer's tank in a crowd: half again as large as the others, and never under CROWD_SELF_MIN_PX on screen. */
function selfCrowdScale(cellPx: number | null): number {
  const grown = TANK_SCALE * SMALL_SELF_GROW;
  return cellPx === null || cellPx <= 0 ? grown : Math.max(grown, CROWD_SELF_MIN_PX / cellPx);
}

/** On-screen size in board units for text that must be at least `minPx` CSS pixels. */
function readableSize(base: number, minPx: number, cellPx: number | null): number {
  return cellPx === null || cellPx <= 0 ? base : Math.max(base, (minPx * CELL) / cellPx);
}

/**
 * Memoised: a parent that renders for another reason (the ranking's poll, a notice) leaves the board alone. A turn gives
 * a new snapshot, so each turn still renders it, and a new `camera` object (a followed window) renders it too.
 */
export const ArenaBoard = memo(function ArenaBoard({ snapshot, throws, names, highlightId, tickMs, tanks, countdown = null, paused = false, camera = null, focusId = null, trailIds, onTankTap, underlay, overlay }: ArenaBoardProps) {
  // The zoomed view's other tanks, a little dimmer than the followed tank and the viewer's own (props.ts, focusId).
  const dimmed = (id: BotId) => focusId !== null && id !== focusId && id !== highlightId;
  const m = useMessages();
  // The water a tank holds and the cost of a shot differ between rule sets, so the board reads the set of the snapshot.
  const rules = rulesOf(snapshot);
  const { width, height, bots, tick } = snapshot;
  const angles = useTurnAngles(bots);
  const trails = useTrails(bots, tick, trailIds);
  const labels = useMemo(() => botLabels(names), [names]);
  const looks = tankLooks(bots, tanks);
  const spanX = camera === null ? width + (2 * WALL) / CELL : camera.width;
  const spanY = camera === null ? height + (2 * WALL) / CELL : camera.height;
  const { ref, cellPx } = useCellPixels(spanX, spanY);
  const detail = boardDetail(cellPx);
  const counting = countdown !== null && countdown > 0;
  useBoardSounds(tick, throws, highlightId, paused, countdown);
  // A crowd: squares too small for a label (a big arena seen whole, up to 512 tanks). Every other tank is then
  // one <use> of a shared drawing in one gliding group, without a title, and only the effects that read at that
  // size play: the jets of hits and misses and the splash. The viewer's tank keeps everything.
  const crowd = !detail.labels;
  const symbolBase = useId().replace(/:/g, "");
  // One shared drawing per hull and plate pair that is in the round (at most 12 x 13), not per tank.
  const crowdSymbols = crowd ? crowdPaints(bots, looks) : [];

  const botsById = new Map(bots.map((bot) => [bot.id, bot]));
  const leader = leaderId(bots);
  // A board in a hidden tab (an empty box, cellPx 0) stays mounted for its sounds but draws no tanks, so 512
  // tanks cost nothing while the viewer reads the ranking. A window draws only the tanks in it and near it
  // (board/camera.ts); the whole arena draws every tank.
  const hidden = cellPx === 0;
  const drawn = hidden ? [] : camera === null ? bots : bots.filter((bot) => inWindow(camera, bot.x, bot.y, CULL_MARGIN));
  const drawnIds = camera === null && !hidden ? null : new Set(drawn.map((bot) => bot.id));
  const drawnItems = hidden ? [] : camera === null ? snapshot.items : snapshot.items.filter((item) => inWindow(camera, item.x, item.y, CULL_MARGIN));
  // SVG has no z-index, so the highlighted tank is drawn last to stay on top.
  const drawOrder = [...drawn.filter((bot) => bot.id !== highlightId), ...drawn.filter((bot) => bot.id === highlightId)];

  const shots: { id: BotId; shape: ShotShape }[] = [];
  const hitTargets = new Set<BotId>();
  const shooters = new Set<BotId>();
  for (const event of throws) {
    // An unknown shooter cannot happen in a snapshot from the engine; skipping keeps the screen alive.
    const shooter = botsById.get(event.throwerId);
    if (shooter === undefined || hidden || (drawnIds !== null && !drawnIds.has(shooter.id))) continue;
    if (crowd && shooter.id !== highlightId && (event.outcome === "dry" || event.outcome === "empty")) continue;
    shots.push({ id: event.throwerId, shape: shotShape(shooter, event, snapshot) });
    if (event.outcome === "hit") hitTargets.add(event.targetId);
    if (event.outcome !== "dry") shooters.add(event.throwerId);
  }

  const ownBot = highlightId === null ? undefined : botsById.get(highlightId);
  // Where the viewer's tank sits in what the viewer sees: the whole arena or the window.
  const ownInTopHalf = ownBot !== undefined && (camera === null ? ownBot.y < height / 2 : ownBot.y + 0.5 - camera.y < camera.height / 2);
  const ownInTopRow = ownBot !== undefined && (camera === null ? ownBot.y === 0 : ownBot.y - camera.y < 1.2);
  const ownInBottomRow = ownBot !== undefined && (camera === null ? ownBot.y === height - 1 : camera.y + camera.height - ownBot.y < 1.2);
  const youBelow =
    ownBot !== undefined &&
    youMarkerBelow(
      ownBot,
      bots.filter((bot) => bot.id !== ownBot.id),
      { inTopRow: ownInTopRow, inBottomRow: ownInBottomRow },
    );
  // The top edge of the picture, so a "+1" in the top row stays inside it.
  const topEdge = camera === null ? -WALL : camera.y * CELL;
  const fxMs = Math.min(FX_MAX_MS, Math.max(FX_MIN_MS, tickMs));
  const plusSize = readableSize(5.5, PLUS_MIN_PX, cellPx);
  // The part of the board the picture shows, in board units, so a name pill stays inside it.
  const view: BoardView =
    camera === null
      ? { left: -WALL, top: -WALL, right: width * CELL + WALL, bottom: height * CELL + WALL }
      : { left: camera.x * CELL, top: camera.y * CELL, right: (camera.x + camera.width) * CELL, bottom: (camera.y + camera.height) * CELL };
  const { peekId, show: showName } = useTankPeek();
  const peekBot = peekId === null ? undefined : drawn.find((bot) => bot.id === peekId);
  /** The drawn tank on the square under the pointer. The window's picture starts at the camera, so its point moves by the camera. */
  const tankUnder = (event: ReactPointerEvent<SVGSVGElement>): BotId | null => {
    const toScreen = event.currentTarget.getScreenCTM();
    if (toScreen === null) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(toScreen.inverse());
    return botAtPoint(drawn, camera === null ? point : { x: point.x + camera.x * CELL, y: point.y + camera.y * CELL });
  };
  const label = highlightId === null ? m.board.arenaLabel(bots.length, tick, snapshot.ticksTotal) : `${m.board.arenaLabel(bots.length, tick, snapshot.ticksTotal)} ${m.board.yourTankRing}`;

  return (
    <div className="relative h-full w-full min-w-0">
      <svg
        ref={ref}
        role="img"
        aria-label={label}
        viewBox={camera === null ? `${-WALL} ${-WALL} ${width * CELL + 2 * WALL} ${height * CELL + 2 * WALL}` : `0 0 ${camera.width * CELL} ${camera.height * CELL}`}
        className={`block h-full w-full min-w-0 ${paused ? "" : "ab-live"}`}
        style={{ "--tick-ms": `${tickMs}ms`, "--fx-ms": `${fxMs}ms` } as CSSProperties}
        // A mouse shows the name of the tank it is over at once (the browser's own tooltip comes late). A click,
        // a tap or a pen shows it too, and one on the floor hides it.
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const id = tankUnder(event);
          if (id !== null) showName(id);
        }}
        onPointerDown={(event) => showName(tankUnder(event))}
        // Following waits for a whole tap (a click), not the start of a touch: a swipe or a pinch that began on a tank
        // made the zoomed view follow it (owner, 2026-11-17). It takes the tank drawn under the finger, not the square
        // tankUnder reads, which a tank only reaches at the end of its glide.
        onClick={(event) => {
          const hit = event.target instanceof Element ? event.target.closest("[data-bot-id]")?.getAttribute("data-bot-id") : null;
          if (hit !== null && hit !== undefined) onTankTap?.(hit);
        }}
      >
        <style>{ARENA_MOTION_CSS}</style>
        {/* The window glides with the same transition as the tanks, so the followed tank stays still in the middle.
            Keyed by the view, so a switch between the window and the whole arena does not glide. */}
        <g
          key={camera === null ? "whole" : "window"}
          className={camera === null ? undefined : "ab-move"}
          style={camera === null ? undefined : { transform: `translate(${-camera.x * CELL}px, ${-camera.y * CELL}px)` }}
        >
        <Floor width={width} height={height} ruleSetId={snapshot.ruleSetId} />
        {underlay}
        {crowd ? (
          <defs>
            {crowdSymbols.map((paint) => (
              <symbol key={paint.key} id={`${symbolBase}-tank-${paint.key}`} overflow="visible">
                {/* The tiny level: plate and hull colour. A round plate, because this drawing turns with the tank. */}
                {paint.look.plate === null ? null : <TankPlate colour={paint.look.plate} round />}
                <TankShape look={{ ...paint.look, plate: null }} detail="tiny" />
              </symbol>
            ))}
          </defs>
        ) : null}

        {/* A game master's tread marks lie on the floor, under the items and tanks (tankTrail.ts). */}
        {trails.size === 0 || hidden ? null : (
          <g data-layer="trail">
            {[...trails].flatMap(([id, state]) => {
              const colour = `var(--color-tank-${(looks.get(id) ?? FALLBACK_LOOK).colour}-dark)`;
              return state.trail.map((cell, i) => {
                const centre = cellCenter(cell.x, cell.y);
                const to = i === 0 ? state.at : (state.trail[i - 1] ?? state.at);
                return (
                  <g
                    key={`${id}-${cell.x}-${cell.y}`}
                    data-trail-mark={i}
                    transform={`translate(${centre.x} ${centre.y}) rotate(${stepAngle(cell, to)})`}
                    opacity={TRAIL_OPACITY[i] ?? 0}
                    style={{ stroke: colour, transition: `opacity ${tickMs}ms linear` }}
                  >
                    {/* Two tread prints along the step, dashed like a track's plates. */}
                    <line x1={-3.6} x2={3.6} y1={-2.7} y2={-2.7} strokeWidth={1.7} strokeDasharray="1.1 0.7" />
                    <line x1={-3.6} x2={3.6} y1={2.7} y2={2.7} strokeWidth={1.7} strokeDasharray="1.1 0.7" />
                  </g>
                );
              });
            })}
          </g>
        )}

        {/* Items lie on the floor. Each keeps its key while it stays, so it pops in once. */}
        <g data-layer="items">
          {drawnItems.map((item) => {
            const centre = cellCenter(item.x, item.y);
            const fading = item.turnsLeft <= ITEM_FADE_TURNS;
            return (
              <g key={`${item.kind}-${item.x}-${item.y}`} transform={`translate(${centre.x} ${centre.y})`} data-item={item.kind} data-fading={fading ? "true" : undefined}>
                <g className="ab-anim ab-item-in">
                  <g className={fading ? "ab-item-fade" : undefined} opacity={fading ? 0.6 : undefined}>
                    <ItemShape kind={item.kind} spin="ab-anim ab-pinwheel" />
                  </g>
                </g>
              </g>
            );
          })}
        </g>

        {/* Jets run under the tanks, so a jet starts at the nozzle and never covers a hull. */}
        <g key={`jets-${tick}`}>
          {shots.map(({ id, shape }) =>
            shape.kind === "dry" ? null : (
              <g key={id} data-throw={shape.kind}>
                <JetShape jet={shape.jet} motion="ab-jet" />
              </g>
            ),
          )}
        </g>

        {drawOrder.map((bot) => {
          const isSelf = bot.id === highlightId;
          const angle = angles.get(bot.id) ?? directionDegrees(bot.direction);
          const centre = cellCenter(bot.x, bot.y);
          const look = looks.get(bot.id) ?? FALLBACK_LOOK;
          const reaction = hitTargets.has(bot.id) ? "ab-anim ab-wobble" : shooters.has(bot.id) && (!crowd || isSelf) ? "ab-anim ab-recoil" : undefined;
          const tankLabel = detail.labels ? labels.get(bot.id) : undefined;
          // The viewer's own tank is never tiny, so it keeps its hatch in a crowd.
          const tankDetail = isSelf && detail.tank === "tiny" ? "simple" : detail.tank;
          const stuck = bot.effect?.kind === "stuck";
          if (crowd && !isSelf) {
            // The same transform as the nested groups below in one list, so one transition moves and turns the tank.
            return (
              <g
                // Its own key: the full drawing below keeps the turn on an inner group, and the browser glided between
                // the two transforms, turning a tank's day of turns (rotate(3600deg)) back to 0 in one glide (2026-11-17).
                key={`crowd-${bot.id}`}
                className="ab-move"
                data-bot-id={bot.id}
                opacity={dimmed(bot.id) ? DIM_OPACITY : undefined}
                style={{ transform: `translate(${centre.x}px, ${centre.y - TANK_LIFT}px) scale(${TANK_SCALE}) rotate(${angle}deg)` }}
              >
                <g key={reaction === undefined ? "rest" : `react-${tick}`} className={reaction}>
                  <use href={`#${symbolBase}-tank-${paintKey(look)}`} />
                </g>
              </g>
            );
          }
          return (
            <g
              key={bot.id}
              className="ab-move"
              data-bot-id={bot.id}
              data-self={isSelf ? "true" : undefined}
              opacity={dimmed(bot.id) ? DIM_OPACITY : undefined}
              style={{ transform: `translate(${centre.x}px, ${centre.y}px)` }}
            >
              <title>{m.board.tankTitle(displayName(names, bot.id), bot.water, rules.waterCapacity, canThrow(bot.water, rules))}</title>
              {/* The plate lies on the square and does not turn with the tank. */}
              {look.plate === null ? null : (
                <g transform={`scale(${PLATE_SCALE})`}>
                  <TankPlate colour={look.plate} />
                </g>
              )}
              {stuck ? (
                <g data-effect="stuck">
                  <MudPuddle />
                </g>
              ) : null}
              <g transform={`translate(0 ${-TANK_LIFT}) scale(${isSelf && crowd ? selfCrowdScale(cellPx) : TANK_SCALE})`}>
                {isSelf && counting ? (
                  <circle r={7.6} fill="none" strokeWidth={1.2} className="ab-anim ab-you-pulse" style={{ stroke: "var(--color-self)" }} />
                ) : null}
                <g className="ab-move" style={{ transform: `rotate(${angle}deg)` }}>
                  {/* Only this group is keyed by the turn, so a reaction replays without breaking the glide of the groups around it. */}
                  <g key={reaction === undefined ? "rest" : `react-${tick}`} className={reaction}>
                    <TankShape look={{ ...look, plate: null, icon: null }} self={isSelf} detail={tankDetail} showFlag heading={angle} />
                  </g>
                  {hatchContent(look, tankLabel, tankDetail) === null ? null : (
                    <g transform={`translate(${TURRET_X} 0)`}>
                      {/* Turns back by the same angle with the same transition, so the icon or label stays upright while the tank turns. */}
                      <g className="ab-move" style={{ transform: `rotate(${-angle}deg)` }}>
                        <TankHatch look={look} label={tankLabel} detail={tankDetail} />
                      </g>
                    </g>
                  )}
                </g>
                {/* The effects keep still while the tank turns, like the plate. */}
                {stuck ? <MudSplats /> : null}
                {bot.effect?.kind === "dizzy" ? (
                  <g data-effect="dizzy">
                    <DizzyStars motion="ab-anim ab-dizzy" />
                  </g>
                ) : null}
              </g>
              {bot.item === null ? null : (
                // Keyed by the item, so the disc pops in on the turn the tank takes it.
                <g key={`held-${bot.item}`} transform={`translate(${BADGE_AT.x} ${BADGE_AT.y}) scale(${BADGE_SCALE})`} data-held={bot.item}>
                  <g className="ab-anim ab-item-in">
                    <HeldBadge kind={bot.item} />
                  </g>
                </g>
              )}
            </g>
          );
        })}

        <g key={`marks-${tick}`}>
          {shots.map(({ id, shape }) => (crowd && id !== highlightId && shape.kind !== "hit" ? null : <ShotMark key={id} shape={shape} />))}
        </g>

        {overlay}

        {/* Gauges and the crown come after every effect, so nothing covers them. On squares too small to read a gauge, only the viewer's tank keeps one. */}
        {drawOrder.map((bot) => {
          const gauge = detail.gauges || bot.id === highlightId;
          if (!gauge && bot.id !== leader) return null;
          const centre = cellCenter(bot.x, bot.y);
          return (
            <g key={bot.id} className="ab-move" opacity={dimmed(bot.id) ? DIM_OPACITY : undefined} style={{ transform: `translate(${centre.x}px, ${centre.y}px)` }}>
              {gauge ? <WaterGauge water={bot.water} rules={rules} small={!detail.labels} /> : null}
              {bot.id === leader ? (
                <g transform={`translate(0 ${-CELL / 2 + 0.6})`} data-leader="true">
                  <title>{m.board.leaderTitle(displayName(names, bot.id))}</title>
                  <Crown />
                </g>
              ) : null}
            </g>
          );
        })}

        <g key={`plus-${tick}`} aria-hidden="true">
          {[...shooters].flatMap((id) => {
            const shooter = botsById.get(id);
            if (crowd && id !== highlightId) return [];
            const hit = throws.find((event) => event.throwerId === id && event.outcome === "hit");
            if (shooter === undefined || hit === undefined) return [];
            const at = tankCenter(shooter.x, shooter.y);
            // In the top row the "+1" stays inside the wall instead of leaving the picture.
            return [
              <g key={id} transform={`translate(${at.x + CELL * 0.3} ${Math.max(at.y - CELL * 0.65, plusSize * 0.6 + topEdge)})`}>
                <text
                  className="ab-anim ab-plus"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="var(--font-display)"
                  fontWeight={700}
                  fontSize={plusSize}
                  strokeWidth={plusSize * 0.22}
                  paintOrder="stroke"
                  style={{ fill: id === highlightId ? "var(--color-self-ink)" : "var(--color-ink)", stroke: "var(--color-panel)" }}
                >
                  {hit.outcome === "hit" && hit.bucket === true ? m.board.plusTwo : m.board.plusOne}
                </text>
              </g>,
            ];
          })}
        </g>

        {peekBot === undefined ? null : (
          <NameTag key={peekBot.id} bot={peekBot} text={displayName(names, peekBot.id)} self={peekBot.id === highlightId} cellPx={cellPx} view={view} />
        )}

        {counting && highlightId !== null ? <YouMarker bot={ownBot} below={youBelow} text={m.common.you} cellPx={cellPx} /> : null}
        </g>
      </svg>
      {counting ? (
        // The number sits in the half of the board away from the viewer's tank, so it never covers the tank or the "You" marker.
        // The overlay is a size container, so the panel stays under a third of the board's height on a small board.
        <div className={`pointer-events-none absolute inset-0 flex justify-center p-[3cqh] [container-type:size] ${ownInTopHalf ? "items-end" : "items-start"}`}>
          <div className="flex min-w-[1.6em] items-center justify-center rounded-[var(--radius-card)] bg-panel/85 px-[min(1.25rem,4cqh)] shadow-[var(--shadow-raised)]">
            <Countdown seconds={countdown ?? 0} size="fit" />
          </div>
        </div>
      ) : null}
    </div>
  );
});

/** The ground of the round's condition (arenaGround.ts). Memoised: its marks change only with the board's size or condition. */
const Floor = memo(function Floor({ width, height, ruleSetId }: { width: number; height: number; ruleSetId: RuleSetId }) {
  const w = width * CELL;
  const h = height * CELL;
  const ground = ARENA_GROUNDS[ruleSetId];
  const marks = useMemo(() => groundMarksPath(width, height, ruleSetId), [width, height, ruleSetId]);
  const filled = marksFilled(ground.marks);
  return (
    <g data-ground={ground.marks}>
      {/* The wall: a darker rim around the floor, so the arena reads as a closed place. */}
      <rect x={-WALL} y={-WALL} width={w + 2 * WALL} height={h + 2 * WALL} rx={WALL + 2} style={{ fill: ground.wall }} />
      <rect width={w} height={h} rx={2} style={{ fill: ground.floor }} />
      {/* The wall's shadow on the floor along the top and left edges, so the floor lies below the wall. */}
      <path d={`M0 0H${w}V1.6H1.6V${h}H0Z`} style={{ fill: ground.wall }} opacity={0.35} />
      {/* Marks under the grid, so the courtyard's joints run over its slabs. */}
      {marks === "" ? null : (
        <path d={marks} strokeWidth={filled ? undefined : 0.4} strokeLinecap="round" strokeLinejoin="round" style={filled ? { fill: ground.mark } : { fill: "none", stroke: ground.mark }} />
      )}
      <path d={gridLinePath(width, height)} strokeWidth={ground.gridWidth} fill="none" style={{ stroke: ground.grid }} />
    </g>
  );
});

/** What the shot left: a splash on the tank that was hit, a puff where a jet landed, or the drops of a dry shot. */
function ShotMark({ shape }: { shape: ShotShape }) {
  switch (shape.kind) {
    case "hit":
      return (
        <g data-mark="hit" transform={`translate(${shape.splash.x} ${shape.splash.y})`}>
          <Splash motion="ab-anim ab-splash" />
        </g>
      );
    case "blocked":
      return (
        <g data-mark="blocked" transform={`translate(${shape.umbrella.x} ${shape.umbrella.y}) rotate(${shape.angle}) scale(${UMBRELLA_SCALE})`}>
          <OpenUmbrella motion="ab-anim ab-umbrella" />
        </g>
      );
    case "miss":
    case "empty":
      return (
        <g data-mark={shape.kind} transform={`translate(${shape.jet.to.x} ${shape.jet.to.y})`}>
          <Puff motion="ab-anim ab-puff" />
        </g>
      );
    case "dry":
      return (
        <g data-throw="dry">
          <DryDrops drops={shape.drops} motion="ab-anim ab-dry" />
        </g>
      );
  }
}

/** During the countdown: a pill with "You" next to the viewer's tank, above it, or below it in the top row of the picture. */
function YouMarker({ bot, below, text, cellPx }: { bot: PublicBot | undefined; below: boolean; text: string; cellPx: number | null }) {
  if (bot === undefined) return null;
  const size = readableSize(4.5, YOU_MIN_PX, cellPx);
  const centre = cellCenter(bot.x, bot.y);
  const y = below ? centre.y + CELL / 2 + size * 0.9 : centre.y - CELL / 2 - size * 0.9;
  return (
    <g transform={`translate(${centre.x} ${y})`} aria-hidden="true" data-you-marker="true">
      <Pill text={text} size={size} fill="var(--color-self-ink)" />
    </g>
  );
}

/** The width of a pill from the length of its text: an estimate, because SVG text is measured only once it is drawn. */
function pillSize(text: string, size: number): { width: number; height: number } {
  return { width: size * (text.length * 0.62 + 1.2), height: size * 1.5 };
}

/** A rounded label centred on (0, 0): the "You" marker and a tank's name. */
function Pill({ text, size, fill }: { text: string; size: number; fill: string }) {
  const { width, height } = pillSize(text, size);
  return (
    <>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={height / 2} style={{ fill }} />
      <text textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-display)" fontWeight={700} fontSize={size} style={{ fill: "var(--color-panel)" }}>
        {text}
      </text>
    </>
  );
}

/** A tank's name over it after a hover or a tap. It glides with the tank, and stays inside the view. */
function NameTag({ bot, text, self, cellPx, view }: { bot: PublicBot; text: string; self: boolean; cellPx: number | null; view: BoardView }) {
  const size = readableSize(4.5, NAME_MIN_PX, cellPx);
  const spot = nameTagSpot(cellCenter(bot.x, bot.y), pillSize(text, size), view);
  return (
    <g className="ab-move" style={{ transform: `translate(${spot.x}px, ${spot.y}px)`, pointerEvents: "none" }} aria-hidden="true" data-name-tag={bot.id}>
      <Pill text={text} size={size} fill={self ? "var(--color-self-ink)" : "var(--color-ink)"} />
    </g>
  );
}
