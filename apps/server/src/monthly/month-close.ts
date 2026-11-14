// Promotion and demotion at the month's end (docs/specs/revamp/77-monthly-league.md, section 4).
// Pure, with table tests in month-close.test.ts.
//
// Input: each league's final ranking of the month, League 1 first, best first. Computed from
// these rankings before any move:
// 1. Between each pair of neighbouring leagues, the lower part of the upper league and the upper
//    part of the lower league change places. Both parts have the same size: the smaller of the
//    two halves, each half rounded down (16 and 16 seats: 8 each way; 16 and 5: 2 each way).
//    A middle league sends its top up and its bottom down; the two parts never overlap, because
//    each is at most half of it.
// 2. Then free seats are filled from the league below, so only the last league has free seats,
//    and a league left empty closes. "In ranking order" means the lower league's own final
//    ranking: its own tanks first, best first; then the tanks that came up into it, best first;
//    the tanks that went down into it come last, so a demotion is not undone while the lower
//    league still has its own tanks. When the league below is empty, the next one fills.
// 3. With one league nothing moves.
//
// Month close of the whole league, as a state machine (actor: the server, at the first moment
// of a new month; apps/server/src/monthly/monthly.ts runs it):
// | From          | To             | Guard                                                         |
// |---------------|----------------|---------------------------------------------------------------|
// | month open    | rankings fixed | the last day of the month is closed                           |
// | rankings fixed| seats moved    | this function's result is saved with each seat's move         |
// | seats moved   | month open     | the new month's first day starts; the moves wait to be seen   |
// Terminal state: none; a closed month's data stays on disk as it was.

export type MoveKind = "up" | "down" | "stayed";

export interface MonthCloseResult<Id> {
  /** The leagues after the close, League 1 first, each in ranking order. No league is empty. */
  readonly leagues: readonly (readonly Id[])[];
  /** Every seat: its league before and after (1 is the top), and what that was. */
  readonly moves: ReadonlyMap<Id, { readonly from: number; readonly to: number; readonly kind: MoveKind }>;
}

export function closeMonth<Id>(rankings: readonly (readonly Id[])[], seatsPerLeague: number): MonthCloseResult<Id> {
  if (!Number.isInteger(seatsPerLeague) || seatsPerLeague < 1) throw new Error(`seatsPerLeague must be a positive whole number, got ${seatsPerLeague}`);
  const origin = new Map<Id, { readonly league: number; readonly rank: number }>();
  rankings.forEach((ranking, league) => {
    if (ranking.length > seatsPerLeague) throw new Error(`League ${league + 1} holds ${ranking.length} seats, more than ${seatsPerLeague}.`);
    ranking.forEach((id, rank) => {
      if (origin.has(id)) throw new Error("A seat is in two leagues.");
      origin.set(id, { league, rank });
    });
  });

  // 1. The exchanges, all sized from the rankings before any move.
  const next: Id[][] = rankings.map((ranking) => [...ranking]);
  for (let upper = 0; upper + 1 < rankings.length; upper++) {
    const up = rankings[upper + 1] ?? [];
    const down = rankings[upper] ?? [];
    const count = Math.min(Math.floor(down.length / 2), Math.floor(up.length / 2));
    if (count === 0) continue;
    const goingDown = down.slice(down.length - count);
    const goingUp = up.slice(0, count);
    next[upper] = (next[upper] ?? []).filter((id) => !goingDown.includes(id)).concat(goingUp);
    next[upper + 1] = goingDown.concat((next[upper + 1] ?? []).filter((id) => !goingUp.includes(id)));
  }

  // 2. The free seats, filled from below.
  const originOf = (id: Id): { readonly league: number; readonly rank: number } => {
    const found = origin.get(id);
    if (found === undefined) throw new Error("A seat has no origin.");
    return found;
  };
  /** The order in which league `index` gives tanks to the league above: its own, then those that came up, then those that went down. */
  const fillOrder = (index: number) => (a: Id, b: Id): number => {
    const group = (id: Id): number => {
      const from = originOf(id).league;
      return from === index ? 0 : from > index ? 1 : 2;
    };
    return group(a) - group(b) || Math.abs(originOf(a).league - index) - Math.abs(originOf(b).league - index) || originOf(a).rank - originOf(b).rank;
  };
  for (let index = 0; index < next.length; index++) {
    const league = next[index] ?? [];
    while (league.length < seatsPerLeague) {
      const giver = next.findIndex((candidate, below) => below > index && candidate.length > 0);
      if (giver === -1) break;
      const pool = (next[giver] ?? []).sort(fillOrder(giver));
      const taken = pool.shift();
      if (taken === undefined) break;
      league.push(taken);
    }
  }
  const leagues = next
    .filter((league) => league.length > 0)
    .map((league) => [...league].sort((a, b) => originOf(a).league - originOf(b).league || originOf(a).rank - originOf(b).rank));

  const moves = new Map<Id, { from: number; to: number; kind: MoveKind }>();
  leagues.forEach((league, index) => {
    for (const id of league) {
      const from = (origin.get(id)?.league ?? index) + 1;
      const to = index + 1;
      moves.set(id, { from, to, kind: to < from ? "up" : to > from ? "down" : "stayed" });
    }
  });
  return { leagues, moves };
}
