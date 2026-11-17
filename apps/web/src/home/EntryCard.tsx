// One of the ways in on the home page: a large link with a drawing, a title and one
// sentence. The two main tiles sit side by side: Play now in water blue and the tank
// workshop in the guide colour (docs/specs/revamp/65-guidance.md, section 5), each with
// the drawing above its words. The other ways in are rows. When the page is short, the
// rows leave out their sentence first (`detail` "brief"), then the main tiles do, and last
// the rows take less padding ("compact", 82-fit-fixes.md); titles, drawings and the
// sign-in note always stay, so every way in fits without scrolling.

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { followLink } from "../app/navigation.ts";
import { playSound } from "../sound/player.ts";

/** "water": Play now; "guide": the tank workshop; "row": the smaller ways in. */
/** "water" and "guide": the two large tiles. "row": a plain row. "rowGuide": a row in the workshop's gold, for the catalogue (owner, 2026-11-17: the plain row was easy to miss). */
export type EntryTone = "water" | "guide" | "row" | "rowGuide";

/** "full": the sentence shows; "brief": no sentence; "compact": no sentence, and a row takes less padding (a main tile draws as "brief"). */
export type EntryDetail = "full" | "brief" | "compact";

export interface EntryCardProps {
  readonly href: string;
  readonly title: string;
  readonly body: string;
  readonly art: ReactNode;
  readonly tone?: EntryTone;
  /** A short requirement shown under the sentence, such as "Sign-in needed". */
  readonly note?: string;
  /** A line about what happens there now (the monthly arena's tanks); it stays when the page is short, because it is the reason to go. */
  readonly live?: string | null;
  /** How much the card shows, for a short page. */
  readonly detail?: EntryDetail;
  /** The guide's hook (data-coach), for the first-visit cue on the workshop tile. */
  readonly coach?: string;
}

const SURFACE: Record<EntryTone, string> = {
  water: "border-b-[6px] border-water-deep bg-water text-water-ink hover:bg-water-hover",
  guide: "border-b-[6px] border-guide-deep bg-guide text-guide-ink hover:brightness-95",
  row: "border-2 border-b-4 border-line bg-panel text-ink hover:border-line-strong",
  rowGuide: "border-2 border-b-4 border-guide-deep bg-guide-soft text-ink hover:brightness-95",
};

export function EntryCard({ href, title, body, art, tone = "row", note, live = null, detail = "full", coach }: EntryCardProps) {
  const main = tone === "water" || tone === "guide";
  const brief = detail !== "full";
  const layout = main ? "flex-col items-start gap-2 p-3 laptop:p-4" : `items-center gap-3 px-3 ${detail === "compact" ? "py-1" : "py-2"}`;
  return (
    <a
      href={href}
      data-entry={href}
      {...(coach === undefined ? {} : { "data-coach": coach })}
      onClick={(event) => {
        playSound("tap");
        followLink(event);
      }}
      className={`press group flex min-h-11 min-w-0 rounded-[var(--radius-card)] no-underline ${layout} ${SURFACE[tone]}`}
    >
      <span className={`shrink-0 ${main ? "size-12 laptop:size-16" : brief ? "size-10" : "size-14"}`}>{art}</span>
      <span className="flex min-w-0 flex-col justify-center self-stretch">
        <span className={`font-display font-bold leading-tight [overflow-wrap:anywhere] ${main ? "text-title laptop:text-heading" : "text-lead"}`}>{title}</span>
        {brief ? null : <span className={`[overflow-wrap:anywhere] ${main ? "mt-1" : "text-muted"}`}>{body}</span>}
        {live === null ? null : (
          <span data-entry-live="" className="text-caption font-semibold text-ok [overflow-wrap:anywhere]">
            {live}
          </span>
        )}
        {note === undefined ? null : (
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-muted">
            <Lock aria-hidden size={14} strokeWidth={2.5} />
            {note}
          </span>
        )}
      </span>
    </a>
  );
}
