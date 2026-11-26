// Ultimate rows use the same tank indexes as the compact tick (85-ultimates.md).
import { DIRECTIONS, POINTS_PER_HIT, ULTIMATE_IDS, ULTIMATE_RULES, isUltimateId, type SplashSquare, type ThrowEvent, type UltimateEffect, type UltimateFire, type UltimateId } from "@game/engine";
import type { PlayerId, PublicBot, PublicSnapshot } from "./types.ts";

type Cell = UltimateFire["at"];
type CellRow = readonly [x: number, y: number];
type TankIndex = (id: PlayerId) => number;
type TankId = (index: number) => PlayerId;
type Area = readonly CellRow[];
type Affected = readonly number[];

/** The total follows the original four fields. A ready ultimate has both charge values at 0. */
export type CompactUltimate = readonly [tank: number, ultimate: number, turnsLeft: number, active: number, turnsTotal: number];
type SplashRow =
  | readonly [x: number, y: number, outcome: "empty"]
  | readonly [x: number, y: number, outcome: Exclude<SplashSquare["outcome"], "empty">, target: number];

export type NonMagnetFire = Exclude<UltimateFire, { readonly kind: "magnet" }>;

/** Each row starts with the firing tank, ultimate id, and fire-time square. */
export type CompactFire =
  | readonly [number, "dash", number, number, Area]
  | readonly [number, "splash", number, number, readonly SplashRow[]]
  | readonly [number, "mudBomb", number, number, CellRow | null, Area, Affected, number]
  | readonly [number, "whirlwind", number, number, Area, Affected, points: number]
  | readonly [number, "smoke" | "fullTank" | "bigUmbrella", number, number];

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks the optional fields on a public tank, including a roundStart or monthly state. */
export function hasPublicUltimate(bot: Record<string, unknown>): boolean {
  const { ultimate, ultimateEffect } = bot;
  if (ultimate === undefined) return ultimateEffect === undefined;
  if (!record(ultimate) || !isUltimateId(ultimate["id"])) return false;
  const { kind, turnsLeft, turnsTotal } = ultimate;
  if (kind === "ready" ? turnsLeft !== undefined || turnsTotal !== undefined :
    kind !== "charging" || !positive(turnsLeft) || !positive(turnsTotal) || turnsLeft > turnsTotal) return false;
  if (ultimateEffect === null || ultimateEffect === undefined) return true;
  if (!record(ultimateEffect) || ultimateEffect["kind"] !== ultimate["id"]) return false;
  switch (ultimateEffect["kind"]) {
    case "smoke": return positive(ultimateEffect["turnsLeft"]);
    case "fullTank": return positive(ultimateEffect["freeShots"]);
    case "bigUmbrella": return positive(ultimateEffect["blocksLeft"]);
    default: return false;
  }
}

function isCellRow(row: unknown): row is CellRow {
  return Array.isArray(row) && row.length === 2 && row.every(count);
}

function isArea(rows: unknown, max: number): rows is Area {
  return Array.isArray(rows) && rows.length <= max && rows.every(isCellRow);
}

/** The wire parser has the tank count now; expansion checks squares against the spawn. */
export function hasCompactUltimateFields(states: unknown, fires: unknown, botCount: number): boolean {
  const botIndex = (value: unknown): value is number => count(value) && value < botCount;
  if (states !== undefined && (!Array.isArray(states) || !states.every((row) =>
    Array.isArray(row) && row.length === 5 && botIndex(row[0]) &&
    count(row[1]) && row[1] < ULTIMATE_IDS.length && count(row[2]) && count(row[3]) &&
    (row[2] === 0 ? row[4] === 0 : positive(row[4]) && row[2] <= row[4]) &&
    (row[3] === 0 || effectOf(ULTIMATE_IDS[row[1]], row[3]) !== null)))) return false;
  const affected = (ids: unknown): ids is Affected => Array.isArray(ids) && ids.every(botIndex);
  return fires === undefined || (Array.isArray(fires) && fires.every((row) => {
    if (!Array.isArray(row) || !botIndex(row[0]) || !count(row[2]) || !count(row[3])) return false;
    switch (row[1]) {
      case "dash": return row.length === 5 && isArea(row[4], ULTIMATE_RULES.dash.squares);
      case "splash": return row.length === 5 && Array.isArray(row[4]) && row[4].length <= DIRECTIONS.length && row[4].every((square) =>
        Array.isArray(square) && count(square[0]) && count(square[1]) &&
        (square[2] === "empty" ? square.length === 3 :
          square.length === 4 && ["miss", "hit", "blocked", "dodged"].includes(square[2]) && botIndex(square[3])));
      case "mudBomb": return row.length === 8 && affected(row[6]) && row[7] === row[6].length * POINTS_PER_HIT &&
        (row[4] === null ? Array.isArray(row[5]) && row[5].length === 0 && row[6].length === 0 :
          isCellRow(row[4]) && isArea(row[5], areaSize(ULTIMATE_RULES.mudBomb.reach)));
      case "whirlwind": return row.length === 7 && isArea(row[4], areaSize(ULTIMATE_RULES.whirlwind.reach)) &&
        affected(row[5]) && count(row[6]) && row[6] <= row[5].length * POINTS_PER_HIT;
      case "smoke":
      case "bigUmbrella":
      case "fullTank": return row.length === 4;
      default: return false;
    }
  }));
}

const areaSize = (reach: number): number => (2 * reach + 1) ** 2;
const cellRow = ({ x, y }: Cell): CellRow => [x, y];

function effectOf(id: UltimateId | undefined, active: number): UltimateEffect | null {
  if (active === 0) return null;
  switch (id) {
    case "smoke": return { kind: id, turnsLeft: active };
    case "fullTank": return { kind: id, freeShots: active };
    case "bigUmbrella": return { kind: id, blocksLeft: active };
    default: return null;
  }
}

export function compactUltimate(bot: PublicBot, index: number): CompactUltimate | null {
  const { ultimate, ultimateEffect } = bot;
  if (ultimate === undefined) return null;
  const charge = ultimate.kind === "ready" ? 0 : ultimate.turnsLeft;
  const total = ultimate.kind === "ready" ? 0 : ultimate.turnsTotal;
  const active = ultimateEffect == null ? 0 : ultimateEffect.kind === "smoke" ? ultimateEffect.turnsLeft :
    ultimateEffect.kind === "fullTank" ? ultimateEffect.freeShots : ultimateEffect.blocksLeft;
  return [index, ULTIMATE_IDS.indexOf(ultimate.id), charge, active, total];
}

export function expandUltimate([, index, charge, active, total]: CompactUltimate): Pick<PublicBot, "ultimate" | "ultimateEffect"> {
  const id = ULTIMATE_IDS[index];
  if (id === undefined) throw new Error(`unknown ultimate index ${index}`);
  return {
    ultimate: charge === 0 ? { id, kind: "ready" } : { id, kind: "charging", turnsLeft: charge, turnsTotal: total },
    ultimateEffect: effectOf(id, active),
  };
}

export function compactFire(fire: NonMagnetFire, indexOf: TankIndex): CompactFire {
  const { kind, at: { x, y } } = fire;
  const tank = indexOf(fire.botId);
  switch (kind) {
    // The ram is already in the throws list, in move order with the other shots.
    case "dash": return [tank, kind, x, y, fire.path.map(cellRow)];
    case "splash": return [tank, kind, x, y, fire.squares.map((square): SplashRow => square.outcome === "empty"
      ? [square.x, square.y, square.outcome] : [square.x, square.y, square.outcome, indexOf(square.targetId)])];
    case "mudBomb": return [tank, kind, x, y, fire.center === null ? null : cellRow(fire.center),
      fire.area.map(cellRow), fire.affected.map(indexOf), fire.points];
    case "whirlwind": return [tank, kind, x, y, fire.area.map(cellRow), fire.affected.map(indexOf), fire.points];
    default: return [tank, kind, x, y];
  }
}

export function expandFire(row: CompactFire, idOf: TankId, spawn: PublicSnapshot, shots: ReadonlyMap<PlayerId, ThrowEvent>): NonMagnetFire {
  const [tank, kind, x, y] = row;
  const cell = ([x, y]: CellRow): Cell => {
    if (x >= spawn.width || y >= spawn.height) throw new Error(`ultimate square (${x}, ${y}) is outside the board`);
    return { x, y };
  };
  const botId = idOf(tank);
  const base = { botId, at: cell([x, y]) };
  switch (kind) {
    case "dash": {
      const shot = shots.get(botId);
      if (shot === undefined) throw new Error(`dash from tank ${botId} has no shot`);
      return { ...base, kind, path: row[4].map(cell), shot, points: ULTIMATE_RULES.dash.points };
    }
    case "splash": return { ...base, kind, squares: row[4].map(([x, y, outcome, target]) =>
      outcome === "empty" ? { ...cell([x, y]), outcome } : { ...cell([x, y]), outcome, targetId: idOf(target) }) };
    case "mudBomb": return { ...base, kind, center: row[4] === null ? null : cell(row[4]),
      area: row[5].map(cell), affected: row[6].map(idOf), points: row[7] };
    case "whirlwind": return { ...base, kind, area: row[4].map(cell), affected: row[5].map(idOf), points: row[6] };
    default: return { ...base, kind };
  }
}
