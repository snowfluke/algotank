// Buttons. Use Button for an action on this page, LinkButton for navigation that
// looks like a button. One "primary" per screen: the action the page is for.
// Every variant has a lip that sinks when pressed, so a tap is felt on a phone.

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { followLink } from "../app/navigation.ts";
import { playSound } from "../sound/player.ts";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border-b-4 border-water-deep bg-water text-water-ink hover:bg-water-hover active:bg-water-deep disabled:border-line-strong disabled:bg-line disabled:text-muted",
  secondary:
    "border-2 border-b-4 border-line bg-panel text-ink hover:border-line-strong active:bg-ground disabled:text-muted",
  quiet: "border-b-4 border-transparent bg-transparent text-water hover:bg-water-soft active:bg-water-soft disabled:text-muted",
  danger: "border-b-4 border-hit-deep bg-hit text-white hover:bg-hit-deep active:bg-hit-deep disabled:border-line-strong disabled:bg-line disabled:text-muted",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "min-h-12 min-w-28 px-5 py-2 text-body",
  lg: "min-h-14 min-w-36 px-6 py-3 text-lead",
};

/** Shared by Button and LinkButton. The pressed lip shrinks from 4px to 2px while the button moves down 2px, so the page does not shift. */
function buttonClasses(variant: ButtonVariant, size: ButtonSize): string {
  return `press inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-display font-semibold leading-tight text-center no-underline select-none [overflow-wrap:anywhere] active:mb-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:active:mb-0 disabled:active:border-b-4 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Shows a spinner, blocks clicks and sets aria-busy. The label stays, so the person knows what is running. */
  readonly loading?: boolean;
  /** A leading icon, for example a lucide-react icon with aria-hidden. */
  readonly icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  type = "button",
  disabled,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  function click(event: MouseEvent<HTMLButtonElement>): void {
    playSound("tap");
    onClick?.(event);
  }
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
      onClick={click}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export interface LinkButtonProps {
  readonly href: string;
  readonly children: string;
  /** Opens in a new tab, for a page the person keeps beside this one (the big screen). */
  readonly newTab?: boolean;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: ReactNode;
}

/** A link that looks like a button. A link inside the app changes page without a reload. */
export function LinkButton({ href, children, newTab = false, variant = "secondary", size = "md", icon }: LinkButtonProps) {
  return (
    <a
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : { onClick: followLink })}
      className={buttonClasses(variant, size)}
    >
      {icon}
      {children}
    </a>
  );
}
