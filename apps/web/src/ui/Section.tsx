// A titled part of a page: a heading, an optional one-sentence intro, and the
// content, with the spacing rhythm (more space above a heading than below it).
// Use one Section per job on a page; do not wrap it in a card.

import { useId, type ReactNode } from "react";

export interface SectionProps {
  readonly heading: string;
  /** One complete sentence that continues from the heading. */
  readonly intro?: string;
  /** "h2" by default; use "h3" inside another Section. */
  readonly level?: "h2" | "h3";
  /** Controls placed at the end of the heading row, such as a quiet button. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

export function Section({ heading, intro, level = "h2", action, children }: SectionProps) {
  const id = useId();
  const Heading = level;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Heading id={id} className={`min-w-0 flex-1 ${level === "h2" ? "text-title" : "text-lead"}`}>
          {heading}
        </Heading>
        {action}
      </div>
      {intro === undefined ? null : <p className="-mt-1 text-muted">{intro}</p>}
      {children}
    </section>
  );
}
