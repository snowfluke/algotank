// Replays a recorded league stream (apps/server/scripts/perf-stream.ts writes one) as a live one: the
// `state` message, then one `tick` every state.tickMs, through the same nextLeagueLoad the page uses.
// For the kit harness only (MonthlyHarness.tsx, `stream=<url>`), so the board can be measured with
// hundreds of tanks that move every turn without a server.

import { useEffect, useState } from "react";
import type { CompactTick, LeagueLive } from "@game/arena";
import { nextLeagueLoad, type LeagueLiveLoad } from "./leagueLive.ts";

interface RecordedStream {
  readonly state: LeagueLive;
  readonly ticks: readonly CompactTick[];
}

/** `url` null replays nothing. The last turn stays on the board when the recording ends. */
export function useStreamReplay(url: string | null): LeagueLiveLoad | null {
  const [load, setLoad] = useState<LeagueLiveLoad | null>(null);
  useEffect(() => {
    if (url === null) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`The recorded stream ${url} answered ${response.status}.`);
        return response.json() as Promise<RecordedStream>;
      })
      .then(({ state, ticks }) => {
        if (cancelled) return;
        let at = 0;
        setLoad((current) => nextLeagueLoad(current ?? { kind: "connecting" }, { type: "state", state }, Date.now()));
        timer = setInterval(() => {
          const tick = ticks[at];
          if (tick === undefined) {
            if (timer !== null) clearInterval(timer);
            return;
          }
          at += 1;
          // The measuring script waits on this to count the turns it has seen.
          document.documentElement.dataset["replayTurn"] = String(at);
          setLoad((current) => (current === null ? current : nextLeagueLoad(current, { type: "tick", tick, own: null }, Date.now())));
        }, state.tickMs);
      })
      .catch((error: unknown) => console.error("The stream replay could not start:", error));
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [url]);
  return load;
}
