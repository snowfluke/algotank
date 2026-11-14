// The sentence about the next round's rules, for the lobby and the break of
// the host page, the player page and the shared screen.

import type { PublicArena } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { nextRulesOf, nextRulesSentence } from "./nextRules.ts";

export function RuleSetLine({ arena, className = "" }: { arena: PublicArena; className?: string }) {
  const m = useMessages();
  const sentence = nextRulesSentence(nextRulesOf(arena), m);
  if (sentence === null) return null;
  return <p className={`min-w-0 [overflow-wrap:anywhere] ${className}`}>{sentence}</p>;
}
