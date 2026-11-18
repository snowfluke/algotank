// Resolve the chosen moves one at a time against the positions as already changed
// in this turn. Smoke, Big Umbrella and Dash protect from the start of the turn.

import { POINTS_PER_HIT, canThrow, hitChancePercent, throwRange, waterAfterTick } from "../combat/combat.ts";
import { rulesOf } from "../combat/rule-sets.ts";
import type { RoundRules } from "../combat/rule-sets.ts";
import { DIRECTIONS } from "../types.ts";
import type {
  BoardItem, BotId, BotState, Build, MagnetFire, Pickup, Rng, ShotProtection, Snapshot,
  SplashSquare, TankEffect, TankEffectKind, ThrowEvent, TurnAction, UltimateFire,
} from "../types.ts";
import { ITEM_RULES, actsOnOwnHit, ageItems, effectOfHit, holdItem, holderBlocks, nearestItems, newEffect, pickUp, receiveEffect, spawnItems, useOnce } from "../items/items.ts";
import { ULTIMATE_RULES, bigUmbrellaCovers, magnetSpace, type UltimateId } from "../ultimates/ultimates.ts";
import { TURN_EIGHTHS, chebyshev, rotate } from "../directions.ts";
import { cellAhead, cellKey, isInside } from "./grid.ts";
import type { ArenaSize, Cell } from "./grid.ts";

/** The fields of a bot that a turn changes through moves and attacks. */
export type Placement = Pick<BotState, "id" | "x" | "y" | "direction" | "score" | "water" | "item" | "itemUses" | "itemsWaiting" | "ultimateEffect">;

export type TickMove = { readonly botId: BotId } & TurnAction;

export interface TickResolution {
  /** One entry per bot, in the snapshot's bot order. */
  readonly placements: readonly Placement[];
  /** Throws, including Dash rams, in resolution order. */
  readonly throws: readonly ThrowEvent[];
  /** The surviving new effect from this turn's moves on each tank. */
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
}

const SURE_HIT = 100;

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

  const ultimatesOn = snapshot.bots.some((bot) => bot.ultimate !== undefined) || moves.some((action) => action.ultimate !== undefined);
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
        ...(bot.itemsWaiting === undefined ? {} : { itemsWaiting: bot.itemsWaiting }),
        ...(bot.ultimateEffect === undefined ? {} : { ultimateEffect: bot.ultimateEffect }),
      },
      build: bot.build,
      action,
      waterChange: "refill",
      stuck: bot.effect?.kind === "stuck",
      ultimatesOn,
    };
    // Activate defenses here so earlier shots count too (85-ultimates.md, owner 2026-11-18).
    // The fire in move order only records the event, since the shots can already spend blocks.
    if (action.ultimate === "smoke") slot.place.ultimateEffect = { kind: "smoke", turnsLeft: ULTIMATE_RULES.smoke.turns };
    if (action.ultimate === "bigUmbrella") slot.place.ultimateEffect = { kind: "bigUmbrella", blocksLeft: ULTIMATE_RULES.bigUmbrella.blocks };
    slots.set(bot.id, slot);
    occupant.set(cellKey(bot), slot);
  }
  if (byId.size !== slots.size) throw new Error("a move names a bot that is not in the snapshot");
  if (order.length !== slots.size || new Set(order).size !== order.length) throw new Error("order must list each bot once");

  const throws: ThrowEvent[] = [];
  const inflicted = new Map<BotId, TankEffect>();
  const fires: UltimateFire[] = [];
  const boardItems = itemTurn?.items ?? [];
  let remainingItems: Set<BoardItem> | undefined;
  let remainingMagnets: Set<Slot> | undefined;
  for (const botId of order) {
    const slot = slots.get(botId);
    if (slot === undefined) throw new Error(`order names a bot that is not in the snapshot: "${botId}"`);
    const { action, place, stuck } = slot;
    if (action.ultimate === "magnet") {
      remainingItems ??= new Set(boardItems);
      remainingMagnets ??= new Set(order.flatMap((id) => {
        const magnet = slots.get(id);
        return magnet?.action.ultimate === "magnet" ? [magnet] : [];
      }));
      fires.push(resolveMagnet(slot, remainingItems, remainingMagnets));
      remainingMagnets.delete(slot);
    } else if (action.ultimate !== undefined) {
      const fire = resolveUltimate(action.ultimate, slot, snapshot, rules, occupant, rng, inflicted);
      if (fire !== null) {
        fires.push(fire);
        if (fire.kind === "dash") throws.push(fire.shot);
      }
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
  const { items: left, pickups, backfires } = pickUp(remainingItems ?? boardItems, placements, rng);
  const aged = ageItems(left);
  const spawned = itemTurn?.spawn === true ? spawnItems(snapshot, itemTurn.tick, placements, aged, rng) : [];
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

  const baseChance = hitChancePercent(thrower.build, target.build, distance, rules);
  const hitChance = chanceThroughSmoke(target, baseChance);
  const bucket = me.item === "bucket";
  const points = bucket ? ITEM_RULES.bucketHitPoints : POINTS_PER_HIT;
  const impact = rollImpact(target, me, baseChance, hitChance, points, rng);
  if (impact.outcome === "hit") {
    movePoints(thrower, target, points);
    const effect = effectOfHit(me);
    if (effect !== null) inflict(target, inflicted, newEffect(effect, target.ultimatesOn));
    if (actsOnOwnHit(me.item)) useOnce(me);
  }
  // Keep the existing throw key order for seeded replays.
  return {
    throwerId: info.throwerId, outcome: impact.outcome, targetId: info.targetId, distance, hitChance,
    ...(bucket && impact.outcome === "hit" ? { bucket: true } : {}),
    ...(target.ultimatesOn && impact.protection !== undefined ? { protection: impact.protection } : {}),
  };
}

function chanceThroughSmoke(target: Slot, baseChance: number): number {
  return target.place.ultimateEffect?.kind === "smoke" ? Math.floor(baseChance / ULTIMATE_RULES.smoke.chanceDivisor) : baseChance;
}

function umbrellaAt(target: Slot, from: Cell): "bigUmbrella" | "umbrella" | null {
  if (target.place.ultimateEffect?.kind === "bigUmbrella" && bigUmbrellaCovers(target.place, from)) return "bigUmbrella";
  if (holderBlocks(target.place)) return "umbrella";
  return null;
}

type Impact =
  | { readonly outcome: "hit"; readonly protection?: never }
  | { readonly outcome: "blocked"; readonly protection: ShotProtection };

function rollImpact(
  target: Slot,
  from: Cell,
  baseChance: number,
  hitChance: number,
  points: number,
  rng: Rng,
): Impact | { readonly outcome: "miss"; readonly protection?: ShotProtection } {
  if (hitChance < baseChance) {
    // Use the existing roll for both chances to measure what smoke saved, with no extra draw.
    const roll = rng.next() * 100;
    if (roll >= hitChance) {
      return roll < baseChance && umbrellaAt(target, from) === null
        ? { outcome: "miss", protection: { kind: "smoke", pointsSaved: points } }
        : { outcome: "miss" };
    }
  } else if (!rng.chance(hitChance)) {
    return { outcome: "miss" };
  }

  return resolveHit(target, from, points);
}

function resolveHit(target: Slot, from: Cell, points: number): Impact {
  const umbrella = umbrellaAt(target, from);
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

function inflict(target: Slot, inflicted: Map<BotId, TankEffect>, effect: TankEffect): void {
  const id = target.place.id;
  inflicted.set(id, receiveEffect(inflicted.get(id) ?? null, effect, target.ultimatesOn));
}

function resolveRam(source: Slot, size: ArenaSize, rules: RoundRules, occupant: ReadonlyMap<string, Slot>): ThrowEvent {
  const throwerId = source.place.id;
  const found = firstTarget(source, size, rules, occupant);
  if (found === null) return { throwerId, outcome: "empty" };
  const { target, distance } = found;
  const aimed = { throwerId, targetId: target.place.id, distance };
  if (isDashing(target)) return { ...aimed, outcome: "dodged" };
  const points = ULTIMATE_RULES.dash.points;
  const impact = resolveHit(target, source.place, points);
  if (impact.outcome === "hit") movePoints(source, target, points);
  return { ...aimed, hitChance: SURE_HIT, ...impact };
}

function resolveUltimate(
  kind: Exclude<UltimateId, "magnet">,
  source: Slot,
  size: ArenaSize,
  rules: RoundRules,
  occupant: Map<string, Slot>,
  rng: Rng,
  inflicted: Map<BotId, TankEffect>,
): UltimateFire | null {
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
      const shot = resolveRam(source, size, rules, occupant);
      return { ...fire, kind, path, shot, points: shot.outcome === "hit" ? ULTIMATE_RULES.dash.points : 0 };
    }
    case "smoke":
    case "bigUmbrella":
      return { ...fire, kind };
    case "fullTank":
      me.water = rules.waterCapacity;
      me.ultimateEffect = { kind, freeShots: ULTIMATE_RULES.fullTank.freeShots };
      return { ...fire, kind };
    case "splash": {
      me.water = ULTIMATE_RULES.splash.waterAfter;
      source.waterChange = "keep";
      return { ...fire, kind, squares: resolveSplash(source, size, occupant, rng) };
    }
    case "mudBomb": {
      const hit = firstTarget(source, size, rules, occupant);
      if (hit === null) return { ...fire, kind, center: null, area: [], affected: [], points: 0 };
      const center = { x: hit.target.place.x, y: hit.target.place.y };
      const area = squaresWithin(size, center, ULTIMATE_RULES.mudBomb.reach);
      const outcome = inflictInArea(area, occupant, source, inflicted, { kind: "stuck", turnsLeft: ULTIMATE_RULES.mudBomb.stuckTurns });
      return { ...fire, kind, center, area, ...outcome };
    }
    case "whirlwind": {
      const { reach, dizzyTurns, spinTurns, pointReach } = ULTIMATE_RULES.whirlwind;
      const area = squaresWithin(size, at, reach);
      const outcome = inflictInArea(area, occupant, source, inflicted, { kind: "dizzy", turnsLeft: dizzyTurns, spinTurnsLeft: spinTurns }, pointReach);
      return { ...fire, kind, area, ...outcome };
    }
  }
}

function resolveMagnet(source: Slot, boardItems: Set<BoardItem>, magnets: ReadonlySet<Slot>): MagnetFire {
  const { place } = source;
  const at = { x: place.x, y: place.y };
  const items = magnetItems(source, boardItems, magnets).map((item): MagnetFire["items"][number] => {
    boardItems.delete(item);
    holdItem(place, item.kind);
    return { kind: item.kind, from: { x: item.x, y: item.y } };
  });
  // The bucket joins after the floor pulls and goes straight into the hand (85-ultimates.md, owner 2026-11-18).
  if (magnetSpace(place) > 0) {
    const kind = ULTIMATE_RULES.magnet.newItem;
    holdItem(place, kind);
    items.push({ kind });
  }
  return { botId: place.id, at, kind: "magnet", items };
}

function magnetItems(source: Slot, boardItems: ReadonlySet<BoardItem>, magnets: ReadonlySet<Slot>): BoardItem[] {
  if (boardItems.size === 0) return [];
  const { reach } = ULTIMATE_RULES.magnet;
  if (magnets.size === 1) return nearestItems(boardItems, source.place, reach, magnetSpace(source.place));

  const space = new Map([...magnets].map((slot) => [slot, magnetSpace(slot.place)]));
  const candidates = [...magnets].flatMap((slot) =>
    nearestItems(boardItems, slot.place, reach, boardItems.size).map((item) => ({ slot, item, distance: chebyshev(slot.place, item) })));
  // Stable sorting keeps move order, then row and column, at equal distances. Reserve for
  // later Magnets so the nearer tank can win, while each pull takes effect at its own move.
  candidates.sort((a, b) => a.distance - b.distance);
  const claimed = new Set<BoardItem>();
  const items: BoardItem[] = [];
  for (const { slot, item } of candidates) {
    const free = space.get(slot) ?? 0;
    if (free === 0 || claimed.has(item)) continue;
    space.set(slot, free - 1);
    claimed.add(item);
    if (slot === source) items.push(item);
  }
  return items;
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
  pointReach?: number,
): { readonly affected: readonly BotId[]; readonly points: number } {
  const affected: BotId[] = [];
  let points = 0;
  for (const cell of area) {
    const target = occupant.get(cellKey(cell));
    if (target === undefined || target === source || isDashing(target)) continue;
    inflict(target, inflicted, effect);
    // Mud scores throughout its area. Whirlwind scores within one square (85-ultimates.md).
    if (pointReach === undefined || chebyshev(source.place, cell) <= pointReach) {
      movePoints(source, target, POINTS_PER_HIT);
      points += POINTS_PER_HIT;
    }
    affected.push(target.place.id);
  }
  return { affected, points };
}

function resolveSplash(source: Slot, size: ArenaSize, occupant: ReadonlyMap<string, Slot>, rng: Rng): SplashSquare[] {
  const me = source.place;
  const { reach, points } = ULTIMATE_RULES.splash;
  const squares: SplashSquare[] = [];
  for (let eighths = 0; eighths < DIRECTIONS.length; eighths++) {
    const cell = cellAhead(me, rotate(me.direction, eighths), reach);
    if (!isInside(size, cell)) continue;
    const target = occupant.get(cellKey(cell));
    if (target === undefined) {
      squares.push({ ...cell, outcome: "empty" });
      continue;
    }
    const targetId = target.place.id;
    if (isDashing(target)) {
      squares.push({ ...cell, targetId, outcome: "dodged" });
      continue;
    }
    const hitChance = chanceThroughSmoke(target, SURE_HIT);
    const impact = hitChance === SURE_HIT ? resolveHit(target, me, points)
      : rollImpact(target, me, SURE_HIT, hitChance, points, rng);
    if (impact.outcome === "hit") movePoints(source, target, points);
    squares.push({ ...cell, targetId, ...impact });
  }
  return squares;
}
