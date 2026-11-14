// The stored result of an organiser's tournament (docs/specs/revamp/75-organiser-tournament.md,
// section 5): when a game of a private or presenter arena finishes, the server keeps what
// happened, so the result and its round history stay viewable after the arena is gone, and the
// winner can be traced. One validator (parseTournamentResult) reads it wherever it arrives as
// unknown data: the server's file and the browser's answer.
//
// Who sees what:
// | Field                         | Anyone with the link | The arena's owner (session) |
// |-------------------------------|----------------------|-----------------------------|
// | names, looks, rounds, ranking | yes                  | yes                         |
// | each player's email           | no                   | yes (ResultResponse.emails) |
// | account ids                   | no                   | no (they stay in the row)   |
//
// GET /api/results/:id      -> ResultResponse; 404 for an unknown or expired id
// GET /api/account/results  (account) -> AccountResultsResponse

import { isRuleSetId, type RuleSetId } from "@game/engine";
import { isJoinPolicy, isRuleSetMode, parseTankLook, type ArenaId, type JoinPolicy, type PlayerId, type RuleSetMode, type TankLook } from "./types.ts";

/** How long the server keeps a result. The 10-minute sweep removes older ones. */
export const RESULT_KEEP_DAYS = 180;
export const RESULT_KEEP_MS = RESULT_KEEP_DAYS * 24 * 60 * 60 * 1000;

export type ResultId = string;
/** 128 random bits in base64url: unguessable, and safe as a file name. */
const RESULT_ID = /^[A-Za-z0-9_-]{22}$/;
export const isResultId = (value: unknown): value is ResultId => typeof value === "string" && RESULT_ID.test(value);

export interface ResultPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  /** A built-in opponent the server added. */
  readonly isBot: boolean;
}

/** One place of a round, best first. */
export interface ResultStanding {
  readonly playerId: PlayerId;
  readonly rank: number;
  readonly score: number;
}

export interface ResultRound {
  /** 1 for the first round. */
  readonly round: number;
  readonly isFinal: boolean;
  readonly ruleSetId: RuleSetId;
  /** Every tank that started the round, best rank first. */
  readonly standings: readonly ResultStanding[];
  /** The tanks that went through; for the final, the winner only. */
  readonly survivors: readonly PlayerId[];
}

export interface ResultPlace {
  readonly playerId: PlayerId;
  /** 1 for the winner. A player the owner removed during the game has no place and is not listed. */
  readonly place: number;
}

export interface TournamentResult {
  readonly id: ResultId;
  readonly arenaId: ArenaId;
  readonly arenaName: string;
  readonly kind: "private" | "presenter";
  /** Milliseconds since 1970 on the server's clock. */
  readonly finishedAt: number;
  /** The arena's game number: 1 for its first game, raised by "Play again". */
  readonly game: number;
  readonly ticksPerRound: number;
  readonly tickMs: number;
  readonly ruleSetMode: RuleSetMode;
  /** Who could join the arena when the game was played. */
  readonly joinPolicy: JoinPolicy;
  /** Every tank that played, humans and bots. */
  readonly players: readonly ResultPlayer[];
  /** Oldest first; the last one is the final. */
  readonly rounds: readonly ResultRound[];
  /** Best place first; the winner is first. */
  readonly ranking: readonly ResultPlace[];
  readonly winnerId: PlayerId;
}

export interface ResultResponse {
  readonly result: TournamentResult;
  /** Only in an answer to the arena's owner: the email behind each signed-in player whose account still exists. Null for everyone else. */
  readonly emails: readonly { readonly playerId: PlayerId; readonly email: string }[] | null;
}

export interface ResultSummary {
  readonly id: ResultId;
  readonly arenaName: string;
  readonly kind: "private" | "presenter";
  readonly finishedAt: number;
  readonly game: number;
  readonly winnerName: string;
  readonly winnerLook: TankLook;
  readonly players: number;
  readonly rounds: number;
}

export interface AccountResultsResponse {
  /** Newest first. */
  readonly results: readonly ResultSummary[];
}

export type ResultParse = { readonly ok: true; readonly result: TournamentResult } | { readonly ok: false; readonly error: string };

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
  if (typeof value !== "string" || value === "") fail(path, "text");
  return value;
}
function int(value: unknown, path: string, min: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) fail(path, `a whole number of at least ${min}`);
  return value;
}

function player(raw: unknown, path: string): ResultPlayer {
  const p = obj(raw, path);
  const look = parseTankLook(p["look"]);
  if (look === null) fail(`${path}.look`, "a tank look");
  if (typeof p["isBot"] !== "boolean") fail(`${path}.isBot`, "true or false");
  return { id: text(p["id"], `${path}.id`), name: text(p["name"], `${path}.name`), look, isBot: p["isBot"] };
}

function round(raw: unknown, path: string, known: ReadonlySet<PlayerId>): ResultRound {
  const r = obj(raw, path);
  if (typeof r["isFinal"] !== "boolean") fail(`${path}.isFinal`, "true or false");
  if (!isRuleSetId(r["ruleSetId"])) fail(`${path}.ruleSetId`, "the id of a rule set");
  const standings = list(r["standings"], `${path}.standings`).map((x, i): ResultStanding => {
    const s = obj(x, `${path}.standings[${i}]`);
    const score = s["score"];
    if (typeof score !== "number" || !Number.isFinite(score)) fail(`${path}.standings[${i}].score`, "a number");
    return { playerId: text(s["playerId"], `${path}.standings[${i}].playerId`), rank: int(s["rank"], `${path}.standings[${i}].rank`, 1), score };
  });
  const survivors = list(r["survivors"], `${path}.survivors`).map((x, i) => text(x, `${path}.survivors[${i}]`));
  const playing = new Set(standings.map((s) => s.playerId));
  if (![...playing].every((id) => known.has(id)) || !survivors.every((id) => playing.has(id))) fail(path, "a round of the result's players");
  return { round: int(r["round"], `${path}.round`, 1), isFinal: r["isFinal"], ruleSetId: r["ruleSetId"], standings, survivors };
}

/** The one check of a result that arrives as unknown data (the server's file, the browser's answer). */
export function parseTournamentResult(raw: unknown): ResultParse {
  try {
    const r = obj(raw, "result");
    if (!isResultId(r["id"])) fail("result.id", "a result id");
    const kind = r["kind"];
    if (kind !== "private" && kind !== "presenter") fail("result.kind", '"private" or "presenter"');
    if (!isRuleSetMode(r["ruleSetMode"])) fail("result.ruleSetMode", "a rule set mode");
    if (!isJoinPolicy(r["joinPolicy"])) fail("result.joinPolicy", "a join policy");
    const players = list(r["players"], "result.players").map((p, i) => player(p, `result.players[${i}]`));
    const known = new Set(players.map((p) => p.id));
    if (known.size !== players.length) fail("result.players", "a list without repeats");
    const rounds = list(r["rounds"], "result.rounds").map((x, i) => round(x, `result.rounds[${i}]`, known));
    if (rounds.at(-1)?.isFinal !== true) fail("result.rounds", "a list that ends with the final");
    const ranking = list(r["ranking"], "result.ranking").map((x, i): ResultPlace => {
      const place = obj(x, `result.ranking[${i}]`);
      const playerId = text(place["playerId"], `result.ranking[${i}].playerId`);
      if (!known.has(playerId)) fail(`result.ranking[${i}].playerId`, "a player of the result");
      return { playerId, place: int(place["place"], `result.ranking[${i}].place`, 1) };
    });
    const winnerId = text(r["winnerId"], "result.winnerId");
    if (ranking[0]?.playerId !== winnerId) fail("result.ranking", "a list that starts with the winner");
    return {
      ok: true,
      result: {
        id: r["id"],
        arenaId: text(r["arenaId"], "result.arenaId"),
        arenaName: text(r["arenaName"], "result.arenaName"),
        kind,
        finishedAt: int(r["finishedAt"], "result.finishedAt", 0),
        game: int(r["game"], "result.game", 1),
        ticksPerRound: int(r["ticksPerRound"], "result.ticksPerRound", 1),
        tickMs: int(r["tickMs"], "result.tickMs", 1),
        ruleSetMode: r["ruleSetMode"],
        joinPolicy: r["joinPolicy"],
        players,
        rounds,
        ranking,
        winnerId,
      },
    };
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, error: error.message };
    throw error;
  }
}
