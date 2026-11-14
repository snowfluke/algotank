// The player's result panes: after a round, after being knocked out, and at the
// end. Each starts with the outcome as one sentence with its reason, then a short
// recap of the hits, then the top places; the Ranking pane holds the whole ranking
// with the player's own row marked. The recap reads the round's standings in the
// arena, so a page opened during a break shows it too. The rule for tanks with the same
// points is a step of "How the game works" (the "?" in the status line), because a 20 s
// break has no time to read it (73-after-first-timer-test.md, row 7).

import { useId } from "react";
import { isPublicKind, type PublicArena, type PublicPlayer } from "@game/arena";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { roundKind } from "../live/roundHeading.ts";
import { Celebration } from "../results/Celebration.tsx";
import { finalRankingItems, PagedRanking, RankingRow, roundStandingItems, type RankingItem } from "../standings/StandingsTable.tsx";
import { finalRanking, placeOf, roundHits, roundResult, roundRows, type PlayerRoundResult } from "../standings/standings.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";

interface ResultProps {
  readonly arena: PublicArena;
  readonly me: PublicPlayer;
}

function Recap({ arena, round, playerId }: { arena: PublicArena; round: number; playerId: string }) {
  const m = useMessages();
  const summary = arena.rounds.find((r) => r.round === round);
  const hits = summary === undefined ? null : roundHits(summary, playerId);
  return hits === null ? null : <p className="[overflow-wrap:anywhere]">{m.results.round.recap(hits.landed, hits.taken)}</p>;
}

function useRoundHeading(arena: PublicArena, round: number): string {
  const m = useMessages();
  const summary = arena.rounds.find((r) => r.round === round);
  const kind = summary === undefined ? "round" : roundKind(summary);
  const base = kind === "game" ? m.results.round.gameHeading : kind === "final" ? m.results.round.finalHeading : m.results.round.heading(round);
  return summary === undefined || arena.settings.ruleSetMode === "standard"
    ? base
    : m.live.headingWithRules(base, m.vocabulary.roundRules[summary.ruleSetId].name);
}

/**
 * A public arena's break and result run on the server's clock (20 s, the tournament's result
 * 30 s), which leaves time for the outcome and the place, so the recap of hits and the words
 * for a tank that is out are left out there (73-after-first-timer-test.md, row 7).
 */
function onTheClock(arena: PublicArena): boolean {
  return isPublicKind(arena.settings.kind);
}

/** The round in which a player went out, and the result in it. */
function outResult(arena: PublicArena, me: PublicPlayer): PlayerRoundResult | null {
  return me.status.kind === "eliminated" ? roundResult(arena, me.id, me.status.inRound) : null;
}

// --- The panes after a round and at the end (live/panes.tsx places them) -------------
// They fit the box they are given: the outcome first, then the recap, then the top
// three of the round or the game. The full ranking is the Ranking pane next to it.

const TOP_PLACES = 3;

/** The top three of a ranking, with the viewer's row marked when it is among them. */
function TopPlaces({ items, highlightId }: { items: readonly RankingItem[]; highlightId: string }) {
  const m = useMessages();
  const headingId = useId();
  const top = items.filter((item) => item.kind === "row").slice(0, TOP_PLACES);
  return (
    <section className="flex min-w-0 shrink-0 flex-col gap-1" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-lead">
        {m.results.finished.podium}
      </h3>
      <ol aria-labelledby={headingId} className="m-0 flex list-none flex-col p-0">
        {top.map((item) =>
          item.kind === "row" ? <RankingRow key={item.row.tank.playerId} {...item.row} isSelf={item.row.tank.playerId === highlightId} truncate /> : null,
        )}
      </ol>
    </section>
  );
}

/** The result pane's content: the end of the game, or the round that just ended. `notes` show at the end of a game only. */
export function ResultSummary({ arena, me, notes }: ResultProps & { readonly notes: readonly string[] }) {
  if (arena.phase.kind === "finished") return <FinishedSummary arena={arena} winnerId={arena.phase.winnerId} me={me} notes={notes} />;
  return <BreakSummary arena={arena} me={me} />;
}

/**
 * Detail levels of the break result, fullest first. A player who is out on a small phone
 * reads more sentences and may have the owner's start action under the pane, so the
 * kind lines give way first, then the recap of hits; the outcome and the top three stay.
 */
const BREAK_DETAIL_LEVELS = 3;

function BreakSummary({ arena, me }: ResultProps) {
  const m = useMessages();
  const [language] = useLanguage();
  const detail = useFitDetail<HTMLDivElement>(BREAK_DETAIL_LEVELS, language);
  const latest = arena.rounds.at(-1);
  const heading = useRoundHeading(arena, latest?.round ?? 0);
  if (latest === undefined) return null;
  const items = roundStandingItems(roundRows(arena, latest), m.results.table.topGoThrough);
  const playing = me.status.kind === "playing" ? roundResult(arena, me.id, latest.round) : null;
  const out = outResult(arena, me);
  return (
    <div ref={detail.ref} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 fit:overflow-hidden">
      {out === null ? (
        <h2 className="text-title [overflow-wrap:anywhere]">{heading}</h2>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <TankBadge look={me.look} size={48} name={m.common.yourTank} self detail="full" angle={-90} />
          <h2 className="min-w-0 text-title [overflow-wrap:anywhere]">{m.results.out.heading}</h2>
        </div>
      )}
      {playing === null ? null : (
        <p className="text-lead font-semibold text-ok [overflow-wrap:anywhere]">
          {m.results.round.through(m.results.ordinal(playing.place), playing.of, playing.nextIsFinal, playing.round + 1)}
        </p>
      )}
      {out === null ? null : <p className="text-lead font-semibold [overflow-wrap:anywhere]">{m.results.round.out(m.results.ordinal(out.place), out.of)}</p>}
      {(playing === null && out === null) || detail.level >= 2 || onTheClock(arena) ? null : <Recap arena={arena} round={(playing ?? out)?.round ?? latest.round} playerId={me.id} />}
      {out === null || detail.level >= 1 || onTheClock(arena) ? null : <p className="[overflow-wrap:anywhere]">{`${m.results.out.kind} ${m.results.out.watch}`}</p>}
      <TopPlaces items={items} highlightId={me.id} />
    </div>
  );
}

/** The end of a game gives way like the break: the recap of hits first; the outcome, the notes and the top three stay. */
const FINISHED_DETAIL_LEVELS = 2;

function FinishedSummary({ arena, winnerId, me, notes }: ResultProps & { readonly winnerId: string; readonly notes: readonly string[] }) {
  const m = useMessages();
  const [language] = useLanguage();
  const detail = useFitDetail<HTMLDivElement>(FINISHED_DETAIL_LEVELS, `${language}|${notes.join("|")}`);
  const places = finalRanking(arena);
  const winner = arena.players.find((p) => p.id === winnerId);
  const won = winnerId === me.id;
  const place = placeOf(me.status);
  const final = arena.rounds.at(-1);
  return (
    <div ref={detail.ref} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 fit:overflow-hidden">
      {won && winner !== undefined ? (
        <>
          {/* The picture gives way when the pane is short, so the sentences and the top three always show. */}
          <div className="flex h-40 min-h-0 justify-center [container-type:size] fit:h-auto fit:flex-1">
            <div className="hide-when-short h-full max-w-full [&>svg]:h-full [&>svg]:w-auto">
              <Celebration winner={winner.look} saluting={places.slice(1, 3).map((p) => p.look)} self label={m.common.tankOf(winner.name)} />
            </div>
          </div>
          <h2 className="text-center text-heading text-self-ink [overflow-wrap:anywhere]">{m.results.finished.youWon}</h2>
        </>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          {winner === undefined ? null : <TankBadge look={winner.look} size={56} name={m.common.tankOf(winner.name)} detail="full" angle={-90} />}
          <h2 className="min-w-0 text-heading [overflow-wrap:anywhere]">{m.results.finished.winnerIs(winner?.name ?? winnerId)}</h2>
        </div>
      )}
      {won || place === null ? null : (
        <p className="text-lead font-semibold [overflow-wrap:anywhere]">{m.results.finished.yourPlace(m.results.ordinal(place), places.length)}</p>
      )}
      {notes.map((note) => (
        <p key={note} className="font-semibold [overflow-wrap:anywhere]">
          {note}
        </p>
      ))}
      {final === undefined || detail.level >= 1 || onTheClock(arena) ? null : <Recap arena={arena} round={final.round} playerId={me.id} />}
      <TopPlaces items={finalRankingItems(places)} highlightId={me.id} />
    </div>
  );
}

/** The Ranking pane after a round and at the end: the round's standings during a break, the final ranking when the game is over. */
export function RankingAfterRound({ arena, me }: ResultProps) {
  const m = useMessages();
  const t = m.results.table;
  const headingId = useId();
  const latest = arena.rounds.at(-1);
  const heading = useRoundHeading(arena, latest?.round ?? 0);
  const finished = arena.phase.kind === "finished";
  const rows = !finished && latest !== undefined ? roundRows(arena, latest) : null;
  const items = finished ? finalRankingItems(finalRanking(arena)) : rows === null ? [] : roundStandingItems(rows, t.topGoThrough);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-labelledby={headingId}>
      <h2 id={headingId} className="shrink-0 text-title [overflow-wrap:anywhere]">
        {finished ? t.final : heading}
      </h2>
      <PagedRanking label={finished ? t.final : t.roundList} items={items} highlightId={me.id} />
    </section>
  );
}
