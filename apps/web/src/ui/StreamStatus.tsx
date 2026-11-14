import { useEffect, useState } from "react";
import { getArena, type ApiResult } from "../api/client.ts";
import { errorSentence } from "../api/errorSentences.ts";
import type { ArenaStreamState } from "../stream/streamState.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { ErrorNotice } from "./Notice.tsx";
import type { en as CommonText } from "./messages.ts";

/**
 * The sentence for a stream that will not come back. A 404 after the arena was on
 * screen means its owner closed it or it expired, not that the code is wrong.
 */
export function closedReason(result: ApiResult<unknown>, arenaSeen: boolean, text: (typeof CommonText)["connection"]): string {
  if (result.ok) return text.closed;
  if (result.status === 404) return arenaSeen ? text.arenaClosed : text.notFound;
  return errorSentence(result, "loadArena");
}

/** Why a closed stream will not come back. The stream itself only says "closed", so one plain request asks for the reason. */
function useClosedReason(arenaId: string, closed: boolean, arenaSeen: boolean): string | null {
  const m = useMessages();
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    if (!closed) {
      setReason(null);
      return;
    }
    let cancelled = false;
    void getArena(arenaId).then((result) => {
      if (cancelled) return;
      setReason(closedReason(result, arenaSeen, m.common.connection));
    });
    return () => {
      cancelled = true;
    };
  }, [arenaId, closed, arenaSeen, m]);
  return reason;
}

/** Shows the problems of the stream and nothing while it works. Its box is `contents`, so an empty status takes no gap in the page's flex column. */
export function StreamStatus({ arenaId, stream }: { arenaId: string; stream: ArenaStreamState }) {
  const m = useMessages();
  const closedReason = useClosedReason(arenaId, stream.connection === "closed", stream.arena !== null);
  return (
    <div className="contents" aria-live="polite">
      {stream.connection === "reconnecting" ? (
        <ErrorNotice>{m.common.connection.reconnecting}</ErrorNotice>
      ) : null}
      {closedReason === null ? null : <ErrorNotice>{closedReason}</ErrorNotice>}
      {stream.protocolError === null ? null : (
        <ErrorNotice>{m.common.connection.unreadable}</ErrorNotice>
      )}
    </div>
  );
}
