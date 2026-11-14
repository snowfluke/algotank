// The end of a game on the big screen: the one authored celebration with the
// winner and the top three, then the full ranking beside it. An owner's tournament of more than
// one round shows its round history there instead (75-organiser-tournament.md section 5): its
// columns hold every place, and the winner's path reads from left to right.

import { isPublicKind, type PlayerId, type PublicArena } from "@game/arena";
import { historyOfArena } from "../results/history.ts";
import { RoundHistory } from "../results/RoundHistory.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Celebration } from "../results/Celebration.tsx";
import { FinalRanking } from "../standings/StandingsTable.tsx";
import { finalRanking } from "../standings/standings.ts";
import type { NextStep } from "../stream/streamState.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import type { FitSize } from "../ui/fitList.ts";
import { NextStepLine } from "./NextStepLine.tsx";

/** A column keeps room for about 18 characters of a name beside the place and the tank. */
const PLACES_FIT: FitSize = { maxPx: 36, columnEm: 16 };
/** A history column at the big screen's type size, read from 5 m. */
const SCREEN_HISTORY_COLUMN_PX = 320;

export function FinishedScreen({ arena, winnerId, nextStep = null }: { arena: PublicArena; winnerId: PlayerId; nextStep?: NextStep | null }) {
  const m = useMessages();
  const t = m.screen.finished;
  const places = finalRanking(arena);
  const winner = places.find((p) => p.playerId === winnerId) ?? places[0];
  const podium = places.slice(0, 3);
  const showsHistory = !isPublicKind(arena.settings.kind) && arena.rounds.length > 1;
  return (
    <div className={`grid h-full min-h-0 grid-cols-1 gap-12 ${showsHistory ? "laptop:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : "laptop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}`}>
      <section className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-4" aria-labelledby="winner-heading">
        {winner === undefined ? null : (
          <div className="min-h-0 w-full max-w-[60rem] flex-1 [&>svg]:h-full">
            <Celebration winner={winner.look} saluting={podium.slice(1).map((p) => p.look)} label={m.common.tankOf(winner.name)} />
          </div>
        )}
        <h1 id="winner-heading" className="text-center text-display [overflow-wrap:anywhere]">
          {t.heading(winner?.name ?? winnerId)}
        </h1>
        <ol aria-label={m.results.finished.podium} className="m-0 flex list-none flex-wrap justify-center gap-x-10 gap-y-2 p-0">
          {podium.map((p) => (
            <li key={p.playerId} className="flex min-w-0 items-center gap-3">
              <TankBadge look={p.look} size={56} name={null} angle={-90} detail="full" />
              <span className="flex min-w-0 flex-col">
                <span className="text-caption font-semibold text-muted">{m.results.finished.podiumPlace(p.place)}</span>
                <span className="max-w-[16ch] font-display text-title font-semibold [overflow-wrap:anywhere]">
                  {p.name}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <NextStepLine step={nextStep} counting={t.resetIn} waiting={isPublicKind(arena.settings.kind) ? t.soon : t.waiting} className="text-center text-muted" />
      </section>
      {showsHistory ? (
        <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-labelledby="round-history-heading">
          <h2 id="round-history-heading" className="text-title">
            {m.results.history.heading}
          </h2>
          <RoundHistory model={historyOfArena(arena, null)} columnMinPx={SCREEN_HISTORY_COLUMN_PX} opensAt="last" />
        </section>
      ) : (
        <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-labelledby="final-ranking-heading">
          <h2 id="final-ranking-heading" className="text-title">
            {m.results.table.final}
          </h2>
          <div className="min-h-0 flex-1">
            <FinalRanking places={places} fit={PLACES_FIT} />
          </div>
        </section>
      )}
    </div>
  );
}
