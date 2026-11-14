// The account's statistics on the "My tank" page (docs/specs/revamp/81-metrics.md, K2, "Account
// totals"): games, wins, rounds, shots and hits in total, then the rounds of each month as plain
// bars with their number, paged. Read from GET /api/account/stats when the pane opens. It fills
// the box it is given and never scrolls.

import { useEffect, useId, useState } from "react";
import type { AccountStats } from "@game/arena";
import { getAccountStats } from "../api/client.ts";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { barShare } from "./statsCard.ts";

type Load = { readonly kind: "loading" } | { readonly kind: "failed" } | { readonly kind: "ready"; readonly stats: AccountStats | null };

export function AccountStatsPane() {
  const t = useMessages().stats.account;
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void getAccountStats().then((result) => {
      if (live) setLoad(result.ok ? { kind: "ready", stats: result.data.stats } : { kind: "failed" });
    });
    return () => {
      live = false;
    };
  }, []);
  if (load.kind === "loading") return <p role="status" className="animate-pulse-soft text-muted">{t.loading}</p>;
  if (load.kind === "failed") return <StatusBanner tone="warning" title={t.failed} />;
  if (load.stats === null) return <p data-account-stats="empty">{t.empty}</p>;
  return <AccountStatsCard stats={load.stats} />;
}

function AccountStatsCard({ stats }: { readonly stats: AccountStats }) {
  const t = useMessages().stats.account;
  const f = useFormat();
  const headingId = useId();
  const { total } = stats;
  const most = Math.max(1, ...stats.months.map((month) => month.rounds));
  // Newest month first, so the first page is the latest.
  const months = [...stats.months].reverse();
  const numbers = [
    { key: "games", label: t.games, value: total.games },
    { key: "wins", label: t.wins, value: total.wins },
    { key: "rounds", label: t.rounds, value: total.rounds },
    { key: "shots", label: t.shots, value: total.shots },
    { key: "hits", label: t.hits, value: total.hits },
  ];
  return (
    <section data-account-stats="" aria-labelledby={headingId} className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
      <h2 id={headingId} className="shrink-0 text-title">
        {t.heading}
      </h2>
      <dl className="m-0 grid shrink-0 grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3">
        {numbers.map((n) => (
          <div key={n.key} className="flex min-w-0 flex-col">
            <dt className="min-w-0 text-muted [overflow-wrap:anywhere]">{n.label}</dt>
            <dd data-numeric="" className="m-0 font-display text-heading font-semibold leading-tight">
              {f.number(n.value)}
            </dd>
          </div>
        ))}
      </dl>
      <h3 className="shrink-0 text-lead">{t.monthsHeading}</h3>
      <div className="flex min-h-0 flex-1 flex-col">
        <Pager
          label={t.monthsHeading}
          items={months}
          itemKey={(month) => month.month}
          gap={8}
          renderItem={(month) => (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="min-w-0 [overflow-wrap:anywhere]">{f.month(month.month)}</span>
              <span data-numeric="" className="shrink-0">
                {f.number(month.rounds)}
              </span>
              {/* A plain bar: the month's rounds against the busiest month, with the number beside it. */}
              <span aria-hidden className="col-span-2 block h-3 min-w-0 rounded-full bg-water-soft">
                <span className="block h-full rounded-full bg-water" style={{ width: `${barShare(month.rounds, most) * 100}%` }} />
              </span>
            </div>
          )}
        />
      </div>
    </section>
  );
}
