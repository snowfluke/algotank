// The offline build (`vite build --mode offline`, scripts/pack-offline.sh): a static copy of the tank
// workshop for game portals that serve a ZIP and block every request outside it (owner, 2026-11-25).
// It has no game server, so it sends no request, keeps the page in memory instead of the address
// (a portal's iframe may forbid history changes, and a reload there must find index.html), and
// shows only the pages that run in the browser. Every offline branch in the client reads IS_OFFLINE,
// so `grep -rn IS_OFFLINE src` lists them.

import type { Route } from "../app/route.ts";

export type BuildTarget = "server" | "offline";

// Vite sets MODE from --mode. Bun's test runner has no Vite env, so an unset MODE is the server build.
export const BUILD_TARGET: BuildTarget = import.meta.env.MODE === "offline" ? "offline" : "server";
export const IS_OFFLINE = BUILD_TARGET === "offline";

/** The pages that need no server. Any other page opens the workshop in the offline build. */
const OFFLINE_PAGES: ReadonlySet<Route["page"]> = new Set(["workshop", "myTank", "catalogue", "rules"]);

export const OFFLINE_START_PATH = "/workshop";

export function isOfflinePage(page: Route["page"]): boolean {
  return OFFLINE_PAGES.has(page);
}

/** The folder the build is served from: "./" offline, "/" on the server and in tests. */
export function assetUrl(path: `/${string}`): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}${path.slice(1)}`;
}
