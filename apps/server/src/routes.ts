// The HTTP routes listed at the bottom of packages/arena/src/types.ts.
//
// Who may call a route:
// - account: the session cookie of a signed-in account (auth.requireAccount). No session
//   is 401 not_signed_in; a state change from another site is 403 bad_origin.
// - owner: the account that created the arena. Another account is 403 not_owner. A
//   public arena has no owner, so every account gets not_owner there.
// - player: the player token in the Authorization header. A missing token is 401, a
//   token that does not match is 403.
// - A join in a signed-in-only arena (joinPolicy "account" or "verified") needs the account
//   too (401 not_signed_in), in this order: 403 banned, 403 email_not_verified ("verified"
//   only). An account that already has a seat there gets that seat back with a new token, in any
//   phase, and the old token stops working: the same person on a second device. A seat the owner
//   removed in a break is not handed back. The email reaches only the owner (GET .../accounts and the
//   stored result), never the PublicArena, the stream or a log line.

import {
  createArena,
  isBanned,
  isStartDelayMinutes,
  joinNeedsAccount,
  type ArenaAccountsResponse,
  parseArenaSettings,
  PUBLIC_KINDS,
  parseTankLook,
  type Arena,
  type ArenaEvent,
  type ArenaSettings,
  type CreateArenaResponse,
  type JoinResponse,
  type OwnArenaResponse,
  type AccountId,
  type PlayerId,
  type PublicKind,
  type PublicSeatResponse,
  type StreamMessage,
  type TankLook,
} from "@game/arena";
import { DEFAULT_PRESET_ID, parseStrategy, PRESETS, type Strategy } from "@game/engine";
import { closeArena } from "./arena-lifetime.ts";
import { assignMissingUltimate } from "./ultimates/strategy.ts";
import { removePlayerChat, type ChatLimits, type ChatStore } from "./chat.ts";
import type { Auth } from "./auth/index.ts";
import type { SlidingWindowLimit } from "./rate-limit.ts";
import { clientAddress } from "./auth/request.ts";
import type { AutoSteps } from "./auto-steps.ts";
import {
  acceptsGzip,
  bearerToken,
  gzipJsonResponse,
  HttpError,
  httpErrorFor,
  isRecord,
  jsonResponse,
  jsonTextResponse,
  nameBlocked,
  noContent,
  readJson,
} from "./http.ts";
import { makeGameName } from "./game-names.ts";
import { sequenceAdded, type MetricsRecorder } from "./metrics/metrics.ts";
import { checkTypedName } from "./name-filter.ts";
import type { PublicArenas } from "./public-arenas.ts";
import { roundStartMessage } from "./public-tick.ts";
import { replayGzip, replayJson } from "./replay.ts";
import type { ResultStore } from "./results.ts";
import type { RoundRunner } from "./round-runner.ts";
import { Router, type RouteContext } from "./router.ts";
import { announcementFor } from "./rule-set-draw.ts";
import { newPlayerId, newToken } from "./secrets.ts";
import { startNextRound } from "./start-round.ts";
import { playerIdForToken, type ArenaRecord, type JoinEvent, type Store } from "./store.ts";
import type { StreamHub } from "./stream.ts";
import type { ArenaStats } from "./stats/arena-stats.ts";
import type { Clock } from "./timers.ts";

/** Per client address. A room behind one NAT shares an address, so the numbers are generous. */
export interface ArenaRateLimits {
  /** POST /api/public/seat. */
  readonly seat: SlidingWindowLimit;
  /** POST /api/arenas/:id/players. */
  readonly join: SlidingWindowLimit;
}

export interface RouteDeps {
  readonly store: Store;
  readonly runner: RoundRunner;
  readonly hub: StreamHub;
  readonly auth: Auth;
  readonly autoSteps: AutoSteps;
  readonly publicArenas: PublicArenas;
  readonly chat: ChatStore;
  readonly chatLimits: ChatLimits;
  readonly results: ResultStore;
  readonly limits: ArenaRateLimits;
  /** TRUST_PROXY: the client address of the rate limits comes from X-Forwarded-For. */
  readonly trustProxy: boolean;
  /** The server's clock: a scheduled start is a time on it. */
  readonly now: Clock;
  /** The usage numbers (metrics/metrics.ts). */
  readonly metrics: MetricsRecorder;
  /** The players' statistics (stats/arena-stats.ts): a joining account's credit, a stream's own card. */
  readonly stats: ArenaStats;
  /** The server has mail settings, so an email can be verified. */
  readonly mailOn: boolean;
}

const defaultPreset = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID);
if (defaultPreset === undefined) throw new Error(`The engine has no preset "${DEFAULT_PRESET_ID}".`);
const DEFAULT_STRATEGY = defaultPreset.strategy;

/** Only the plain decimal form: "1.0", "0x1", "1e0" and "01" name the same round but are not round numbers. */
const ROUND_NUMBER = /^[1-9]\d*$/;

// ---------------------------------------------------------------------------
// Boundary checks
// ---------------------------------------------------------------------------

/** Checks the types and the enumerations. createArena owns the ranges, so each rule lives in one place. */
function parseSettings(raw: unknown): ArenaSettings {
  const parsed = parseArenaSettings(raw);
  if (!parsed.ok) throw new HttpError(400, "The settings are not valid.", { details: parsed.problems });
  return parsed.settings;
}

/** An ArenaSettingsPatch: exactly one of botFill (true or false) and tankCount (a whole number; the reducer checks the range). */
function settingsEvent(body: unknown): Extract<ArenaEvent, { kind: "setBotFill" | "setTankCount" }> {
  if (isRecord(body) && Object.keys(body).length === 1) {
    const { botFill, tankCount } = body;
    if (typeof botFill === "boolean") return { kind: "setBotFill", botFill };
    if (typeof tankCount === "number" && Number.isSafeInteger(tankCount)) return { kind: "setTankCount", tankCount };
  }
  throw new HttpError(400, "Send one setting: botFill as true or false, or tankCount as a whole number.");
}

/** Each room submission supplies its own ultimate, including a legacy submission (85-ultimates.md). */
async function readSubmittedStrategy(req: Request): Promise<Strategy> {
  const parsed = parseStrategy(assignMissingUltimate(await readJson(req)));
  if (!parsed.ok) throw new HttpError(400, "The strategy has problems.", { details: parsed.errors });
  return parsed.strategy;
}

function readLook(body: unknown): TankLook {
  const look = parseTankLook(isRecord(body) ? body["look"] : undefined);
  if (look === null) throw httpErrorFor("look_invalid");
  return look;
}

/**
 * The name of a join: a game name when the request sends none, in every arena kind, or
 * the typed name after the name rule and the block list. "Name taken" is the reducer's.
 */
function readJoinName(arena: Arena, body: Readonly<Record<string, unknown>>): string {
  const takenNames = arena.players.map((p) => p.name);
  if (body["name"] === undefined) return makeGameName(takenNames);
  const checked = checkTypedName(body["name"], takenNames);
  if (checked.ok) return checked.name;
  throw checked.code === "name_blocked" ? nameBlocked(checked.suggestion) : httpErrorFor("name_invalid");
}

/** The account's seat when it may be handed to another device: the player is still in the game. */
function seatToHandBack(record: ArenaRecord, playerId: PlayerId | undefined): { readonly id: PlayerId; readonly name: string } | null {
  if (playerId === undefined) return null;
  const player = record.arena.players.find((p) => p.id === playerId);
  if (player === undefined || player.status.kind === "removed") return null;
  return { id: player.id, name: player.name };
}

function readPublicKind(body: unknown): PublicKind {
  const sent = isRecord(body) ? body["kind"] : undefined;
  const kind = PUBLIC_KINDS.find((k) => k === sent);
  if (kind === undefined) throw new HttpError(400, 'Send the kind of public arena: "practice" or "tournament".');
  return kind;
}

function applyOrThrow(deps: RouteDeps, record: ArenaRecord, event: Exclude<ArenaEvent, JoinEvent>): Arena {
  const result = deps.store.apply(record, event);
  if (!result.ok) throw httpErrorFor(result.error);
  return result.arena;
}

function limit(deps: RouteDeps, ctx: RouteContext, window: SlidingWindowLimit): void {
  const address = clientAddress(ctx.req, ctx.server, deps.trustProxy);
  const check = window.check(address);
  if (!check.ok) {
    throw new HttpError(429, "Too many tries from this address. Wait a moment and try again.", {
      code: "rate_limited",
      retryAfterSeconds: check.retryAfterSeconds,
    });
  }
  window.record(address);
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Shared with chat-routes.ts. */
export function arenaOf(deps: Pick<RouteDeps, "store">, ctx: RouteContext): ArenaRecord {
  const id = ctx.params["id"];
  if (id === undefined) throw new Error("This route has no :id parameter.");
  const record = deps.store.get(id);
  if (record === undefined) throw new HttpError(404, "That arena does not exist.");
  return record;
}

/** The account first, so a visitor without a session learns nothing about the arena. */
export function requireOwner(deps: Pick<RouteDeps, "store" | "auth">, ctx: RouteContext): ArenaRecord {
  const account = deps.auth.requireAccount(ctx.req);
  const record = arenaOf(deps, ctx);
  requireOwnerOf(record, account.id);
  return record;
}

/** For a route that looked up the arena first (chat-routes.ts answers no_chat before any sign-in). */
export function requireOwnerOf(record: ArenaRecord, accountId: AccountId): void {
  if (record.ownerAccountId !== accountId) {
    throw new HttpError(403, "Only the person who made this arena can do that.", { code: "not_owner" });
  }
}

export function playerFor(record: ArenaRecord, token: string): PlayerId {
  const playerId = playerIdForToken(record, token);
  if (playerId === undefined) throw new HttpError(403, "The player token is not correct.");
  return playerId;
}

function requirePlayer(record: ArenaRecord, ctx: RouteContext): PlayerId {
  const token = bearerToken(ctx.req);
  if (token === null) throw new HttpError(401, "Send the player token.");
  return playerFor(record, token);
}

/** For routes that also work for a viewer: null means no token was sent. */
function optionalPlayer(record: ArenaRecord, token: string | null): PlayerId | null {
  return token === null ? null : playerFor(record, token);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createRouter(deps: RouteDeps): Router {
  const { store, runner, hub, autoSteps } = deps;
  const router = new Router();
  deps.auth.registerRoutes(router);
  const sendArena = (record: ArenaRecord) => hub.sendArena(autoSteps.view(record.arena));

  // --- Arenas an account owns ----------------------------------------------

  router.add("POST", "/api/arenas", async (ctx) => {
    const account = deps.auth.requireAccount(ctx.req);
    const body = await readJson(ctx.req);
    if (!isRecord(body) || (body["kind"] !== "private" && body["kind"] !== "presenter")) {
      throw new HttpError(400, 'Send the kind: "private" or "presenter".');
    }
    if (!isRecord(body["settings"])) throw new HttpError(400, "The settings are not valid.", { details: ["The settings must be an object."] });
    // The kind sits beside the settings in the request; the server makes public arenas itself.
    const settings = parseSettings({ ...body["settings"], kind: body["kind"] });
    // The create form offers "verified" only with mail settings; this guards every other client.
    if (settings.joinPolicy === "verified" && !deps.mailOn) {
      throw new HttpError(400, 'This server has no mail settings, so no email can be verified and an arena for players with a verified email would admit nobody. Choose "anyone" or "account".', { code: "mail_off" });
    }

    const owned = store.ownedBy(account.id);
    if (owned !== undefined) throw arenaLimit(owned.arena.id);
    let arena: Arena;
    try {
      arena = createArena(store.newArenaId(), settings, announcementFor(settings.ruleSetMode, null));
    } catch (error) {
      // After parseSettings, createArena throws only for out-of-range settings, and its message names the range.
      throw new HttpError(400, error instanceof Error ? error.message : "The settings are not valid.");
    }
    const added = store.add(arena, account.id);
    if (!added.ok) throw arenaLimit(added.ownedArenaId);
    const response: CreateArenaResponse = { arenaId: arena.id };
    return jsonResponse(response);
  });

  router.add("GET", "/api/account/arena", (ctx) => {
    const account = deps.auth.requireAccount(ctx.req);
    const owned = store.ownedBy(account.id);
    const response: OwnArenaResponse = {
      arena: owned === undefined ? null : { id: owned.arena.id, kind: owned.arena.settings.kind, name: owned.arena.settings.name },
    };
    return jsonResponse(response);
  });

  router.add("POST", "/api/arenas/:id/rounds", (ctx) => {
    const record = requireOwner(deps, ctx);
    const started = startNextRound(store, runner, record);
    if (!started.ok) throw httpErrorFor(started.error);
    return noContent();
  });

  // "Start in 1 / 2 / 3 / 5 minutes": the reducer keeps the plan, scheduled-start.ts the timer.
  router.add("POST", "/api/arenas/:id/rounds/schedule", async (ctx) => {
    const record = requireOwner(deps, ctx);
    const body = await readJson(ctx.req);
    const minutes = isRecord(body) ? body["minutes"] : undefined;
    if (!isStartDelayMinutes(minutes)) throw new HttpError(400, "Send minutes as 1, 2, 3 or 5.");
    applyOrThrow(deps, record, { kind: "scheduleStart", startsAt: deps.now() + minutes * 60_000 });
    sendArena(record);
    return noContent();
  });

  router.add("DELETE", "/api/arenas/:id/rounds/schedule", (ctx) => {
    const record = requireOwner(deps, ctx);
    applyOrThrow(deps, record, { kind: "cancelStart" });
    sendArena(record);
    return noContent();
  });

  router.add("POST", "/api/arenas/:id/reset", (ctx) => {
    const record = requireOwner(deps, ctx);
    applyOrThrow(deps, record, { kind: "reset", nextRuleSetId: announcementFor(record.arena.settings.ruleSetMode, null) });
    sendArena(record);
    return noContent();
  });

  router.add("PATCH", "/api/arenas/:id/settings", async (ctx) => {
    const record = requireOwner(deps, ctx);
    const body = await readJson(ctx.req);
    applyOrThrow(deps, record, settingsEvent(body));
    sendArena(record);
    return noContent();
  });

  // "Remove from arena" in the owner's player list, the named limit of the block list.
  // A public arena has no owner, so requireOwner refuses it; the reducer allows the lobby and
  // the break (ownerRemove). `ban=1` keeps the player's account out (signed-in-only arenas).
  router.add("DELETE", "/api/arenas/:id/players/:playerId", (ctx) => {
    const record = requireOwner(deps, ctx);
    const playerId = ctx.params["playerId"];
    if (playerId === undefined) throw new Error("This route has no :playerId parameter.");
    const banParam = ctx.url.searchParams.get("ban");
    if (banParam !== null && banParam !== "0" && banParam !== "1") throw new HttpError(400, "Send ban as 1 or 0.");
    let ban: AccountId | null = null;
    if (banParam === "1") {
      if (!joinNeedsAccount(record.arena.settings.joinPolicy)) throw httpErrorFor("ban_unavailable");
      ban = record.playerAccounts.get(playerId) ?? null;
      if (ban === null) throw httpErrorFor("unknown_player");
    }
    applyOrThrow(deps, record, { kind: "ownerRemove", playerId, ban });
    hub.forget(record.arena.id, [playerId]);
    removePlayerChat(deps, record, playerId);
    sendArena(record);
    return noContent();
  });

  // Personal data for the arena's owner only: the email behind each seat, and who is kept out.
  router.add("GET", "/api/arenas/:id/accounts", (ctx) => {
    const record = requireOwner(deps, ctx);
    if (!joinNeedsAccount(record.arena.settings.joinPolicy)) throw new HttpError(404, "Anyone may join this arena, so it has no accounts.");
    const emailOf = (accountId: AccountId) => deps.auth.accountById(accountId)?.email ?? null;
    const response: ArenaAccountsResponse = {
      players: [...record.playerAccounts].flatMap(([playerId, accountId]) => {
        const email = emailOf(accountId);
        return email === null ? [] : [{ playerId, email }];
      }),
      banned: record.arena.banned.map((b) => ({ accountId: b.accountId, name: b.name, email: emailOf(b.accountId) })),
    };
    return jsonResponse(response);
  });

  router.add("DELETE", "/api/arenas/:id/bans/:accountId", (ctx) => {
    const record = requireOwner(deps, ctx);
    const accountId = ctx.params["accountId"];
    if (accountId === undefined) throw new Error("This route has no :accountId parameter.");
    applyOrThrow(deps, record, { kind: "allowAgain", accountId });
    return noContent();
  });

  router.add("DELETE", "/api/arenas/:id", (ctx) => {
    const record = requireOwner(deps, ctx);
    closeArena(deps, record);
    return noContent();
  });

  // --- Public arenas ---------------------------------------------------------

  router.add("POST", "/api/public/seat", async (ctx) => {
    limit(deps, ctx, deps.limits.seat);
    const kind = readPublicKind(await readJson(ctx.req));
    const response: PublicSeatResponse = { arenaId: deps.publicArenas.seat(kind) };
    return jsonResponse(response);
  });

  // --- Every arena -----------------------------------------------------------

  router.add("GET", "/api/arenas/:id", (ctx) => {
    const record = store.get(ctx.params["id"] ?? "");
    if (record !== undefined) return jsonResponse(autoSteps.view(record.arena));
    // The arena link of a game that ended still leads to its result while the result is kept.
    const ended = deps.results.latestOfArena((ctx.params["id"] ?? "").toUpperCase());
    throw new HttpError(404, "That arena does not exist.", ended === undefined ? {} : { resultId: ended.result.id });
  });

  router.add("GET", "/api/arenas/:id/events", (ctx) => {
    const record = arenaOf(deps, ctx);
    // EventSource cannot set headers, so this route takes the token from the query.
    const playerId = optionalPlayer(record, ctx.url.searchParams.get("token") || null);

    // The stream is long-lived and the heartbeat is sent less often than Bun's default idle timeout.
    ctx.server.timeout(ctx.req, 0);

    const initial: StreamMessage[] = [{ type: "arena", arena: autoSteps.view(record.arena) }];
    const current = runner.currentRound(record.arena.id);
    if (current !== null) initial.push(roundStartMessage(current.round, current.snapshot, current.startsInMs));
    // The player's own statistics of this game, so a page opened in the break shows its card. Never to a viewer.
    const own = playerId === null ? null : deps.stats.ownOf(record.arena.id, playerId, record.arena.game);
    if (own !== null) initial.push({ type: "stats", stats: own });
    // EventSource sends the session cookie on its own; the owner's stream then gets the chat. A
    // GET changes nothing, so no Origin check: accountOf only reads the session. `chat=0` keeps
    // the chat off a stream that the owner's browser opens for the big screen, which must never
    // show it (the screen sends no player token, so the session is its only way to chat).
    const wantsChat = ctx.url.searchParams.get("chat") !== "0";
    const account = !wantsChat || record.ownerAccountId === null ? null : deps.auth.accountOf(ctx.req);
    return hub.open(record.arena.id, playerId, initial, account !== null && account.id === record.ownerAccountId);
  });

  router.add("POST", "/api/arenas/:id/players", async (ctx) => {
    const record = arenaOf(deps, ctx);
    limit(deps, ctx, deps.limits.join);
    // The session before the body, so a visitor without one learns nothing more.
    const policy = record.arena.settings.joinPolicy;
    const account = joinNeedsAccount(policy) ? deps.auth.requireAccount(ctx.req) : null;
    const accountId: AccountId | null = account?.id ?? null;
    const body = await readJson(ctx.req);
    if (!isRecord(body)) throw new HttpError(400, "Send the look, and the name when the player typed one.");
    // After the await, so two joins of one account at once cannot both pass.
    if (account !== null) {
      if (isBanned(record.arena, account.id)) {
        throw new HttpError(403, "The host has asked you not to join this arena again.", { code: "banned" });
      }
      if (policy === "verified" && !account.emailVerified) {
        throw new HttpError(403, "This arena is for players whose email is verified.", { code: "email_not_verified" });
      }
      // Before the name check: the other device sends the seat's own name, which the arena already lists.
      const held = store.seatOf(record, account.id);
      const seat = seatToHandBack(record, held);
      // Removed in a break: out of this game, and the next game (the reset) frees the account.
      if (held !== undefined && seat === null) throw httpErrorFor("wrong_phase");
      if (seat !== null) {
        const playerToken = newToken();
        store.replaceToken(record, seat.id, playerToken);
        hub.markSeen(record.arena.id, seat.id);
        const response: JoinResponse = { playerId: seat.id, playerToken, name: seat.name };
        return jsonResponse(response);
      }
    }
    const look = readLook(body);
    const name = readJoinName(record.arena, body);
    const playerId = newPlayerId();
    const playerToken = newToken();
    const joined = store.addPlayer(record, { kind: "join", playerId, name, strategy: DEFAULT_STRATEGY, look }, playerToken, accountId);
    if (!joined.ok) throw httpErrorFor(joined.error);
    hub.markSeen(record.arena.id, playerId);
    sendArena(record);
    deps.metrics.count("joined", record.arena.settings.kind);
    // A signed-in player's rounds count for their account (the "My tank" page), in any arena; the session is only read.
    const creditTo = account ?? deps.auth.accountOf(ctx.req);
    if (creditTo !== null) deps.stats.credit(record.arena.id, playerId, creditTo.id);

    const stored = joined.arena.players.find((p) => p.id === playerId);
    if (stored === undefined) throw new Error(`Player ${playerId} joined but is not in arena ${record.arena.id}.`);
    const response: JoinResponse = { playerId, playerToken, name: stored.name };
    return jsonResponse(response);
  });

  router.add("POST", "/api/arenas/:id/players/me/leave", (ctx) => {
    const record = arenaOf(deps, ctx);
    const playerId = requirePlayer(record, ctx);
    applyOrThrow(deps, record, { kind: "removePlayers", playerIds: [playerId] });
    hub.forget(record.arena.id, [playerId]);
    sendArena(record);
    return noContent();
  });

  router.add("POST", "/api/arenas/:id/players/me/ready", (ctx) => {
    const record = arenaOf(deps, ctx);
    const playerId = requirePlayer(record, ctx);
    // The reducer refuses it where ready is not open (wrong_phase, readyIsOpen).
    applyOrThrow(deps, record, { kind: "setReady", playerId, ready: true });
    sendArena(record);
    return noContent();
  });

  // Taking ready back: an owner's arena only, where ready informs and does not shorten a countdown.
  router.add("DELETE", "/api/arenas/:id/players/me/ready", (ctx) => {
    const record = arenaOf(deps, ctx);
    const playerId = requirePlayer(record, ctx);
    applyOrThrow(deps, record, { kind: "setReady", playerId, ready: false });
    sendArena(record);
    return noContent();
  });

  router.add("PATCH", "/api/arenas/:id/players/me", async (ctx) => {
    const record = arenaOf(deps, ctx);
    const playerId = requirePlayer(record, ctx);
    const look = readLook(await readJson(ctx.req));
    applyOrThrow(deps, record, { kind: "setLook", playerId, look });
    sendArena(record);
    return noContent();
  });

  router.add("GET", "/api/arenas/:id/players/me/strategy", (ctx) => {
    const record = arenaOf(deps, ctx);
    const playerId = requirePlayer(record, ctx);
    const player = record.arena.players.find((p) => p.id === playerId);
    if (player === undefined) throw new HttpError(404, "That player does not exist.");
    return jsonResponse(player.strategy);
  });

  router.add("PUT", "/api/arenas/:id/players/me/strategy", async (ctx) => {
    const record = arenaOf(deps, ctx);
    const playerId = requirePlayer(record, ctx);
    const strategy = await readSubmittedStrategy(ctx.req);
    const saved = record.arena.players.find((p) => p.id === playerId)?.strategy ?? null;

    // No stream message: strategies are private, so the public arena does not change.
    applyOrThrow(deps, record, { kind: "submitStrategy", playerId, strategy });
    if (sequenceAdded(saved, strategy)) deps.metrics.count("stepRuleSaved");
    return noContent();
  });

  router.add("GET", "/api/arenas/:id/rounds/:round/replay", (ctx) => {
    const record = arenaOf(deps, ctx);
    const playerId = optionalPlayer(record, bearerToken(ctx.req));
    const round = ctx.params["round"];
    if (round === undefined || !ROUND_NUMBER.test(round)) throw new HttpError(404, "That round has not finished.");
    const body = acceptsGzip(ctx.req)
      ? replayGzip(record, Number(round), playerId)
      : replayJson(record, Number(round), playerId);
    if (body === undefined) throw new HttpError(404, "That round has not finished.");
    return typeof body === "string" ? jsonTextResponse(body) : gzipJsonResponse(body);
  });

  return router;
}

function arenaLimit(arenaId: string): HttpError {
  return new HttpError(409, "You already have an open arena. Close it before you make a new one.", { code: "arena_limit", arenaId });
}
