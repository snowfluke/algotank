// The arena link of a game that ended (75-organiser-tournament.md section 5): the arena is gone,
// but the server still keeps its last result for 180 days and names it in the 404 of
// GET /api/arenas/:id (ErrorResponse.resultId). The arena room asks once it knows the arena is
// gone (its view "notFound" or "closed") and then shows this in place of "not found".

import { useEffect, useState } from "react";
import { isResultId, type ArenaId } from "@game/arena";
import { getArena } from "../api/client.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { LinkButton } from "../ui/Button.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";

/** The stored result of an arena that is gone, or null while unknown and when none is kept. */
export function useEndedResult(arenaId: ArenaId, gone: boolean): string | null {
  const [resultId, setResultId] = useState<string | null>(null);
  useEffect(() => {
    if (!gone) return;
    let current = true;
    void getArena(arenaId).then((answer) => {
      // Any other answer leaves the page's own "not found" or "closed" sentence, which is still true.
      if (current && !answer.ok && answer.status === 404 && isResultId(answer.error.resultId)) setResultId(answer.error.resultId);
    });
    return () => {
      current = false;
    };
  }, [arenaId, gone]);
  return resultId;
}

export function EndedArena({ resultId }: { readonly resultId: string }) {
  const t = useMessages().results.ended;
  return (
    <div data-arena-ended="" className="flex min-w-0 flex-col gap-5">
      <StatusBanner tone="info" title={t.title} body={t.body} />
      <div>
        <LinkButton href={paths.result(resultId)} variant="primary" size="lg">
          {t.open}
        </LinkButton>
      </div>
    </div>
  );
}
