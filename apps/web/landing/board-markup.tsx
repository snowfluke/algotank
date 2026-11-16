// Turns the recorded demo rounds into DemoData: SVG markup drawn by the game's own
// components (TankShape, WaterGauge, the jet and splash shapes) plus the per-turn
// numbers the page's script animates. Build time only; React never reaches the page.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STANDARD_RULE_SET_ID, ruleSet } from "@game/engine";
import type { BotState, ThrowEvent } from "@game/engine";
import { BOT_NAMES } from "../../server/src/bots.ts";
import { PUBLIC_TICK_MS } from "../../server/src/public-kinds.ts";
import { CELL, TANK_LIFT, TANK_SCALE, directionDegrees, gridLinePath, shotShape } from "../src/board/boardHelpers.ts";
import { FX_MAX_MS, FX_MIN_MS, WALL } from "../src/board/ArenaBoard.tsx";
import { DryDrops, JetShape, Puff, Splash } from "../src/board/boardShapes.tsx";
import { WaterGauge } from "../src/board/WaterGauge.tsx";
import { tankColourByOrder } from "../src/tank/colours.ts";
import { plainTankLook, tankLetters, type TankLook } from "../src/tank/look.ts";
import { TURRET_X, TankHatch, TankShape, hatchContent } from "../src/tank/TankShape.tsx";
import type { DemoData, DemoFrame, DemoRoundData, DemoShot, DemoTank } from "./demo-data.ts";
import { YOU, orderKey, type DemoRecording, type DemoRound } from "./demo-round.ts";

/** The demo tank: blue with a star, the tank on the README banner. */
export const YOU_LOOK: TankLook = { colour: 1, skin: "plain", second: 7, plate: null, icon: "star", flag: null };

const svg = (element: ReactElement) => renderToStaticMarkup(element);

function tankFor(look: TankLook, label: string | undefined, self: boolean): DemoTank {
  // The hatch is drawn apart from the hull and turned back, so an icon or letters stay upright (as on the game's board).
  const hull = svg(<TankShape look={{ ...look, plate: null, icon: null }} self={self} detail="full" />);
  const hatch = hatchContent(look, label, "full") === null ? null : svg(<TankHatch look={look} label={label} detail="full" />);
  return { hull, hatch, self };
}

/** The tanks in snapshot order: the demo tank, then the bots with the names and plain colours the game gives them. */
function demoTanks(botIds: readonly string[]): DemoTank[] {
  return botIds.map((id, index) => {
    if (id === YOU) return tankFor(YOU_LOOK, undefined, true);
    const name = BOT_NAMES[index] ?? `Bot ${index}`;
    return tankFor(plainTankLook(tankColourByOrder(index + 1)), tankLetters(name), false);
  });
}

function shotMarkup(shooter: BotState, event: ThrowEvent, bounds: { width: number; height: number }): DemoShot {
  const shape = shotShape(shooter, event, bounds);
  switch (shape.kind) {
    case "hit":
      return {
        under: svg(<JetShape jet={shape.jet} motion="ab-jet" />),
        over: svg(
          <g transform={`translate(${shape.splash.x} ${shape.splash.y})`}>
            <Splash motion="ab-anim ab-splash" />
          </g>,
        ),
      };
    case "miss":
    case "empty":
      return {
        under: svg(<JetShape jet={shape.jet} motion="ab-jet" />),
        over: svg(
          <g transform={`translate(${shape.jet.to.x} ${shape.jet.to.y})`}>
            <Puff motion="ab-anim ab-puff" />
          </g>,
        ),
      };
    case "dry":
      return { under: "", over: svg(<DryDrops drops={shape.drops} motion="ab-anim ab-dry" />) };
    case "blocked":
      // demo-round.ts plays with items off, so no tank holds an umbrella.
      throw new Error("The landing demo plays without items, so no throw can be blocked.");
  }
}

/** The floor and grid, drawn like the game's board (board/ArenaBoard.tsx, Floor). */
export function floorMarkup(width: number, height: number): string {
  const w = width * CELL;
  const h = height * CELL;
  return svg(
    <g>
      <rect x={-WALL} y={-WALL} width={w + 2 * WALL} height={h + 2 * WALL} rx={WALL + 2} style={{ fill: "var(--color-line-strong)" }} />
      <rect width={w} height={h} rx={2} style={{ fill: "var(--color-arena-floor)" }} />
      <path d={gridLinePath(width, height)} strokeWidth={0.4} fill="none" style={{ stroke: "var(--color-arena-grid)" }} />
    </g>,
  );
}

export function demoData(recording: DemoRecording): DemoData {
  const first = recording.rounds[0];
  if (first === undefined) throw new Error("The demo recorded no rounds.");
  const ids = first.spawn.bots.map((bot) => bot.id);
  const { width, height } = first.spawn;
  const rules = ruleSet(STANDARD_RULE_SET_ID);
  const shots: DemoShot[] = [];
  const shotIndex = new Map<string, number>();
  const shotId = (shot: DemoShot): number => {
    const key = `${shot.under}|${shot.over}`;
    const known = shotIndex.get(key);
    if (known !== undefined) return known;
    shots.push(shot);
    shotIndex.set(key, shots.length - 1);
    return shots.length - 1;
  };

  const frameOf = (bots: readonly BotState[], rule: number, events: readonly ThrowEvent[]): DemoFrame => {
    const byId = new Map(bots.map((bot) => [bot.id, bot]));
    const ordered = ids.map((id) => {
      const bot = byId.get(id);
      if (bot === undefined) throw new Error(`The tank "${id}" left the demo round.`);
      return bot;
    });
    const frameShots: number[] = [];
    const hit = new Set<number>();
    const fired = new Set<number>();
    for (const event of events) {
      const shooter = byId.get(event.throwerId);
      if (shooter === undefined) throw new Error(`A shot came from the unknown tank "${event.throwerId}".`);
      frameShots.push(shotId(shotMarkup(shooter, event, { width, height })));
      if (event.outcome === "hit") hit.add(ids.indexOf(event.targetId));
      if (event.outcome !== "dry") fired.add(ids.indexOf(event.throwerId));
    }
    return {
      bots: ordered.flatMap((bot) => [bot.x, bot.y, directionDegrees(bot.direction), bot.water, bot.score]),
      rule,
      shots: frameShots,
      hit: [...hit],
      fired: [...fired],
    };
  };

  const roundData = (round: DemoRound): DemoRoundData => {
    const ruleAt = (ruleId: string | null): number => (ruleId === null ? -1 : round.order.indexOf(ruleId as (typeof round.order)[number]));
    const frames = [
      frameOf(round.spawn.bots, -1, []),
      ...round.ticks.map((tick) => {
        const own = tick.decisions.find((decision) => decision.botId === YOU);
        if (own === undefined) throw new Error("The demo tank made no decision.");
        return frameOf(tick.snapshot.bots, ruleAt(own.ruleId), tick.throws);
      }),
    ];
    return { order: round.order, rank: round.rank, frames };
  };

  return {
    board: { width, height, cell: CELL, wall: WALL, tankScale: TANK_SCALE, tankLift: TANK_LIFT, turretX: TURRET_X },
    // The game's own speed, so the demo looks like a round a player will see.
    tickMs: PUBLIC_TICK_MS,
    fxMs: Math.min(FX_MAX_MS, Math.max(FX_MIN_MS, PUBLIC_TICK_MS)),
    tanks: demoTanks(ids),
    gauges: Array.from({ length: rules.waterCapacity + 1 }, (_, water) => svg(<WaterGauge water={water} rules={rules} small={false} />)),
    shots,
    rounds: Object.fromEntries(recording.rounds.map((round) => [orderKey(round.order), roundData(round)])),
  };
}
