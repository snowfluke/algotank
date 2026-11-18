// Ultimate triggers and timing (docs/specs/revamp/85-ultimates.md, owner 2026-11-18).
// The trigger reads the snapshot before the turn and draws nothing. The round checks it
// after spin and a running sequence. A fire takes the tank's whole turn.
//
// | From             | To                          | Actor              | Guard                       |
// |------------------|-----------------------------|--------------------|-----------------------------|
// | (none)           | charging (firstReadyTurn)   | create / join      | ultimates on                |
// | charging (n > 1) | charging (n - 1)            | end of turn        |                             |
// | charging (1)     | ready                       | end of turn        |                             |
// | ready            | fired                       | start of turn      | trigger holds, can act      |
// | fired            | charging (rechargeTurns)    | end of same turn   |                             |
// | any              | (none)                      | end of round       |                             |

import { canThrow, throwRange } from "../combat/combat.ts";
import { rulesOf } from "../combat/rule-sets.ts";
import { directionOfSigns, eighthsBetween } from "../directions.ts";
import { canTake } from "../items/items.ts";
import { cellAhead } from "../round/grid.ts";
import { botsThatCanHit, firstBotInLine, isFree } from "../strategy/geometry.ts";
import { forEachBotNear } from "../strategy/snapshot-index.ts";
import type { BotState, Decision, Snapshot, UltimateEffect, UltimateState } from "../types.ts";

export const ULTIMATE_IDS = ["dash", "smoke", "splash", "fullTank", "mudBomb", "whirlwind", "bigUmbrella", "magnet"] as const;
export type UltimateId = (typeof ULTIMATE_IDS)[number];

export function isUltimateId(value: unknown): value is UltimateId {
  return ULTIMATE_IDS.some((id) => id === value);
}

export const ULTIMATE_RULES = {
  // 8 turns of charge before the first fire, so the board shows each tank's charge before ultimates go off. Measured
  // 2026-11-18 (85-ultimates.md, Starting numbers): a 20-turn room averages 0.86 fires per tank at 8 and 0.93 at 1.
  firstReadyTurn: 8,
  rechargeTurns: 40,
  dash: { squares: 3, triggerMinDistance: 2, triggerMaxDistance: 4, aimedAtMe: 1, points: 2 },
  smoke: { turns: 15, aimedAtMe: 1, chanceDivisor: 4 },
  // Owner, 2026-11-18 (85-ultimates.md): more points per hit, with the whole tank of water.
  splash: { reach: 1, triggerTanks: 2, points: 2, waterAfter: 0 },
  fullTank: { freeShots: 3 },
  mudBomb: { stuckTurns: 5, reach: 1 },
  // Owner, 2026-11-18 (85-ultimates.md): every dizzy turn from Whirlwind spins.
  whirlwind: { reach: 2, pointReach: 1, dizzyTurns: 4, spinTurns: 4, triggerTanks: 2 },
  bigUmbrella: { blocks: 4, blockedEighths: [0, 1, 2, 6, 7] as readonly number[], aimedAtMe: 1 },
  // Owner, 2026-11-18 (85-ultimates.md): a ready Magnet can always get an item if it has room.
  magnet: { reach: 4, handSize: 3, newItem: "bucket" },
} as const;

export function magnetSpace(tank: Pick<BotState, "item" | "itemsWaiting">): number {
  return ULTIMATE_RULES.magnet.handSize - (canTake(tank) ? 0 : 1 + (tank.itemsWaiting?.length ?? 0));
}

function tanksNear(snapshot: Snapshot, tank: BotState, reach: number): number {
  let count = 0;
  forEachBotNear(snapshot, tank.x, tank.y, reach, (other) => {
    if (other.id !== tank.id) count++;
  });
  return count;
}

const TRIGGERS: Record<UltimateId, (snapshot: Snapshot, tank: BotState) => boolean> = {
  dash: (snapshot, tank) => {
    const { triggerMinDistance, triggerMaxDistance, aimedAtMe } = ULTIMATE_RULES.dash;
    if (tank.effect?.kind === "stuck" || !isFree(snapshot, cellAhead(tank, tank.direction))) return false;
    const first = firstBotInLine(snapshot, tank, triggerMaxDistance);
    return (first !== null && first.distance >= triggerMinDistance) || botsThatCanHit(snapshot, tank).length >= aimedAtMe;
  },
  smoke: (snapshot, tank) => tank.ultimateEffect?.kind !== "smoke" &&
    botsThatCanHit(snapshot, tank).length >= ULTIMATE_RULES.smoke.aimedAtMe,
  splash: (snapshot, tank) => canThrow(tank.water, rulesOf(snapshot)) &&
    tanksNear(snapshot, tank, ULTIMATE_RULES.splash.reach) >= ULTIMATE_RULES.splash.triggerTanks,
  fullTank: (snapshot, tank) => {
    const rules = rulesOf(snapshot);
    return !canThrow(tank.water, rules) && tanksNear(snapshot, tank, throwRange(tank.build, rules)) > 0;
  },
  mudBomb: (snapshot, tank) => firstBotInLine(snapshot, tank, throwRange(tank.build, rulesOf(snapshot))) !== null,
  whirlwind: (snapshot, tank) => tanksNear(snapshot, tank, ULTIMATE_RULES.whirlwind.reach) >= ULTIMATE_RULES.whirlwind.triggerTanks,
  bigUmbrella: (snapshot, tank) => tank.ultimateEffect?.kind !== "bigUmbrella" &&
    botsThatCanHit(snapshot, tank).length >= ULTIMATE_RULES.bigUmbrella.aimedAtMe,
  magnet: (_snapshot, tank) => magnetSpace(tank) > 0,
};

export function ultimateDecision(snapshot: Snapshot, tank: BotState): Decision | null {
  const ultimate = tank.ultimate;
  if (ultimate?.kind !== "ready" || !TRIGGERS[ultimate.id](snapshot, tank)) return null;
  return { botId: tank.id, modeId: tank.modeId, ruleId: null, actionId: "ultimate", move: "W", nextModeId: tank.modeId, ultimate: ultimate.id };
}

export function chargeAfterTurn(state: UltimateState, fired: UltimateId | undefined): UltimateState {
  if (fired !== undefined) return { id: state.id, kind: "charging", turnsLeft: ULTIMATE_RULES.rechargeTurns };
  if (state.kind === "ready") return state;
  if (state.turnsLeft === 1) return { id: state.id, kind: "ready" };
  return { ...state, turnsLeft: state.turnsLeft - 1 };
}

export function ultimateEffectAfterTurn(effect: UltimateEffect | null): UltimateEffect | null {
  if (effect?.kind !== "smoke") return effect;
  return effect.turnsLeft === 1 ? null : { ...effect, turnsLeft: effect.turnsLeft - 1 };
}

type FacingSquare = Pick<BotState, "x" | "y" | "direction">;

/** A shot's bearing is measured from the target's facing and square. */
export function bigUmbrellaCovers(target: FacingSquare, from: Pick<BotState, "x" | "y">): boolean {
  const incoming = directionOfSigns(from.x - target.x, from.y - target.y);
  return incoming !== null && ULTIMATE_RULES.bigUmbrella.blockedEighths.includes(eighthsBetween(target.direction, incoming));
}
