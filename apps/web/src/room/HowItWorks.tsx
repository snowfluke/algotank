// "How the game works": six steps, one at a time, each with a drawing (a tank, a
// shot, water, a point, the four items, two tanks with the same points). The board
// legend says what each item does (docs/items.md). The last step is the rule for
// tanks with the same points, which no timed result screen has the time to say
// (73-after-first-timer-test.md, row 7). The help button in the status line opens it; it no longer
// opens by itself, because a first-timer's lobby tour (guide/) replaces that. When the
// room has a tour for its phase, the dialog offers "Show me around" to replay it. A
// native <dialog>, so focus stays inside and Escape closes it; ui/Dialog.tsx is for
// confirmations only.

import { CircleHelp, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { ITEM_KINDS } from "@game/engine";
import { ItemShape } from "../board/itemShapes.tsx";
import { TankShape } from "../tank/TankShape.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";

function Drawing({ children }: { readonly children: ReactNode }) {
  return (
    <svg viewBox="0 0 40 20" aria-hidden="true" className="aspect-[2/1] w-full max-w-60 shrink-0 self-center overflow-visible rounded-[var(--radius-card)] bg-arena-floor">
      {children}
    </svg>
  );
}

const DRAWINGS: readonly ReactNode[] = [
  <Drawing key="tank">
    <g transform="translate(20 10) scale(1.2)">
      <TankShape colour={1} self angle={0} />
    </g>
  </Drawing>,
  <Drawing key="shot">
    <g transform="translate(8 10)">
      <TankShape colour={1} angle={0} detail="simple" />
    </g>
    <line x1="14" y1="10" x2="28" y2="10" stroke="var(--color-water)" strokeWidth="2.5" strokeLinecap="round" />
    <g transform="translate(33 10)">
      <TankShape colour={2} angle={180} detail="simple" />
    </g>
  </Drawing>,
  <Drawing key="water">
    <rect x="6" y="7" width="28" height="6" rx="3" fill="var(--color-panel)" stroke="var(--color-line-strong)" />
    <rect x="7" y="8" width="17" height="4" rx="2" fill="var(--color-water)" />
  </Drawing>,
  <Drawing key="points">
    <g transform="translate(10 11)">
      <TankShape colour={1} angle={-90} detail="simple" />
    </g>
    <text x="27" y="15" textAnchor="middle" className="font-display" fontSize="11" fontWeight="700" fill="var(--color-self-ink)">
      +1
    </text>
  </Drawing>,
  <Drawing key="items">
    {ITEM_KINDS.map((kind, i) => (
      <g key={kind} transform={`translate(${5.5 + i * 9.7} 10) scale(0.9)`}>
        <ItemShape kind={kind} />
      </g>
    ))}
  </Drawing>,
  <Drawing key="tie">
    <g transform="translate(9 11)">
      <TankShape colour={1} angle={-90} detail="simple" />
    </g>
    <text x="20" y="14" textAnchor="middle" className="font-display" fontSize="9" fontWeight="700" fill="var(--color-ink)">
      =
    </text>
    <g transform="translate(31 11)">
      <TankShape colour={2} angle={-90} detail="simple" />
    </g>
  </Drawing>,
];

/** The sentences of the steps, in order: what the tank plays by, the three rules, the items, then the rule for the same points. */
export function howItWorksSteps(t: ReturnType<typeof useMessages>["room"]["howTo"]): readonly string[] {
  return [t.playsBy, ...t.lines];
}

export interface HowItWorksProps {
  readonly open: boolean;
  onClose(): void;
  /** Replays the tour of the room's phase ("Show me around"), or null when the phase has none. */
  readonly onShowAround: (() => void) | null;
}

export function HowItWorks({ open, onClose, onShowAround }: HowItWorksProps) {
  const m = useMessages();
  const t = m.room.howTo;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState(0);
  const steps = howItWorksSteps(t);
  const last = step === steps.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setStep(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close(): void {
    onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-how-it-works=""
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] max-h-[calc(100dvh-2rem)] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-scrim/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-title">
            {t.heading}
          </h2>
          <IconButton label={m.common.close} icon={<X aria-hidden size={22} />} variant="quiet" onClick={close} />
        </div>
        {onShowAround === null ? null : (
          <div>
            <Button
              variant="secondary"
              data-show-around=""
              onClick={() => {
                close();
                onShowAround();
              }}
            >
              {m.guide.showAround}
            </Button>
          </div>
        )}
        {/* One step at a time; the key replays the entrance when the step changes. */}
        <div key={step} className="flex min-w-0 animate-rise flex-col gap-3">
          {DRAWINGS[step]}
          <p className="min-h-[4.35em] text-lead [overflow-wrap:anywhere]" aria-live="polite">
            {steps[step]}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="tabular shrink-0 font-display font-semibold whitespace-nowrap text-muted">{m.common.carousel.position(step + 1, steps.length)}</p>
          {/* The buttons move under the position as one group when the row is too narrow for both. */}
          <div className="ml-auto flex flex-wrap justify-end gap-3">
            {step === 0 ? null : (
              <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                {m.common.back}
              </Button>
            )}
            {last ? (
              <Button onClick={close} data-how-it-works-done="">
                {t.close}
              </Button>
            ) : (
              <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} data-how-it-works-next="">
                {m.common.carousel.next}
              </Button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** The help button of the status line. */
export function HowItWorksButton({ onOpen }: { onOpen(): void }) {
  const m = useMessages();
  return <IconButton label={m.room.howTo.open} icon={<CircleHelp aria-hidden size={24} />} variant="quiet" data-how-it-works-open="" onClick={onOpen} />;
}
