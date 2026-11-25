// "/rules": the rules guide on its own page (owner, 2026-11-20), opened from the catalogue. The address holds the
// part ("?part=do"), so a link or a reload opens it; each choice replaces the address, so "back" leaves at once.

import { ultimatesOn } from "@game/arena";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { currentSearch, goBack, replaceSearch } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { GUIDE_PARTS, RulesGuide, type GuidePart } from "./RulesGuide.tsx";

/** The part in "?part=targets"; a missing or unknown one opens the first. */
export function partFromSearch(search: string): GuidePart {
  const asked = new URLSearchParams(search).get("part");
  return GUIDE_PARTS.find((part) => part === asked) ?? GUIDE_PARTS[0];
}

export function RulesPage() {
  const [part, setPart] = useState<GuidePart>(() => partFromSearch(currentSearch()));
  return (
    <RulesView
      part={part}
      onPart={(next) => {
        setPart(next);
        const params = new URLSearchParams(currentSearch());
        params.set("part", next);
        replaceSearch(`?${params.toString()}`);
      }}
    />
  );
}

/** The page in any state, so the tests can open a part. */
export function RulesView({ part, onPart, nowMs = Date.now() }: { readonly part: GuidePart; onPart(next: GuidePart): void; readonly nowMs?: number }) {
  const m = useMessages();
  const g = m.catalogue.rulesGuide;
  return (
    <AppShell>
      <div data-rules-page="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <IconButton label={m.common.back} icon={<ArrowLeft aria-hidden size={22} />} variant="quiet" onClick={() => goBack(paths.catalogue())} />
          <h1 className="min-w-0 text-heading [overflow-wrap:anywhere]">{g.heading}</h1>
        </div>
        <RulesGuide part={part} onPart={onPart} hybridOn={ultimatesOn(nowMs)} />
      </div>
    </AppShell>
  );
}
