// The rules editor as one pane: the list, and the open step (a rule, a condition,
// "If no rule fits", the modes). On a narrow pane the step replaces the list; on a
// wide one they sit side by side. The screen keeps `nav`, so a resize keeps the step.

import { RulesList, type RulesEditorProps } from "./RulesList.tsx";
import { resolveView } from "./rulesNav.ts";
import { RulesStep } from "./RuleSteps.tsx";

export function RulesPane(props: RulesEditorProps & { readonly wide: boolean }) {
  const view = resolveView(props.strategy, props.nav);
  if (view.kind === "list") return <RulesList {...props} />;
  if (!props.wide) return <RulesStep {...props} />;
  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-6">
      <div className="flex min-h-0 min-w-0 flex-col">
        <RulesList {...props} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <RulesStep {...props} />
      </div>
    </div>
  );
}

