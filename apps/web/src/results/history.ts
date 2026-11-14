// The round history ("Riwayat ronde", docs/specs/revamp/75-organiser-tournament.md section 5):
// one column per round, oldest first and the final last, each a ranking with points and a
// mark for through or out, so the path of each tank reads from left to right. Pure, so the
// result page (a stored TournamentResult) and the finished views of a live arena (a
// PublicArena's rounds and players) draw the same columns.
//
// The followed tank is kept on every column's page (Pager keepIndex), so its path stays in
// view at 512 tanks: the viewer's own tank when it played, otherwise the winner.

import type { PlayerId, PublicArena, ResultRound, TankLook, TournamentResult } from "@game/arena";

export interface HistoryTank {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  readonly isBot: boolean;
}

/** "through": went on to the next round; "out": the round ended this tank's game; "winner": first in the final. */
export type HistoryMark = "through" | "out" | "winner";

export interface HistoryRow {
  readonly tank: HistoryTank;
  readonly place: number;
  readonly score: number;
  readonly mark: HistoryMark;
  /** The viewer's own tank. */
  readonly self: boolean;
  /** The tank that won the game; its rows across the columns are its path. */
  readonly winner: boolean;
}

export interface HistoryColumn {
  readonly round: number;
  readonly isFinal: boolean;
  /** Best place first. */
  readonly rows: readonly HistoryRow[];
  /** How many tanks went through (1 in the final: the winner). */
  readonly through: number;
  /** The row of the followed tank, or null when it did not play this round. */
  readonly keepIndex: number | null;
}

export interface RoundHistoryModel {
  readonly columns: readonly HistoryColumn[];
  /** The viewer's tank when it played, otherwise the winner; null when neither exists (a break watched by a stranger). */
  readonly followedId: PlayerId | null;
  readonly winnerId: PlayerId | null;
}

/** The same shape for a stored round and a live RoundSummary. */
type RoundInput = Pick<ResultRound, "round" | "isFinal" | "survivors" | "standings">;

const UNKNOWN_LOOK: TankLook = { colour: 1, skin: "plain", second: 2, plate: null, icon: null };

function build(rounds: readonly RoundInput[], tanks: ReadonlyMap<PlayerId, HistoryTank>, winnerId: PlayerId | null, viewerId: PlayerId | null): RoundHistoryModel {
  const played = new Set(rounds.flatMap((r) => r.standings.map((s) => s.playerId)));
  const viewerPlayed = viewerId !== null && played.has(viewerId);
  const followedId = viewerPlayed ? viewerId : winnerId;
  const columns = [...rounds]
    .sort((a, b) => a.round - b.round)
    .map((round): HistoryColumn => {
      const through = new Set(round.survivors);
      const rows = [...round.standings]
        .sort((a, b) => a.rank - b.rank)
        .map((s): HistoryRow => {
          // A player missing from the list cannot come from the server; the id keeps the row readable.
          const tank = tanks.get(s.playerId) ?? { playerId: s.playerId, name: s.playerId, look: UNKNOWN_LOOK, isBot: false };
          const won = round.isFinal && s.playerId === winnerId;
          return {
            tank,
            place: s.rank,
            score: s.score,
            mark: won ? "winner" : through.has(s.playerId) && !round.isFinal ? "through" : "out",
            self: viewerPlayed && s.playerId === viewerId,
            winner: s.playerId === winnerId,
          };
        });
      const kept = followedId === null ? -1 : rows.findIndex((row) => row.tank.playerId === followedId);
      return { round: round.round, isFinal: round.isFinal, rows, through: through.size, keepIndex: kept === -1 ? null : kept };
    });
  return { columns, followedId: followedId !== null && played.has(followedId) ? followedId : null, winnerId };
}

/** The history of a stored result (the result page). */
export function historyOfResult(result: TournamentResult, viewerId: PlayerId | null): RoundHistoryModel {
  const tanks = new Map(result.players.map((p) => [p.id, { playerId: p.id, name: p.name, look: p.look, isBot: p.isBot }]));
  return build(result.rounds, tanks, result.winnerId, viewerId);
}

/** The history of the current game of a live arena (the finished views), before or without a stored result. */
export function historyOfArena(arena: Pick<PublicArena, "rounds" | "players" | "phase">, viewerId: PlayerId | null): RoundHistoryModel {
  const tanks = new Map(arena.players.map((p) => [p.id, { playerId: p.id, name: p.name, look: p.look, isBot: p.isBot }]));
  const rounds = arena.rounds.map((r) => ({
    round: r.round,
    isFinal: r.isFinal,
    survivors: r.survivors,
    standings: r.standings.map((s) => ({ playerId: s.botId, rank: s.rank, score: s.score })),
  }));
  return build(rounds, tanks, arena.phase.kind === "finished" ? arena.phase.winnerId : null, viewerId);
}

/** The places of a stored result with their tanks, best first. */
export function rankingOfResult(result: TournamentResult): readonly { readonly tank: HistoryTank; readonly place: number }[] {
  const tanks = new Map(result.players.map((p) => [p.id, p]));
  return result.ranking.flatMap((entry) => {
    const p = tanks.get(entry.playerId);
    return p === undefined ? [] : [{ tank: { playerId: p.id, name: p.name, look: p.look, isBot: p.isBot }, place: entry.place }];
  });
}

/** The address of a stored result, for the result link and its QR code. */
export function resultLink(origin: string, resultId: string): string {
  return `${origin}/r/${encodeURIComponent(resultId)}`;
}
