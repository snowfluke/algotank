// A sentence about the state of the page: where the game stands, a warning, a
// problem. "danger" is role alert (read at once); the others are role status.
// The tone shows by its icon as well as its colour. For an error next to a form
// field, use the field's `error` instead.

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type StatusTone = "info" | "success" | "warning" | "danger";

const TONES: Record<StatusTone, { readonly classes: string; readonly icon: ReactNode }> = {
  info: { classes: "bg-water-soft text-ink [&_svg]:text-water", icon: <Info aria-hidden size={22} strokeWidth={2.5} /> },
  success: { classes: "bg-ok-soft text-ink [&_svg]:text-ok", icon: <CircleCheck aria-hidden size={22} strokeWidth={2.5} /> },
  warning: { classes: "bg-warning-soft text-ink [&_svg]:text-warning", icon: <TriangleAlert aria-hidden size={22} strokeWidth={2.5} /> },
  danger: { classes: "bg-hit-soft text-ink [&_svg]:text-hit", icon: <CircleAlert aria-hidden size={22} strokeWidth={2.5} /> },
};

export interface StatusBannerProps {
  readonly tone: StatusTone;
  /** One complete sentence: what is true now. */
  readonly title: string;
  /** An optional second sentence: what happens next or what to do. */
  readonly body?: string;
  /** One button or link, such as "Try again". */
  readonly action?: ReactNode;
}

export function StatusBanner({ tone, title, body, action }: StatusBannerProps) {
  const { classes, icon } = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3 rounded-[var(--radius-card)] p-4 ${classes}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1 [overflow-wrap:anywhere]">
        <p className="font-semibold">{title}</p>
        {body === undefined ? null : <p>{body}</p>}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}
