// The watch panes that the room frame places (docs/specs/revamp/60-no-scroll.md, seam S2 to S1a).
// Each pane fills the box it is given (the pane contract in 11-foundation-guide.md 11.2):
// its root is `flex min-h-0 flex-1 flex-col`, so give it a parent with a height
// (AppShell's main area, a tab panel, or a grid cell with `min-h-0`). No pane scrolls;
// lists are paged with `Pager`, and the viewer's row stays on every page.
//
// | Pane              | Room phase        | Props                    | Shows |
// |-------------------|-------------------|--------------------------|-------|
// | ArenaPane         | running           | arena, stream, viewerId  | one compact row (own place with a word on the cut, points, water; a help button that opens the legend dialog), then the board as large as the rest of the box allows, centred; in a big arena a window around the viewer's tank (or the leader) with a map and a switch to the whole arena (board/ArenaView.tsx) |
// | RankingPane       | running           | arena, stream, viewerId  | "Ranking", the note on the cut or the final, the live ranking paged with the cut line |
// | MyTankPane        | running           | decisions, strategy      | "What your tank did": the recent turns, newest first, paged |
// | ResultPane        | break, finished   | arena, me, notes?        | the outcome sentence, the recap, the winner (with the celebration when the viewer won), the notes and the top three |
// | FinalRankingPane  | break, finished   | arena, me                | the round's ranking with the cut line (break) or the final ranking (finished), paged |
//
// Props:
// - `arena: PublicArena` is `stream.arena` once loaded.
// - `stream: ArenaStreamState` is the room's `useArenaStream` state; the pane reads the
//   round's snapshot (`snapshotFor`), the shots and `firstTurnAt` from it.
// - `viewerId: PlayerId | null` is the viewer's own tank when it plays in this round
//   (view "live"), and null for a viewer without a tank in the round (view "watching":
//   a waiting or knocked-out player). It decides the own row, the "you" ring, which row
//   the ranking keeps, and which shot sounds play (board/turnSounds.ts: a player hears
//   only their own tank, a viewer without a tank hears every tank).
// - `me: PublicPlayer` is the viewer's player from the room view (any status: playing,
//   eliminated, waiting, winner).
// - `notes` (optional) are sentences a public arena adds to the end of a game, such as what
//   that a bot won the tournament.
// - `decisions` is `stream.ownDecisions`; `strategy` is the saved strategy
//   (`strategy.load.saved` when `strategy.load.kind === "ready"`).
//
// For the room's status line: `useRoundTitle(arena)` gives "Round 2" or "Round 2: Dry
// spell" (an arena that changes the rules), and `roundClock(arena, stream)` the time
// left as "1:05", or null before the first snapshot.
//
// Laptop: ArenaPane and RankingPane side by side, for example
// `grid grid-cols-[minmax(0,1fr)_minmax(0,20rem)] gap-6` in a box with a height; the
// own status stays in ArenaPane's row above the board.

import { useMemo, type ReactNode } from "react";
import type { PlayerId, PublicArena, PublicPlayer } from "@game/arena";
import type { StrategyInput } from "@game/engine";
import { ArenaView } from "../board/ArenaView.tsx";
import { LegendButton } from "../board/BoardLegend.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { DecisionFeed } from "../player/DecisionFeed.tsx";
import { RankingAfterRound, ResultSummary } from "../player/ResultViews.tsx";
import { liveRanking, ownLive, playerNames, tankInfos } from "../standings/standings.ts";
import { liveRankingItems, PagedRanking } from "../standings/StandingsTable.tsx";
import { snapshotFor, type ArenaStreamState, type OwnDecision } from "../stream/streamState.ts";
import { formatClock, timeLeftMs } from "./clock.ts";
import { useSecondsUntil } from "./countdown.ts";
import { roundHeading } from "./roundHeading.ts";
import { OwnStatusRow } from "./OwnStatus.tsx";

export interface ArenaPaneProps {
  readonly arena: PublicArena;
  readonly stream: ArenaStreamState;
  readonly viewerId: PlayerId | null;
  /** Replays the first-round tour from the legend dialog ("Show me around"); absent where no tour belongs. */
  readonly onShowAround?: () => void;
}

export interface RankingPaneProps {
  readonly arena: PublicArena;
  readonly stream: ArenaStreamState;
  readonly viewerId: PlayerId | null;
}

export interface MyTankPaneProps {
  readonly decisions: readonly OwnDecision[];
  readonly strategy: StrategyInput;
}

export interface ResultPaneProps {
  readonly arena: PublicArena;
  readonly me: PublicPlayer;
  /** Sentences shown under the outcome at the end of a game, in this order. */
  readonly notes?: readonly string[];
  /** A block under the notes at the end of a game: the practice arena's rule tip (ruletip/RuleTip.tsx). */
  readonly tip?: ReactNode;
}

export interface FinalRankingPaneProps {
  readonly arena: PublicArena;
  readonly me: PublicPlayer;
}

const PANE = "flex min-h-0 min-w-0 flex-1 flex-col";

/** The time left in the running round as "m:ss", or null outside a round or before its first snapshot. */
export function roundClock(arena: PublicArena, stream: ArenaStreamState): string | null {
  if (arena.phase.kind !== "running") return null;
  const snapshot = snapshotFor(stream, arena.phase.round);
  return snapshot === null ? null : formatClock(timeLeftMs(snapshot, arena.settings.tickMs));
}

/** "Round 2", "Final", or with the rules' name in an arena that changes them; null outside a round. */
export function useRoundTitle(arena: PublicArena): string | null {
  const m = useMessages();
  if (arena.phase.kind !== "running") return null;
  return roundHeading(arena.phase, arena.settings.ruleSetMode !== "standard", m);
}

function Starting() {
  const m = useMessages();
  return <p className="animate-pulse-soft text-lead text-muted">{m.live.starting}</p>;
}

export function ArenaPane({ arena, stream, viewerId, onShowAround }: ArenaPaneProps) {
  // One names record and one colour map per player list, so the board derives its labels once and not on every turn.
  const names = useMemo(() => playerNames(arena), [arena]);
  const tanks = useMemo(() => tankInfos(arena), [arena]);
  const countdown = useSecondsUntil(stream.firstTurnAt);
  const snapshot = arena.phase.kind === "running" ? snapshotFor(stream, arena.phase.round) : null;
  if (arena.phase.kind !== "running" || snapshot === null) {
    return (
      <div className={PANE}>
        <Starting />
      </div>
    );
  }
  const own = viewerId === null ? null : ownLive(snapshot, viewerId, arena.phase.isFinal);
  const counting = countdown !== null && snapshot.tick === 0;
  return (
    <div className={`${PANE} gap-2`} data-arena-pane="">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        {/* data-coach: the first-round tour's steps about points and water (guide/tours.ts). */}
        <div data-coach="own-status" className="min-w-0 flex-1">
          {own === null ? null : <OwnStatusRow own={own} beforeFirstTurn={snapshot.tick === 0} />}
        </div>
        <LegendButton {...(onShowAround === undefined ? {} : { onShowAround })} />
      </div>
      <ArenaView
        snapshot={snapshot}
        throws={stream.throws}
        names={names}
        highlightId={viewerId}
        tickMs={arena.settings.tickMs}
        tanks={tanks}
        countdown={counting ? countdown : null}
      />
    </div>
  );
}

export function RankingPane({ arena, stream, viewerId }: RankingPaneProps) {
  const m = useMessages();
  const t = m.results.table;
  const snapshot = arena.phase.kind === "running" ? snapshotFor(stream, arena.phase.round) : null;
  const isFinal = arena.phase.kind === "running" && arena.phase.isFinal;
  const ranking = useMemo(() => (snapshot === null ? null : liveRanking(arena, snapshot)), [arena, snapshot]);
  const items = useMemo(() => (ranking === null ? [] : liveRankingItems(ranking, t.topGoThrough)), [ranking, t]);
  // The rule for tanks with the same points at the cut is a step of "How the game works", so the pane keeps its height for the rows.
  const note = isFinal ? t.finalRule : null;
  return (
    <section className={`${PANE} gap-2`} aria-label={t.live} data-ranking-pane="">
      <h2 className="shrink-0 text-title">{t.live}</h2>
      {note === null ? null : <p className="shrink-0 text-caption text-muted">{note}</p>}
      {ranking === null ? <Starting /> : <PagedRanking label={t.live} items={items} highlightId={viewerId} />}
    </section>
  );
}

export function MyTankPane({ decisions, strategy }: MyTankPaneProps) {
  return (
    <div className={PANE}>
      <DecisionFeed decisions={decisions} strategy={strategy} />
    </div>
  );
}

export function ResultPane({ arena, me, notes = [], tip }: ResultPaneProps) {
  return (
    <div className={PANE} data-result-pane="">
      <ResultSummary arena={arena} me={me} notes={notes} tip={tip} />
    </div>
  );
}

export function FinalRankingPane({ arena, me }: FinalRankingPaneProps) {
  return (
    <div className={PANE}>
      <RankingAfterRound arena={arena} me={me} />
    </div>
  );
}
