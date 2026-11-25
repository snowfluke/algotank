// A confirmation before something that cannot be undone (remove a player, end
// the game). Nothing else: a choice that can be undone uses a Toast with Undo.
// Built on the native <dialog> with showModal(), so the browser traps focus,
// makes the page behind inert, and closes it on Escape.

import { useEffect, useId, useRef } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "./Button.tsx";

export interface DialogProps {
  readonly open: boolean;
  /** A question that names the action: "Remove Budi from the arena?" */
  readonly title: string;
  /** One sentence about what is lost. */
  readonly body: string;
  /** The button that does it, named by the action: "Remove Budi". */
  readonly confirmLabel: string;
  onConfirm(): void;
  /**
   * A second way to do it, before the confirm button: the removal's "Yes, they may join again"
   * beside "No, keep them out". Absent for a plain yes-or-no question.
   */
  readonly alternative?: { readonly label: string; onChoose(): void };
  /** `data-dialog` on the element, for the audit and the browser runs. */
  readonly hook?: string;
  /** Runs on Cancel, Escape, and a click on the backdrop. */
  onCancel(): void;
}

export function Dialog({ open, title, body, confirmLabel, onConfirm, onCancel, alternative, hook }: DialogProps) {
  const m = useMessages();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-dialog={hook}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      // Escape fires "cancel"; the parent owns `open`, so it decides.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-scrim/50"
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id={titleId} className="text-title">
          {title}
        </h2>
        <p id={bodyId} className="text-muted">
          {body}
        </p>
        <div className="flex flex-wrap justify-end gap-3 pt-3">
          {/* Cancel comes first in the focus order, so Enter on open does no harm. */}
          <Button variant="secondary" onClick={onCancel} autoFocus>
            {m.common.cancel}
          </Button>
          {alternative === undefined ? null : (
            <Button variant="secondary" data-dialog-alternative="" onClick={alternative.onChoose}>
              {alternative.label}
            </Button>
          )}
          <Button variant="danger" data-dialog-confirm="" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
