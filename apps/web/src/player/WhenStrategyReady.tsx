// Shows the loading and failure states of the player's strategy, and hands the
// loaded strategy to the preparation panel.

import type { ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import type { StrategyLoad } from "../prep/strategySession.ts";
import type { StrategyHandle } from "../prep/useStrategySession.ts";

export type ReadyStrategy = Extract<StrategyLoad, { readonly kind: "ready" }>;

export function WhenStrategyReady({ strategy, children }: { strategy: StrategyHandle; children(ready: ReadyStrategy): ReactNode }) {
  const m = useMessages();
  const { load } = strategy;
  if (load.kind === "idle" || load.kind === "loading") {
    return (
      <p role="status" className="animate-pulse-soft text-muted">
        {m.prep.loading}
      </p>
    );
  }
  if (load.kind === "failed") {
    return (
      <StatusBanner
        tone="danger"
        title={m.prep.loadFailed}
        body={load.describe(m.errors).sentence}
        action={
          <Button variant="secondary" onClick={strategy.reload}>
            {m.prep.tryAgain}
          </Button>
        }
      />
    );
  }
  return <>{children(load)}</>;
}
