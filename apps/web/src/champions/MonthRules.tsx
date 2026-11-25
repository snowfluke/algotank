// "Every tank's rules" of a closed month (owner, 2026-11-17, "for fair play"; the visibility table
// is at the top of packages/arena/src/monthly-protocol.ts): a button on the month's card on the
// champions page, and the list it opens, League 1 first and each league by place, as the tanks
// stood at the month's close. A row opens the tank's sheet with the rules it had then
// (monthly/TankSheet.tsx). Months before FIRST_PUBLISHED_RULES_MONTH have no copy, so no button.
// Limit: a month opens only from its card, and a month without a champion has no card.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MonthTank } from "@game/arena";
import { X } from "lucide-react";
import { describeError } from "../api/errorSentences.ts";
import { getMonthTanks, type ApiFailure } from "../api/client.ts";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { TankSheet, type SheetSource, type SheetTank } from "../monthly/TankSheet.tsx";
import { PagedRanking, type RankingItem } from "../standings/StandingsTable.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";

type TanksLoad = { readonly kind: "loading" } | { readonly kind: "failed"; readonly failure: ApiFailure } | { readonly kind: "ready"; readonly tanks: readonly MonthTank[] };

/** One row per tank; a league after the first starts with a line that names it. */
export function monthTankItems(tanks: readonly MonthTank[], leagueLabel: (league: number) => string, gm: { readonly text: string; readonly title: string }): RankingItem[] {
  const items: RankingItem[] = [];
  tanks.forEach((tank, i) => {
    if (i > 0 && tanks[i - 1]?.league !== tank.league) items.push({ kind: "cut", label: leagueLabel(tank.league) });
    items.push({ kind: "row", row: { tank: { playerId: tank.seatId, name: tank.name, look: tank.look, isBot: false }, place: tank.rank, score: null, verdict: null, ...(tank.gm ? { badge: gm } : {}) } });
  });
  return items;
}

export function MonthRules({ month }: { readonly month: string }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.champions.monthRules;
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<TanksLoad>({ kind: "loading" });
  const [sheet, setSheet] = useState<SheetTank | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const source = useMemo<SheetSource>(() => ({ kind: "month", month }), [month]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoad({ kind: "loading" });
    void getMonthTanks(month).then((result) => {
      if (current) setLoad(result.ok ? { kind: "ready", tanks: result.data.tanks } : { kind: "failed", failure: result });
    });
    return () => {
      current = false;
    };
  }, [open, month]);

  const tanks = load.kind === "ready" ? load.tanks : [];
  const byId = useMemo(() => new Map(tanks.map((tank) => [tank.seatId, tank])), [tanks]);
  const items = useMemo(() => monthTankItems(tanks, m.monthly.league, m.monthly.gm), [tanks, m]);
  const heading = t.heading(f.month(month));

  return (
    <>
      <Button variant="secondary" data-month-rules-open={month} onClick={() => setOpen(true)}>
        {t.open}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        data-month-rules={month}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="m-auto h-[min(40rem,calc(100dvh-2rem))] w-[min(32rem,calc(100%-2rem))] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-scrim/50"
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <h2 id={titleId} className="min-w-0 flex-1 text-title [overflow-wrap:anywhere]">
              {heading}
            </h2>
            <IconButton label={m.common.close} icon={<X aria-hidden size={22} />} variant="quiet" onClick={() => setOpen(false)} />
          </div>
          <p className="shrink-0 text-muted [overflow-wrap:anywhere]">{t.note(f.month(month))}</p>
          {load.kind === "loading" ? (
            <p role="status" className="animate-pulse-soft text-muted">
              {t.loading}
            </p>
          ) : load.kind === "failed" ? (
            <p role="alert">{describeError(load.failure, "loadTank", m.errors).sentence}</p>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <PagedRanking
                label={heading}
                items={items}
                highlightId={null}
                jumpLabel={null}
                open={{ label: m.monthly.sheet.open, cue: () => null, can: (id) => byId.has(id), onOpen: (id) => setSheet(byId.get(id) ?? null) }}
              />
            </div>
          )}
        </div>
        {/* Inside this dialog, so it opens over the list in the browser's top layer. */}
        <TankSheet tank={sheet} source={source} onClose={() => setSheet(null)} />
      </dialog>
    </>
  );
}
