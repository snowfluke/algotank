// The form in which a server saves an arena, and the boundary check for reading it
// back. A row can be damaged or edited by hand, so nothing from it is trusted until
// parseStoredArena has checked it. Strategies go through parseStrategy again, because
// the Strategy type is a brand that only parseStrategy grants.
//
// To add a field to Arena, RoundSummary or ArenaPhase, change the type in types.ts and
// the matching reader below. stored-arena.test.ts fails when they disagree.

import { isRuleSetId, parseStrategy, type Handicap, type RoundConfig, type RuleSetId, type Standing, type Strategy } from "@game/engine";
import { announcementFitsMode, parseArenaSettings, readyIsOpen, seatsOf, tankCountFits } from "./arena.ts";
import type { AccountId } from "./auth-protocol.ts";
import { isResultId } from "./results-protocol.ts";
import {
  isPublicKind,
  joinNeedsAccount,
  parseTankLook,
  type Arena,
  type ArenaKind,
  type ArenaPhase,
  type BannedAccount,
  type Player,
  type PlayerId,
  type PlayerStatus,
  type RoundSummary,
  type StartPlan,
  type TankLook,
} from "./types.ts";

// The version of the shape. Versions 1 to 7 were the arena files of earlier versions of the
// game, which was never deployed; the database holds version 8 only (docs/specs/revamp/83-sqlite.md).
// A later change of the shape raises the version and adds its migration here; any other version
// is refused, so a row is never read with the wrong shape.
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
   * player. It holds one seat in that arena, and the owner reads its email.
   */
  readonly playerAccounts: readonly { readonly playerId: PlayerId; readonly accountId: AccountId }[];
}

export type StoredArenaParse = { readonly ok: true; readonly stored: StoredArena } | { readonly ok: false; readonly error: string };

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
  // The kind decides whether the arena has a chat (createArena), so a stored arena cannot give a public arena one.
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

/** Checks what ties the parts of an arena together, so a hand-edited row cannot hold an arena the reducer could never reach. */
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

/** RoundPlayer.handicap: a number from the rounds of 2026-11-21 before the two parts, or its miss and exposure. */
function handicapOf(raw: unknown, path: string): number | Handicap {
  if (typeof raw === "number") return int(raw, path, 1);
  const h = obj(raw, path);
  const part = (key: "miss" | "exposure") => {
    const value = h[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${path}.${key}`, "a number of at least 0");
    return value;
  };
  return { miss: part("miss"), exposure: part("exposure") };
}

function roundConfig(raw: unknown, path: string): RoundConfig {
  const c = obj(raw, path);
  const survivors = c["survivorsAfterRound"];
  const players = list(c["players"], `${path}.players`).map((x, i) => {
    const p = obj(x, `${path}.players[${i}]`);
    const player = { id: text(p["id"], `${path}.players[${i}].id`), strategy: strategy(p["strategy"], `${path}.players[${i}].strategy`) };
    // A config saved before handicaps (2026-11-20) has none, and plays as it did.
    return p["handicap"] === undefined ? player : { ...player, handicap: handicapOf(p["handicap"], `${path}.players[${i}].handicap`) };
  });
  if (players.length < 2) fail(`${path}.players`, "a list of at least 2 players");
  uniqueIds(players.map((p) => p.id), `${path}.players`);
  return {
    seed: int(c["seed"], `${path}.seed`),
    ticksTotal: int(c["ticksTotal"], `${path}.ticksTotal`, 1),
    survivorsAfterRound: survivors === null ? null : int(survivors, `${path}.survivorsAfterRound`, 1),
    ruleSetId: ruleSetId(c["ruleSetId"], `${path}.ruleSetId`),
    players,
    items: roundOption(c["items"], `${path}.items`),
    ultimates: roundOption(c["ultimates"], `${path}.ultimates`),
    ...(roundOption(c["waitWhenDry"], `${path}.waitWhenDry`) ? { waitWhenDry: true } : {}),
  };
}

/** A config saved before a round feature was added replays with that feature off. */
function roundOption(raw: unknown, path: string): boolean {
  if (raw === undefined) return false;
  if (typeof raw !== "boolean") fail(path, "true or false");
  return raw;
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
    const file = obj(raw, "The arena");
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
    if (error instanceof ShapeError) return { ok: false, error: error.message };
    throw error;
  }
}
