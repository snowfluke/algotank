// Tabs with panels, following the WAI-ARIA tabs pattern: arrow keys, Home and
// End move between tabs, and only the chosen tab is in the Tab order. Use it to
// switch between views of one thing (simple and advanced editor), not for steps.

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly panel: ReactNode;
}

export interface TabsProps<T extends string> {
  /** Names the tab list for a screen reader. */
  readonly label: string;
  readonly tabs: readonly TabItem<T>[];
  // NoInfer: the type comes from the options, so a useState setter of a narrower union fits.
  readonly value: NoInfer<T>;
  onChange(next: NoInfer<T>): void;
}

/** The tab a key moves to, or null for a key that does not move. Wraps at both ends. */
export function nextTabIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function Tabs<T extends string>({ label, tabs, value, onChange }: TabsProps<T>) {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, tabs.findIndex((tab) => tab.value === value));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const next = nextTabIndex(current, event.key, tabs.length);
    const tab = next === null ? undefined : tabs[next];
    if (next === null || tab === undefined) return;
    event.preventDefault();
    onChange(tab.value);
    buttons.current[next]?.focus();
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1 border-b-2 border-line">
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
              id={`${base}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${i}`}
              tabIndex={selected ? 0 : -1}
              data-tab={tab.value}
              onClick={() => onChange(tab.value)}
              className={`-mb-0.5 min-h-12 min-w-11 border-b-4 px-4 font-display font-semibold ${selected ? "border-water text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, i) => (
        <div key={tab.value} data-tab-panel={tab.value} role="tabpanel" id={`${base}-panel-${i}`} aria-labelledby={`${base}-tab-${i}`} hidden={i !== current} tabIndex={0}>
          {i === current ? tab.panel : null}
        </div>
      ))}
    </div>
  );
}
