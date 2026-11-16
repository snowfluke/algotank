// A tank's name on a hover, a click or a tap (owner, 2026-11-16): a mouse over a tank, a click on
// it, or a finger on it shows the tank's name in a pill over it for PEEK_MS. The pill moves with the tank, and a new
// hover or tap starts the time again. It works at every board size, also in a crowd of 512 tanks,
// because it finds the tank by the square under the pointer and not by the drawing.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicBot } from "@game/arena";
import type { BotId } from "@game/engine";
import { CELL } from "./boardHelpers.ts";

/** How long a name stays after the last hover or tap. */
export const PEEK_MS = 2000;

/** The part of the board the picture shows, in board units: the whole arena with its wall, or the camera's window. */
export interface BoardView {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The tank on the square under `point` (board units), or null. Two tanks never share a square. */
export function botAtPoint(bots: readonly PublicBot[], point: { readonly x: number; readonly y: number }): BotId | null {
  const x = Math.floor(point.x / CELL);
  const y = Math.floor(point.y / CELL);
  return bots.find((bot) => bot.x === x && bot.y === y)?.id ?? null;
}

/**
 * Where the name pill's centre goes: over the tank, or under it when the space over it is
 * outside the view, and moved sideways so the whole pill stays inside the view.
 */
export function nameTagSpot(centre: { readonly x: number; readonly y: number }, pill: { readonly width: number; readonly height: number }, view: BoardView): { x: number; y: number } {
  const above = centre.y - CELL / 2 - pill.height * 0.6;
  const y = above - pill.height / 2 < view.top ? centre.y + CELL / 2 + pill.height * 0.6 : above;
  const half = pill.width / 2;
  const x = view.right - view.left <= pill.width ? (view.left + view.right) / 2 : Math.min(Math.max(centre.x, view.left + half), view.right - half);
  return { x, y };
}

/** The tank whose name shows now, and `show` to show one (or none) for PEEK_MS. */
export function useTankPeek(): { readonly peekId: BotId | null; show(id: BotId | null): void } {
  const [peekId, setPeekId] = useState<BotId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((id: BotId | null) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = id === null ? null : setTimeout(() => setPeekId(null), PEEK_MS);
    setPeekId(id);
  }, []);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return { peekId, show };
}
