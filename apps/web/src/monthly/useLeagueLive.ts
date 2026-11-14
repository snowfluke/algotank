// Opens a league's event stream and keeps its live state (leagueLive.ts holds the table).
// EventSource reconnects by itself after a dropped connection; a turn that does not fit closes
// the stream and opens it again, so the page starts over from a fresh state. A stream the server
// refuses (a league that does not exist, too many viewers) closes for good: the page then says
// so and offers Try again.

import { useCallback, useEffect, useState } from "react";
import { leagueEventsUrl } from "../api/client.ts";
import { nextLeagueLoad, parseLeagueMessage, type LeagueLiveLoad } from "./leagueLive.ts";

/** The connection itself, apart from what it carried: "reconnecting" keeps the last board on the screen. */
export type LeagueConnection = "open" | "reconnecting" | "failed";

export interface LeagueLiveHandle {
  readonly load: LeagueLiveLoad;
  readonly connection: LeagueConnection;
  retry(): void;
}

/** `league` null opens nothing yet: the page waits until it knows which league to show. */
export function useLeagueLive(league: number | null): LeagueLiveHandle {
  const [load, setLoad] = useState<LeagueLiveLoad>({ kind: "connecting" });
  const [connection, setConnection] = useState<LeagueConnection>("open");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoad({ kind: "connecting" });
    setConnection("open");
    if (league === null) return;
    const source = new EventSource(leagueEventsUrl(league));
    const onMessage = (event: MessageEvent<string>) => {
      const message = parseLeagueMessage(event.data);
      if (message === null) return;
      setConnection("open");
      // The server ends a closed league's stream; without this the browser would open it again and get a 404.
      if (message.type === "closed") source.close();
      setLoad((current) => {
        try {
          return nextLeagueLoad(current, message, Date.now());
        } catch (error) {
          console.error("A turn of the monthly arena did not fit its tanks; the page connects again:", error);
          setAttempt((n) => n + 1);
          return { kind: "connecting" };
        }
      });
    };
    source.addEventListener("state", onMessage);
    source.addEventListener("tick", onMessage);
    source.addEventListener("closed", onMessage);
    source.onerror = () => {
      // CLOSED: the server answered with an error, so the browser gives up; CONNECTING: it tries again by itself.
      setConnection(source.readyState === EventSource.CLOSED ? "failed" : "reconnecting");
    };
    return () => source.close();
  }, [league, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { load, connection, retry };
}
