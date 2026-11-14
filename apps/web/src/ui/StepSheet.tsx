// A full-pane step for editing one thing: a rule, or the options of a form. It
// replaces the pane's content (the screen renders the sheet instead of the pane),
// so the phone never shows two layers, and Back returns to the pane. It has a Back
// button, a title, the body, and an optional action row at the bottom. A step may put one
// control in the header row (`headerControl`, such as a Summary / Statistics switch): the
// title then shows only where the row has room for both (a container of 28rem or more)
// and stays in the markup for screen readers elsewhere (82-fit-fixes.md).
//
// The body gets the height that is left and must fit it (the pane contract). When one
// step holds too much, split it: a sheet can open a second sheet (the screen keeps
// which one is open), or the body can use Pager or Carousel.
//
// Focus: the title takes focus when the sheet opens, so a screen reader starts there,
// and Escape goes back. Returning focus to the control that opened the sheet is the
// screen's job, because that control is rendered again after the sheet closes.

import { ArrowLeft } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "./IconButton.tsx";

export interface StepSheetProps {
  /** Names the step, for example "Round speed" or "Rule 2". */
  readonly title: string;
  readonly onBack: () => void;
  /** The accessible name of the Back button. Defaults to "Back". */
  readonly backLabel?: string;
  readonly children: ReactNode;
  /** The step's own action, for example "Done" or "Remove rule". Shown at the bottom of the sheet. */
  readonly action?: ReactNode;
  /** One control in the header row after the title, for example a switch between two views of the step. */
  readonly headerControl?: ReactNode;
}

export function StepSheet({ title, onBack, backLabel, children, action, headerControl }: StepSheetProps) {
  const m = useMessages();
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onBack();
  }

  return (
    // A header control (52 px) makes the header row 8 px taller than the Back button alone, so the sheet takes the 8 px back from its two gaps.
    <section aria-labelledby={titleId} data-step-sheet="" onKeyDown={onKeyDown} className={`flex min-h-0 min-w-0 flex-1 flex-col ${headerControl === undefined ? "gap-3" : "gap-2"}`}>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <IconButton label={backLabel ?? m.common.back} icon={<ArrowLeft aria-hidden size={22} />} variant="quiet" data-step-sheet-back="" onClick={onBack} />
        {/* sr-only, not hidden: the title keeps its focus on open and its name for the section when the row has no room for it. */}
        <h2
          ref={heading}
          id={titleId}
          tabIndex={-1}
          className={`min-w-0 flex-1 text-title [overflow-wrap:anywhere] focus-visible:outline-none ${headerControl === undefined ? "" : "sr-only @md:not-sr-only"}`}
        >
          {title}
        </h2>
        {headerControl === undefined ? null : <div className="min-w-0 shrink-0">{headerControl}</div>}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{children}</div>
      {action === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </section>
  );
}
