// GET /api/public for the chooser: when the page opens, then every 5 s while the page is
// visible, and at once when it becomes visible again. A failed poll keeps the last good
// answer, because a line that is a few seconds old is still true enough to choose by.

import { useEffect, useState } from "react";
import { getPublicStatus } from "../api/client.ts";
import type { PublicStatusLoad } from "./liveLines.ts";

const PUBLIC_STATUS_POLL_MS = 5000;

export function usePublicStatus(): PublicStatusLoad {
  const [load, setLoad] = useState<PublicStatusLoad>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState === "visible";

    async function poll(): Promise<void> {
      clearTimeout(timer);
      const result = await getPublicStatus();
      if (!live) return;
      if (result.ok) {
        const startsInMs = result.data.tournament.startsInMs;
        setLoad({ kind: "ready", status: result.data, startsAt: startsInMs === null ? null : Date.now() + startsInMs });
      } else {
        setLoad((old) => (old.kind === "ready" ? old : { kind: "failed" }));
      }
      if (visible()) timer = setTimeout(() => void poll(), PUBLIC_STATUS_POLL_MS);
    }

    function onVisibility(): void {
      if (visible()) void poll();
      else clearTimeout(timer);
    }

    void poll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return load;
}
