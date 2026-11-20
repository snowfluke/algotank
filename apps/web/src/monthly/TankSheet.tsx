// A tank's sheet: what anyone may read about one monthly tank (owner, 2026-11-17, "for fair play";
// the visibility table is at the top of packages/arena/src/monthly-protocol.ts). Opened from a
// ranking row of the monthly page, or from a published month's list on the champions page.
// - "live": GET /api/monthly/tanks/:seatId gives the last finished day's numbers, and the rules only
//   of a game master's tank; any other tank's sheet says when its rules open.
// - "month": GET /api/monthly/months/:month/tanks/:seatId gives the rules it had at that close.
// The server decides what is open, so the page never holds rules it may not show.
// A native <dialog>, like MonthlyAbout.tsx: focus stays inside and Escape closes it. Long rules
// scroll inside the dialog, never the page.

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FIRST_PUBLISHED_RULES_MONTH, type DayNumbers, type TankLook } from "@game/arena";
import { PICKER_ORDER, playStyleOf, type PresetId, type StrategyInput, type UltimateId } from "@game/engine";
import { paths } from "../app/route.ts";
import { UltimateLink } from "../catalogue/UltimateLink.tsx";
import { describeError } from "../api/errorSentences.ts";
import { getMonthTankRules, getTankSheet, type ApiFailure } from "../api/client.ts";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { NameBadge } from "../standings/StandingsTable.tsx";
import { tankLetters } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { RulesText } from "./RulesText.tsx";

export interface SheetTank {
  readonly seatId: string;
  readonly name: string;
  readonly look: TankLook;
  readonly gm: boolean;
}

/** Where the sheet reads from: today's league, or a published month's copy. */
export type SheetSource = { readonly kind: "live" } | { readonly kind: "month"; readonly month: string };

type SheetLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly failure: ApiFailure }
  | {
      readonly kind: "ready";
      readonly rules: StrategyInput | null;
      readonly lastDay: { readonly day: string; readonly numbers: DayNumbers } | null;
      readonly style: TankStyle;
    };

/** What the chips under the name show: the preset its rules are, or null for its own rules, and its ultimate. */
interface TankStyle {
  readonly playStyle: PresetId | null;
  readonly ultimate: UltimateId;
}

async function loadSheet(tank: SheetTank, source: SheetSource): Promise<SheetLoad> {
  if (source.kind === "month") {
    const result = await getMonthTankRules(source.month, tank.seatId);
    if (!result.ok) return { kind: "failed", failure: result };
    const { rules } = result.data;
    return { kind: "ready", rules, lastDay: null, style: { playStyle: playStyleOf(rules), ultimate: rules.ultimate } };
  }
  const result = await getTankSheet(tank.seatId);
  if (!result.ok) return { kind: "failed", failure: result };
  const { rules, lastDay, playStyle, ultimate } = result.data;
  return { kind: "ready", rules, lastDay, style: { playStyle, ultimate } };
}

/** Open while `tank` is not null; `onClose` runs on the close button, Escape and the backdrop. */
export function TankSheet({ tank, source, onClose }: { readonly tank: SheetTank | null; readonly source: SheetSource; onClose(): void }) {
  const m = useMessages();
  const t = m.monthly.sheet;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [load, setLoad] = useState<SheetLoad>({ kind: "loading" });
  const sourceKey = source.kind === "month" ? source.month : "live";

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (tank !== null && !dialog.open) dialog.showModal();
    if (tank === null && dialog.open) dialog.close();
  }, [tank]);

  useEffect(() => {
    if (tank === null) return;
    let current = true;
    setLoad({ kind: "loading" });
    void loadSheet(tank, source).then((next) => {
      if (current) setLoad(next);
    });
    return () => {
      current = false;
    };
    // The source is read by its key, so a new object for the same source does not load again.
  }, [tank, sourceKey]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-tank-sheet=""
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] max-h-[calc(100dvh-2rem)] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-ink/50"
    >
      {tank === null ? null : (
        <div className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col gap-3 p-4">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <TankBadge look={tank.look} label={tankLetters(tank.name)} size={40} name={null} detail="full" angle={-90} className="h-10 w-10 shrink-0" />
            <h2 id={titleId} className="flex min-w-0 flex-1 items-baseline gap-2 text-title">
              {tank.gm ? <NameBadge text={m.monthly.gm.text} title={m.monthly.gm.title} /> : null}
              <span className="min-w-0 [overflow-wrap:anywhere]">{tank.name}</span>
            </h2>
            <IconButton label={m.common.close} icon={<X aria-hidden size={22} />} variant="quiet" onClick={onClose} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto overscroll-contain">
            <SheetBody tank={tank} source={source} load={load} />
          </div>
        </div>
      )}
    </dialog>
  );
}

function SheetBody({ tank, source, load }: { readonly tank: SheetTank; readonly source: SheetSource; readonly load: SheetLoad }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.monthly.sheet;
  if (load.kind === "loading") {
    return (
      <p role="status" className="animate-pulse-soft text-muted">
        {t.loading}
      </p>
    );
  }
  if (load.kind === "failed") return <p role="alert">{describeError(load.failure, "loadTank", m.errors).sentence}</p>;
  // The style chips and the day's numbers first: they are short, and the rules can run to 120 sentences (LIMITS).
  return (
    <>
      <StyleChips style={load.style} />
      {source.kind === "live" ? <LastDay lastDay={load.lastDay} /> : null}
      <section className="flex min-w-0 flex-col gap-2">
        <h3 className="text-lead font-semibold">{t.rules}</h3>
        {source.kind === "month" ? <p className="text-muted [overflow-wrap:anywhere]">{t.monthRules(f.month(source.month))}</p> : null}
        {source.kind === "live" && tank.gm ? <p className="text-muted [overflow-wrap:anywhere]">{t.gm}</p> : null}
        {load.rules === null ? <p className="[overflow-wrap:anywhere]">{t.rulesLater(f.month(FIRST_PUBLISHED_RULES_MONTH))}</p> : <RulesText strategy={load.rules} />}
      </section>
    </>
  );
}

/**
 * The play style and the ultimate, as the chips the workshop shows (owner, 2026-11-20). A play style the catalogue
 * has opens its card in a new tab, like the ultimate's chip; the Charger has no card, so its chip is plain text.
 */
function StyleChips({ style }: { readonly style: TankStyle }) {
  const m = useMessages();
  const { playStyle, ultimate } = style;
  const chip = "inline-flex min-h-7 max-w-full min-w-0 items-center rounded-full bg-ground px-2.5 py-px text-caption font-semibold text-ink [overflow-wrap:anywhere]";
  const name = playStyle === null ? m.monthly.sheet.ownRules : m.vocabulary.playStyles[playStyle].name;
  const inCatalogue = playStyle !== null && PICKER_ORDER.some((id) => id === playStyle);
  return (
    <div role="group" aria-label={m.monthly.sheet.styleLabel} data-tank-style={playStyle ?? "own"} className="flex min-w-0 flex-wrap items-center gap-1.5">
      {inCatalogue ? (
        <a href={`${paths.catalogue("playStyles")}&card=${playStyle}`} target="_blank" rel="noopener noreferrer" className={`press ${chip}`}>
          {name}
        </a>
      ) : (
        <span className={chip}>{name}</span>
      )}
      <UltimateLink ultimate={ultimate} />
    </div>
  );
}

function LastDay({ lastDay }: { readonly lastDay: { readonly day: string; readonly numbers: DayNumbers } | null }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.monthly.sheet;
  if (lastDay === null) return <p className="text-muted [overflow-wrap:anywhere]">{t.noLastDay}</p>;
  const { numbers } = lastDay;
  const rows: readonly (readonly [string, number])[] = [
    [t.turns, numbers.turns],
    [m.stats.shots, numbers.shots],
    [m.stats.hits, numbers.hits],
    [m.stats.timesHit, numbers.timesHit],
    [t.moved, numbers.squaresMoved],
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-lead font-semibold [overflow-wrap:anywhere]">{t.lastDay(f.date(`${lastDay.day}T12:00:00Z`))}</h3>
      <dl className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="min-w-0 [overflow-wrap:anywhere]">{label}</dt>
            <dd className="m-0 tabular text-right font-display font-semibold">{f.number(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
