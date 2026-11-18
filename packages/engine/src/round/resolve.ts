// Resolve the chosen moves one at a time against the positions as already changed
// in this turn. Splash records its targets at its move, then rolls after the item
// draws. Ordinary throws get first use of the umbrella blocks shared with Splash.

import { POINTS_PER_HIT, canThrow, hitChancePercent, throwRange, waterAfterTick } from "../combat/combat.ts";
import { rulesOf } from "../combat/rule-sets.ts";
import type { RoundRules } from "../combat/rule-sets.ts";
import { DIRECTIONS } from "../types.ts";
import type {
  BoardItem, BotId, BotState, Build, Pickup, Rng, ShotProtection, Snapshot,
  SplashSquare, TankEffect, TankEffectKind, ThrowEvent, TurnAction, UltimateFire,
} from "../types.ts";
import { ITEM_RULES, actsOnOwnHit, ageItems, effectOfHit, holderBlocks, newEffect, pickUp, spawnItems, useOnce } from "../items/items.ts";
import { ULTIMATE_RULES, bigUmbrellaCovers, type UltimateId } from "../ultimates/ultimates.ts";
import { TURN_EIGHTHS, rotate } from "../directions.ts";
import { cellAhead, cellKey, isInside } from "./grid.ts";
import type { ArenaSize, Cell } from "./grid.ts";

/** The fields of a bot that a turn changes through moves and attacks. */
export type Placement = Pick<BotState, "id" | "x" | "y" | "direction" | "score" | "water" | "item" | "itemUses" | "ultimateEffect">;

export type TickMove = { readonly botId: BotId } & TurnAction;

export interface TickResolution {
  /** One entry per bot, in the snapshot's bot order. */
  readonly placements: readonly Placement[];
  /** Ordinary throws, in resolution order. */
  readonly throws: readonly ThrowEvent[];
  /** New effects from moves, in move order. A later effect replaces an earlier one. */
  readonly inflicted: ReadonlyMap<BotId, TankEffect>;
  readonly fires: readonly UltimateFire[];
  readonly items: readonly BoardItem[];
  readonly pickups: readonly Pickup[];
  readonly backfires: ReadonlyMap<BotId, TankEffectKind>;
}

interface ItemTurn {
  readonly items: readonly BoardItem[];
  readonly tick: number;
  readonly spawn: boolean;
}

interface Slot {
  readonly place: { -readonly [K in keyof Placement]: Placement[K] };
  readonly build: Build;
  readonly action: TickMove;
  readonly stuck: boolean;
  readonly ultimatesOn: boolean;
  waterChange: "refill" | "spend" | "keep";
  freshUmbrella: boolean;
}

interface ShotDefenses {
  readonly smoked: boolean;
  readonly bigUmbrellaCovers: boolean;
}

type PendingSplash = {
  readonly kind: "pendingSplash";
  readonly source: Slot;
  readonly at: Cell;
  readonly squares: readonly (
    | { readonly cell: Cell; readonly target?: never }
    | { readonly cell: Cell; readonly target: Slot; readonly defenses: ShotDefenses; readonly front: boolean }
  )[];
};

/** Every snapshot bot needs exactly one move and exactly one place in order. */
export function resolveTick(
  snapshot: Pick<Snapshot, "width" | "height" | "bots" | "ruleSetId">,
  moves: readonly TickMove[],
  order: readonly BotId[],
  rng: Rng,
  itemTurn?: ItemTurn,
): TickResolution {
  const rules = rulesOf(snapshot);
  const byId = new Map<BotId, TickMove>();
  for (const action of moves) {
    if (byId.has(action.botId)) throw new Error(`two moves for bot "${action.botId}"`);
    byId.set(action.botId, action);
  }

  const slots = new Map<BotId, Slot>();
  const occupant = new Map<string, Slot>();
  for (const bot of snapshot.bots) {
    const action = byId.get(bot.id);
    if (action === undefined) throw new Error(`no move for bot "${bot.id}"`);
    if (slots.has(bot.id)) throw new Error(`snapshot has two bots with id "${bot.id}"`);
    const slot: Slot = {
      place: {
        id: bot.id, x: bot.x, y: bot.y, direction: bot.direction, score: bot.score,
        water: bot.water, item: bot.item, itemUses: bot.itemUses,
        ...(bot.ultimateEffect === undefined ? {} : { ultimateEffect: bot.ultimateEffect }),
      },
      build: bot.build,
      action,
      waterChange: "refill",
      stuck: bot.effect?.kind === "stuck",
      ultimatesOn: bot.ultimate !== undefined || action.ultimate !== undefined,
      freshUmbrella: false,
    };
    slots.set(bot.id, slot);
    occupant.set(cellKey(bot), slot);
  }
  if (byId.size !== slots.size) throw new Error("a move names a bot that is not in the snapshot");
  if (order.length !== slots.size || new Set(order).size !== order.length) throw new Error("order must list each bot once");

  const throws: ThrowEvent[] = [];
  const inflicted = new Map<BotId, TankEffect>();
  const pendingFires: (UltimateFire | PendingSplash)[] = [];
  for (const botId of order) {
    const slot = slots.get(botId);
    if (slot === undefined) throw new Error(`order names a bot that is not in the snapshot: "${botId}"`);
    const { action, place, stuck } = slot;
    if (action.ultimate !== undefined) {
      const fire = resolveUltimate(action.ultimate, slot, snapshot, rules, occupant, inflicted);
      if (fire !== null) pendingFires.push(fire);
    } else if (action.move === "T") {
      throws.push(resolveThrow(slot, snapshot, rules, occupant, rng, inflicted));
    } else if (!stuck) {
      if (action.move === "F") drive(slot, snapshot, occupant);
      else if (action.move !== "W") place.direction = rotate(place.direction, TURN_EIGHTHS[action.move]);
    }
  }

  const placements = [...slots.values()].map((slot) => {
    if (slot.waterChange !== "keep") {
      slot.place.water = waterAfterTick(slot.place.water, slot.waterChange === "spend", rules);
    }
    return slot.place;
  });
  const { items: left, pickups, backfires } = pickUp(itemTurn?.items ?? [], placements, rng);
  for (const pickup of pickups) {
    const slot = slots.get(pickup.botId);
    if (slot !== undefined && pickup.item === "umbrella") slot.freshUmbrella = true;
  }
  const aged = ageItems(left);
  const spawned = itemTurn?.spawn === true ? spawnItems(snapshot, itemTurn.tick, placements, aged, rng) : [];
  const fires = pendingFires.map((fire) => fire.kind === "pendingSplash" ? resolveSplash(fire, rng) : fire);
  return { placements, throws, inflicted, fires, items: [...aged, ...spawned], pickups, backfires };
}

/** A diagonal step only needs its destination free. Dash repeats the same step. */
function drive(slot: Slot, size: ArenaSize, occupant: Map<string, Slot>): Cell | null {
  const { place } = slot;
  const ahead = cellAhead(place, place.direction);
  if (!isInside(size, ahead) || occupant.has(cellKey(ahead))) return null;
  occupant.delete(cellKey(place));
  place.x = ahead.x;
  place.y = ahead.y;
  occupant.set(cellKey(ahead), slot);
  return ahead;
}

function firstTarget(slot: Slot, size: ArenaSize, rules: RoundRules, occupant: ReadonlyMap<string, Slot>) {
  const range = throwRange(slot.build, rules);
  for (let distance = 1; distance <= range; distance++) {
    const cell = cellAhead(slot.place, slot.place.direction, distance);
    if (!isInside(size, cell)) break;
    const target = occupant.get(cellKey(cell));
    if (target !== undefined) return { target, distance };
  }
  return null;
}

/** Read the chosen action so the immunity covers the whole turn, even a zero-square dash. */
function isDashing(slot: Slot): boolean {
  return slot.action.ultimate === "dash" && !slot.stuck;
}

function resolveThrow(
  thrower: Slot,
  size: ArenaSize,
  rules: RoundRules,
  occupant: ReadonlyMap<string, Slot>,
  rng: Rng,
  inflicted: Map<BotId, TankEffect>,
): ThrowEvent {
  const me = thrower.place;
  const found = firstTarget(thrower, size, rules, occupant);
  if (found === null) return { throwerId: me.id, outcome: "empty" };
  const { target, distance } = found;
  const info = { throwerId: me.id, targetId: target.place.id, distance };
  const free = me.ultimateEffect;
  if (free?.kind === "fullTank") {
    me.ultimateEffect = free.freeShots === 1 ? null : { ...free, freeShots: free.freeShots - 1 };
    thrower.waterChange = "keep";
  } else {
    if (!canThrow(me.water, rules)) return { throwerId: me.id, outcome: "dry", targetId: info.targetId, distance };
    thrower.waterChange = "spend";
  }
  if (isDashing(target)) return { ...info, outcome: "dodged" };

  const defenses = defensesAt(target, me);
  const baseChance = hitChancePercent(thrower.build, target.build, distance, rules);
  const hitChance = defenses.smoked ? Math.floor(baseChance / ULTIMATE_RULES.smoke.chanceDivisor) : baseChance;
  const bucket = me.item === "bucket";
  const points = bucket ? ITEM_RULES.bucketHitPoints : POINTS_PER_HIT;
  const impact = rollImpact(target, defenses, baseChance, hitChance, points, rng);
  if (impact.outcome === "hit") {
    movePoints(thrower, target, points);
    const effect = effectOfHit(me);
    if (effect !== null) inflicted.set(info.targetId, newEffect(effect, target.ultimatesOn));
    if (actsOnOwnHit(me.item)) useOnce(me);
  }
  // Keep the existing throw key order for seeded replays.
  return {
    throwerId: info.throwerId, outcome: impact.outcome, targetId: info.targetId, distance, hitChance,
    ...(bucket && impact.outcome === "hit" ? { bucket: true } : {}),
    ...(target.ultimatesOn && impact.protection !== undefined ? { protection: impact.protection } : {}),
  };
}

function defensesAt(target: Slot, from: Cell): ShotDefenses {
  return {
    smoked: target.place.ultimateEffect?.kind === "smoke",
    bigUmbrellaCovers: target.place.ultimateEffect?.kind === "bigUmbrella" && bigUmbrellaCovers(target.place, from),
  };
}

function umbrellaAt(target: Slot, defenses: ShotDefenses): "bigUmbrella" | "umbrella" | null {
  if (defenses.bigUmbrellaCovers && target.place.ultimateEffect?.kind === "bigUmbrella") return "bigUmbrella";
  if (!target.freshUmbrella && holderBlocks(target.place)) return "umbrella";
  return null;
}

function rollImpact(
  target: Slot,
  defenses: ShotDefenses,
  baseChance: number,
  hitChance: number,
  points: number,
  rng: Rng,
  guaranteed = false,
): { readonly outcome: "miss" | "hit" | "blocked"; readonly protection?: ShotProtection } {
  if (defenses.smoked) {
    // Use the existing roll for both chances to measure what smoke saved, with no extra draw.
    const roll = rng.next() * 100;
    if (roll >= hitChance) {
      return roll < baseChance && umbrellaAt(target, defenses) === null
        ? { outcome: "miss", protection: { kind: "smoke", pointsSaved: points } }
        : { outcome: "miss" };
    }
  } else if (!guaranteed && !rng.chance(hitChance)) {
    return { outcome: "miss" };
  }

  const umbrella = umbrellaAt(target, defenses);
  if (umbrella === null) return { outcome: "hit" };
  if (umbrella === "bigUmbrella") {
    const effect = target.place.ultimateEffect;
    if (effect?.kind !== "bigUmbrella") throw new Error("big umbrella blocked without an active effect");
    target.place.ultimateEffect = effect.blocksLeft === 1 ? null : { ...effect, blocksLeft: effect.blocksLeft - 1 };
  } else useOnce(target.place);
  return { outcome: "blocked", protection: { kind: umbrella, pointsSaved: points } };
}

/** The same amount leaves one tank and reaches the other, so scores sum to zero. */
function movePoints(source: Slot, target: Slot, points: number): void {
  source.place.score += points;
  target.place.score -= points;
}

function resolveUltimate(
  kind: UltimateId,
  source: Slot,
  size: ArenaSize,
  rules: RoundRules,
  occupant: Map<string, Slot>,
  inflicted: Map<BotId, TankEffect>,
): UltimateFire | PendingSplash | null {
  const me = source.place;
  const at = { x: me.x, y: me.y };
  const fire = { botId: me.id, at };
  switch (kind) {
    case "dash": {
      if (!isDashing(source)) return null;
      const path: Cell[] = [];
      for (let step = 0; step < ULTIMATE_RULES.dash.squares; step++) {
        const cell = drive(source, size, occupant);
        if (cell === null) break;
        path.push(cell);
      }
      return { ...fire, kind, path };
    }
    case "smoke":
      me.ultimateEffect = { kind, turnsLeft: ULTIMATE_RULES.smoke.turns };
      return { ...fire, kind };
    case "bigUmbrella":
      me.ultimateEffect = { kind, blocksLeft: ULTIMATE_RULES.bigUmbrella.blocks };
      return { ...fire, kind };
    case "fullTank":
      me.water = rules.waterCapacity;
      me.ultimateEffect = { kind, freeShots: ULTIMATE_RULES.fullTank.freeShots };
      return { ...fire, kind };
    case "splash": {
      me.water = 0;
      source.waterChange = "keep";
      const squares = DIRECTIONS.flatMap((_, eighths): PendingSplash["squares"] => {
        const cell = cellAhead(me, rotate(me.direction, eighths), ULTIMATE_RULES.splash.reach);
        if (!isInside(size, cell)) return [];
        const target = occupant.get(cellKey(cell));
        return target === undefined ? [{ cell }] : [{ cell, target, defenses: defensesAt(target, me), front: eighths === 0 }];
      });
      return { kind: "pendingSplash", source, at, squares };
    }
    case "mudBomb": {
      const hit = firstTarget(source, size, rules, occupant);
      if (hit === null) return { ...fire, kind, center: null, area: [], affected: [] };
      const center = { x: hit.target.place.x, y: hit.target.place.y };
      const area = squaresWithin(size, center, ULTIMATE_RULES.mudBomb.reach);
      const affected = inflictInArea(area, occupant, source, inflicted, { kind: "stuck", turnsLeft: ULTIMATE_RULES.mudBomb.stuckTurns });
      return { ...fire, kind, center, area, affected };
    }
    case "whirlwind": {
      const { reach, dizzyTurns, spinTurns } = ULTIMATE_RULES.whirlwind;
      const area = squaresWithin(size, at, reach);
      const affected = inflictInArea(area, occupant, source, inflicted, { kind: "dizzy", turnsLeft: dizzyTurns, spinTurnsLeft: spinTurns });
      return { ...fire, kind, area, affected };
    }
    case "magnet":
      throw new Error("Magnet cannot fire in this phase");
  }
}

function squaresWithin(size: ArenaSize, center: Cell, reach: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = Math.max(0, center.y - reach); y <= Math.min(size.height - 1, center.y + reach); y++) {
    for (let x = Math.max(0, center.x - reach); x <= Math.min(size.width - 1, center.x + reach); x++) cells.push({ x, y });
  }
  return cells;
}

function inflictInArea(
  area: readonly Cell[],
  occupant: ReadonlyMap<string, Slot>,
  source: Slot,
  inflicted: Map<BotId, TankEffect>,
  effect: TankEffect,
): BotId[] {
  const affected: BotId[] = [];
  for (const cell of area) {
    const target = occupant.get(cellKey(cell));
    if (target === undefined || target === source || (effect.kind === "stuck" && isDashing(target))) continue;
    const id = target.place.id;
    inflicted.set(id, effect);
    affected.push(id);
  }
  return affected;
}

function resolveSplash(fire: PendingSplash, rng: Rng): UltimateFire {
  const squares = fire.squares.map((square): SplashSquare => {
    const { cell, target } = square;
    if (target === undefined) return { ...cell, outcome: "empty" };
    const { front, defenses } = square;
    const baseChance = front ? 100 : 100 / ULTIMATE_RULES.splash.sideChanceDivisor;
    const hitChance = defenses.smoked ? baseChance / ULTIMATE_RULES.smoke.chanceDivisor : baseChance;
    const targetId = target.place.id;
    if (isDashing(target)) {
      // The ring draws once per occupied side square even when its tank is immune.
      if (defenses.smoked || !front) rng.chance(hitChance);
      return { ...cell, targetId, outcome: "dodged" };
    }
    const impact = rollImpact(target, defenses, baseChance, hitChance, POINTS_PER_HIT, rng, front);
    if (impact.outcome === "hit") movePoints(fire.source, target, POINTS_PER_HIT);
    return { ...cell, targetId, ...impact };
  });
  return { botId: fire.source.place.id, at: fire.at, kind: "splash", squares };
}
