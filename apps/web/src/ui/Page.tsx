// The page column under the AppHeader: 16px side gutters, the spacing rhythm
// between sections, and a width that stays readable on a phone and a laptop.
// Pages render <AppHeader /> and then <Page>; App.tsx gives both a full-height column.

import type { ReactNode } from "react";

/** The widest the column grows. "editor" is 72rem, for the strategy editor beside its rule list. */
export type PageWidth = "narrow" | "wide" | "editor";
const MAX_WIDTH: Record<PageWidth, string> = { narrow: "max-w-xl", wide: "max-w-3xl", editor: "max-w-6xl" };

export function Page({ children, width = "narrow" }: { children: ReactNode; width?: PageWidth }) {
  return (
    <main className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-4 pb-10 ${MAX_WIDTH[width]}`}>
      {children}
    </main>
  );
}
