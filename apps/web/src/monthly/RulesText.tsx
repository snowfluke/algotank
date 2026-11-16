// A tank's rules to read, not to edit: each mode's rules as the workshop words them
// (vocabulary/sentence.ts), in the order the tank checks them, then its upgrades. The tank sheet
// shows it (TankSheet.tsx) for a game master's tank and for a month whose rules are open.

import type { StrategyInput } from "@game/engine";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { ATTRIBUTE_IDS } from "../prep/upgrades.ts";
import { fallbackText, modeName, ruleText } from "../vocabulary/sentence.ts";

export function RulesText({ strategy }: { readonly strategy: StrategyInput }) {
  const m = useMessages();
  const f = useFormat();
  const v = m.vocabulary;
  const upgrades = f.list(ATTRIBUTE_IDS.map((id) => `${v.attributes[id].name} ${strategy.build[id] ?? 0}`));
  return (
    <div data-rules-text="" className="flex min-w-0 flex-col gap-3">
      {strategy.modes.map((mode) => (
        <section key={mode.id} className="flex min-w-0 flex-col gap-1">
          {/* With one mode its name says nothing the list does not. */}
          {strategy.modes.length > 1 ? <h4 className="font-display font-semibold [overflow-wrap:anywhere]">{modeName(v, mode)}</h4> : null}
          <ol className="m-0 flex min-w-0 list-decimal flex-col gap-1 pl-6 [overflow-wrap:anywhere] marker:text-muted">
            {mode.rules.map((rule) => (
              <li key={rule.id}>{ruleText(v, rule, strategy.modes)}</li>
            ))}
          </ol>
          <p className="[overflow-wrap:anywhere]">{fallbackText(v, mode.fallback)}</p>
        </section>
      ))}
      <p className="text-muted [overflow-wrap:anywhere]">{m.monthly.sheet.upgrades(upgrades)}</p>
    </div>
  );
}
