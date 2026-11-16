// "/champions", the hall of fame (docs/specs/revamp/67-public-arenas.md): this month's
// ranking (paged, the visitor's own row kept in view), the champions of past months with
// their top three, and the recent tournament winners. On a phone the three parts are tabs;
// on a laptop they stand side by side. Nothing scrolls: each list is a Pager.
//
// The page reads its data once (useChampions.ts); ChampionsView draws any state from
// props, so the tests render it without a server.

import { ArrowLeft, CalendarDays, ListOrdered, Trophy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MONTHLY_RANKED_DAYS, type LeagueMonthRow, type MonthRecord, type TournamentWinner } from "@game/arena";
import { describeError } from "../api/errorSentences.ts";
import { goBack } from "../app/navigation.ts";
import { useAccount } from "../auth/accountStore.ts";
import { monthItems } from "../monthly/monthlyParts.ts";
import { paths } from "../app/route.ts";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { PagedRanking, RankingRow } from "../standings/StandingsTable.tsx";
import { tankLetters } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { MonthRules } from "./MonthRules.tsx";
import { useChampions, type ChampionsLoad } from "./useChampions.ts";

export type ChampionsPart = "month" | "months" | "tournaments";

const PART_ICONS: Record<ChampionsPart, ReactNode> = {
  month: <ListOrdered aria-hidden size={22} />,
  months: <CalendarDays aria-hidden size={22} />,
  tournaments: <Trophy aria-hidden size={22} />,
};
const PARTS: readonly ChampionsPart[] = ["month", "months", "tournaments"];

/** A past month's row. Stored rows carry no account id, and a rank is never shared, so the rank is the key. */
function rankKey(rank: number): string {
  return `rank-${rank}`;
}

const PANE = "flex min-h-0 min-w-0 flex-1 flex-col gap-2";

function MonthPane({ month, rows, ownSeatId }: { readonly month: string; readonly rows: readonly LeagueMonthRow[]; readonly ownSeatId: string | null }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.champions;
  const heading = t.monthHeading(f.month(month));
  return (
    <section aria-label={heading} data-champions-part="month" className={PANE}>
      <h2 className="shrink-0 text-title [overflow-wrap:anywhere]">{heading}</h2>
      <p className="shrink-0 text-muted">{t.rule}</p>
      {rows.length === 0 ? (
        <p className="text-lead">{t.monthEmpty}</p>
      ) : (
        <PagedRanking label={heading} items={monthItems(rows, m.monthly.notRanked(MONTHLY_RANKED_DAYS), m.monthly.gm)} highlightId={ownSeatId} jumpLabel={m.monthly.toNotRanked} />
      )}
    </section>
  );
}

function MonthCard({ record, rulesOpen }: { readonly record: MonthRecord; readonly rulesOpen: boolean }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.champions;
  const { champion } = record;
  return (
    <article className="flex min-w-0 flex-col gap-1 border-b border-line pb-2">
      <h3 className="text-lead [overflow-wrap:anywhere]">{f.month(record.month)}</h3>
      <p className="flex min-w-0 items-center gap-2">
        <TankBadge look={champion.look} label={tankLetters(champion.name)} size={40} name={null} detail="full" angle={-90} />
        <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{t.champion(champion.name, champion.score)}</span>
      </p>
      <ol aria-label={t.monthTop} className="m-0 flex list-none flex-col p-0">
        {record.top.slice(0, 3).map((row) => (
          <RankingRow key={row.rank} tank={{ playerId: rankKey(row.rank), name: row.name, look: row.look, isBot: false }} place={row.rank} score={row.score} verdict={null} isSelf={false} truncate />
        ))}
      </ol>
      {rulesOpen ? (
        <div className="flex min-w-0">
          <MonthRules month={record.month} />
        </div>
      ) : null}
    </article>
  );
}

function MonthsPane({ months, rulesMonths }: { readonly months: readonly MonthRecord[]; readonly rulesMonths: ReadonlySet<string> }) {
  const m = useMessages();
  const t = m.champions;
  return (
    <section aria-label={t.monthsHeading} data-champions-part="months" className={PANE}>
      <h2 className="shrink-0 text-title">{t.monthsHeading}</h2>
      {months.length === 0 ? (
        <p className="text-lead">{t.monthsEmpty}</p>
      ) : (
        <Pager label={t.monthsHeading} items={months} itemKey={(record) => record.month} gap={8} renderItem={(record) => <MonthCard record={record} rulesOpen={rulesMonths.has(record.month)} />} />
      )}
    </section>
  );
}

function WinnerRow({ winner }: { readonly winner: TournamentWinner }) {
  const m = useMessages();
  const f = useFormat();
  return (
    <div className="flex min-h-12 min-w-0 items-center gap-2 border-b border-line py-1">
      <TankBadge look={winner.look} label={tankLetters(winner.name)} size={36} name={null} detail="full" angle={-90} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold" title={winner.name}>
          {winner.name}
        </span>
        <span className="text-caption text-muted [overflow-wrap:anywhere]">{m.champions.won(winner.name, f.date(winner.wonAt), winner.tanks)}</span>
      </span>
    </div>
  );
}

function TournamentsPane({ winners }: { readonly winners: readonly TournamentWinner[] }) {
  const m = useMessages();
  const t = m.champions;
  return (
    <section aria-label={t.tournamentsHeading} data-champions-part="tournaments" className={PANE}>
      <h2 className="shrink-0 text-title">{t.tournamentsHeading}</h2>
      {winners.length === 0 ? (
        <p className="text-lead">{t.tournamentsEmpty}</p>
      ) : (
        <Pager label={t.tournamentsHeading} items={winners} itemKey={(w, i) => `${w.wonAt}-${i}`} gap={0} ordered renderItem={(w) => <WinnerRow winner={w} />} />
      )}
    </section>
  );
}

/** The page in any state of its data. `part` is the tab shown on a phone. */
export function ChampionsView({ load, part, onPart, onRetry }: { readonly load: ChampionsLoad; readonly part: ChampionsPart; onPart(next: ChampionsPart): void; onRetry(): void }) {
  const m = useMessages();
  const t = m.champions;
  const laptop = useLaptopLayout();
  const ready = load.kind === "ready";
  const tabs =
    ready && !laptop ? (
      <BottomTabs idBase="champions" label={t.parts.label} value={part} onChange={onPart} tabs={PARTS.map((value) => ({ value, label: t.parts[value], icon: PART_ICONS[value] }))} />
    ) : undefined;

  let body: ReactNode;
  if (load.kind === "loading") {
    body = (
      <p role="status" className="animate-pulse-soft text-lead text-muted">
        {t.loading}
      </p>
    );
  } else if (load.kind === "failed") {
    body = (
      <StatusBanner
        tone="danger"
        title={describeError(load.failure, "loadChampions", m.errors).sentence}
        action={
          <Button variant="secondary" onClick={onRetry}>
            {t.retry}
          </Button>
        }
      />
    );
  } else {
    const { data } = load;
    const panes: Record<ChampionsPart, ReactNode> = {
      month: <MonthPane month={data.month} rows={data.rows} ownSeatId={data.ownSeatId} />,
      months: <MonthsPane months={data.champions.months} rulesMonths={data.rulesMonths} />,
      tournaments: <TournamentsPane winners={data.champions.tournamentWinners} />,
    };
    body = laptop ? (
      <div className="grid min-w-0 gap-6 fit:min-h-0 fit:flex-1 fit:grid-rows-[minmax(0,1fr)]" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)" }}>
        {PARTS.map((value) => (
          <div key={value} className="flex min-h-0 min-w-0 flex-col">
            {panes[value]}
          </div>
        ))}
      </div>
    ) : (
      <div {...tabPanelProps("champions", part)} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {panes[part]}
      </div>
    );
  }

  return (
    <AppShell bottom={tabs}>
      <div data-champions="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* Back returns to the room or the chooser that linked here; a shared link to this page goes to the chooser. */}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <IconButton label={m.common.back} icon={<ArrowLeft aria-hidden size={22} />} variant="quiet" data-champions-back="" onClick={() => goBack(paths.play())} />
          <h1 className="min-w-0 text-heading [overflow-wrap:anywhere]">{t.heading}</h1>
        </div>
        {body}
      </div>
    </AppShell>
  );
}

export function ChampionsPage() {
  const account = useAccount();
  const { load, retry } = useChampions(account.kind === "signedIn");
  const [part, setPart] = useState<ChampionsPart>("month");
  return <ChampionsView load={load} part={part} onPart={setPart} onRetry={retry} />;
}
