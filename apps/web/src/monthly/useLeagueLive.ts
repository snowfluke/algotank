// Opens a league's event stream and keeps its live state (leagueLive.ts holds the table).
// EventSource reconnects by itself after a dropped connection; a turn that does not fit closes
// the stream and opens it again, so the page starts over from a fresh state. A stream the server
// refuses (a league that does not exist, too many viewers) closes for good: the page then says
// so and offers Try again. Messages show through a short playout queue (stream/playout.ts), so turns
// that the way to the viewer holds back show at the server's pace instead of freezing and rushing.

import { useCallback, useEffect, useState } from "react";
import { leagueEventsUrl } from "../api/client.ts";
import { checkPageBuild } from "../app/pageBuild.ts";
import type { LeagueStreamMessage } from "@game/arena";
import { nextLeagueLoad, parseLeagueMessage, type LeagueLiveLoad } from "./leagueLive.ts";
import type { Arrival } from "../stream/playout.ts";
import { startPlayout } from "../stream/playoutRunner.ts";

/** The first state starts the playout's clock; a later one belongs to the turn before it. */
function arrivalOf(message: LeagueStreamMessage, first: boolean): Arrival<LeagueStreamMessage> {
  if (message.type === "tick") return { kind: "turn", turn: message.tick.tick, item: message };
  if (message.type === "state") return { kind: first ? "restart" : "update", item: message };
  return { kind: "flush", item: message };
}

/** A state shown `waitedMs` after it came: its time to the day's end is that much shorter, so the countdown stays right. */
function shownLater(message: LeagueStreamMessage, waitedMs: number): LeagueStreamMessage {
  return message.type === "state" ? { ...message, state: { ...message.state, dayEndsInMs: message.state.dayEndsInMs - waitedMs } } : message;
}

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
    // The queue belongs to this stream, so a reconnect or another league starts it empty.
    // Taken off the queue outside the updater, which React may run twice.
    const playout = startPlayout<LeagueStreamMessage>((due, now) =>
      setLoad((current) => {
        try {
          return due.reduce((load, { item, arrivedAt }) => nextLeagueLoad(load, shownLater(item, now - arrivedAt), now), current);
        } catch (error) {
          console.error("A turn of the monthly arena did not fit its tanks; the page connects again:", error);
          setAttempt((n) => n + 1);
          return { kind: "connecting" };
        }
      }),
    );
    // Known from the first state; a turn before it cannot be placed (leagueLive.ts) and is not queued.
    let tickMs: number | null = null;
    const onMessage = (event: MessageEvent<string>) => {
      const message = parseLeagueMessage(event.data);
      if (message === null) return;
      setConnection("open");
      // The server ends a closed league's stream; without this the browser would open it again and get a 404.
      if (message.type === "closed") source.close();
      const first = message.type === "state" && tickMs === null;
      if (message.type === "state" && tickMs === null) tickMs = message.state.tickMs;
      if (tickMs === null) {
        if (message.type === "closed") setLoad((current) => nextLeagueLoad(current, message, Date.now()));
        return;
      }
      playout.receive(arrivalOf(message, first), tickMs);
    };
    // A stream that comes back after an error most often met a release that restarted the server.
    let lostOnce = false;
    source.onopen = () => {
      if (lostOnce) checkPageBuild();
    };
    source.addEventListener("state", onMessage);
    source.addEventListener("tick", onMessage);
    source.addEventListener("closed", onMessage);
    source.onerror = () => {
      lostOnce = true;
      // CLOSED: the server answered with an error, so the browser gives up; CONNECTING: it tries again by itself.
      setConnection(source.readyState === EventSource.CLOSED ? "failed" : "reconnecting");
    };
    return () => {
      source.close();
      playout.stop();
    };
  }, [league, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { load, connection, retry };
}
