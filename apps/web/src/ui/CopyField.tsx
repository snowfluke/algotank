import { useId, useRef } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "./Button.tsx";
import { INPUT_CLASSES } from "./Field.tsx";
import { useCopy } from "./useCopy.ts";

// A read-only address with a Copy button, for a link or a token the person passes on.

/** A read-only address with a copy button. When copying is blocked, the text is selected for a manual copy. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const m = useMessages();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // Selecting the text lets the person copy it by hand.
  const { copied, copy } = useCopy(value, () => input.current?.select());

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`${INPUT_CLASSES} min-w-[12rem] flex-1`}
        />
        <Button variant="secondary" onClick={copy} aria-live="polite">
          {copied ? m.common.copied : m.common.copy}
        </Button>
      </div>
    </div>
  );
}
