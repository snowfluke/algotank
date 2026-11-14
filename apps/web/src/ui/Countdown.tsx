// A large number for "starts in N". Pure display: the caller owns the clock and
// passes the whole seconds left. Each new number pops in (still under reduced
// motion), and a screen reader hears "Starts in 3 seconds" once per change.
// Pair it with playSound("countdown") in the caller when the number changes.

import { useMessages } from "../i18n/I18nProvider.tsx";

export interface CountdownProps {
  readonly seconds: number;
  /** "md" for a card, "xl" for the big screen or a full-screen overlay, "fit" inside a size container (the board), where it takes at most 26% of the container's height. */
  readonly size?: "md" | "xl" | "fit";
}

const SIZE_CLASSES = {
  md: "text-display",
  xl: "text-[clamp(6rem,18vw,14rem)]",
  fit: "text-[min(var(--text-display),26cqh)]",
} as const;

export function Countdown({ seconds, size = "md" }: CountdownProps) {
  const m = useMessages();
  const whole = Math.max(0, Math.ceil(seconds));
  return (
    <div role="timer" aria-live="polite" aria-atomic="true" className="flex flex-col items-center">
      <span className="sr-only">{m.common.startsIn(whole)}</span>
      <span
        key={whole}
        aria-hidden="true"
        className={`tabular animate-pop font-display font-bold leading-none text-water ${SIZE_CLASSES[size]}`}
      >
        {whole}
      </span>
    </div>
  );
}
