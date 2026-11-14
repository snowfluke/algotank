// Reads results out of a PublicArena and a live snapshot: the live ranking with the
// cut, the standings of a finished round, the final ranking, and one player's
// outcome. Pure, so the big screen and the phone show the same numbers.
//
// Ties differ by source. During a round only the points are known, so tanks with
// the same points share a place (1, 2, 2, 4). After a round the server's rank is
// unique (points, then hits landed, then a draw from the seed), so the results keep
// that order and only say when equal points sit next to each other.

import { FINAL_SIZE, finalPlaceOf } from "@game/arena";
import type { PlayerId, PlayerStatus, PublicArena, PublicPlayer, PublicSnapshot, RoundSummary } from "@game/arena";
import { rulesOf } from "@game/engine";
import { cutPosition, rankBots } from "../board/boardHelpers.ts";
import type { TankInfo } from "../board/props.ts";
import { plainTankLook, type TankLook } from "../tank/look.ts";

/** Who a row shows: name, look and whether the server added it as a bot. */
export interface RowTank {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  readonly isBot: boolean;
}

export interface StandingRow extends RowTank {
  readonly place: number;
  readonly score: number;
  /** True when the player stays in the event after this round. */
  readonly advanced: boolean;
  /** True when the row above has the same points, so the tie-break decided the order. */
  readonly sameScoreAsAbove: boolean;
}

export interface FinalPlace extends RowTank {
  readonly place: number;
}

export interface LiveRow extends RowTank {
  /** Shared by tanks with the same points. */
  readonly place: number;
  readonly score: number;
}

export interface LiveRanking {
  readonly rows: readonly LiveRow[];
  /** How many rows stay above the cut line, or null when no line is drawn (a final, or nobody goes out). */
  readonly cut: number | null;
  /** True when the rows on both sides of the cut line have the same points. */
  readonly tieAtCut: boolean;
}

export interface PlayerRoundResult {
  readonly round: number;
  readonly place: number;
  readonly of: number;
  readonly advanced: boolean;
  readonly isFinal: boolean;
  /** True when the players who go through play the final next. */
  readonly nextIsFinal: boolean;
}

/** Where the viewer stands right now in a running round. */
export type LiveOutlook =
  | { readonly kind: "through" }
  | { readonly kind: "out" }
  /** Same points as the tank across the cut line: hits landed decide. */
  | { readonly kind: "onLine" }
  /** The round removes nobody. */
  | { readonly kind: "allThrough" }
  | { readonly kind: "leading"; readonly shared: boolean }
  | { readonly kind: "chasing"; readonly behind: number };

export interface OwnLive {
  readonly place: number;
  readonly tied: boolean;
  readonly of: number;
  readonly score: number;
  readonly water: number;
  readonly waterCapacity: number;
  readonly canShoot: boolean;
  readonly hitsLanded: number;
  readonly hitsTaken: number;
  readonly outlook: LiveOutlook;
}

const UNKNOWN_LOOK: TankLook = plainTankLook(1);

export function playerNames(arena: Pick<PublicArena, "players">): Readonly<Record<PlayerId, string>> {
  return Object.fromEntries(arena.players.map((p) => [p.id, p.name]));
}

/** The board's map of looks and bot flags, from the player list. */
export function tankInfos(arena: Pick<PublicArena, "players">): ReadonlyMap<PlayerId, TankInfo> {
  return new Map(arena.players.map((p) => [p.id, { look: p.look, isBot: p.isBot }]));
}

/** One lookup table per list: a search of the player list per row is 512 x 512 steps in a big arena. */
function playersById(arena: Pick<PublicArena, "players">): ReadonlyMap<PlayerId, PublicPlayer> {
  return new Map(arena.players.map((p) => [p.id, p]));
}

function rowTank(players: ReadonlyMap<PlayerId, PublicPlayer>, playerId: PlayerId): RowTank {
  const player = players.get(playerId);
  // A player missing from the list cannot come from the server; the id keeps the row readable.
  return player === undefined
    ? { playerId, name: playerId, look: UNKNOWN_LOOK, isBot: false }
    : { playerId, name: player.name, look: player.look, isBot: player.isBot };
}

export function liveRanking(arena: Pick<PublicArena, "players">, snapshot: PublicSnapshot): LiveRanking {
  const ranked = rankBots(snapshot.bots);
  const players = playersById(arena);
  const rows = ranked.map((r) => ({ ...rowTank(players, r.bot.id), place: r.rank, score: r.bot.score }));
  const cut = cutPosition(snapshot.survivorsAfterRound, rows.length);
  const tieAtCut = cut !== null && rows[cut - 1]?.score === rows[cut]?.score;
  return { rows, cut, tieAtCut };
}

/** The viewer's place, numbers and outlook, or null when the viewer has no tank in the round. */
export function ownLive(snapshot: PublicSnapshot, ownId: PlayerId, isFinal: boolean): OwnLive | null {
  const ranked = rankBots(snapshot.bots);
  const own = ranked.find((r) => r.bot.id === ownId);
  if (own === undefined) return null;
  const rules = rulesOf(snapshot);
  const score = own.bot.score;
  const tied = ranked.some((r) => r.bot.id !== ownId && r.bot.score === score);
  return {
    place: own.rank,
    tied,
    of: ranked.length,
    score,
    water: own.bot.water,
    waterCapacity: rules.waterCapacity,
    canShoot: own.bot.water >= rules.waterPerThrow,
    hitsLanded: own.bot.hitsLanded,
    hitsTaken: own.bot.hitsTaken,
    outlook: outlookOf(ranked.map((r) => r.bot.score), score, snapshot.survivorsAfterRound, isFinal),
  };
}

/** `scores` is sorted from most points down. */
export function outlookOf(scores: readonly number[], score: number, survivors: number | null, isFinal: boolean): LiveOutlook {
  const top = scores[0] ?? score;
  if (isFinal) {
    if (score < top) return { kind: "chasing", behind: top - score };
    return { kind: "leading", shared: scores.filter((s) => s === top).length > 1 };
  }
  const cut = cutPosition(survivors, scores.length);
  if (cut === null) return { kind: "allThrough" };
  const lastIn = scores[cut - 1] ?? score;
  const firstOut = scores[cut] ?? score;
  if (score > firstOut) return { kind: "through" };
  if (score < lastIn) return { kind: "out" };
  return { kind: "onLine" };
}

export function roundRows(arena: Pick<PublicArena, "players">, summary: RoundSummary): readonly StandingRow[] {
  const survivors = new Set(summary.survivors);
  const players = playersById(arena);
  return summary.standings.map((s, i) => ({
    ...rowTank(players, s.botId),
    place: s.rank,
    score: s.score,
    advanced: survivors.has(s.botId),
    sameScoreAsAbove: summary.standings[i - 1]?.score === s.score,
  }));
}

/** The winner first, then each eliminated player by the place the server gave. */
export function finalRanking(arena: Pick<PublicArena, "players">): readonly FinalPlace[] {
  const places: FinalPlace[] = [];
  const players = playersById(arena);
  for (const p of arena.players) {
    const place = placeOf(p.status);
    if (place !== null) places.push({ ...rowTank(players, p.id), place });
  }
  return places.sort((a, b) => a.place - b.place);
}

export function lastRoundResult(arena: Pick<PublicArena, "rounds">, playerId: PlayerId): PlayerRoundResult | null {
  const summary = arena.rounds.at(-1);
  return summary === undefined ? null : roundResult(arena, playerId, summary.round);
}

/** A player's result in a given round of the current game, or null when the player did not play it. */
export function roundResult(arena: Pick<PublicArena, "rounds">, playerId: PlayerId, round: number): PlayerRoundResult | null {
  const summary = arena.rounds.find((r) => r.round === round);
  const standing = summary?.standings.find((s) => s.botId === playerId);
  if (summary === undefined || standing === undefined) return null;
  return {
    round: summary.round,
    place: standing.rank,
    of: summary.standings.length,
    advanced: summary.survivors.includes(playerId),
    isFinal: summary.isFinal,
    nextIsFinal: summary.survivors.length <= FINAL_SIZE,
  };
}

/** Hits a player landed and took in a finished round, or null when the player did not play in it. */
export function roundHits(summary: RoundSummary, playerId: PlayerId): { readonly landed: number; readonly taken: number } | null {
  const standing = summary.standings.find((s) => s.botId === playerId);
  return standing === undefined ? null : { landed: standing.hitsLanded, taken: standing.hitsTaken };
}

/** The final place of a player who is out or has won, or null while the player is still playing. */
export function placeOf(status: PlayerStatus): number | null {
  return finalPlaceOf(status);
}
