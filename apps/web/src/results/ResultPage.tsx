// The page of a stored result, /r/:id ("Tournament result" / "Hasil turnamen"): the winner with
// the celebration drawing, the final ranking (paged) and the round history. The arena's owner
// also gets the winner's email with Copy (ResultResponse.emails is null for everyone else).
// Anyone with the link sees the rest, so a fresh browser opens it as it is. On a laptop the
// winner and the ranking share the left column and the history takes the rest; on a phone the
// three are tabs. Nothing scrolls (60-no-scroll.md).
//
// | Load        | Shows                                                        |
// |-------------|--------------------------------------------------------------|
// | loading     | one status line                                              |
// | notFound    | why (a wrong link, or older than 180 days) and a home link  |
// | failed      | the connection sentence and Try again                        |
// | ready       | the result                                                   |

import { History, ListOrdered, Trophy } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PlayerId, ResultResponse } from "@game/arena";
import { getResult } from "../api/client.ts";
import { paths } from "../app/route.ts";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { browserStore, readPlayerSession } from "../session/storage.ts";
import { RankingRow } from "../standings/StandingsTable.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { Button, LinkButton } from "../ui/Button.tsx";
import { CopyField } from "../ui/CopyField.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { Celebration } from "./Celebration.tsx";
import { historyOfResult, rankingOfResult } from "./history.ts";
import { RoundHistory } from "./RoundHistory.tsx";

export type ResultLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "notFound" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly response: ResultResponse };

export type ResultPart = "winner" | "ranking" | "history";
const PARTS: readonly ResultPart[] = ["winner", "ranking", "history"];
const PART_ICONS: Record<ResultPart, ReactNode> = {
  winner: <Trophy aria-hidden size={22} />,
  ranking: <ListOrdered aria-hidden size={22} />,
  history: <History aria-hidden size={22} />,
};
const PANE = "flex min-h-0 min-w-0 flex-1 flex-col gap-3";

function WinnerPart({ response }: { readonly response: ResultResponse }) {
  const m = useMessages();
  const f = useFormat();
  const { result } = response;
  const ranking = rankingOfResult(result);
  const winner = ranking[0]?.tank;
  const email = response.emails?.find((e) => e.playerId === result.winnerId)?.email ?? null;
  return (
    <section aria-label={m.results.page.tabs.winner} className={PANE}>
      {winner === undefined ? null : (
        <div className="min-h-0 w-full flex-1 [&>svg]:h-full">
          <Celebration winner={winner.look} saluting={ranking.slice(1, 3).map((r) => r.tank.look)} label={m.common.tankOf(winner.name)} />
        </div>
      )}
      <p className="shrink-0 font-display text-heading font-bold [overflow-wrap:anywhere]">{m.results.finished.winnerIs(winner?.name ?? result.winnerId)}</p>
      <p className="shrink-0 text-muted">{m.results.page.played(f.date(new Date(result.finishedAt).toISOString()), result.rounds.length, result.players.length)}</p>
      {email === null ? null : (
        <div data-winner-email="" className="shrink-0">
          <CopyField label={m.results.page.winnerEmail} value={email} />
        </div>
      )}
    </section>
  );
}

function RankingPart({ response, viewerId }: { readonly response: ResultResponse; readonly viewerId: PlayerId | null }) {
  const t = useMessages().results.table;
  const places = rankingOfResult(response.result);
  const own = places.findIndex((p) => p.tank.playerId === viewerId);
  return (
    <section aria-label={t.final} className={PANE}>
      <h2 className="shrink-0 text-title">{t.final}</h2>
      <Pager
        label={t.final}
        items={places}
        itemKey={(p) => p.tank.playerId}
        keepIndex={own === -1 ? null : own}
        uniformHeight
        gap={0}
        renderItem={(p) => <RankingRow element="div" tank={p.tank} place={p.place} isSelf={p.tank.playerId === viewerId} score={null} verdict={null} truncate />}
      />
    </section>
  );
}

/** The page in any state of its data. `part` is the tab shown on a phone. Exported for its test. */
export function ResultView({ load, viewerId, part, onPart, onRetry }: { readonly load: ResultLoad; readonly viewerId: PlayerId | null; readonly part: ResultPart; onPart(next: ResultPart): void; onRetry(): void }) {
  const m = useMessages();
  const t = m.results.page;
  const laptop = useLaptopLayout();
  const ready = load.kind === "ready";
  const tabs = ready && !laptop ? <BottomTabs idBase="result" label={t.parts} value={part} onChange={onPart} tabs={PARTS.map((value) => ({ value, label: t.tabs[value], icon: PART_ICONS[value] }))} /> : undefined;

  let body: ReactNode;
  switch (load.kind) {
    case "loading":
      body = (
        <p role="status" className="animate-pulse-soft text-lead text-muted">
          {t.loading}
        </p>
      );
      break;
    case "notFound":
      body = (
        <>
          <StatusBanner tone="info" title={t.notFound} />
          <div>
            <LinkButton href={paths.home()} variant="primary" size="lg">
              {m.common.goHome}
            </LinkButton>
          </div>
        </>
      );
      break;
    case "failed":
      body = (
        <StatusBanner
          tone="danger"
          title={m.results.mine.failed}
          action={
            <Button variant="secondary" onClick={onRetry}>
              {m.results.mine.tryAgain}
            </Button>
          }
        />
      );
      break;
    case "ready": {
      const { response } = load;
      const history = <RoundHistory model={historyOfResult(response.result, viewerId)} />;
      body = laptop ? (
        <div className="grid min-h-0 min-w-0 gap-6 fit:flex-1 fit:grid-rows-[minmax(0,1fr)]" style={{ gridTemplateColumns: "minmax(0,22rem) minmax(0,1fr)" }}>
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <div className="flex min-h-0 flex-[1_1_0] flex-col">
              <WinnerPart response={response} />
            </div>
            <div className="flex min-h-0 flex-[1.4_1_0] flex-col">
              <RankingPart response={response} viewerId={viewerId} />
            </div>
          </div>
          <section aria-label={m.results.history.heading} className={PANE}>
            <h2 className="shrink-0 text-title">{m.results.history.heading}</h2>
            {history}
          </section>
        </div>
      ) : (
        <div {...tabPanelProps("result", part)} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {part === "winner" ? <WinnerPart response={response} /> : part === "ranking" ? <RankingPart response={response} viewerId={viewerId} /> : history}
        </div>
      );
      break;
    }
  }

  const heading = load.kind === "ready" ? load.response.result.arenaName : m.common.pageTitles.result;
  return (
    <AppShell header={<AppHeader title={m.common.pageTitles.result} />} bottom={tabs}>
      <div data-result-page={load.kind} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <h1 className="shrink-0 text-heading [overflow-wrap:anywhere]">{heading}</h1>
        {body}
      </div>
    </AppShell>
  );
}

function useResult(resultId: string): { readonly load: ResultLoad; retry(): void } {
  const [load, setLoad] = useState<ResultLoad>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLoad({ kind: "loading" });
    void getResult(resultId).then((answer) => {
      if (!current) return;
      if (answer.ok) setLoad({ kind: "ready", response: answer.data });
      else setLoad(answer.status === 404 ? { kind: "notFound" } : { kind: "failed" });
    });
    return () => {
      current = false;
    };
  }, [resultId, attempt]);
  return { load, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

export function ResultPage({ resultId }: { readonly resultId: string }) {
  const { load, retry } = useResult(resultId);
  const [part, setPart] = useState<ResultPart>("winner");
  // A browser that played in the arena still holds its seat, so its tank is marked as "you".
  const viewerId = load.kind === "ready" ? (readPlayerSession(browserStore(), load.response.result.arenaId)?.playerId ?? null) : null;
  return <ResultView load={load} viewerId={viewerId} part={part} onPart={setPart} onRetry={retry} />;
}
