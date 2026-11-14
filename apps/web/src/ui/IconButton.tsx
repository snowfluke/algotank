// A button that shows only an icon: close, mute, remove a row. The type requires
// `label`, because a screen reader has nothing else to read. Use Button when there is room for words.

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { playSound } from "../sound/player.ts";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  /** The accessible name, for example m.common.close. */
  readonly label: string;
  /** An icon with aria-hidden, for example `<X aria-hidden />` from lucide-react. */
  readonly icon: ReactNode;
  readonly variant?: "secondary" | "quiet";
  /** A short word shown next to the icon from 480px wide, such as "Copy". Below that only the icon shows; `label` stays the accessible name. */
  readonly text?: string;
}

const VARIANT_CLASSES = {
  secondary: "border-2 border-b-4 border-line bg-panel text-ink hover:border-line-strong active:bg-ground",
  quiet: "border-2 border-transparent bg-transparent text-ink hover:bg-water-soft active:bg-water-soft",
} as const;

export function IconButton({ label, icon, variant = "secondary", text, className = "", type = "button", onClick, ...rest }: IconButtonProps) {
  function click(event: MouseEvent<HTMLButtonElement>): void {
    playSound("tap");
    onClick?.(event);
  }
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] disabled:cursor-not-allowed disabled:text-muted ${text === undefined ? "size-11" : "min-[480px]:px-3"} ${VARIANT_CLASSES[variant]} ${className}`}
      onClick={click}
      {...rest}
    >
      {icon}
      {text === undefined ? null : (
        <span aria-hidden="true" className="font-display font-semibold max-[479px]:hidden">
          {text}
        </span>
      )}
    </button>
  );
}
