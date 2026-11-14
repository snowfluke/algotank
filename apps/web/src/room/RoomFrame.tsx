// The frame of the arena room and the presenter page under the no-scroll rule: the
// header with the arena name, short notices, the status line, the pane area, and the
// bottom bar with the screen's primary action and the tabs. room/roomFrame.ts decides
// which panes a view has; this file draws them: one tab at a time on a phone, columns
// on a laptop (ui/layout.ts). A step sheet (settings, tank colour) replaces the pane
// area, never covers it.
//
// Each pane gets a box of fixed height in the fit layout and must fit it (the pane
// contract, docs/specs/revamp/11-foundation-guide.md 11.2). Its wrapper carries
// data-room-pane="<pane>", so the no-scroll audit can tell a pane that overflows its
// box from a frame that gives too little.

import type { ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { columnPaneOf, laptopGroupOf, type FrameColumn, type FrameLayout } from "./roomFrame.ts";

export interface FramePane {
  /** The tab label, one or two short words. */
  readonly label: string;
  /** A lucide-react icon with aria-hidden, size 22. */
  readonly icon: ReactNode;
  readonly content: ReactNode;
  /** Stays mounted while another tab shows, because it plays sound (the board's turn sounds). */
  readonly keepMounted?: boolean;
  /** A dot on the tab or the switch while the pane is not shown (the chat's unread mark), with the text a screen reader hears. */
  readonly dot?: string;
}

export interface RoomFrameProps<P extends string> {
  /** Links the tabs to their panels, unique on the page. */
  readonly idBase: string;
  /** The arena name in the header, or undefined while it loads. */
  readonly title: string | undefined;
  /** The page's h1 for a screen reader: the header shows the name, cut to one row. */
  readonly heading: string;
  /** NoticeLine elements, or null. */
  readonly notices: ReactNode;
  /** The StatusLine. */
  readonly status: ReactNode;
  /** The primary action with its one-line explanation, or null when the viewer has none now. */
  readonly action: ReactNode;
  readonly layout: FrameLayout<P>;
  readonly pane: (value: P) => FramePane;
  readonly tab: P;
  onTab(next: P): void;
  /** A StepSheet that replaces the pane area while it is open. */
  readonly sheet: ReactNode;
}

const PANE_BOX = "flex min-h-0 min-w-0 flex-1 flex-col";

function tabOf<P extends string>(value: P, item: FramePane, dot: string | undefined) {
  return dot === undefined ? { value, label: item.label, icon: item.icon } : { value, label: item.label, icon: item.icon, dot };
}

/** A laptop group's tab carries the dot of any pane in the group, so the mark shows from the other group too. */
function laptopGroupDot<P extends string>(layout: FrameLayout<P>, value: P, pane: (value: P) => FramePane): string | undefined {
  const group = layout.laptop.find((g) => g.value === value);
  return group?.columns.flatMap((column) => column.panes).map((p) => pane(p).dot).find((dot) => dot !== undefined);
}

export function RoomFrame<P extends string>({ idBase, title, heading, notices, status, action, layout, pane, tab, onTab, sheet }: RoomFrameProps<P>) {
  const m = useMessages();
  const laptop = useLaptopLayout();
  const group = laptopGroupOf(layout, tab);
  const tabValues = laptop ? layout.laptop.map((g) => g.value) : layout.tabs;
  // On a laptop the group tab is lit while any pane of the group shows.
  const tabValue = laptop ? (group?.value ?? tab) : tab;
  const tabs =
    tabValues.length > 1 ? (
      <BottomTabs
        idBase={idBase}
        label={m.room.tabs.label}
        value={tabValue}
        onChange={onTab}
        tabs={tabValues.map((value) => tabOf(value, pane(value), laptop ? laptopGroupDot(layout, value, pane) : pane(value).dot))}
      />
    ) : null;
  const bottom = action === null && tabs === null ? undefined : (
    <>
      {action}
      {tabs}
    </>
  );

  return (
    <AppShell header={<AppHeader {...(title === undefined ? {} : { title })} />} bottom={bottom}>
      <h1 className="sr-only">{heading}</h1>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {notices}
        {status}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-1">
          {sheet === null ? null : (
            <div key="sheet" data-room-pane="sheet" className={PANE_BOX}>
              {sheet}
            </div>
          )}
          {laptop && group !== undefined ? (
            // A group with a pane that plays sound (the board) stays mounted, hidden, while a sheet or another group shows, as on a phone.
            layout.laptop.map((g) => {
              const visible = sheet === null && g.value === group.value;
              const keep = g.columns.some((column) => column.panes.some((value) => pane(value).keepMounted === true));
              if (!visible && !keep) return null;
              return (
                <LaptopGroupView key={g.value} hidden={!visible} idBase={idBase} columns={g.columns} tab={tab} pane={pane} onTab={onTab} tabbed={tabs !== null} groupValue={g.value} />
              );
            })
          ) : (
            // Every pane keeps its place by key, so a pane that stays mounted while hidden (the board) is not mounted again when its tab returns.
            layout.tabs.map((value) => {
              const item = pane(value);
              const visible = sheet === null && value === tab;
              if (!visible && item.keepMounted !== true) return null;
              return (
                <div key={value} hidden={!visible} {...(visible ? tabPanelProps(idBase, value) : {})} data-room-pane={value} className={PANE_BOX}>
                  {item.content}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}

const COLUMN_WIDTH: Record<FrameColumn<string>["width"], string> = { main: "minmax(0,1fr)", side: "minmax(0,20rem)" };

function LaptopGroupView<P extends string>({
  hidden,
  idBase,
  columns,
  tab,
  pane,
  onTab,
  tabbed,
  groupValue,
}: {
  /** True while a sheet or another group shows: the group stays mounted for its sound. */
  readonly hidden: boolean;
  readonly idBase: string;
  readonly columns: readonly FrameColumn<P>[];
  readonly tab: P;
  readonly pane: (value: P) => FramePane;
  onTab(next: P): void;
  /** True when BottomTabs switch the groups, so this grid is their tab panel. */
  readonly tabbed: boolean;
  readonly groupValue: P;
}) {
  const m = useMessages();
  return (
    <div
      hidden={hidden}
      {...(tabbed && !hidden ? tabPanelProps(idBase, groupValue) : {})}
      className="grid min-w-0 gap-6 fit:min-h-0 fit:flex-1 fit:grid-rows-[minmax(0,1fr)]"
      style={{ gridTemplateColumns: columns.map((column) => COLUMN_WIDTH[column.width]).join(" ") }}
    >
      {columns.map((column) => {
        const shown = columnPaneOf(column, tab);
        if (shown === undefined) return null;
        return (
          <div key={column.panes.join("-")} className="flex min-h-0 min-w-0 flex-col gap-3">
            {column.panes.length > 1 ? (
              <SegmentedControl
                legend={m.room.tabs.label}
                hideLegend
                size="sm"
                value={shown}
                onChange={onTab}
                options={column.panes.map((value) => {
                  const dot = pane(value).dot;
                  return dot === undefined ? { value, label: pane(value).label } : { value, label: pane(value).label, dot };
                })}
              />
            ) : null}
            <div data-room-pane={shown} className={PANE_BOX}>
              {pane(shown).content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
