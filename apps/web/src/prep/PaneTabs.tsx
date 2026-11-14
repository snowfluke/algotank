// Tabs at the top of a pane whose chosen panel fills the rest of the pane's height
// (the pane contract of the no-scroll layout). ui/Tabs.tsx draws the same tab row,
// but its panel does not take a height, so a Pager or a board inside it cannot fit.
// Only the chosen panel is rendered. The tab row can carry a short line at its end
// (the save line), so the two share one row where the width allows.
//
// ponytail: a copy of ui/Tabs.tsx's tab row with a filling panel; give ui/Tabs a
// `fill` option (S0 owns it) and use that here instead.

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { playSound } from "../sound/player.ts";
import { nextTabIndex } from "../ui/Tabs.tsx";

export interface PaneTab<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface PaneTabsProps<T extends string> {
  /** Names the tab list for a screen reader. */
  readonly label: string;
  readonly tabs: readonly PaneTab<T>[];
  readonly value: NoInfer<T>;
  onChange(next: NoInfer<T>): void;
  /** The chosen tab's content. It gets the height under the tab row. */
  readonly children: ReactNode;
  /** A short line at the end of the tab row, such as the save state. It wraps under the tabs when the row is narrow. */
  readonly end?: ReactNode;
}

export function PaneTabs<T extends string>({ label, tabs, value, onChange, children, end }: PaneTabsProps<T>) {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, tabs.findIndex((tab) => tab.value === value));

  function choose(next: T): void {
    if (next !== value) playSound("tap");
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const next = nextTabIndex(current, event.key, tabs.length);
    const tab = next === null ? undefined : tabs[next];
    if (next === null || tab === undefined) return;
    event.preventDefault();
    choose(tab.value);
    buttons.current[next]?.focus();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b-2 border-line">
        <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex min-w-0 flex-wrap">
          {tabs.map((tab, i) => {
            const selected = i === current;
            return (
              <button
                key={tab.value}
                ref={(element) => {
                  buttons.current[i] = element;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${tab.value}`}
                aria-selected={selected}
                aria-controls={`${base}-panel`}
                tabIndex={selected ? 0 : -1}
                data-tab={tab.value}
                onClick={() => choose(tab.value)}
                className={`-mb-0.5 min-h-12 min-w-11 border-b-4 px-1 font-display font-semibold min-[380px]:px-1.5 min-[400px]:px-2 ${selected ? "border-water text-ink" : "border-transparent text-muted [@media(hover:hover)]:hover:text-ink"}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {end === undefined ? null : <div className="ml-auto min-w-0 pb-1">{end}</div>}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${tabs[current]?.value ?? ""}`}
        data-tab-panel={tabs[current]?.value}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {children}
      </div>
    </div>
  );
}
