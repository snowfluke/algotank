// The legend for what a first-time viewer cannot guess on the board: the water
// gauge, a hit, a miss, a dry shot, "you" and the crown. Each entry is drawn with
// the board's own shapes. It opens as a dialog from a help button next to the
// board, so it never takes room from the board in a pane that does not scroll.
// The dialog pages its entries when they do not fit its height (a small phone in Indonesian).

import { CircleHelp, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ruleSet, STANDARD_RULE_SET_ID } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { TankShape } from "../tank/TankShape.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Pager } from "../ui/Pager.tsx";
import type { Jet } from "./boardHelpers.ts";
import { Crown, DryDrops, JetShape, Puff, Splash } from "./boardShapes.tsx";
import { WaterGauge } from "./WaterGauge.tsx";

const STANDARD = ruleSet(STANDARD_RULE_SET_ID);

function Picture({ children, width = 34 }: { children: ReactNode; width?: number }) {
  return (
    <svg viewBox={`-5 -6 ${width} 12`} className="block h-9 w-full overflow-visible" aria-hidden="true">
      {children}
    </svg>
  );
}

const HIT_JET: Jet = { from: { x: 4, y: 0 }, control: { x: 12, y: -0.6 }, to: { x: 20, y: 0 } };
const MISS_JET: Jet = { from: { x: 4, y: 0 }, control: { x: 13, y: -5 }, to: { x: 26, y: 1 } };

function Tank({ x = 0, angle = 0, self = false, colour = 1 as const }: { x?: number; angle?: number; self?: boolean; colour?: 1 | 2 }) {
  return (
    <g transform={`translate(${x} 0) scale(0.8)`}>
      <TankShape colour={colour} angle={angle} self={self} detail="simple" />
    </g>
  );
}

interface LegendEntry {
  readonly key: string;
  readonly term: string;
  readonly body: string;
  readonly picture: ReactNode;
}

function useLegendEntries(): readonly LegendEntry[] {
  const m = useMessages();
  const l = m.board.legend;
  return [
    {
      key: "gauge",
      term: l.gauge.term,
      body: l.gauge.body,
      picture: (
        <Picture width={22}>
          <g transform="translate(6 -4)">
            <WaterGauge water={6} rules={STANDARD} small={false} />
          </g>
        </Picture>
      ),
    },
    {
      key: "hit",
      term: l.hit.term,
      body: l.hit.body,
      picture: (
        <Picture>
          <JetShape jet={HIT_JET} />
          <Tank />
          <Tank x={23} angle={180} colour={2} />
          <g transform="translate(23 0)">
            <Splash />
          </g>
        </Picture>
      ),
    },
    {
      key: "miss",
      term: l.miss.term,
      body: l.miss.body,
      picture: (
        <Picture>
          <JetShape jet={MISS_JET} />
          <Tank />
          <Tank x={16} angle={180} colour={2} />
          <g transform="translate(26 1)">
            <Puff />
          </g>
        </Picture>
      ),
    },
    {
      key: "dry",
      term: l.dry.term,
      body: l.dry.body,
      picture: (
        <Picture width={18}>
          <Tank />
          <DryDrops drops={[{ x: 5, y: 0 }, { x: 6.3, y: 0 }, { x: 7.4, y: 0 }]} />
        </Picture>
      ),
    },
    {
      key: "you",
      term: l.you.term,
      body: l.you.body,
      picture: (
        <Picture width={12}>
          <Tank self />
        </Picture>
      ),
    },
    {
      key: "leader",
      term: l.leader.term,
      body: l.leader.body,
      picture: (
        <Picture width={12}>
          <Tank colour={2} />
          <g transform="translate(0 -4.4)">
            <Crown />
          </g>
        </Picture>
      ),
    },
  ];

}

/** The help button beside the board and the legend dialog it opens. `onShowAround` replays the screen's tour from the dialog. */
export function LegendButton({ onShowAround }: { readonly onShowAround?: () => void }) {
  const m = useMessages();
  const l = m.board.legend;
  const [open, setOpen] = useState(false);
  // A wrapper ref, because IconButton does not pass a ref to its button.
  const wrapper = useRef<HTMLSpanElement>(null);
  return (
    <span ref={wrapper} className="contents">
      <IconButton
        label={l.summary}
        text={l.button}
        icon={<CircleHelp aria-hidden size={22} />}
        aria-haspopup="dialog"
        data-legend-open=""
        onClick={() => setOpen(true)}
      />
      {open ? (
        <LegendDialog
          onClose={() => {
            setOpen(false);
            // The dialog is gone after this render, so focus goes back to the button that opened it.
            requestAnimationFrame(() => wrapper.current?.querySelector("button")?.focus());
          }}
          {...(onShowAround === undefined
            ? {}
            : {
                onShowAround: () => {
                  // The dialog closes first, so the tour's first step points at the screen and not at a modal layer.
                  setOpen(false);
                  onShowAround();
                },
              })}
        />
      ) : null}
    </span>
  );
}

/** Exported for its test; screens use LegendButton. */
export function LegendDialog({ onClose, onShowAround }: { onClose: () => void; readonly onShowAround?: () => void }) {
  const m = useMessages();
  const l = m.board.legend;
  const entries = useLegendEntries();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-legend-dialog=""
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // In the fixed-height layout the dialog has a fixed height, so its Pager knows how many entries fit.
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-ink/50 fit:h-[min(36rem,calc(100dvh-2rem))] fit:overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-4 laptop:p-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-title [overflow-wrap:anywhere]">
            {l.summary}
          </h2>
          <IconButton label={m.common.close} icon={<X aria-hidden size={22} />} variant="quiet" autoFocus onClick={onClose} />
        </div>
        {onShowAround === undefined ? null : (
          <div className="shrink-0">
            <Button variant="secondary" data-show-around="" onClick={onShowAround}>
              {m.guide.showAround}
            </Button>
          </div>
        )}
        <Pager
          label={l.summary}
          items={entries}
          itemKey={(entry) => entry.key}
          ordered={false}
          gap={12}
          renderItem={(entry) => (
            <div className="flex min-w-0 items-start gap-3">
              <div className="w-20 shrink-0 pt-1">{entry.picture}</div>
              <div className="flex min-w-0 flex-col">
                <span className="font-semibold" data-legend-term="">{entry.term}</span>
                <span className="text-caption text-muted">{entry.body}</span>
              </div>
            </div>
          )}
        />
      </div>
    </dialog>
  );
}
