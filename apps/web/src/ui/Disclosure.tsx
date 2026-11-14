// The "More options" pattern: advanced controls stay one tap away and out of the
// simple path. A native <details>, so it works with the keyboard and a screen
// reader without script. The summary defaults to m.common.moreOptions.

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";

export interface DisclosureProps {
  /** The summary text. Name what is inside when it is not just "More options". */
  readonly summary?: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}

export function Disclosure({ summary, defaultOpen = false, children }: DisclosureProps) {
  const m = useMessages();
  return (
    <details open={defaultOpen} className="group min-w-0">
      <summary className="press inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] px-1 font-display font-semibold text-water [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden size={20} strokeWidth={2.5} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        {summary ?? m.common.moreOptions}
      </summary>
      <div className="flex flex-col gap-4 pt-3">{children}</div>
    </details>
  );
}
