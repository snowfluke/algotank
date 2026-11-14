// The routes of arena chat. Who may do what, retention and the limits are at the top of chat.ts.
//
// Order of the checks, so each caller learns no more than they may:
// 1. The arena exists (404), and has a chat (404 no_chat): a public arena has none for anyone,
//    so this comes before any sign-in.
// 2. The caller: a player token makes a player (403 for a wrong one); without one, the owner's
//    session (401, 403 bad_origin on a POST from another site, 403 not_owner) makes the host.
// 3. The body (POST, PUT). After that await everything below runs without a pause, so the arena,
//    the seat and the limits cannot change between the check and the use.
// 4. POST: chat off (409), round running (409), text (400), rate limits (429), block list (422).

import {
  CHAT_LIMITS,
  parseChatText,
  type ChatHistoryResponse,
  type ChatMessage,
  type ChatSender,
} from "@game/arena";
import { chatMembers, chatStateOf, type ChatLimits, type ChatSenderKey, type ChatStore } from "./chat.ts";
import type { Auth } from "./auth/index.ts";
import type { AutoSteps } from "./auto-steps.ts";
import { bearerToken, HttpError, httpErrorFor, isRecord, jsonResponse, noContent, readJson } from "./http.ts";
import { hasBlockedWordInText } from "./name-filter.ts";
import type { Router, RouteContext } from "./router.ts";
import { arenaOf, playerFor, requireOwner, requireOwnerOf } from "./routes.ts";
import { newChatMessageId } from "./secrets.ts";
import { ArenaGoneError, type ArenaRecord, type Store } from "./store.ts";
import type { StreamHub } from "./stream.ts";
import type { Clock } from "./timers.ts";
import type { MetricsRecorder } from "./metrics/metrics.ts";

export interface ChatRouteDeps {
  readonly store: Store;
  readonly hub: StreamHub;
  readonly auth: Auth;
  readonly autoSteps: AutoSteps;
  readonly chat: ChatStore;
  readonly chatLimits: ChatLimits;
  readonly now: Clock;
  /** The usage numbers (metrics/metrics.ts). */
  readonly metrics: MetricsRecorder;
}

/** The arena, or 404 no_chat for a public arena. */
function chatArena(deps: ChatRouteDeps, ctx: RouteContext): ArenaRecord {
  const record = arenaOf(deps, ctx);
  if (chatStateOf(record.arena) === "none") throw new HttpError(404, "This arena has no chat.", { code: "no_chat" });
  return record;
}

/** A player by token, or else the owner by session (the host). */
function chatCaller(deps: ChatRouteDeps, ctx: RouteContext, record: ArenaRecord): ChatSenderKey {
  const token = bearerToken(ctx.req);
  if (token !== null) return { kind: "player", playerId: playerFor(record, token) };
  requireOwnerOf(record, deps.auth.requireAccount(ctx.req).id);
  return { kind: "host" };
}

/** A request may hold the record across an await while the arena closes; its change must not reach a gone arena. */
function assertHeld(deps: ChatRouteDeps, record: ArenaRecord): void {
  if (deps.store.get(record.arena.id) !== record) throw new ArenaGoneError(record.arena.id);
}

function chatOff(): HttpError {
  return new HttpError(409, "The host turned the chat off.", { code: "chat_off" });
}

/** The name and look are copied, so the line outlives the seat. */
function senderOf(record: ArenaRecord, key: ChatSenderKey): ChatSender {
  if (key.kind === "host") return { kind: "host" };
  const player = record.arena.players.find((p) => p.id === key.playerId);
  // The token map and the player list change in one step (store.ts), so a valid token has a player.
  if (player === undefined) throw new Error(`Player ${key.playerId} has a token but no seat in arena ${record.arena.id}.`);
  return { kind: "player", playerId: player.id, name: player.name, look: player.look };
}

export function registerChatRoutes(router: Router, deps: ChatRouteDeps): void {
  router.add("GET", "/api/arenas/:id/chat", (ctx) => {
    const record = chatArena(deps, ctx);
    chatCaller(deps, ctx, record);
    if (chatStateOf(record.arena) === "off") throw chatOff();
    const response: ChatHistoryResponse = { messages: deps.chat.history(record.arena.id) };
    return jsonResponse(response);
  });

  router.add("POST", "/api/arenas/:id/chat", async (ctx) => {
    const record = chatArena(deps, ctx);
    chatCaller(deps, ctx, record);
    const body = await readJson(ctx.req);
    assertHeld(deps, record);
    // Again after the await: the owner may have removed this player meanwhile.
    const caller = chatCaller(deps, ctx, record);

    const state = chatStateOf(record.arena);
    if (state === "off") throw chatOff();
    if (state === "readOnly") throw new HttpError(409, "A round is running, so the chat opens again after it.", { code: "chat_closed" });
    const text = parseChatText(isRecord(body) ? body["text"] : undefined);
    if (text === null) {
      throw new HttpError(400, `Send text of 1 to ${CHAT_LIMITS.textMax} characters.`, { code: "chat_text_invalid" });
    }
    const rate = deps.chatLimits.take(record.arena.id, caller);
    if (!rate.allowed) {
      const message = rate.code === "chat_too_fast" ? "You are sending too fast. Wait a moment." : "Many people are writing at once. Wait a moment.";
      throw new HttpError(429, message, { code: rate.code, retryAfterMs: rate.waitMs });
    }
    if (hasBlockedWordInText(text)) {
      throw new HttpError(422, "That line has a word we do not use in this game.", { code: "chat_text_blocked" });
    }

    const message: ChatMessage = { id: newChatMessageId(), at: deps.now(), sender: senderOf(record, caller), text };
    deps.chat.append(record.arena.id, message);
    deps.hub.sendChat(record.arena.id, { type: "chat", message }, chatMembers(record.arena));
    deps.metrics.count("chatLine");
    return jsonResponse(message, 201);
  });

  router.add("PUT", "/api/arenas/:id/chat", async (ctx) => {
    const record = chatArena(deps, ctx);
    requireOwner(deps, ctx);
    const body = await readJson(ctx.req);
    if (!isRecord(body) || typeof body["on"] !== "boolean") throw new HttpError(400, "Send on as true or false.");
    // store.apply refuses a record the store no longer holds (the arena closed during the await).
    const result = deps.store.apply(record, { kind: "setChat", on: body["on"] });
    if (!result.ok) throw httpErrorFor(result.error);
    deps.hub.sendArena(deps.autoSteps.view(record.arena));
    return noContent();
  });
}
