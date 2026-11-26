// Ultimate triggers and timing (docs/specs/revamp/85-ultimates.md, owner 2026-11-18 and 2026-11-19).
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
import { directionOfSigns, eighthsBetween } from "../directions.ts";
import { canTake } from "../items/items.ts";
import { rulesAt } from "../round/arena-layouts.ts";
import { cellAhead } from "../round/grid.ts";
import { botsThatCanHit, firstBotInLine, isFree } from "../strategy/geometry.ts";
import { forEachBotNear } from "../strategy/snapshot-index.ts";
import type { BotState, Decision, Snapshot, UltimateAction, UltimateEffect, UltimateState } from "../types.ts";

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
  // `points` is what every dash scores (owner, 2026-11-26: "it should guarantee getting +2 even if no tank to bump"):
  // a rammed tank gives them up, and a dash that rams nobody, or is blocked or dodged, gets them from the game.
  dash: { squares: 3, triggerMinDistance: 2, triggerMaxDistance: 4, aimedAtMe: 1, points: 2 },
  // Owner, 2026-11-19 (85-ultimates.md): a shot stopped by smoke can turn on a neighbour.
  smoke: { turns: 15, aimedAtMe: 1, chanceDivisor: 4, deflectChance: 0.25 },
  // Owner, 2026-11-18 (85-ultimates.md): more points per hit, with the whole tank of water.
  splash: { reach: 1, triggerTanks: 2, points: 2, waterAfter: 0 },
  fullTank: { freeShots: 3 },
  mudBomb: { stuckTurns: 5, reach: 1 },
  // Owner, 2026-11-18 (85-ultimates.md): every dizzy turn from Whirlwind spins.
  whirlwind: { reach: 2, pointReach: 1, dizzyTurns: 4, spinTurns: 4, triggerTanks: 2 },
  // Owner, 2026-11-19: 3 blocks, not 4. With 4 the Dry hunter led the simulated monthly field by +854 points a
  // tank a day (mean 236, 4 days); with 3 it was at -73 (85-ultimates.md, Measured).
  bigUmbrella: { blocks: 3, blockedEighths: [0, 1, 2, 6, 7] as readonly number[], aimedAtMe: 1 },
  // Owner, 2026-11-18 (85-ultimates.md): a ready Magnet can always get an item if it has room.
  magnet: { reach: 4, handSize: 3, newItem: "bucket" },
} as const;

export function magnetSpace(tank: Pick<BotState, "item" | "itemsWaiting">): number {
  return ULTIMATE_RULES.magnet.handSize - (canTake(tank) ? 0 : 1 + (tank.itemsWaiting?.length ?? 0));
}

function tanksNear(snapshot: Snapshot, tank: BotState, reach: number, center = tank): number {
  let count = 0;
  forEachBotNear(snapshot, center.x, center.y, reach, (other) => {
    if (other.id !== tank.id && other.id !== center.id) count++;
  });
  return count;
}

const TANK_REACH: Partial<Record<UltimateId, (snapshot: Snapshot, tank: BotState) => number>> = {
  dash: (snapshot, tank) => firstBotInLine(snapshot, tank, ULTIMATE_RULES.dash.triggerMaxDistance) === null ? 0 : 1,
  splash: (snapshot, tank) => tanksNear(snapshot, tank, ULTIMATE_RULES.splash.reach),
  mudBomb: (snapshot, tank) => {
    const first = firstBotInLine(snapshot, tank, throwRange(tank.build, rulesAt(snapshot, tank.x, tank.y)));
    // Count the first tank and its neighbours, leaving out the thrower.
    return first === null ? 0 : tanksNear(snapshot, tank, ULTIMATE_RULES.mudBomb.reach, first.bot) + 1;
  },
  whirlwind: (snapshot, tank) => tanksNear(snapshot, tank, ULTIMATE_RULES.whirlwind.reach),
};

export function ultimateCatchesTanks(id: UltimateId): boolean {
  return TANK_REACH[id] !== undefined;
}

export function ultimateReach(snapshot: Snapshot, tank: BotState): number {
  return tank.ultimate === undefined ? 0 : TANK_REACH[tank.ultimate.id]?.(snapshot, tank) ?? 0;
}

export function ultimateCharged(tank: BotState, percent: number): boolean {
  const state = tank.ultimate;
  return state?.kind === "ready" || (state?.kind === "charging" &&
    (state.turnsTotal - state.turnsLeft) * 100 >= percent * state.turnsTotal);
}

// Rules use the hard guard only. The automatic trigger also checks for a good moment (85-ultimates.md).
const CAN_ACT: Record<UltimateId, (snapshot: Snapshot, tank: BotState) => boolean> = {
  dash: (snapshot, tank) => tank.effect?.kind !== "stuck" && isFree(snapshot, cellAhead(tank, tank.direction)),
  smoke: (_snapshot, tank) => tank.ultimateEffect?.kind !== "smoke",
  splash: (snapshot, tank) => canThrow(tank.water, rulesAt(snapshot, tank.x, tank.y)),
  fullTank: () => true,
  mudBomb: (snapshot, tank) => ultimateReach(snapshot, tank) > 0,
  whirlwind: () => true,
  bigUmbrella: (_snapshot, tank) => tank.ultimateEffect?.kind !== "bigUmbrella",
  magnet: (_snapshot, tank) => magnetSpace(tank) > 0,
};

const TRIGGERS: Record<UltimateId, (snapshot: Snapshot, tank: BotState) => boolean> = {
  dash: (snapshot, tank) => {
    const { triggerMinDistance, aimedAtMe } = ULTIMATE_RULES.dash;
    return (ultimateReach(snapshot, tank) > 0 && firstBotInLine(snapshot, tank, triggerMinDistance - 1) === null) ||
      botsThatCanHit(snapshot, tank).length >= aimedAtMe;
  },
  smoke: (snapshot, tank) => botsThatCanHit(snapshot, tank).length >= ULTIMATE_RULES.smoke.aimedAtMe,
  splash: (snapshot, tank) => ultimateReach(snapshot, tank) >= ULTIMATE_RULES.splash.triggerTanks,
  fullTank: (snapshot, tank) => {
    const rules = rulesAt(snapshot, tank.x, tank.y);
    return !canThrow(tank.water, rules) && tanksNear(snapshot, tank, throwRange(tank.build, rules)) > 0;
  },
  mudBomb: () => true,
  whirlwind: (snapshot, tank) => ultimateReach(snapshot, tank) >= ULTIMATE_RULES.whirlwind.triggerTanks,
  bigUmbrella: (snapshot, tank) => botsThatCanHit(snapshot, tank).length >= ULTIMATE_RULES.bigUmbrella.aimedAtMe,
  magnet: () => true,
};

export function useUltimate(snapshot: Snapshot, tank: BotState): UltimateAction | null {
  const ultimate = tank.ultimate;
  if (ultimate?.kind !== "ready" || !CAN_ACT[ultimate.id](snapshot, tank)) return null;
  return { move: "W", ultimate: ultimate.id };
}

export function ultimateDecision(snapshot: Snapshot, tank: BotState): Decision | null {
  const action = useUltimate(snapshot, tank);
  if (action === null || !TRIGGERS[action.ultimate](snapshot, tank)) return null;
  const { move, ultimate } = action;
  return { botId: tank.id, modeId: tank.modeId, ruleId: null, actionId: "ultimate", move, nextModeId: tank.modeId, ultimate };
}

function charging(id: UltimateId, turnsTotal: number): UltimateState {
  return { id, kind: "charging", turnsLeft: turnsTotal, turnsTotal };
}

export function firstUltimateCharge(id: UltimateId): UltimateState {
  return charging(id, ULTIMATE_RULES.firstReadyTurn);
}

export function chargeAfterTurn(state: UltimateState, fired: UltimateId | undefined): UltimateState {
  if (fired !== undefined) return charging(state.id, ULTIMATE_RULES.rechargeTurns);
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
