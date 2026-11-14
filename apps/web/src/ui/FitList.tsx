import type { ReactNode } from "react";
import { COLUMN_GAP_EM, fitWindow, planFit, ROW_HEIGHT_EM, type FitSize } from "./fitList.ts";
import { useBoxSize } from "./useBoxSize.ts";
import { useFitLayout, useLaptopLayout } from "./layout.ts";

/** How a list fits the big screen. */
export interface FitOptions {
  readonly size: FitSize;
  /** Index of the row to keep in view when not every row fits (the cut line), or null for the top rows only. */
  readonly focus: number | null;
  /** The line that counts the rows that do not show, for example "12 more tanks play". */
  readonly more: (hidden: number) => string;
}

interface FitListProps {
  readonly label: string;
  /** Set on a projector screen. Without it, or on a narrow window, the list is a plain list. */
  readonly fit?: FitOptions | undefined;
  /** One keyed `li` per row, sized in `em` and ROW_HEIGHT_EM tall. */
  readonly children: readonly ReactNode[];
}

/**
 * An ordered list. With `fit` it fills its parent's height without scrolling, and the
 * parent must have a height of its own (a grid row or a flex item with min-h-0). A
 * narrow window scrolls the page and the parent has no height, so the list is a
 * plain one there.
 */
export function FitList({ label, fit, children }: FitListProps) {
  // The same queries as the big screen's fixed-height layout (screen/ScreenPage.tsx), so the list fits exactly where the page stops scrolling.
  const laptop = useLaptopLayout();
  const fixedHeight = useFitLayout();
  const wide = laptop && fixedHeight;
  if (fit === undefined || !wide) {
    return (
      <ol aria-label={label} className="m-0 list-none p-0">
        {children}
      </ol>
    );
  }
  return <FittedList label={label} fit={fit} rows={children} />;
}

function FittedList({ label, fit, rows }: { label: string; fit: FitOptions; rows: readonly ReactNode[] }) {
  const { ref, box } = useBoxSize<HTMLDivElement>();
  // Before the first measurement (and in a server render) every row is listed once, unstyled.
  const plan = box === null ? null : planFit(rows.length, box, fit.size);
  const visible = plan === null ? { kind: "all" as const } : fitWindow(rows.length, plan.capacity, fit.focus);
  let shown: ReactNode[];
  if (visible.kind === "all") {
    shown = [...rows];
  } else {
    shown = visible.shown.map((i) => rows[i]);
    const text = fit.more(visible.hidden);
    shown.splice(
      visible.moreAt,
      0,
      <li key="more" data-more-line="true" className="flex min-h-[2em] min-w-0 items-center font-semibold text-muted">
        <span className="min-w-0 truncate" title={text}>
          {text}
        </span>
      </li>,
    );
  }
  return (
    <div ref={ref} className="h-full min-h-0 overflow-hidden">
      <ol
        aria-label={label}
        className="m-0 grid list-none p-0"
        style={
          plan === null
            ? undefined
            : {
                gridAutoFlow: "column",
                gridTemplateColumns: `repeat(${plan.columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${plan.rows}, ${ROW_HEIGHT_EM}em)`,
                columnGap: `${COLUMN_GAP_EM}em`,
                fontSize: `${plan.fontPx}px`,
              }
        }
      >
        {shown}
      </ol>
    </div>
  );
}
