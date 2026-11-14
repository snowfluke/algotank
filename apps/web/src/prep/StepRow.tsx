// A rule's steps in order, drawn as a row of green action blocks joined by green
// arrows, each with its icon (76-email-and-sequences.md, S3). The rule card, the step
// editor and the Try it replay draw the same row, so a child links the three. The
// row wraps between blocks; a block never splits. The replay marks the step running now.

import { ArrowRight } from "lucide-react";
import { Fragment } from "react";
import type { StepBlock } from "../vocabulary/sentence.ts";
import { STEP_ICONS } from "./actionIcons.ts";

const BLOCK = "inline-flex max-w-full items-center gap-1 rounded-[0.5rem] border-2 border-ok px-1.5 align-middle font-semibold leading-snug [overflow-wrap:anywhere]";

export interface StepRowProps {
  readonly steps: readonly StepBlock[];
  /** "inline" flows inside a rule card's sentence; "row" is a wrapping row of its own. */
  readonly layout: "inline" | "row";
  /** 0-based position of the step running now, which the row fills in; null marks none. */
  readonly current?: number | null;
  /** Called with the position of a tapped block; without it the blocks are not buttons. */
  readonly onPick?: (index: number) => void;
  /** 0-based position of the block the editor has chosen. */
  readonly chosen?: number | null;
  /** The accessible name of each block when it is a button. */
  readonly blockLabel?: (index: number, name: string) => string;
  /** The data-focus-key of each block button, so focus can return to it. */
  readonly focusKey?: (index: number) => string;
}

export function StepRow({ steps, layout, current = null, onPick, chosen = null, blockLabel, focusKey }: StepRowProps) {
  const row = layout === "inline" ? "inline" : "flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5";
  return (
    <span className={row} data-step-row="">
      {steps.map((step, i) => {
        const Icon = step.kind === null ? null : STEP_ICONS[step.kind];
        const running = i === current;
        const picked = i === chosen;
        // White on ok is 5.5:1; the filled block is told from the others by its fill, not its hue alone.
        const look = running ? "bg-ok text-water-ink" : picked ? "bg-ok-soft outline outline-3 outline-offset-1 outline-ok" : "bg-ok-soft";
        const inner = (
          <>
            {Icon === null ? null : <Icon aria-hidden size={17} strokeWidth={2.5} className={`shrink-0 ${running ? "" : "text-ok"}`} />}
            <span className="min-w-0">{step.name}</span>
          </>
        );
        return (
          // A step's position is its identity in the row: two steps may be the same kind.
          <Fragment key={i}>
            {i === 0 ? null : <ArrowRight aria-hidden size={16} strokeWidth={3} className="mx-0.5 inline-block shrink-0 align-middle text-ok" />}
            {onPick === undefined ? (
              <span className={`${BLOCK} ${layout === "row" ? "min-h-9" : "py-px"} ${look}`} data-step-block={i} {...(running ? { "data-step-running": "" } : {})}>
                {inner}
              </span>
            ) : (
              <button
                type="button"
                aria-pressed={picked}
                aria-label={blockLabel?.(i, step.name) ?? step.name}
                data-step-block={i}
                {...(focusKey === undefined ? {} : { "data-focus-key": focusKey(i) })}
                onClick={() => onPick(i)}
                className={`press ${BLOCK} min-h-11 min-w-11 justify-center ${look}`}
              >
                {inner}
              </button>
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
