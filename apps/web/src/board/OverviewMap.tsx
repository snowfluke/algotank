// The small map of a big arena in a corner of the follow window: every tank as a
// dot in its hull colour on a larger dot of its plate colour, the viewer's dot larger with the orange ring, and the
// window as a frame. A canvas, because 512 dots redrawn once per turn would be 512
// SVG nodes for React to compare on every turn; the map has no motion.

import { useLayoutEffect, useRef } from "react";
import type { PublicBot } from "@game/arena";
import type { BotId } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { TankLook } from "../tank/look.ts";
import type { ArenaSize, CameraWindow } from "./camera.ts";

/** The map's width in CSS px is this share of the board's width, between the two limits. */
const MAP_SHARE = 0.3;
const MAP_MIN_PX = 72;
const MAP_MAX_PX = 140;

export function overviewWidth(boardWidth: number): number {
  return Math.round(Math.min(MAP_MAX_PX, Math.max(MAP_MIN_PX, boardWidth * MAP_SHARE)));
}

export interface OverviewMapProps {
  readonly arena: ArenaSize;
  readonly bots: readonly PublicBot[];
  readonly looks: ReadonlyMap<BotId, TankLook>;
  readonly highlightId: BotId | null;
  readonly view: CameraWindow;
  /** Width in CSS px, from overviewWidth. */
  readonly width: number;
}

export function OverviewMap({ arena, bots, looks, highlightId, view, width }: OverviewMapProps) {
  const m = useMessages();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const height = Math.round((width * arena.height) / arena.width);

  useLayoutEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (canvas === null || context === null || context === undefined) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const css = getComputedStyle(canvas);
    const token = (name: string) => css.getPropertyValue(`--color-${name}`).trim();
    const scale = (width / arena.width) * ratio;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = token("arena-floor");
    context.fillRect(0, 0, arena.width, arena.height);
    // A dot is a little larger than its square, so a dot stays visible on a 2 px square.
    const dot = Math.max(0.5, (1.1 * ratio) / scale);
    let own: PublicBot | undefined;
    for (const bot of bots) {
      if (bot.id === highlightId) {
        own = bot;
        continue;
      }
      const look = looks.get(bot.id);
      // The tiny detail level: the plate as a ring around the hull colour, so two colours find a tank here too.
      if (look !== undefined && look.plate !== null) {
        context.fillStyle = token(`tank-${look.plate}`);
        context.beginPath();
        context.arc(bot.x + 0.5, bot.y + 0.5, dot * 1.6, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = token(`tank-${look?.colour ?? 1}`);
      context.beginPath();
      context.arc(bot.x + 0.5, bot.y + 0.5, dot, 0, Math.PI * 2);
      context.fill();
    }
    const line = (1.5 * ratio) / scale;
    context.lineWidth = line;
    context.strokeStyle = token("ink");
    context.strokeRect(view.x, view.y, view.width, view.height);
    if (own !== undefined) {
      // Drawn last, larger and ringed, so the viewer's dot is found without its colour.
      context.fillStyle = token("self");
      context.beginPath();
      // At least 4 CSS px across the radius, so it is found on a phone where a square is under 2 px.
      context.arc(own.x + 0.5, own.y + 0.5, Math.max(dot * 2.2, (4 * ratio) / scale), 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = token("panel");
      context.stroke();
    }
  }, [arena.width, arena.height, bots, looks, highlightId, view, width, height]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={m.board.camera.overview}
      data-overview-map=""
      className="block rounded-[0.375rem] border-2 border-panel shadow-[var(--shadow-raised)]"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
