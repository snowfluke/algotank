// The tab bar at the bottom of a phone screen that has several panes (the room:
// Tank, Players, Invite). Each tab is an icon over a short label, at least 44px
// tall, and follows the WAI-ARIA tabs pattern (arrow keys, Home, End).
//
// The bar and the pane live in different places of AppShell: the bar goes in the
// `bottom` slot (after the screen's primary action, if it has one), the chosen pane in
// the main area inside `<div {...tabPanelProps(idBase, value)}>`. The screen owns the
// chosen value, so both read the same state, and `idBase` links them for assistive tech.
//
// On a laptop a screen may show the same panes side by side instead: test
// useLaptopLayout() from ui/layout.ts and render its own columns. BottomTabs itself
// works at any width, for a laptop screen that keeps one pane behind a tab.

import type { KeyboardEvent, ReactNode } from "react";
import { useRef } from "react";
import { playSound } from "../sound/player.ts";
import { nextTabIndex } from "./Tabs.tsx";

export interface BottomTab<T extends string> {
  readonly value: T;
  /** One or two short words: "Tank", "Players". */
  readonly label: string;
  /** A lucide-react icon with aria-hidden, size 22. */
  readonly icon: ReactNode;
  /** Puts a dot on the icon (the chat's unread mark); the text is read after the label, for example "new messages". */
  readonly dot?: string;
}

export interface BottomTabsProps<T extends string> {
  /** The same string the screen passes to tabPanelProps, unique on the page, for example "room". */
  readonly idBase: string;
  /** Names the tab list, for example "Arena parts". */
  readonly label: string;
  readonly tabs: readonly BottomTab<T>[];
  readonly value: NoInfer<T>;
  readonly onChange: (next: NoInfer<T>) => void;
  /**
   * True when the tabs share a row with other buttons (the monthly page's two actions): no padding
   * or width cap of its own, and a label may take two lines, broken between words only.
   */
  readonly inline?: boolean;
}

const tabId = (idBase: string, value: string) => `${idBase}-tab-${value}`;

/** The orange of "you" with a white rim, so it shows on the icon and on the selected tab's soft background; its meaning is in the text beside it. */
export function UnreadDot() {
  return <span aria-hidden="true" data-unread-dot="" className="block size-3 shrink-0 rounded-full border-2 border-panel bg-self" />;
}
const panelId = (idBase: string, value: string) => `${idBase}-panel-${value}`;

/** Attributes for the element that holds the chosen pane. Give it a height (flex-1 min-h-0) too. */
export function tabPanelProps(idBase: string, value: string) {
  return {
    role: "tabpanel",
    id: panelId(idBase, value),
    "aria-labelledby": tabId(idBase, value),
    "data-tab-panel": value,
  } as const;
}

export function BottomTabs<T extends string>({ idBase, label, tabs, value, onChange, inline = false }: BottomTabsProps<T>) {
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
    <div
      role="tablist"
      aria-label={label}
      data-bottom-tabs={idBase}
      onKeyDown={onKeyDown}
      className={inline ? "grid w-full grid-flow-col auto-cols-[minmax(min-content,1fr)] gap-1" : "mx-auto grid w-full max-w-xl grid-flow-col auto-cols-fr gap-1 px-2 py-1"}
    >
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
            id={tabId(idBase, tab.value)}
            aria-selected={selected}
            aria-controls={panelId(idBase, tab.value)}
            tabIndex={selected ? 0 : -1}
            data-tab={tab.value}
            onClick={() => choose(tab.value)}
            className={`press flex min-h-13 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] ${inline ? "px-0.5" : "px-1"} font-display text-caption font-semibold leading-tight ${
              selected ? "bg-water-soft text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <span className={`relative flex items-center ${selected ? "text-water" : ""}`}>
              {tab.icon}
              {tab.dot === undefined ? null : (
                <span className="absolute -top-0.5 -right-1.5">
                  <UnreadDot />
                </span>
              )}
            </span>
            <span className={inline ? "max-w-full min-w-0 text-center [word-break:keep-all]" : "max-w-full min-w-0 truncate"}>{tab.label}</span>
            {tab.dot === undefined ? null : <span className="sr-only">{`, ${tab.dot}`}</span>}
            {/* The selected tab also has a bar under its label, so the choice does not depend on colour alone. */}
            <span aria-hidden="true" className={`mt-0.5 block h-1 w-6 rounded-full ${selected ? "bg-water" : "bg-transparent"}`} />
          </button>
        );
      })}
    </div>
  );
}
