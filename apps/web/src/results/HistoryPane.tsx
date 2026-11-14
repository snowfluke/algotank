// The round history as a pane of a live arena's finished view (the arena room and the presenter
// page), with the stored result's link and QR code above it once the server wrote the result.
// Built from the PublicArena, so it shows before the result file's id arrives.

import type { PlayerId, PublicArena } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { historyOfArena } from "./history.ts";
import { ResultLink, resultIdOf } from "./ResultLink.tsx";
import { RoundHistory } from "./RoundHistory.tsx";

export function HistoryPane({ arena, viewerId }: { readonly arena: PublicArena; readonly viewerId: PlayerId | null }) {
  const t = useMessages().results.history;
  const resultId = resultIdOf(arena);
  return (
    <section aria-label={t.heading} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {resultId === null ? null : <ResultLink resultId={resultId} />}
      <RoundHistory model={historyOfArena(arena, viewerId)} />
    </section>
  );
}
