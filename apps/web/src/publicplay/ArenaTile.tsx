// One public arena on the chooser: a radio card with the drawing, the name, the one
// sentence that says what happens there and the live line. The chosen tile gets the
// water border and a check mark, so the choice does not depend on colour. On a phone the
// drawing sits beside the text; on a laptop the three tiles stand in a row with the
// drawing above.

import { Check, Lock } from "lucide-react";
import { useId } from "react";
import { ArenaArt } from "./ArenaArt.tsx";
import type { ChooserKind } from "./chooserKinds.ts";

export interface ArenaTileProps {
  readonly kind: ChooserKind;
  readonly checked: boolean;
  onSelect(kind: ChooserKind): void;
  readonly title: string;
  readonly about: string;
  readonly live: string;
  /** A requirement under the live line, such as the monthly arena's sign-in. */
  readonly note: string | null;
  /** False on a short screen: the drawing gives its room to the text. */
  readonly showArt: boolean;
  /** False only when a problem line needs the room on the smallest screens. */
  readonly showLive: boolean;
}

export function ArenaTile({ kind, checked, onSelect, title, about, live, note, showArt, showLive }: ArenaTileProps) {
  const aboutId = useId();
  return (
    <label
      data-arena-tile={kind}
      className="press relative flex min-w-0 cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border-2 border-b-4 border-line bg-panel px-3 py-2 has-[:checked]:border-water has-[:checked]:bg-water-soft has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-water)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-water laptop:flex-col laptop:p-4 [@media(hover:hover)]:hover:border-line-strong"
    >
      <input type="radio" name="arena" value={kind} checked={checked} onChange={() => onSelect(kind)} aria-describedby={aboutId} className="sr-only" />
      {showArt ? (
        <span aria-hidden="true" className="size-14 shrink-0 laptop:size-20">
          <ArenaArt kind={kind} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        {/* The title keeps clear of the check mark in the corner. */}
        <span className="flex min-h-7 items-center pr-9 font-display text-lead font-semibold leading-tight [overflow-wrap:anywhere]">{title}</span>
        <span id={aboutId} className="flex min-w-0 flex-col">
          <span className="[overflow-wrap:anywhere]">{about}</span>
          {showLive ? <span className="text-caption font-semibold text-muted [overflow-wrap:anywhere]">{live}</span> : null}
          {note === null ? null : (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-caption font-semibold text-muted">
              <Lock aria-hidden size={14} strokeWidth={2.5} className="shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{note}</span>
            </span>
          )}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`absolute top-2 right-3 flex size-7 shrink-0 items-center justify-center rounded-full border-2 laptop:top-4 laptop:right-4 ${checked ? "border-water bg-water text-water-ink" : "border-line bg-panel text-transparent"}`}
      >
        <Check size={18} strokeWidth={3} />
      </span>
    </label>
  );
}
