// Labelled form controls. TextInput (and Picker, in ui/Picker.tsx) put the label above
// the control, an optional hint below it, and an error sentence under that, all linked
// with aria-describedby so a screen reader reads them with the control.
// There is no native select: use Picker.

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export const INPUT_CLASSES =
  "block min-h-12 w-full min-w-0 rounded-[var(--radius-control)] border-2 border-line bg-panel px-3 py-2 text-ink placeholder:text-muted hover:border-line-strong aria-[invalid=true]:border-hit disabled:bg-ground disabled:text-muted";

export interface DescribedProps {
  readonly label: string;
  /** One sentence for a constraint the label cannot show (format, unit, length). */
  readonly hint?: string;
  /** One sentence that names the problem and the fix. Set it only after the person tried. */
  readonly error?: string | null;
}

export function useDescriptions(hint: string | undefined, error: string | null | undefined) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined || error === null ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter((x) => x !== undefined).join(" ");
  return { id, hintId, errorId, describedBy: describedBy === "" ? undefined : describedBy };
}

export function Descriptions({ hint, hintId, error, errorId }: { hint?: string | undefined; hintId?: string | undefined; error?: string | null | undefined; errorId?: string | undefined }) {
  return (
    <>
      {hint === undefined ? null : (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {error === undefined || error === null ? null : (
        <p id={errorId} className="flex items-start gap-1.5 font-semibold text-hit [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </>
  );
}

export interface TextInputProps extends DescribedProps, Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  /** "code" shows large, spaced display type for a short code the person reads off a screen. */
  readonly display?: "text" | "code";
  /** A control inside the right end of the field, such as the password's show or hide button (an IconButton). */
  readonly trailing?: ReactNode;
}

const CODE_CLASSES = "min-h-16 font-display text-title font-bold tracking-[0.2em] uppercase";

export function TextInput({ label, hint, error, display = "text", trailing, ...inputProps }: TextInputProps) {
  const d = useDescriptions(hint, error);
  const input = (
    <input
      id={d.id}
      className={`${display === "code" ? `${INPUT_CLASSES} ${CODE_CLASSES}` : INPUT_CLASSES} ${trailing === undefined ? "" : "pr-14"}`}
      aria-describedby={d.describedBy}
      aria-invalid={d.errorId === undefined ? undefined : true}
      {...inputProps}
    />
  );
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={d.id} className="font-semibold">
        {label}
      </label>
      {trailing === undefined ? (
        input
      ) : (
        <div className="relative min-w-0">
          {input}
          <div className="absolute inset-y-0 right-0.5 flex items-center">{trailing}</div>
        </div>
      )}
      <Descriptions hint={hint} hintId={d.hintId} error={error} errorId={d.errorId} />
    </div>
  );
}

