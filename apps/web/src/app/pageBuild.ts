// Whether this tab runs an older release than the server. Vite names the page's entry script by
// its content, so the address of the script that loaded this page is its build; every API answer
// names the server's (x-page-build, server static.ts pageBuildOf). A tab left open across a
// release kept old code that removed a tank at "Ubah aturan" (owner, 2026-11-16), so the page
// offers a reload (NewVersionBanner.tsx). Without a built page (the dev server) nothing happens.

import { IS_OFFLINE } from "../offline/target.ts";

type Listener = () => void;

let older = false;
const listeners = new Set<Listener>();

/** The built entry script of the page in this tab, or null on the dev server. */
function ownBuild(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLScriptElement>('script[type="module"][src^="/assets/"]')?.getAttribute("src") ?? null;
}

/** True when the server names a build and it is not the one this page runs. */
export function isOlderPage(own: string | null, server: string | null): boolean {
  return own !== null && server !== null && own !== server;
}

/** Called with each API answer's x-page-build. Once older, the page stays older until it reloads. */
export function notePageBuild(server: string | null): void {
  if (older || !isOlderPage(ownBuild(), server)) return;
  older = true;
  for (const listener of listeners) listener();
}

/** Asks the server for its build: after a stream comes back, which is when a release restarted it. */
export function checkPageBuild(): void {
  if (IS_OFFLINE) return;
  // A failed check says nothing about the build; the next API answer brings it again.
  fetch("/api/health").then(
    (response) => notePageBuild(response.headers.get("x-page-build")),
    () => undefined,
  );
}

export const pageBuildStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isOlder: (): boolean => older,
};
