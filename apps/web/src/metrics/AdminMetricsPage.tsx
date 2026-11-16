// "/admin/metrics", the host's usage numbers (docs/specs/revamp/81-metrics.md, K1a): today
// against yesterday as a table, the last 30 days as small line charts, and the first visit as
// bars with the share that reached each step. On a phone the three parts are tabs; on a laptop
// they stand side by side. Nothing scrolls: each list is a Pager.
//
// AdminMetricsView draws any state from props, so the tests render it without a server.

import { BarChart3, Footprints, LineChart as LineIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AdminMetricsResponse } from "@game/arena";
import { useFormat, useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { Button } from "../ui/Button.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { NotFoundPage } from "../ui/NotFoundPage.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { LineChart } from "./LineChart.tsx";
import { pathOf, seriesOf, todayRows, type PathStep, type Series, type TodayRow } from "./metricsView.ts";
import { useAdminMetrics, type AdminMetricsLoad } from "./useAdminMetrics.ts";

export type MetricsPart = "today" | "days" | "path";
const PARTS: readonly MetricsPart[] = ["today", "days", "path"];
const PART_ICONS: Record<MetricsPart, ReactNode> = {
  today: <BarChart3 aria-hidden size={22} />,
  days: <LineIcon aria-hidden size={22} />,
  path: <Footprints aria-hidden size={22} />,
};

const PANE = "flex min-h-0 min-w-0 flex-1 flex-col gap-2";
/** The table's columns: the name takes the rest, each number at least 5.5em. */
const ROW_GRID = "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(5.5em,auto)_minmax(5.5em,auto)] items-center gap-x-3";

/** A date at noon UTC, so no time zone moves it to another day. */
const noon = (day: string) => `${day}T12:00:00Z`;

function useShortDay(): (day: string) => string {
  const [language] = useLanguage();
  const format = new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (day) => format.format(new Date(noon(day)));
}

function TodayPane({ rows }: { readonly rows: readonly TodayRow[] }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.metrics;
  const value = (n: number | null) => (n === null ? t.noRound : f.number(n));
  return (
    <section aria-label={t.todayHeading} data-metrics-part="today" className={PANE}>
      <h2 className="shrink-0 text-title">{t.todayHeading}</h2>
      <div className={`${ROW_GRID} shrink-0 border-b border-line pb-1 text-caption text-muted`} aria-hidden="true">
        <span>{t.columns.measure}</span>
        <span className="text-right">{t.columns.today}</span>
        <span className="text-right">{t.columns.yesterday}</span>
      </div>
      <Pager
        label={t.todayHeading}
        items={rows}
        ordered={false}
        gap={0}
        itemKey={(row) => (row.kind === "measure" ? row.id : `page-${row.page}`)}
        renderItem={(row) => {
          const name = row.kind === "measure" ? t.measures[row.id] : t.pageRow(t.pages[row.page]);
          return (
            <div className={`${ROW_GRID} min-h-11 border-b border-line py-1`}>
              <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
              <span className="text-right font-semibold tabular-nums">
                <span className="sr-only">{`${t.columns.today}: `}</span>
                {value(row.today)}
              </span>
              <span className="text-right tabular-nums text-muted">
                <span className="sr-only">{`${t.columns.yesterday}: `}</span>
                {value(row.yesterday)}
              </span>
            </div>
          );
        }}
      />
    </section>
  );
}

function ChartItem({ series }: { readonly series: Series }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.metrics;
  const shortDay = useShortDay();
  const name = t.measures[series.id];
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1 pb-2">
      <figcaption className="min-w-0 font-semibold [overflow-wrap:anywhere]">{name}</figcaption>
      <LineChart
        points={series.points}
        summary={t.chartSummary(name, f.number(series.total), f.number(series.max))}
        formatValue={(n) => f.number(n)}
        formatDay={shortDay}
        pointTitle={t.pointTitle}
      />
    </figure>
  );
}

function DaysPane({ series }: { readonly series: readonly Series[] }) {
  const t = useMessages().metrics;
  return (
    <section aria-label={t.daysHeading} data-metrics-part="days" className={PANE}>
      <h2 className="shrink-0 text-title">{t.daysHeading}</h2>
      <Pager label={t.daysHeading} items={series} ordered={false} gap={8} uniformHeight itemKey={(s) => s.id} renderItem={(s) => <ChartItem series={s} />} />
    </section>
  );
}

function StepBar({ step }: { readonly step: PathStep }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.metrics;
  const share = f.number(step.share, { style: "percent", maximumFractionDigits: 0 });
  return (
    <div className="flex min-w-0 flex-col gap-1 py-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t.steps[step.step]}</span>
        <span className="text-caption tabular-nums text-muted">{t.pathValue(f.number(step.count), share)}</span>
      </div>
      <div aria-hidden="true" className="h-3 min-w-0 rounded-full bg-water-soft">
        <div className="h-3 rounded-full bg-water" style={{ width: `${Math.min(100, Math.round(step.share * 100))}%` }} />
      </div>
    </div>
  );
}

function PathPane({ steps }: { readonly steps: readonly PathStep[] }) {
  const t = useMessages().metrics;
  const started = (steps[0]?.count ?? 0) > 0;
  return (
    <section aria-label={t.pathHeading} data-metrics-part="path" className={PANE}>
      <h2 className="shrink-0 text-title">{t.pathHeading}</h2>
      <p className="shrink-0 text-muted">{t.pathIntro}</p>
      {started ? (
        <Pager label={t.pathHeading} items={steps} ordered gap={0} uniformHeight itemKey={(s) => s.step} renderItem={(s) => <StepBar step={s} />} />
      ) : (
        <p className="text-lead">{t.pathEmpty}</p>
      )}
    </section>
  );
}

function Ready({ data, part, laptop }: { readonly data: AdminMetricsResponse; readonly part: MetricsPart; readonly laptop: boolean }) {
  const panes: Record<MetricsPart, ReactNode> = {
    today: <TodayPane rows={todayRows(data)} />,
    days: <DaysPane series={seriesOf(data)} />,
    path: <PathPane steps={pathOf(data)} />,
  };
  return laptop ? (
    <div className="grid min-w-0 gap-6 fit:min-h-0 fit:flex-1 fit:grid-rows-[minmax(0,1fr)]" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)" }}>
      {PARTS.map((value) => (
        <div key={value} className="flex min-h-0 min-w-0 flex-col">
          {panes[value]}
        </div>
      ))}
    </div>
  ) : (
    <div {...tabPanelProps("metrics", part)} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {panes[part]}
    </div>
  );
}

/** The page in any state of its data. `part` is the tab shown on a phone. */
export function AdminMetricsView({ load, part, onPart, onRetry }: { readonly load: AdminMetricsLoad; readonly part: MetricsPart; onPart(next: MetricsPart): void; onRetry(): void }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.metrics;
  const laptop = useLaptopLayout();
  if (load.kind === "notFound") {
    return (
      <NotFoundPage />
    );
  }
  const tabs =
    load.kind === "ready" && !laptop ? (
      <BottomTabs idBase="metrics" label={t.parts.label} value={part} onChange={onPart} tabs={PARTS.map((value) => ({ value, label: t.parts[value], icon: PART_ICONS[value] }))} />
    ) : undefined;
  return (
    <AppShell bottom={tabs}>
      <div data-admin-metrics="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 shrink-0 flex-col gap-1">
          <h1 className="min-w-0 text-heading [overflow-wrap:anywhere]">{t.heading}</h1>
          {load.kind === "ready" ? <p className="text-muted [overflow-wrap:anywhere]">{t.intro(f.date(noon(load.data.today)), load.data.timeZone)}</p> : null}
        </div>
        {load.kind === "loading" ? (
          <p role="status" className="animate-pulse-soft text-lead text-muted">
            {t.loading}
          </p>
        ) : load.kind === "failed" ? (
          <StatusBanner
            tone="danger"
            title={t.failed}
            action={
              <Button variant="secondary" onClick={onRetry}>
                {t.retry}
              </Button>
            }
          />
        ) : (
          <Ready data={load.data} part={part} laptop={laptop} />
        )}
      </div>
    </AppShell>
  );
}

export function AdminMetricsPage() {
  const { load, retry } = useAdminMetrics();
  const [part, setPart] = useState<MetricsPart>("today");
  return <AdminMetricsView load={load} part={part} onPart={setPart} onRetry={retry} />;
}
