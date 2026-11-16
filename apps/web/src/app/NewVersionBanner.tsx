// A reload offer for a tab that runs an older release (pageBuild.ts). It sits over the top of the
// page, so the page under it does not move, and it reloads only on a tap: a reload by itself could
// lose rules or a look that are not saved yet.

import { useSyncExternalStore } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { pageBuildStore } from "./pageBuild.ts";

export function NewVersionBanner() {
  const m = useMessages();
  const older = useSyncExternalStore(pageBuildStore.subscribe, pageBuildStore.isOlder, () => false);
  if (!older) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4">
      <div role="status" data-new-version="" className="pointer-events-auto flex min-w-0 max-w-[32rem] flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] bg-panel p-3 shadow-[var(--shadow-raised)]">
        <p className="min-w-0 flex-1 basis-48 font-semibold [overflow-wrap:anywhere]">{m.common.newVersion}</p>
        <Button onClick={() => window.location.reload()}>
          {m.common.reload}
        </Button>
      </div>
    </div>
  );
}
