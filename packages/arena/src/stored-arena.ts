// The form in which a server saves an arena, and the boundary check for reading it
// back. A file can be damaged or edited by hand, so nothing from it is trusted until
// parseStoredArena has checked it. Strategies go through parseStrategy again, because
// the Strategy type is a brand that only parseStrategy grants.
//
// To add a field to Arena, RoundSummary or ArenaPhase, change the type in types.ts and
// the matching reader below. stored-arena.test.ts fails when they disagree.

import { isRuleSetId, parseStrategy, type RoundConfig, type RuleSetId, type Standing, type Strategy } from "@game/engine";
import { announcementFitsMode, parseArenaSettings, readyIsOpen, seatsOf, tankCountFits } from "./arena.ts";
import type { AccountId } from "./auth-protocol.ts";
import { isResultId } from "./results-protocol.ts";
import {
  isPublicKind,
  joinNeedsAccount,
  parseTankLook,
  plainTankLook,
  TANK_COLOUR_COUNT,
  type Arena,
  type ArenaKind,
  type ArenaPhase,
  type BannedAccount,
  type Player,
  type PlayerId,
  type PlayerStatus,
  type RoundSummary,
  type StartPlan,
  type TankColour,
  type TankLook,
} from "./types.ts";

// Version 2 added arena kinds, owners, bots, colours and games, and dropped the host token.
// A version 1 file cannot be read: it has no owner, so nobody could manage its arena.
// Version 3 dropped arena.settings.inputMode, when the owner removed the developer mode
// (2026-11-12). A version 2 file is read through fromVersion2 and saved as version 3.
// Version 4 replaced each player's `colour` with a `look` (tank identity, 2026-11-12). A
// version 3 file is read through fromVersion3 and saved as version 4; a version 2 file
// takes both steps.
// Version 5 replaced the kind "public" with "practice", "tournament" and "monthly", added each
// player's `ready` and the `playerAccounts` of a monthly arena (three public arenas,
// 2026-11-12). A version 4 file of a private or presenter arena is read through fromVersion4.
// A version 4 file of a "public" arena is retired: public rooms hold nothing worth keeping,
// so the loader drops it (parseStoredArena answers `retired`).
// Version 6 added `arena.chat` (arena chat, 2026-11-12). A version 5 file is read through
// fromVersion5: "on" in a private or presenter arena, null in a public one.
// Version 7 added the organiser tournament (2026-11-13): `settings.joinPolicy`, the start
// plan of a lobby or break (`phase.start`), the finished phase's `resultId`, `arena.banned`, the
// status "removed", and `playerAccounts` in a signed-in-only arena. A version 6 file is read
// through fromVersion6: joinPolicy "anyone", start waiting, resultId null, banned empty.
// Version 8 added `settings.tankCount` (arena seats, docs/specs/revamp/78-arena-seats.md). A
// version 7 file is read through fromVersion7: tankCount null, which keeps the kind's fixed numbers
// (a private arena takes 64 people and fills bots to 8, a presenter arena 512 and 8), so a stored
// arena plays as before until its owner sets a number in the lobby.
export const STORED_ARENA_VERSION = 8;

export interface StoredArena {
  readonly version: typeof STORED_ARENA_VERSION;
  readonly arena: Arena;
  /** The account that created the arena; null for a public arena, which the server runs. */
  readonly ownerAccountId: AccountId | null;
  /** Milliseconds since 1970 of the last event or round. An idle arena expires after ARENA_TTL_HOURS. */
  readonly lastActivityAt: number;
  /** Secret. Bots have none. */
  readonly playerTokens: readonly { readonly playerId: PlayerId; readonly token: string }[];
  /** The players and strategies of every round that started, which a replay needs. */
  readonly roundConfigs: readonly { readonly round: number; readonly config: RoundConfig }[];
  /**
   * Signed-in-only arena only (empty elsewhere): the signed-in account behind each human
   * player. It holds one seat in that arena, and the owner reads its email. (Version 5 to 7 also
   * kept them for the old monthly arena, which apps/server/src/monthly/set-aside.ts sets aside.)
   */
  readonly playerAccounts: readonly { readonly playerId: PlayerId; readonly accountId: AccountId }[];
}

export type StoredArenaParse =
  | { readonly ok: true; readonly stored: StoredArena }
  /** `retired`: a file of a kind this version no longer has; the loader drops it with a log line instead of stopping. */
  | { readonly ok: false; readonly error: string; readonly retired: boolean };

/** Thrown by the readers below and caught once, in parseStoredArena. */
class ShapeError extends Error {}

type Obj = Readonly<Record<string, unknown>>;

function fail(path: string, expected: string): never {
  throw new ShapeError(`${path} must be ${expected}.`);
}

function obj(value: unknown, path: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "an object");
  return value as Obj;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "a list");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "text");
  return value;
}

function int(value: unknown, path: string, min = Number.MIN_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) fail(path, `a whole number of at least ${min}`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "true or false");
  return value;
}

function ruleSetId(value: unknown, path: string): RuleSetId {
  if (!isRuleSetId(value)) fail(path, "the id of a rule set");
  return value;
}

function look(value: unknown, path: string): TankLook {
  const parsed = parseTankLook(value);
  if (parsed === null) fail(path, "a tank look (colour, skin, second, plate and icon)");
  return parsed;
}

function strategy(value: unknown, path: string): Strategy {
  const parsed = parseStrategy(value);
  if (!parsed.ok) fail(path, `a valid strategy (${parsed.errors.join(" ")})`);
  return parsed.strategy;
}

function playerStatus(raw: unknown, path: string): PlayerStatus {
  const status = obj(raw, path);
  switch (status["kind"]) {
    case "playing":
      return { kind: "playing" };
    case "winner":
      return { kind: "winner" };
    case "waiting":
      return { kind: "waiting" };
    case "removed":
      return { kind: "removed" };
    case "eliminated":
      return {
        kind: "eliminated",
        inRound: int(status["inRound"], `${path}.inRound`, 1),
        finalRank: int(status["finalRank"], `${path}.finalRank`, 1),
      };
    default:
      return fail(`${path}.kind`, "playing, eliminated, winner, waiting or removed");
  }
}

function player(raw: unknown, path: string): Player {
  const p = obj(raw, path);
  return {
    id: text(p["id"], `${path}.id`),
    name: text(p["name"], `${path}.name`),
    strategy: strategy(p["strategy"], `${path}.strategy`),
    status: playerStatus(p["status"], `${path}.status`),
    isBot: bool(p["isBot"], `${path}.isBot`),
    look: look(p["look"], `${path}.look`),
    ready: bool(p["ready"], `${path}.ready`),
  };
}

function standing(raw: unknown, path: string): Standing {
  const s = obj(raw, path);
  const score = s["score"];
  if (typeof score !== "number" || !Number.isFinite(score)) fail(`${path}.score`, "a number");
  return {
    botId: text(s["botId"], `${path}.botId`),
    score,
    rank: int(s["rank"], `${path}.rank`, 1),
    hitsLanded: hitCount(s["hitsLanded"], `${path}.hitsLanded`),
    hitsTaken: hitCount(s["hitsTaken"], `${path}.hitsTaken`),
  };
}

/**
 * Files written before standings carried hit counts have no such field. They load
 * with 0, so an event in progress survives the upgrade; only its hits recap reads 0.
 */
function hitCount(raw: unknown, path: string): number {
  return raw === undefined ? 0 : int(raw, path, 0);
}

function idList(raw: unknown, path: string): readonly string[] {
  return list(raw, path).map((id, i) => text(id, `${path}[${i}]`));
}

function summary(raw: unknown, path: string): RoundSummary {
  const s = obj(raw, path);
  return {
    round: int(s["round"], `${path}.round`, 1),
    isFinal: bool(s["isFinal"], `${path}.isFinal`),
    seed: int(s["seed"], `${path}.seed`),
    ruleSetId: ruleSetId(s["ruleSetId"], `${path}.ruleSetId`),
    standings: list(s["standings"], `${path}.standings`).map((x, i) => standing(x, `${path}.standings[${i}]`)),
    survivors: idList(s["survivors"], `${path}.survivors`),
  };
}

function startPlan(raw: unknown, path: string): StartPlan {
  const plan = obj(raw, path);
  switch (plan["kind"]) {
    case "waiting":
      return { kind: "waiting" };
    case "missed":
      return { kind: "missed" };
    case "scheduled":
      return { kind: "scheduled", startsAt: int(plan["startsAt"], `${path}.startsAt`, 0) };
    default:
      return fail(`${path}.kind`, "waiting, scheduled or missed");
  }
}

function phase(raw: unknown, path: string): ArenaPhase {
  const p = obj(raw, path);
  const nextRuleSetId = (): RuleSetId | null => {
    const value = p["nextRuleSetId"];
    return value === null ? null : ruleSetId(value, `${path}.nextRuleSetId`);
  };
  switch (p["kind"]) {
    case "lobby":
      return { kind: "lobby", nextRuleSetId: nextRuleSetId(), start: startPlan(p["start"], `${path}.start`) };
    case "break":
      return {
        kind: "break",
        nextRound: int(p["nextRound"], `${path}.nextRound`, 1),
        nextRuleSetId: nextRuleSetId(),
        start: startPlan(p["start"], `${path}.start`),
      };
    case "finished": {
      const resultId = p["resultId"];
      if (resultId !== null && !isResultId(resultId)) fail(`${path}.resultId`, "null or a result id");
      return { kind: "finished", winnerId: text(p["winnerId"], `${path}.winnerId`), resultId };
    }
    case "running": {
      const isFinal = bool(p["isFinal"], `${path}.isFinal`);
      const survivors = p["survivorsAfterRound"];
      if (isFinal ? survivors !== null : typeof survivors !== "number") {
        fail(`${path}.survivorsAfterRound`, isFinal ? "null in a final" : "a number outside a final");
      }
      return {
        kind: "running",
        round: int(p["round"], `${path}.round`, 1),
        isFinal,
        seed: int(p["seed"], `${path}.seed`),
        ruleSetId: ruleSetId(p["ruleSetId"], `${path}.ruleSetId`),
        playerIds: idList(p["playerIds"], `${path}.playerIds`),
        survivorsAfterRound: survivors === null ? null : int(survivors, `${path}.survivorsAfterRound`, 1),
      };
    }
    default:
      return fail(`${path}.kind`, "lobby, running, break or finished");
  }
}

function chatSetting(value: unknown, kind: ArenaKind): Arena["chat"] {
  // The kind decides whether the arena has a chat (createArena), so a file cannot give a public arena one.
  if (isPublicKind(kind)) {
    if (value !== null) fail("arena.chat", "null in a public arena");
    return null;
  }
  if (value !== "on" && value !== "off") fail("arena.chat", '"on" or "off" in a private or presenter arena');
  return value;
}

function bannedList(raw: unknown): readonly BannedAccount[] {
  return list(raw, "arena.banned").map((x, i) => {
    const entry = obj(x, `arena.banned[${i}]`);
    const accountId = text(entry["accountId"], `arena.banned[${i}].accountId`);
    if (accountId === "") fail(`arena.banned[${i}].accountId`, "not empty");
    return { accountId, name: text(entry["name"], `arena.banned[${i}].name`) };
  });
}

function uniqueIds(ids: readonly string[], path: string): void {
  if (new Set(ids).size !== ids.length) fail(path, "a list without repeats");
}

/** Checks what ties the parts of an arena together, so a hand-edited file cannot hold an arena the reducer could never reach. */
function checkArena(arena: Arena): void {
  const playerIds = arena.players.map((p) => p.id);
  uniqueIds(playerIds, "arena.players");
  const { kind, tankCount } = arena.settings;
  if (isPublicKind(kind) ? tankCount !== null : tankCount !== null && !tankCountFits(kind, tankCount)) {
    fail("arena.settings.tankCount", isPublicKind(kind) ? "null in a public arena" : "null or a tank count this kind allows");
  }
  const seats = seatsOf(arena.settings);
  if (arena.players.filter((p) => !p.isBot).length > seats.people) fail("arena.players", `a list of at most ${seats.people} human players`);
  if (arena.players.filter((p) => p.isBot).length > seats.botsFillTo) fail("arena.players", `a list of at most ${seats.botsFillTo} bots`);
  if (!isPublicKind(kind) && arena.players.some((p) => p.status.kind === "waiting")) {
    fail("arena.players", "free of waiting players outside a public arena");
  }
  // Ready belongs to the lobby and the result of a public arena (see Ready in types.ts). The
  // shape of the file did not change when the result accepted it, so the version stayed 6.
  if (!readyIsOpen(arena) && arena.players.some((p) => p.ready)) {
    fail("arena.players", "free of ready players outside the phases where ready is open");
  }
  // "removed" exists between a break and the reset, in an owner's arena (see ownerRemove in types.ts).
  if ((isPublicKind(kind) || arena.phase.kind === "lobby") && arena.players.some((p) => p.status.kind === "removed")) {
    fail("arena.players", "free of removed players in a lobby and in a public arena");
  }
  uniqueIds(arena.banned.map((b) => b.accountId), "arena.banned");
  if (!joinNeedsAccount(arena.settings.joinPolicy) && arena.banned.length > 0) fail("arena.banned", "empty outside a signed-in-only arena");
  if (isPublicKind(kind)) {
    const { phase: current } = arena;
    if ((current.kind === "lobby" || current.kind === "break") && current.start.kind !== "waiting") {
      fail("arena.phase.start", "waiting in a public arena, whose own timers start its rounds");
    }
    if (current.kind === "finished" && current.resultId !== null) fail("arena.phase.resultId", "null in a public arena");
  }
  const known = new Set(playerIds);
  const mustExist = (ids: readonly string[], path: string) => {
    if (!ids.every((id) => known.has(id))) fail(path, "ids of players in this arena");
  };

  arena.rounds.forEach((r, i) => {
    if (r.round !== i + 1) fail(`arena.rounds[${i}].round`, `${i + 1}`);
    mustExist(r.standings.map((s) => s.botId), `arena.rounds[${i}].standings`);
    mustExist(r.survivors, `arena.rounds[${i}].survivors`);
  });

  const { phase: current, rounds, settings } = arena;
  switch (current.kind) {
    case "lobby":
      if (rounds.length !== 0) fail("arena.rounds", "empty in the lobby");
      break;
    case "break":
      if (current.nextRound !== rounds.length + 1) fail("arena.phase.nextRound", `${rounds.length + 1}`);
      break;
    case "running":
      if (current.round !== rounds.length + 1) fail("arena.phase.round", `${rounds.length + 1}`);
      mustExist(current.playerIds, "arena.phase.playerIds");
      break;
    case "finished":
      if (!known.has(current.winnerId)) fail("arena.phase.winnerId", "the id of a player in this arena");
      if (rounds.at(-1)?.isFinal !== true) fail("arena.rounds", "ending with a final when the event is finished");
      break;
  }
  if (
    (current.kind === "lobby" || current.kind === "break") &&
    !announcementFitsMode(settings.ruleSetMode, current.nextRuleSetId)
  ) {
    fail("arena.phase.nextRuleSetId", `a value that fits the mode "${settings.ruleSetMode}"`);
  }
}

function readArena(raw: unknown): Arena {
  const a = obj(raw, "arena");
  const settings = parseArenaSettings(a["settings"]);
  if (!settings.ok) fail("arena.settings", `valid settings (${settings.problems.join(" ")})`);
  const arena: Arena = {
    id: text(a["id"], "arena.id"),
    settings: settings.settings,
    players: list(a["players"], "arena.players").map((p, i) => player(p, `arena.players[${i}]`)),
    phase: phase(a["phase"], "arena.phase"),
    rounds: list(a["rounds"], "arena.rounds").map((r, i) => summary(r, `arena.rounds[${i}]`)),
    game: int(a["game"], "arena.game", 1),
    chat: chatSetting(a["chat"], settings.settings.kind),
    banned: bannedList(a["banned"]),
  };
  checkArena(arena);
  return arena;
}

function roundConfig(raw: unknown, path: string): RoundConfig {
  const c = obj(raw, path);
  const survivors = c["survivorsAfterRound"];
  const players = list(c["players"], `${path}.players`).map((x, i) => {
    const p = obj(x, `${path}.players[${i}]`);
    return { id: text(p["id"], `${path}.players[${i}].id`), strategy: strategy(p["strategy"], `${path}.players[${i}].strategy`) };
  });
  if (players.length < 2) fail(`${path}.players`, "a list of at least 2 players");
  uniqueIds(players.map((p) => p.id), `${path}.players`);
  return {
    seed: int(c["seed"], `${path}.seed`),
    ticksTotal: int(c["ticksTotal"], `${path}.ticksTotal`, 1),
    survivorsAfterRound: survivors === null ? null : int(survivors, `${path}.survivorsAfterRound`, 1),
    ruleSetId: ruleSetId(c["ruleSetId"], `${path}.ruleSetId`),
    players,
  };
}

/** A replay is recomputed from the config, so the config of a completed round must be the one that was played. */
function checkRoundConfigs(arena: Arena, configs: StoredArena["roundConfigs"]): void {
  uniqueIds(configs.map((c) => String(c.round)), "roundConfigs");
  for (const played of arena.rounds) {
    const entry = configs.find((c) => c.round === played.round);
    if (entry === undefined) fail("roundConfigs", `holding round ${played.round}, which completed`);
    const { config } = entry;
    const sameField = config.seed === played.seed && config.ruleSetId === played.ruleSetId;
    const samePlayers =
      config.players.length === played.standings.length &&
      config.players.every((p) => played.standings.some((s) => s.botId === p.id));
    if (!sameField || !samePlayers) fail(`roundConfigs for round ${played.round}`, "the round that completed");
  }
}

/**
 * A version 2 file is a version 3 file with `arena.settings.inputMode`, so dropping that
 * one field is the whole migration. When `arena` or its settings are not objects, the file
 * passes through unchanged apart from the version, so the readers name what is wrong.
 */
function fromVersion2(file: Obj): Obj {
  const arena = file["arena"];
  if (typeof arena !== "object" || arena === null || Array.isArray(arena)) return { ...file, version: 3 };
  const settings = (arena as Obj)["settings"];
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return { ...file, version: 3 };
  const { inputMode: _dropped, ...rest } = settings as Obj;
  return { ...file, version: 3, arena: { ...(arena as Obj), settings: rest } };
}

/** Version 3 had 8 colours and version 4 has 12, so a whole number is clamped into 1 to 12. */
function clampedColour(value: number): TankColour {
  return Math.min(Math.max(value, 1), TANK_COLOUR_COUNT) as TankColour;
}

/**
 * A version 3 player has `colour` where a version 4 player has `look`. A player whose
 * colour is a whole number gets a plain look in that colour. Anything else passes
 * through unchanged apart from the version, so the readers name what is wrong.
 */
function fromVersion3(file: Obj): Obj {
  const arena = file["arena"];
  if (typeof arena !== "object" || arena === null || Array.isArray(arena)) return { ...file, version: 4 };
  const players = (arena as Obj)["players"];
  if (!Array.isArray(players)) return { ...file, version: 4 };
  const migrated = players.map((raw: unknown) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
    const { colour: old, ...rest } = raw as Obj;
    if (typeof old !== "number" || !Number.isSafeInteger(old)) return raw;
    return { ...rest, look: plainTankLook(clampedColour(old)) };
  });
  return { ...file, version: 4, arena: { ...(arena as Obj), players: migrated } };
}

/** Thrown by fromVersion4 for a file of the retired kind "public". */
class RetiredError extends Error {}

/**
 * A version 4 player has no `ready`, and a version 4 file has no `playerAccounts`: every
 * player gets ready false and the file an empty list. The kind "public" no longer exists,
 * so such a file is retired. Anything else passes through apart from the version.
 */
function fromVersion4(file: Obj): Obj {
  const arena = file["arena"];
  if (typeof arena !== "object" || arena === null || Array.isArray(arena)) return { ...file, version: 5, playerAccounts: [] };
  const settings = (arena as Obj)["settings"];
  if (typeof settings === "object" && settings !== null && (settings as Obj)["kind"] === "public") {
    throw new RetiredError("it holds a public arena of an older version, which had one public kind. Public rooms hold nothing worth keeping");
  }
  const players = (arena as Obj)["players"];
  const migrated = Array.isArray(players)
    ? players.map((raw: unknown) => (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? { ...(raw as Obj), ready: false } : raw))
    : players;
  return { ...file, version: 5, playerAccounts: [], arena: { ...(arena as Obj), players: migrated } };
}

/**
 * A version 5 arena has no `chat`: a private or presenter arena gets "on", the default of a new
 * one, and a public arena null. Anything else passes through apart from the version.
 */
function fromVersion5(file: Obj): Obj {
  const arena = file["arena"];
  if (typeof arena !== "object" || arena === null || Array.isArray(arena)) return { ...file, version: 6 };
  const settings = (arena as Obj)["settings"];
  const kind = typeof settings === "object" && settings !== null ? (settings as Obj)["kind"] : undefined;
  const chat = kind === "private" || kind === "presenter" ? "on" : null;
  return { ...file, version: 6, arena: { ...(arena as Obj), chat } };
}

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A version 6 file has no joinPolicy, no start plan, no resultId and no ban list. Its arenas
 * took any visitor, waited for the owner, and were never stored as results, so the defaults say
 * exactly that. Anything else passes through apart from the version.
 */
function fromVersion6(file: Obj): Obj {
  const arena = file["arena"];
  if (!isObj(arena)) return { ...file, version: 7 };
  const settings = arena["settings"];
  const phase = arena["phase"];
  let nextPhase: unknown = phase;
  if (isObj(phase) && (phase["kind"] === "lobby" || phase["kind"] === "break")) nextPhase = { ...phase, start: { kind: "waiting" } };
  if (isObj(phase) && phase["kind"] === "finished") nextPhase = { ...phase, resultId: null };
  return {
    ...file,
    version: 7,
    arena: { ...arena, settings: isObj(settings) ? { ...settings, joinPolicy: "anyone" } : settings, phase: nextPhase, banned: [] },
  };
}

/**
 * A version 7 file has no tankCount. null keeps the numbers its kind had then (seatsOf), so the
 * arena plays as before. Anything else passes through apart from the version.
 */
function fromVersion7(file: Obj): Obj {
  const arena = file["arena"];
  if (!isObj(arena)) return { ...file, version: 8 };
  const settings = arena["settings"];
  return { ...file, version: 8, arena: { ...arena, settings: isObj(settings) ? { ...settings, tankCount: null } : settings } };
}

/** Takes an older file through each migration in turn, oldest first. */
function migrate(read: Obj): Obj {
  const v3 = read["version"] === 2 ? fromVersion2(read) : read;
  const v4 = v3["version"] === 3 ? fromVersion3(v3) : v3;
  const v5 = v4["version"] === 4 ? fromVersion4(v4) : v4;
  const v6 = v5["version"] === 5 ? fromVersion5(v5) : v5;
  const v7 = v6["version"] === 6 ? fromVersion6(v6) : v6;
  return v7["version"] === 7 ? fromVersion7(v7) : v7;
}

function playerAccounts(raw: unknown, arena: Arena): StoredArena["playerAccounts"] {
  const entries = list(raw, "playerAccounts").map((x, i) => {
    const entry = obj(x, `playerAccounts[${i}]`);
    const playerId = text(entry["playerId"], `playerAccounts[${i}].playerId`);
    if (!arena.players.some((p) => p.id === playerId && !p.isBot)) {
      fail(`playerAccounts[${i}].playerId`, "the id of a human player in this arena");
    }
    const accountId = text(entry["accountId"], `playerAccounts[${i}].accountId`);
    if (accountId === "") fail(`playerAccounts[${i}].accountId`, "not empty");
    return { playerId, accountId };
  });
  uniqueIds(entries.map((e) => e.playerId), "playerAccounts");
  uniqueIds(entries.map((e) => e.accountId), "playerAccounts accounts");
  // Version 5 to 7 also kept the accounts of a monthly arena; the server sets such a file aside before it parses (apps/server/src/monthly/set-aside.ts).
  const withAccounts = joinNeedsAccount(arena.settings.joinPolicy);
  if (!withAccounts && entries.length > 0) fail("playerAccounts", "empty outside a signed-in-only arena");
  // Only a signed-in account joins these arenas, so every human there has one.
  if (withAccounts && entries.length !== arena.players.filter((p) => !p.isBot).length) {
    fail("playerAccounts", "one entry for each human player of a signed-in-only arena");
  }
  return entries;
}

export function parseStoredArena(raw: unknown): StoredArenaParse {
  try {
    const file = migrate(obj(raw, "The file"));
    if (file["version"] === 1) {
      fail("version", `${STORED_ARENA_VERSION}, but this file comes from an older version of AlgoTank that had host keys. Move it out of the data directory to start`);
    }
    if (file["version"] !== STORED_ARENA_VERSION) fail("version", `${STORED_ARENA_VERSION}`);
    const arena = readArena(file["arena"]);
    const playerTokens = list(file["playerTokens"], "playerTokens").map((x, i) => {
      const entry = obj(x, `playerTokens[${i}]`);
      const playerId = text(entry["playerId"], `playerTokens[${i}].playerId`);
      if (!arena.players.some((p) => p.id === playerId && !p.isBot)) {
        fail(`playerTokens[${i}].playerId`, "the id of a human player in this arena");
      }
      const token = text(entry["token"], `playerTokens[${i}].token`);
      if (token === "") fail(`playerTokens[${i}].token`, "not empty");
      return { playerId, token };
    });
    uniqueIds(playerTokens.map((t) => t.playerId), "playerTokens");
    const owner = file["ownerAccountId"];
    const isPublic = isPublicKind(arena.settings.kind);
    if (isPublic ? owner !== null : typeof owner !== "string" || owner === "") {
      fail("ownerAccountId", isPublic ? "null for a public arena" : "the id of an account");
    }
    const ownerAccountId = owner === null ? null : text(owner, "ownerAccountId");
    const lastActivityAt = int(file["lastActivityAt"], "lastActivityAt", 0);
    const roundConfigs = list(file["roundConfigs"], "roundConfigs").map((x, i) => {
      const entry = obj(x, `roundConfigs[${i}]`);
      return { round: int(entry["round"], `roundConfigs[${i}].round`, 1), config: roundConfig(entry["config"], `roundConfigs[${i}].config`) };
    });
    checkRoundConfigs(arena, roundConfigs);
    return {
      ok: true,
      stored: {
        version: STORED_ARENA_VERSION,
        arena,
        ownerAccountId,
        lastActivityAt,
        playerTokens,
        roundConfigs,
        playerAccounts: playerAccounts(file["playerAccounts"], arena),
      },
    };
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, error: error.message, retired: false };
    if (error instanceof RetiredError) return { ok: false, error: error.message, retired: true };
    throw error;
  }
}
