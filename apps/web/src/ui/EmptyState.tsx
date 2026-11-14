// What a list or area shows when it has nothing yet: the condition in one
// sentence and the next step. Add a picture (a TankBadge) only when it helps.

import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** What is true: "No players have joined yet." */
  readonly title: string;
  /** What happens next or what to do: "Share the code, and players appear here as they join." */
  readonly body: string;
  readonly visual?: ReactNode;
  /** One button or link for the next step. */
  readonly action?: ReactNode;
}

export function EmptyState({ title, body, visual, action }: EmptyStateProps) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 py-6">
      {visual === undefined ? null : <div aria-hidden="true">{visual}</div>}
      <p className="font-display text-lead font-semibold">{title}</p>
      <p className="max-w-[60ch] text-muted">{body}</p>
      {action === undefined ? null : <div className="pt-2">{action}</div>}
    </div>
  );
}
