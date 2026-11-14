// The frame of every page under the no-scroll rule (docs/specs/revamp/60-no-scroll.md).
// Use it as the root of a page, instead of AppHeader plus Page.
//
// In the fixed-height layout (`fit:`, 360 x 560 CSS px or larger) the frame is exactly
// the viewport (100dvh, so the moving browser bars of a phone do not cut it): the header
// row, the main area that takes the rest and never scrolls, and the optional bottom bar.
// Whatever goes in `children` must fit the main area (the pane contract: flex or grid
// with min-h-0, never relying on the page to grow). Outside `fit:` (a phone held
// sideways, enlarged text) the same frame is a column at least as tall as the viewport
// and the page scrolls, so nothing is ever cut off.
//
// The frame keeps clear of the notch and the home indicator (env(safe-area-inset-*));
// index.html sets viewport-fit=cover so those insets are real on a phone.

import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader.tsx";

/**
 * How wide the main area's content may grow, centred, with 16px gutters:
 * "narrow" 36rem for one form, "wide" 72rem for panes side by side, "full" for edge to edge (no gutters).
 */
export type ShellWidth = "narrow" | "wide" | "full";

const WIDTH_CLASSES: Record<ShellWidth, string> = {
  narrow: "mx-auto w-full max-w-xl px-4",
  wide: "mx-auto w-full max-w-6xl px-4",
  full: "w-full",
};

export interface AppShellProps {
  /** The main area. It gets a box of fixed height in the `fit:` layout and must fit in it. */
  readonly children: ReactNode;
  /** The header row, at most 56px. Defaults to `<AppHeader />`; pass your own AppHeader for a title, or null for none (the big screen). */
  readonly header?: ReactNode;
  /**
   * The bottom bar: the screen's primary action, BottomTabs, or the action above BottomTabs.
   * It sits on a panel background with a top border and keeps clear of the home indicator.
   */
  readonly bottom?: ReactNode;
  readonly width?: ShellWidth;
  /** "center" places a short form in the middle of the main area's height; "start" (default) at the top. */
  readonly align?: "start" | "center";
}

export function AppShell({ children, header = <AppHeader />, bottom, width = "wide", align = "start" }: AppShellProps) {
  return (
    <div
      data-app-shell=""
      className="flex min-h-dvh w-full flex-col pt-[env(safe-area-inset-top,0px)] fit:grid fit:h-dvh fit:min-h-0 fit:grid-rows-[auto_minmax(0,1fr)_auto] fit:overflow-hidden"
    >
      <div className="min-w-0 pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)]">{header}</div>
      <main
        data-shell-main=""
        className={`flex min-h-0 min-w-0 flex-1 flex-col pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)] fit:overflow-hidden ${bottom === undefined ? "pb-[env(safe-area-inset-bottom,0px)]" : ""}`}
      >
        <div
          className={`flex min-h-0 flex-1 flex-col pt-2 pb-4 ${align === "center" ? "fit:justify-center-safe" : ""} ${WIDTH_CLASSES[width]}`}
        >
          {children}
        </div>
      </main>
      {bottom === undefined ? null : (
        <div
          data-shell-bottom=""
          className="min-w-0 border-t-2 border-line bg-panel pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)]"
        >
          {bottom}
        </div>
      )}
    </div>
  );
}
