// Reads one server-sent event into a StreamMessage. The check is on the shape the
// pages read (the type, the phase, the snapshot and the bot list). It does not
// check every field of every bot, because the server is the same project and a
// wrong shape here means a version mismatch, which the caller reports. The water
// of each bot is checked, because the board reads it on every tick and a server from
// before the water rule sends none (a turn's outcomes are table indexes, checked when
// streamState.ts expands the turn).
// The rule set ids and the two arena modes are checked too: the pages call ruleSet(id),
// which throws on an unknown id, so a server from before the rule sets must give a
// protocol error and not a blank page. The arena kind, the game number, the server's
// next step (auto), the time to the next game (nextGameInMs), and each player's bot flag, ready flag
// and look (parseTankLook) are checked as well, because a server from before the arena kinds or the
// three public arenas sends none of them. Each bot's direction and the
// viewer's own move are checked against the engine's lists: the board turns a direction
// into an angle and the practice panel names a move, so an unknown value from a server of
// another version must give a protocol error, not a tank drawn at a wrong angle.
// The chat setting is checked too (a server from before the chat sends none), and a chat line
// goes through the one check of chat/chatWire.ts, because the page draws its name, tank and text.
// The join policy, the start plan of a lobby or break and the finished phase's result id are checked
// (a server from before the organiser tournament sends none, and the pages branch on them).
// A turn comes in the compact form; it is checked here for its shape (arrays of numbers).
// Its indexes need the round's spawn, so streamState.ts checks them when it expands the turn.

import { ARENA_KINDS, hasCompactUltimateFields, hasPublicUltimate, isJoinPolicy, isResultId, parseOwnStats, parseTankLook, RULE_SET_MODES } from "@game/arena";
import { DIRECTIONS, MOVES, isRuleSetId, isUltimateId } from "@game/engine";
import { isChatMessage } from "../chat/chatWire.ts";
import type { WireStreamMessage } from "./streamState.ts";

export const STREAM_EVENT_NAMES = ["arena", "roundStart", "tick", "closed", "stats"] as const;
/** The chat's events. A page listens for them only when it shows the chat; the big screen never does. */
export const CHAT_EVENT_NAMES = ["chat", "chatRemoved"] as const;

export type ParsedStreamMessage =
  | { readonly ok: true; readonly message: WireStreamMessage }
  | { readonly ok: false; readonly reason: string };

const PHASE_KINDS: readonly unknown[] = ["lobby", "running", "break", "finished"];
const DIRECTION_VALUES: readonly unknown[] = DIRECTIONS;
const MOVE_VALUES: readonly unknown[] = MOVES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A rule set id the engine knows. The pages call ruleSet(id), which throws on an unknown id, so the check is here. */
const hasRuleSetId = (record: Record<string, unknown>, key: string): boolean => isRuleSetId(record[key]);
const hasRuleSetIdOrNull = (record: Record<string, unknown>, key: string): boolean =>
  record[key] === null || isRuleSetId(record[key]);

export function isSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["width"] === "number" &&
    typeof value["height"] === "number" &&
    typeof value["tick"] === "number" &&
    typeof value["ticksTotal"] === "number" &&
    hasRuleSetId(value, "ruleSetId") &&
    Array.isArray(value["bots"]) &&
    value["bots"].every((bot) => isRecord(bot) && typeof bot["water"] === "number" &&
      DIRECTION_VALUES.includes(bot["direction"]) && hasPublicUltimate(bot))
  );
}

const ARENA_KIND_VALUES: readonly unknown[] = ARENA_KINDS;
const AUTO_ACTIONS: readonly unknown[] = ["start", "reset"];

function isAutoStep(value: unknown): boolean {
  return value === null || (isRecord(value) && AUTO_ACTIONS.includes(value["action"]) && typeof value["inMs"] === "number");
}

function isPublicPlayer(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["isBot"] === "boolean" &&
    typeof value["ready"] === "boolean" &&
    parseTankLook(value["look"]) !== null
  );
}

const isNumberOrNull = (value: unknown): boolean => value === null || typeof value === "number";
/** The chat pane shows by this setting, and a server from before the chat sends none. */
const CHAT_SETTINGS: readonly unknown[] = ["on", "off", null];
const RULE_SET_MODE_VALUES: readonly unknown[] = RULE_SET_MODES;

function isStartPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value["kind"] === "waiting" || value["kind"] === "missed" || (value["kind"] === "scheduled" && typeof value["startsAt"] === "number");
}

function isPhaseWithRules(phase: Record<string, unknown>): boolean {
  switch (phase["kind"]) {
    case "lobby":
    case "break":
      return hasRuleSetIdOrNull(phase, "nextRuleSetId") && isStartPlan(phase["start"]);
    case "running":
      return hasRuleSetId(phase, "ruleSetId");
    case "finished":
      return phase["resultId"] === null || isResultId(phase["resultId"]);
    default:
      return true;
  }
}

/** Also the guard of GET /api/arenas/:id, so both entrances reject a server that predates the rule sets. */
export function isPublicArena(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    isRecord(value["settings"]) &&
    typeof value["settings"]["tickMs"] === "number" &&
    ARENA_KIND_VALUES.includes(value["settings"]["kind"]) &&
    typeof value["settings"]["botFill"] === "boolean" &&
    isNumberOrNull(value["settings"]["tankCount"]) &&
    isJoinPolicy(value["settings"]["joinPolicy"]) &&
    RULE_SET_MODE_VALUES.includes(value["settings"]["ruleSetMode"]) &&
    typeof value["game"] === "number" &&
    isAutoStep(value["auto"]) &&
    isNumberOrNull(value["nextGameInMs"]) &&
    CHAT_SETTINGS.includes(value["chat"]) &&
    Array.isArray(value["players"]) &&
    value["players"].every(isPublicPlayer) &&
    Array.isArray(value["rounds"]) &&
    value["rounds"].every((round) => isRecord(round) && hasRuleSetId(round, "ruleSetId")) &&
    isRecord(value["phase"]) &&
    PHASE_KINDS.includes(value["phase"]["kind"]) &&
    isPhaseWithRules(value["phase"])
  );
}

export function isDecision(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["botId"] === "string" &&
    typeof value["modeId"] === "string" &&
    (value["ruleId"] === null || typeof value["ruleId"] === "string") &&
    typeof value["actionId"] === "string" &&
    MOVE_VALUES.includes(value["move"]) &&
    typeof value["nextModeId"] === "string" &&
    // Present only on a turn of a rule's steps in order (engine Decision.step).
    (value["step"] === undefined || (isRecord(value["step"]) && typeof value["step"]["index"] === "number" && typeof value["step"]["count"] === "number")) &&
    // Present only on a turn of a dizzy tank (engine Decision.dizzy).
    (value["dizzy"] === undefined || value["dizzy"] === true) &&
    // Present only on a spinning turn of a dizzy tank (engine Decision.spin).
    (value["spin"] === undefined || value["spin"] === true) &&
    (value["ultimate"] === undefined || (isUltimateId(value["ultimate"]) && value["actionId"] === "ultimate" && value["move"] === "W"))
  );
}

function isNumberRow(value: unknown): boolean {
  return Array.isArray(value) && value.every((n) => typeof n === "number");
}

/** The compact form's shape. The ultimate rows use the same checks as the shared codec. */
export function isCompactTick(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["tick"] === "number" &&
    Array.isArray(value["bots"]) && value["bots"].every(isNumberRow) &&
    [value["moves"], value["throws"], value["items"], value["pickups"]].every((rows) => Array.isArray(rows) && rows.every(isNumberRow)) &&
    hasCompactUltimateFields(value["ultimates"], value["fires"], value["bots"].length)
  );
}

function fail(reason: string): ParsedStreamMessage {
  return { ok: false, reason };
}

export function parseStreamMessage(eventName: string, data: string): ParsedStreamMessage {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return fail(`The ${eventName} event is not valid JSON.`);
  }
  if (!isRecord(value)) return fail(`The ${eventName} event is not an object.`);

  const type = value["type"];
  if (type !== eventName) return fail(`The ${eventName} event carries the type ${String(type)}.`);

  // Each branch checks the fields the pages read, then narrows the whole object.
  switch (type) {
    case "arena":
      return isPublicArena(value["arena"]) ? { ok: true, message: value as unknown as WireStreamMessage } : fail("The arena event has no valid arena.");
    case "roundStart":
      return typeof value["round"] === "number" && typeof value["startsInMs"] === "number" && isSnapshot(value["snapshot"])
        ? { ok: true, message: value as unknown as WireStreamMessage }
        : fail("The roundStart event has no valid snapshot.");
    case "tick":
      return typeof value["round"] === "number" &&
        isCompactTick(value["tick"]) &&
        (value["own"] === null || isDecision(value["own"]))
        ? { ok: true, message: value as unknown as WireStreamMessage }
        : fail("The tick event has no valid tick.");
    case "closed":
      return { ok: true, message: { type: "closed" } };
    case "chat":
      return isChatMessage(value["message"]) ? { ok: true, message: { type: "chat", message: value["message"] } } : fail("The chat event has no valid message.");
    case "chatRemoved":
      return typeof value["playerId"] === "string" ? { ok: true, message: { type: "chatRemoved", playerId: value["playerId"] } } : fail("The chatRemoved event has no player id.");
    case "stats": {
      // The card draws these numbers and mode names, so the one check of stats-protocol.ts reads them.
      const stats = parseOwnStats(value["stats"]);
      return stats === null ? fail("The stats event has no valid statistics.") : { ok: true, message: { type: "stats", stats } };
    }
    default:
      return fail(`The event type ${String(type)} is not known.`);
  }
}
