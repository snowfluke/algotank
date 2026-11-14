// The arena reducer. Every change to an Arena goes through applyEvent. The arena
// kinds, the state machine and the player-action guards are written at the top of types.ts.

import {
  ARENA_KINDS,
  FINAL_SIZE,
  RULE_SET_MODES,
  isArenaKind,
  isJoinPolicy,
  JOIN_POLICIES,
  joinNeedsAccount,
  isPublicKind,
  isRuleSetMode,
  parsePlayerName,
  parseTankLook,
  PLAYER_NAME_MAX,
  type Arena,
  type ArenaError,
  type ArenaEvent,
  type ArenaId,
  type ArenaKind,
  type ArenaResult,
  type ArenaSettings,
  type AutoStep,
  type Player,
  type PlayerId,
  type PlayerStatus,
  type PublicArena,
  type RoundSummary,
  type RuleSetMode,
  type StartPlan,
  WAITING,
} from "./types.ts";
import type { AccountId } from "./auth-protocol.ts";
import { isRuleSetId, STANDARD_RULE_SET_ID, type RuleSetId, type Standing } from "@game/engine";

const SETTINGS_NAME_MAX = 60;
const TICKS_PER_ROUND_MIN = 20;
const TICKS_PER_ROUND_MAX = 600;
const TICK_MS_MIN = 100;
const TICK_MS_MAX = 5000;
const MIN_PLAYERS_TO_START = 2;

/** The limits above, for forms that check input before they send it. */
export const ARENA_LIMITS = {
  /** The same number as PLAYER_NAME_MAX in types.ts, kept here because the join form reads it. */
  playerNameMax: PLAYER_NAME_MAX,
  arenaNameMax: SETTINGS_NAME_MAX,
  ticksPerRoundMin: TICKS_PER_ROUND_MIN,
  ticksPerRoundMax: TICKS_PER_ROUND_MAX,
  tickMsMin: TICK_MS_MIN,
  tickMsMax: TICK_MS_MAX,
  minPlayersToStart: MIN_PLAYERS_TO_START,
} as const;

/**
 * The most human players an arena of this kind holds when its numbers are fixed (tankCount
 * null), waiting ones included, and the top of tankCountRange for an owner's arena. Bots do not
 * count: they fill seats up to botFillSizeOf(kind), and every kind holds at least that many.
 * Read seatsOf(settings) for an arena.
 */
export function maxPlayersOf(kind: ArenaKind): number {
  switch (kind) {
    case "private":
      // A friend group's tournament, as large as the public tournament arena (owner, 2026-11-13).
      return 64;
    case "presenter":
      // Cut rounds start with 512, 256, 128, 64, 32 and 16 players, then 8 play the final: 7 rounds (docs/decisions, "Large arenas").
      return 512;
    case "practice":
      return 8;
    case "tournament":
      return 64;
  }
}

/**
 * Bots fill the seats up to this many players when a game starts in an arena with fixed numbers
 * (tankCount null), and such an arena never holds more bots than this. The tournament fills to 16
 * so that there is always a cut round before the final (docs/specs/revamp/67-public-arenas.md).
 * Read seatsOf(settings) for an arena.
 */
export function botFillSizeOf(kind: ArenaKind): number {
  return kind === "tournament" ? 2 * FINAL_SIZE : FINAL_SIZE;
}

/** The tank counts an owner may choose, and the create form's first value (docs/specs/revamp/78-arena-seats.md). */
export interface TankCountRange {
  readonly min: number;
  readonly max: number;
  readonly initial: number;
}

/** null for a public arena, whose numbers are fixed by its kind. */
export function tankCountRange(kind: "private" | "presenter"): TankCountRange;
export function tankCountRange(kind: ArenaKind): TankCountRange | null;
export function tankCountRange(kind: ArenaKind): TankCountRange | null {
  switch (kind) {
    case "private":
      return { min: MIN_PLAYERS_TO_START, max: maxPlayersOf(kind), initial: 16 };
    case "presenter":
      return { min: MIN_PLAYERS_TO_START, max: maxPlayersOf(kind), initial: maxPlayersOf(kind) };
    case "practice":
    case "tournament":
      return null;
  }
}

/** True when `count` is a tank count an owner may choose for this kind. */
export function tankCountFits(kind: ArenaKind, count: number): boolean {
  const range = tankCountRange(kind);
  return range !== null && integerInRange(count, range.min, range.max);
}

export interface Seats {
  /** The most human players the arena takes, waiting ones included; one more is arena_full. */
  readonly people: number;
  /** With botFill on, bots fill the seats up to this many tanks when a game starts; the arena never holds more bots. */
  readonly botsFillTo: number;
}

/**
 * How many tanks an arena has: the one answer for the join check, the bot fill, the stored-file
 * check and the forms. An owner's tank count gives both numbers; null gives the kind's fixed ones.
 */
export function seatsOf(settings: Pick<ArenaSettings, "kind" | "tankCount">): Seats {
  const { kind, tankCount } = settings;
  if (tankCount === null) return { people: maxPlayersOf(kind), botsFillTo: botFillSizeOf(kind) };
  return { people: tankCount, botsFillTo: tankCount };
}

/** How many bots the start of a game adds to `players` tanks: none with botFill off or when the seats are taken. */
export function botsToAddAtStart(settings: Pick<ArenaSettings, "kind" | "tankCount" | "botFill">, players: number): number {
  return settings.botFill ? Math.max(0, seatsOf(settings).botsFillTo - players) : 0;
}

/** How many players a non-final round keeps. */
export function survivorCount(n: number): number {
  return Math.max(FINAL_SIZE, Math.ceil(n / 2));
}

/** A round is the final when this many players or fewer start it. */
export function isFinalRound(n: number): boolean {
  return n <= FINAL_SIZE;
}

/** Counts code points, so an emoji counts as one character. */
function lengthInCharacters(text: string): number {
  return Array.from(text).length;
}

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * True when `id` is a legal announcement of the next round's rule set in this mode.
 * One place holds this rule for createArena, startRound, roundCompleted and the loader
 * of stored arenas.
 */
export function announcementFitsMode(mode: RuleSetMode, id: RuleSetId | null): boolean {
  switch (mode) {
    case "standard":
      return id === STANDARD_RULE_SET_ID;
    case "announced":
      return id !== null && isRuleSetId(id);
    case "surprise":
      return id === null;
  }
}

export type SettingsParse =
  | { readonly ok: true; readonly settings: ArenaSettings }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * The boundary check for settings that arrive as unknown data (a request body, a stored
 * file). It checks types and the enumerations. createArena owns the ranges and the
 * rules of a public arena.
 */
export function parseArenaSettings(raw: unknown): SettingsParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, problems: ["The settings must be an object."] };
  }
  const { name, kind, ticksPerRound, tickMs, ruleSetMode, botFill, joinPolicy, tankCount } = raw as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof name !== "string") problems.push("name must be text.");
  if (!isArenaKind(kind)) problems.push(`kind must be one of: ${ARENA_KINDS.join(", ")}.`);
  if (typeof ticksPerRound !== "number") problems.push("ticksPerRound must be a number.");
  if (typeof tickMs !== "number") problems.push("tickMs must be a number.");
  if (!isRuleSetMode(ruleSetMode)) problems.push(`ruleSetMode must be one of: ${RULE_SET_MODES.join(", ")}.`);
  if (typeof botFill !== "boolean") problems.push("botFill must be true or false.");
  if (!isJoinPolicy(joinPolicy)) problems.push(`joinPolicy must be one of: ${JOIN_POLICIES.join(", ")}.`);
  if (tankCount !== null && typeof tankCount !== "number") problems.push("tankCount must be a number or null.");
  if (
    typeof name !== "string" ||
    !isArenaKind(kind) ||
    typeof ticksPerRound !== "number" ||
    typeof tickMs !== "number" ||
    !isRuleSetMode(ruleSetMode) ||
    typeof botFill !== "boolean" ||
    !isJoinPolicy(joinPolicy) ||
    (tankCount !== null && typeof tankCount !== "number")
  ) {
    return { ok: false, problems };
  }
  return { ok: true, settings: { name, kind, ticksPerRound, tickMs, ruleSetMode, botFill, joinPolicy, tankCount } };
}

/**
 * `nextRuleSetId` is the first announcement, held by the lobby. The server draws it,
 * and this function rejects one that does not fit the mode.
 */
export function createArena(id: ArenaId, settings: ArenaSettings, nextRuleSetId: RuleSetId | null): Arena {
  const name = settings.name.trim();
  const nameLength = lengthInCharacters(name);
  if (isPublicKind(settings.kind)) {
    // A public arena has no owner to name it; the client shows the translated name of its kind.
    if (nameLength !== 0) throw new Error("A public arena has no name.");
    if (!settings.botFill) throw new Error("A public arena always fills empty seats with bots.");
    // The setting belongs to an owner's arena.
    if (settings.joinPolicy !== "anyone") throw new Error("A public arena has no joinPolicy other than anyone.");
    if (settings.tankCount !== null) throw new Error("A public arena has the fixed numbers of its kind, so its tankCount is null.");
  } else if (nameLength < 1 || nameLength > SETTINGS_NAME_MAX) {
    throw new Error(`Arena name must be 1 to ${SETTINGS_NAME_MAX} characters after trimming.`);
  }
  if (!isArenaKind(settings.kind)) {
    throw new Error(`kind must be one of: ${ARENA_KINDS.join(", ")}.`);
  }
  // null exists in an owner's arena only for files stored before version 8; a new one has a number.
  if (!isPublicKind(settings.kind) && (settings.tankCount === null || !tankCountFits(settings.kind, settings.tankCount))) {
    const range = tankCountRange(settings.kind);
    throw new Error(`tankCount must be an integer from ${range?.min} to ${range?.max}.`);
  }
  if (!integerInRange(settings.ticksPerRound, TICKS_PER_ROUND_MIN, TICKS_PER_ROUND_MAX)) {
    throw new Error(`ticksPerRound must be an integer from ${TICKS_PER_ROUND_MIN} to ${TICKS_PER_ROUND_MAX}.`);
  }
  if (!integerInRange(settings.tickMs, TICK_MS_MIN, TICK_MS_MAX)) {
    throw new Error(`tickMs must be an integer from ${TICK_MS_MIN} to ${TICK_MS_MAX}.`);
  }
  if (!isRuleSetMode(settings.ruleSetMode)) {
    throw new Error(`ruleSetMode must be one of: ${RULE_SET_MODES.join(", ")}.`);
  }
  if (!announcementFitsMode(settings.ruleSetMode, nextRuleSetId)) {
    throw new Error(`The first rule set announcement ${String(nextRuleSetId)} does not fit the mode "${settings.ruleSetMode}".`);
  }
  return {
    id,
    settings: {
      name,
      kind: settings.kind,
      ticksPerRound: settings.ticksPerRound,
      tickMs: settings.tickMs,
      ruleSetMode: settings.ruleSetMode,
      botFill: settings.botFill,
      joinPolicy: settings.joinPolicy,
      tankCount: settings.tankCount,
    },
    players: [],
    phase: { kind: "lobby", nextRuleSetId, start: WAITING },
    rounds: [],
    game: 1,
    // Chat is for people who came by a code or link from someone they know (docs/specs/revamp/72-arena-chat.md).
    chat: isPublicKind(settings.kind) ? null : "on",
    banned: [],
  };
}

const reject = (error: ArenaError): ArenaResult => ({ ok: false, error });
const accept = (arena: Arena): ArenaResult => ({ ok: true, arena });

function withPlayer(arena: Arena, playerId: PlayerId, change: (player: Player) => Player): Arena {
  return { ...arena, players: arena.players.map((p) => (p.id === playerId ? change(p) : p)) };
}

function nameIsTaken(arena: Arena, name: string): boolean {
  const key = name.toLowerCase();
  return arena.players.some((p) => p.name.toLowerCase() === key);
}

/** The server generates ids, so a repeat is a bug in the caller, not a player mistake. */
function assertNewId(arena: Arena, playerId: PlayerId): void {
  if (arena.players.some((p) => p.id === playerId)) {
    throw new Error(`Player id ${playerId} is already in arena ${arena.id}.`);
  }
}

const humanCount = (arena: Arena): number => arena.players.filter((p) => !p.isBot).length;

function applyJoin(arena: Arena, event: Extract<ArenaEvent, { kind: "join" }>): ArenaResult {
  const inLobby = arena.phase.kind === "lobby";
  // A public arena is always open, so a visitor never meets a closed door; they wait for the next game.
  if (!inLobby && !isPublicKind(arena.settings.kind)) return reject("wrong_phase");

  const name = parsePlayerName(event.name);
  if (name === null) return reject("name_invalid");
  if (nameIsTaken(arena, name)) return reject("name_taken");
  const look = parseTankLook(event.look);
  if (look === null) return reject("look_invalid");
  // Humans only: in a public arena bots hold seats during a game and leave at the reset.
  if (humanCount(arena) >= seatsOf(arena.settings).people) return reject("arena_full");
  assertNewId(arena, event.playerId);

  const player: Player = {
    id: event.playerId,
    name,
    strategy: event.strategy,
    status: inLobby ? { kind: "playing" } : { kind: "waiting" },
    isBot: false,
    look,
    ready: false,
  };
  return accept({ ...arena, players: [...arena.players, player] });
}

function applyAddBots(arena: Arena, event: Extract<ArenaEvent, { kind: "addBots" }>): ArenaResult {
  if (arena.phase.kind !== "lobby") return reject("wrong_phase");
  const seats = seatsOf(arena.settings);
  const bots = arena.players.filter((p) => p.isBot).length + event.bots.length;
  if (arena.players.length + event.bots.length > seats.people || bots > seats.botsFillTo) return reject("arena_full");

  let next = arena;
  for (const bot of event.bots) {
    const name = parsePlayerName(bot.name);
    if (name === null) return reject("name_invalid");
    if (nameIsTaken(next, name)) return reject("name_taken");
    const look = parseTankLook(bot.look);
    if (look === null) return reject("look_invalid");
    assertNewId(next, bot.playerId);
    const player: Player = {
      id: bot.playerId,
      name,
      strategy: bot.strategy,
      status: { kind: "playing" },
      isBot: true,
      look,
      ready: false,
    };
    next = { ...next, players: [...next.players, player] };
  }
  return accept(next);
}

function applyRemovePlayers(arena: Arena, event: Extract<ArenaEvent, { kind: "removePlayers" }>): ArenaResult {
  if (arena.phase.kind !== "lobby") return reject("wrong_phase");
  const gone = new Set(event.playerIds);
  if (![...gone].every((id) => arena.players.some((p) => p.id === id))) return reject("unknown_player");
  return accept({ ...arena, players: arena.players.filter((p) => !gone.has(p.id)) });
}

/** True while the player has a seat: a removed player's token is gone, so nothing may act for them. */
function seated(arena: Arena, playerId: PlayerId): Player | undefined {
  return arena.players.find((p) => p.id === playerId && p.status.kind !== "removed");
}

const playingCount = (arena: Arena): number => arena.players.filter((p) => p.status.kind === "playing").length;

/** True when the owner has kept this account out of the arena. */
export function isBanned(arena: Pick<Arena, "banned">, accountId: AccountId): boolean {
  return arena.banned.some((b) => b.accountId === accountId);
}

function applyOwnerRemove(arena: Arena, event: Extract<ArenaEvent, { kind: "ownerRemove" }>): ArenaResult {
  const { phase } = arena;
  if (isPublicKind(arena.settings.kind)) return reject("wrong_phase");
  if (phase.kind !== "lobby" && phase.kind !== "break") return reject("wrong_phase");
  // Nothing identifies a visitor reliably outside a signed-in-only arena, so a ban would promise what it cannot keep.
  if (event.ban !== null && !joinNeedsAccount(arena.settings.joinPolicy)) return reject("ban_unavailable");
  const target = seated(arena, event.playerId);
  if (target === undefined || target.isBot) return reject("unknown_player");

  let players: readonly Player[];
  if (phase.kind === "lobby") {
    players = arena.players.filter((p) => p.id !== event.playerId);
  } else {
    // A break must keep a game to finish: the next round needs two tanks.
    if (target.status.kind === "playing" && playingCount(arena) - 1 < MIN_PLAYERS_TO_START) return reject("not_enough_players");
    // The round history names every tank that played, so the player stays as "removed" until the reset.
    players = arena.players.map((p): Player => (p.id === event.playerId ? { ...p, status: { kind: "removed" }, ready: false } : p));
  }
  const ban = event.ban;
  const banned = ban === null || isBanned(arena, ban) ? arena.banned : [...arena.banned, { accountId: ban, name: target.name }];
  return accept({ ...arena, players, banned });
}

function applyAllowAgain(arena: Arena, event: Extract<ArenaEvent, { kind: "allowAgain" }>): ArenaResult {
  if (!isBanned(arena, event.accountId)) return reject("not_banned");
  return accept({ ...arena, banned: arena.banned.filter((b) => b.accountId !== event.accountId) });
}

/** The lobby or break with a new plan; every other phase has no plan to change. See "Scheduled start" in types.ts. */
function withStartPlan(arena: Arena, start: StartPlan): ArenaResult {
  const { phase } = arena;
  if (isPublicKind(arena.settings.kind)) return reject("wrong_phase");
  if (phase.kind !== "lobby" && phase.kind !== "break") return reject("wrong_phase");
  return accept({ ...arena, phase: { ...phase, start } });
}

function applyScheduleStart(arena: Arena, event: Extract<ArenaEvent, { kind: "scheduleStart" }>): ArenaResult {
  // The server checks the allowed minutes against its clock; a time that is not a whole number is a caller bug.
  if (!Number.isSafeInteger(event.startsAt) || event.startsAt < 0) throw new Error(`startsAt ${event.startsAt} is not a time.`);
  return withStartPlan(arena, { kind: "scheduled", startsAt: event.startsAt });
}

function scheduled(arena: Arena): boolean {
  const { phase } = arena;
  return (phase.kind === "lobby" || phase.kind === "break") && phase.start.kind === "scheduled";
}

function applySetLook(arena: Arena, event: Extract<ArenaEvent, { kind: "setLook" }>): ArenaResult {
  // Players find their tank on the live screen by its look, so it does not change during a round.
  if (arena.phase.kind === "running") return reject("wrong_phase");
  if (seated(arena, event.playerId) === undefined) return reject("unknown_player");
  const look = parseTankLook(event.look);
  if (look === null) return reject("look_invalid");
  return accept(withPlayer(arena, event.playerId, (p) => ({ ...p, look })));
}

function applySetBotFill(arena: Arena, event: Extract<ArenaEvent, { kind: "setBotFill" }>): ArenaResult {
  if (arena.phase.kind !== "lobby") return reject("wrong_phase");
  // A public arena always fills its seats, and createArena holds that rule; nobody owns one to change it.
  if (isPublicKind(arena.settings.kind)) return reject("wrong_phase");
  return accept({ ...arena, settings: { ...arena.settings, botFill: event.botFill } });
}

function applySetTankCount(arena: Arena, event: Extract<ArenaEvent, { kind: "setTankCount" }>): ArenaResult {
  if (arena.phase.kind !== "lobby") return reject("wrong_phase");
  if (isPublicKind(arena.settings.kind)) return reject("wrong_phase");
  if (!tankCountFits(arena.settings.kind, event.tankCount)) return reject("tank_count_invalid");
  // Nobody loses a seat: the owner removes a player first when the game must be smaller.
  if (event.tankCount < humanCount(arena)) return reject("tank_count_below_players");
  // Bots wait in a lobby only after a start that failed; the next start fills the seats again, so
  // they go here and never outnumber the new count (the stored-file check refuses that).
  const players = arena.players.filter((p) => !p.isBot);
  return accept({ ...arena, players, settings: { ...arena.settings, tankCount: event.tankCount } });
}

function applySetReady(arena: Arena, event: Extract<ArenaEvent, { kind: "setReady" }>): ArenaResult {
  // In a public arena ready shortens the server's lobby countdown. On the result it is accepted
  // too and carried into the next lobby by the reset, so a player who wants to play again does
  // not wait the full countdown after the result. In an owner's arena it only informs the owner.
  if (!readyIsOpen(arena)) return reject("wrong_phase");
  const isPublic = isPublicKind(arena.settings.kind);
  // A public arena has no take-back: a player who changes their mind waits for the normal countdown.
  if (!event.ready && isPublic) return reject("wrong_phase");
  const player = seated(arena, event.playerId);
  if (player === undefined || player.isBot) return reject("unknown_player");
  // In a break only a tank that plays the next round has something to be ready for.
  if (!isPublic && player.status.kind !== "playing") return reject("player_eliminated");
  if (player.ready === event.ready) return accept(arena);
  return accept(withPlayer(arena, event.playerId, (p) => ({ ...p, ready: event.ready })));
}

function applySetChat(arena: Arena, event: Extract<ArenaEvent, { kind: "setChat" }>): ArenaResult {
  // Any phase: the owner must be able to stop a chat that goes wrong at once. A public arena has
  // no chat to switch, and the server answers no_chat before it gets here.
  if (arena.chat === null) return reject("wrong_phase");
  return accept({ ...arena, chat: event.on ? "on" : "off" });
}

/**
 * The phases in which a human may tap "I'm ready" (see Ready in types.ts). It reads only the kind and
 * the phase, so the server asks it about an Arena and the browser about a PublicArena.
 */
export function readyIsOpen(arena: { readonly settings: { readonly kind: ArenaKind }; readonly phase: { readonly kind: string } }): boolean {
  if (isPublicKind(arena.settings.kind)) return arena.phase.kind === "lobby" || arena.phase.kind === "finished";
  return arena.phase.kind === "lobby" || arena.phase.kind === "break";
}

/**
 * The final place of a player who is out or has won, or null while the player still plays or
 * waits, and for a player the owner removed. A cut keeps the top ranks, so a round's rank of an
 * eliminated player is their place in the whole game. The stored result and the browser's
 * final ranking both read it.
 */
export function finalPlaceOf(status: PlayerStatus): number | null {
  switch (status.kind) {
    case "winner":
      return 1;
    case "eliminated":
      return status.finalRank;
    case "playing":
    case "waiting":
    case "removed":
      return null;
  }
}

/**
 * A player the owner removed in a break has no final place, so the places after theirs close up
 * when the game ends: 7, 8, not 7, 9. A player's place is 1 plus the players with a better place,
 * so a shared place stays shared. The finished view and the stored result both read finalRank.
 */
function closePlaceGaps(players: readonly Player[]): Player[] {
  const places = players.map((p) => finalPlaceOf(p.status)).filter((place): place is number => place !== null);
  return players.map((p): Player => {
    if (p.status.kind !== "eliminated") return p;
    const own = p.status.finalRank;
    const place = places.filter((other) => other < own).length + 1;
    return place === own ? p : { ...p, status: { ...p.status, finalRank: place } };
  });
}

/** Ready belongs to the next game's start, so a round start and a failed round clear it. */
function notReady(player: Player): Player {
  return player.ready ? { ...player, ready: false } : player;
}

function applyReset(arena: Arena, event: Extract<ArenaEvent, { kind: "reset" }>): ArenaResult {
  if (arena.phase.kind !== "finished") return reject("wrong_phase");
  if (!announcementFitsMode(arena.settings.ruleSetMode, event.nextRuleSetId)) return reject("rule_set_mismatch");
  return accept({
    ...arena,
    // Ready is kept: the start cleared it, so a ready player tapped it on this result.
    // A player the owner removed during the game has no seat, so the new game has none for them.
    players: arena.players.filter((p) => !p.isBot && p.status.kind !== "removed").map((p) => ({ ...p, status: { kind: "playing" } })),
    phase: { kind: "lobby", nextRuleSetId: event.nextRuleSetId, start: WAITING },
    rounds: [],
    game: arena.game + 1,
  });
}

function applySubmitStrategy(arena: Arena, event: Extract<ArenaEvent, { kind: "submitStrategy" }>): ArenaResult {
  const player = seated(arena, event.playerId);
  if (player === undefined) return reject("unknown_player");
  const { phase } = arena;
  // The round copied the strategy at its start, so an edit would not reach it; refuse it rather than mislead.
  if (phase.kind === "running" && phase.playerIds.includes(event.playerId)) return reject("wrong_phase");
  // After the final everyone may prepare for the next game.
  if (player.status.kind === "eliminated" && phase.kind !== "finished") return reject("player_eliminated");
  return accept(withPlayer(arena, event.playerId, (p) => ({ ...p, strategy: event.strategy })));
}

function applyStartRound(arena: Arena, event: Extract<ArenaEvent, { kind: "startRound" }>): ArenaResult {
  const phase = arena.phase;
  if (phase.kind !== "lobby" && phase.kind !== "break") return reject("wrong_phase");

  const playerIds = arena.players.filter((p) => p.status.kind === "playing").map((p) => p.id);
  if (playerIds.length < MIN_PLAYERS_TO_START) return reject("not_enough_players");

  // The server draws the id, so a mismatch is a bug in the caller, not a host mistake.
  const { ruleSetMode } = arena.settings;
  if (!isRuleSetId(event.ruleSetId)) return reject("rule_set_mismatch");
  if (ruleSetMode === "standard" && event.ruleSetId !== STANDARD_RULE_SET_ID) return reject("rule_set_mismatch");
  if (phase.nextRuleSetId !== null && event.ruleSetId !== phase.nextRuleSetId) return reject("rule_set_mismatch");

  const isFinal = isFinalRound(playerIds.length);
  return accept({
    ...arena,
    players: arena.players.map(notReady),
    phase: {
      kind: "running",
      round: phase.kind === "lobby" ? 1 : phase.nextRound,
      isFinal,
      seed: event.seed,
      ruleSetId: event.ruleSetId,
      playerIds,
      survivorsAfterRound: isFinal ? null : survivorCount(playerIds.length),
    },
  });
}

/** True when the standings name each round player once and use the ranks 1..n once each. */
function standingsMatch(playerIds: readonly PlayerId[], standings: readonly Standing[]): boolean {
  const n = playerIds.length;
  if (standings.length !== n) return false;
  const expected = new Set(playerIds);
  const seenIds = new Set<PlayerId>();
  const seenRanks = new Set<number>();
  for (const s of standings) {
    if (!expected.has(s.botId) || seenIds.has(s.botId)) return false;
    if (!integerInRange(s.rank, 1, n) || seenRanks.has(s.rank)) return false;
    seenIds.add(s.botId);
    seenRanks.add(s.rank);
  }
  return true;
}

function applyRoundCompleted(arena: Arena, event: Extract<ArenaEvent, { kind: "roundCompleted" }>): ArenaResult {
  const phase = arena.phase;
  if (phase.kind !== "running") return reject("wrong_phase");
  if (!standingsMatch(phase.playerIds, event.standings)) return reject("standings_mismatch");
  // A final leaves nothing to announce. Any other round announces the next one in the arena's mode.
  const announcementFits = phase.isFinal
    ? event.nextRuleSetId === null
    : announcementFitsMode(arena.settings.ruleSetMode, event.nextRuleSetId);
  if (!announcementFits) return reject("rule_set_mismatch");

  const ranked = [...event.standings].sort((a, b) => a.rank - b.rank);
  const rankOf = new Map(ranked.map((s) => [s.botId, s.rank]));

  // The final keeps one player, the winner. Every other round keeps the cut set at its start.
  let keep = 1;
  if (!phase.isFinal) {
    if (phase.survivorsAfterRound === null) throw new Error("A non-final round must have survivorsAfterRound.");
    keep = phase.survivorsAfterRound;
  }

  const players = arena.players.map((p): Player => {
    const rank = rankOf.get(p.id);
    if (rank === undefined) return p; // Not in this round: already eliminated.
    if (rank > keep) return { ...p, status: { kind: "eliminated", inRound: phase.round, finalRank: rank } };
    return phase.isFinal ? { ...p, status: { kind: "winner" } } : p;
  });

  const survivors = ranked.filter((s) => s.rank <= keep).map((s) => s.botId);
  const summary: RoundSummary = {
    round: phase.round,
    isFinal: phase.isFinal,
    seed: phase.seed,
    ruleSetId: phase.ruleSetId,
    standings: ranked,
    survivors,
  };
  const next: Arena = { ...arena, players, rounds: [...arena.rounds, summary] };

  if (!phase.isFinal) return accept({ ...next, phase: { kind: "break", nextRound: phase.round + 1, nextRuleSetId: event.nextRuleSetId, start: WAITING } });
  const winnerId = survivors[0];
  if (winnerId === undefined) throw new Error("A final round has at least two players, so rank 1 exists.");
  return accept({ ...next, players: closePlaceGaps(players), phase: { kind: "finished", winnerId, resultId: null } });
}

function applyRoundAborted(arena: Arena): ArenaResult {
  const phase = arena.phase;
  if (phase.kind !== "running") return reject("wrong_phase");
  // The failed round counts for nothing, so the announcement stays what it was. A surprise
  // round was never announced, so it stays a surprise.
  const nextRuleSetId = arena.settings.ruleSetMode === "surprise" ? null : phase.ruleSetId;
  // Before any completed round the owner has the lobby, where players may still join. The
  // game that "waiting" players waited for has not begun, so they play in it. The bots
  // leave, so the next start fills the seats again for the humans who are there then.
  if (arena.rounds.length === 0) {
    const players = arena.players
      .filter((p) => !p.isBot)
      .map((p): Player => notReady(p.status.kind === "waiting" ? { ...p, status: { kind: "playing" } } : p));
    return accept({ ...arena, players, phase: { kind: "lobby", nextRuleSetId, start: WAITING } });
  }
  return accept({ ...arena, players: arena.players.map(notReady), phase: { kind: "break", nextRound: phase.round, nextRuleSetId, start: WAITING } });
}

function applyResultStored(arena: Arena, event: Extract<ArenaEvent, { kind: "resultStored" }>): ArenaResult {
  const { phase } = arena;
  if (phase.kind !== "finished" || isPublicKind(arena.settings.kind)) return reject("wrong_phase");
  return accept({ ...arena, phase: { ...phase, resultId: event.resultId } });
}

export function applyEvent(arena: Arena, event: ArenaEvent): ArenaResult {
  switch (event.kind) {
    case "join":
      return applyJoin(arena, event);
    case "addBots":
      return applyAddBots(arena, event);
    case "removePlayers":
      return applyRemovePlayers(arena, event);
    case "setLook":
      return applySetLook(arena, event);
    case "setBotFill":
      return applySetBotFill(arena, event);
    case "setTankCount":
      return applySetTankCount(arena, event);
    case "setReady":
      return applySetReady(arena, event);
    case "ownerRemove":
      return applyOwnerRemove(arena, event);
    case "allowAgain":
      return applyAllowAgain(arena, event);
    case "scheduleStart":
      return applyScheduleStart(arena, event);
    case "cancelStart":
      return scheduled(arena) ? withStartPlan(arena, WAITING) : reject("wrong_phase");
    case "startMissed":
      return scheduled(arena) ? withStartPlan(arena, { kind: "missed" }) : reject("wrong_phase");
    case "resultStored":
      return applyResultStored(arena, event);
    case "setChat":
      return applySetChat(arena, event);
    case "reset":
      return applyReset(arena, event);
    case "submitStrategy":
      return applySubmitStrategy(arena, event);
    case "startRound":
      return applyStartRound(arena, event);
    case "roundCompleted":
      return applyRoundCompleted(arena, event);
    case "roundAborted":
      return applyRoundAborted(arena);
  }
}

/** `auto` and `nextGameInMs` come from the server's timers, so the reducer never reads a clock. */
export function toPublicArena(arena: Arena, auto: AutoStep, nextGameInMs: number | null): PublicArena {
  return {
    id: arena.id,
    settings: arena.settings,
    players: arena.players.map((p) => ({ id: p.id, name: p.name, status: p.status, isBot: p.isBot, look: p.look, ready: p.ready })),
    phase: arena.phase,
    rounds: arena.rounds,
    game: arena.game,
    auto,
    nextGameInMs,
    chat: arena.chat,
  };
}
