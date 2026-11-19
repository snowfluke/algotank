import type { PublicSnapshot } from "@game/arena";
import type { BotId, UltimateFire } from "@game/engine";
import { CULL_MARGIN, inWindow, type CameraWindow } from "../camera.ts";

// The round's public tanks carry the flag from its start (85-ultimates.md).
// Use the spawn for help so the last turn can clear tank states without hiding the rule.
export function hasUltimates(snapshot: PublicSnapshot | null): boolean {
  return snapshot?.bots.some((tank) => tank.ultimate !== undefined) ?? false;
}

/** Fire-time squares turn with the snapshot so effects land on the same tanks and tiles. */
export function rotateFires(fires: readonly UltimateFire[], height: number): readonly UltimateFire[] {
  const turn = <T extends UltimateFire["at"]>(cell: T): T => ({ ...cell, x: height - 1 - cell.y, y: cell.x });
  return fires.map((fire) => {
    const at = turn(fire.at);
    switch (fire.kind) {
      case "dash": return { ...fire, at, path: fire.path.map(turn) };
      case "splash": return { ...fire, at, squares: fire.squares.map(turn) };
      case "mudBomb": return { ...fire, at, area: fire.area.map(turn), center: fire.center === null ? null : turn(fire.center) };
      case "whirlwind": return { ...fire, at, area: fire.area.map(turn) };
      case "magnet": return { ...fire, at, items: fire.items.map((item) => item.from === undefined ? item : { ...item, from: turn(item.from) }) };
      default: return { ...fire, at };
    }
  });
}

/** An offscreen tank can still ram, catch a tank, or pull an item in the camera's window. */
export function fireInWindow(fire: UltimateFire, camera: CameraWindow, drawn: ReadonlySet<BotId> | null): boolean {
  const near = (cell: UltimateFire["at"]) => inWindow(camera, cell.x, cell.y, CULL_MARGIN);
  if (near(fire.at)) return true;
  switch (fire.kind) {
    case "dash": return fire.path.some(near) || ("targetId" in fire.shot && (drawn?.has(fire.shot.targetId) ?? false));
    case "splash": return fire.squares.some(near);
    case "mudBomb":
    case "whirlwind": return fire.area.some(near) || fire.affected.some((id) => drawn?.has(id) ?? false);
    case "magnet": return fire.items.some(({ from }) => from !== undefined && near(from));
    default: return false;
  }
}
