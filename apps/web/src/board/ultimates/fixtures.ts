// The audit and board tests use compact ticks, like room and monthly streams (85-ultimates.md).
import { compactTick, expandTick, type PublicTick } from "@game/arena";
import type { UltimateId } from "@game/engine";
import { ULTIMATE_SCENES } from "../../catalogue/scenes.ts";

export function ultimateTickFixture(id: UltimateId): PublicTick {
  const scene = ULTIMATE_SCENES[id];
  const spawn = scene.steps[0]?.snapshot;
  const fired = scene.steps.find((step) => step.fires.length > 0);
  if (spawn === undefined || fired === undefined) throw new Error(`Missing a turn for ${id}`);
  const order = spawn.bots.map((tank) => tank.id);
  return expandTick(compactTick({
    tick: 0,
    order,
    moves: order.map((botId) => ({ botId, move: "W" })),
    pickups: [],
    ...fired,
  }, order), spawn);
}
