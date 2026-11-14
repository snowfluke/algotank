// The next round's rules in the viewer's language, for the lobby and the break.
// nextRulesOf decides what may be known; this only words it.

import type { PublicArena } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { nextRulesOf } from "../rules/nextRules.ts";

export function RulesLine({ arena, className = "" }: { arena: PublicArena; className?: string }) {
  const m = useMessages();
  const next = nextRulesOf(arena);
  if (next.kind === "none") return null;
  const text =
    next.kind === "hidden"
      ? m.screen.rules.hidden
      : m.screen.rules.known(m.vocabulary.roundRules[next.ruleSetId].name, m.vocabulary.roundRules[next.ruleSetId].summary);
  return <p className={`min-w-0 [overflow-wrap:anywhere] ${className}`}>{text}</p>;
}
