// "How the monthly arena works": the information button (an "i", so it differs from the board
// legend's "?" beside it) at the top of the monthly page and the list it opens. Players thought they had to keep the page open while their tank played,
// so the list says that the tank plays without it, next to the league's other rules.
// A native <dialog>, like room/HowItWorks.tsx, so focus stays inside and Escape closes it;
// ui/Dialog.tsx is for confirmations only.

import { Info, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FIRST_PUBLISHED_RULES_MONTH, MONTHLY_RANKED_DAYS } from "@game/arena";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "../ui/IconButton.tsx";

/**
 * The facts in reading order: how a round runs, that the tank plays alone, how the month counts,
 * then what everyone may read (owner, 2026-11-17). `firstOpenMonth` is FIRST_PUBLISHED_RULES_MONTH as a name.
 */
export function monthlyFacts(m: ReturnType<typeof useMessages>, firstOpenMonth: string): readonly string[] {
  const t = m.monthly.about;
  return [t.round, t.reshuffle, t.items, t.playsAlone, m.publicplay.league.rule, t.rankedDays(MONTHLY_RANKED_DAYS), t.leagues, t.gm, t.rulesOpen(firstOpenMonth)];
}

export function MonthlyAbout() {
  const m = useMessages();
  const f = useFormat();
  const t = m.monthly.about;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <IconButton label={t.open} icon={<Info aria-hidden size={24} />} variant="quiet" data-monthly-about-open="" onClick={() => setOpen(true)} />
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        data-monthly-about=""
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="m-auto w-[min(32rem,calc(100%-2rem))] max-h-[calc(100dvh-2rem)] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-ink/50"
      >
        {/* The list scrolls inside the dialog: with the rules facts (2026-11-17) it is taller than a 360 x 640 phone. */}
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 p-4">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <h2 id={titleId} className="min-w-0 flex-1 text-title">
              {t.heading}
            </h2>
            <IconButton label={m.common.close} icon={<X aria-hidden size={22} />} variant="quiet" onClick={() => setOpen(false)} />
          </div>
          <ul className="flex min-h-0 min-w-0 list-disc flex-col gap-2 overflow-auto overscroll-contain pl-5 [overflow-wrap:anywhere] marker:text-water">
            {monthlyFacts(m, f.month(FIRST_PUBLISHED_RULES_MONTH)).map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
