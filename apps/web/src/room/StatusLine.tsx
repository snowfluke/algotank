// The line at the top of the arena room and the presenter page: where the game
// stands and what comes next, at most two lines, with the clock and the page's icon
// buttons (help, champions, "Other arenas" on a public result, settings) at its end. When the clock and the buttons would
// leave the sentence less than 7rem, they wrap under it, so the sentence is never squeezed. The next-step sentence shows when both
// sentences fit in two lines; otherwise only the first one shows, in full, so the
// pane under it keeps its height and no sentence is cut.

import type { ReactNode } from "react";
import { useLanguage } from "../i18n/I18nProvider.tsx";
import type { StatusTone } from "../ui/StatusBanner.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";

export interface StatusTimer {
  /** What the clock counts down to: "Time left", "Starts in". */
  readonly label: string;
  /** The time as m:ss. */
  readonly text: string;
}

export interface StatusLineProps {
  readonly tone: StatusTone;
  /** Where the game stands, one sentence. */
  readonly title: string;
  /**
   * The sentence is read aloud but not shown, and the clock leads the line: the pane under the line
   * shows the outcome, and the phase is too short to read it twice (a public break or result).
   */
  readonly sentenceHidden?: boolean;
  /** What happens next, one sentence. Shown when there is room. */
  readonly body?: string;
  readonly timer: StatusTimer | null;
  /** Icon buttons, placed last. */
  readonly actions?: ReactNode;
}

const TITLE_TONE: Record<StatusTone, string> = { info: "text-ink", success: "text-ok", warning: "text-warning", danger: "text-hit" };

export function StatusLine({ tone, title, body, timer, actions, sentenceHidden = false }: StatusLineProps) {
  const [language] = useLanguage();
  // Level 0: both sentences in at most two lines; level 1: the first sentence alone, never cut.
  const { ref, level } = useFitDetail<HTMLParagraphElement>(body === undefined ? 1 : 2, `${language}|${title}|${body ?? ""}`);
  const both = !sentenceHidden && body !== undefined && level === 0;
  return (
    <div data-status-line="" className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
      {/* A hidden sentence takes no room, so the clock leads and the clock and the buttons keep one row. */}
      <p
        ref={sentenceHidden ? undefined : ref}
        role="status"
        className={sentenceHidden ? "sr-only" : `min-w-0 flex-1 basis-28 [overflow-wrap:anywhere] ${both ? "fit:max-h-[3em] fit:overflow-hidden" : ""}`}
      >
        <span className={`font-semibold ${TITLE_TONE[tone]}`}>{title}</span>
        {both ? <span className="text-muted"> {body}</span> : null}
      </p>
      {timer === null ? null : (
        // data-countdown-clock: a coach mark's callout never covers the clock (ui/CoachMark.tsx, KEEP_CLEAR).
        <p data-countdown-clock="" className={`flex shrink-0 flex-col ${sentenceHidden ? "mr-auto items-start" : "items-end"}`}>
          <span className="text-caption font-semibold text-muted">{timer.label}</span>
          <time className="font-display text-title font-bold leading-none">{timer.text}</time>
        </p>
      )}
      {actions === undefined ? null : <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export type NoticeTone = "warning" | "danger" | "info";

const NOTICE_TONE: Record<NoticeTone, string> = { info: "bg-water-soft", warning: "bg-warning-soft", danger: "bg-hit-soft" };

/**
 * A short notice above the status line (the connection dropped, this browser cannot
 * remember the seat, a change saves after the round): one sentence on a tinted band,
 * so a rare problem costs the pane one line and not a banner.
 */
export function NoticeLine({ tone, text, action }: { readonly tone: NoticeTone; readonly text: string; readonly action?: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] px-3 py-1.5 ${NOTICE_TONE[tone]}`}
    >
      <p className="min-w-0 flex-1 basis-48 font-semibold [overflow-wrap:anywhere]">{text}</p>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}
