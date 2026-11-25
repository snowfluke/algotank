// Client-side navigation without a router library. A page change is a pushState
// plus an event, and useRoute re-reads the path on that event and on back/forward.
// The offline build keeps the path in memory and never touches the address (offline/target.ts).

import { useMemo, useSyncExternalStore, type MouseEvent } from "react";
import { IS_OFFLINE, OFFLINE_START_PATH, isOfflinePage } from "../offline/target.ts";
import { parseRoute, type Route } from "./route.ts";

const NAVIGATE_EVENT = "app:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

/** True once this tab has changed page inside the app, so "back" stays in the app. */
let movedInApp = false;

/** Offline only: the pages visited, the current one last, each as a path with its search. */
const offlineHistory: string[] = [OFFLINE_START_PATH];

function splitPath(path: string): { readonly pathname: string; readonly search: string } {
  const at = path.indexOf("?");
  return at === -1 ? { pathname: path, search: "" } : { pathname: path.slice(0, at), search: path.slice(at) };
}

function currentOfflinePath(): string {
  return offlineHistory[offlineHistory.length - 1] ?? OFFLINE_START_PATH;
}

function changed(): void {
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo(0, 0);
}

export function navigate(path: string): void {
  movedInApp = true;
  if (IS_OFFLINE) {
    // A page that needs the server opens the workshop, so a link to it never shows a broken page.
    offlineHistory.push(isOfflinePage(parseRoute(splitPath(path).pathname).page) ? path : OFFLINE_START_PATH);
  } else {
    window.history.pushState(null, "", path);
  }
  changed();
}

/**
 * onClick for an <a> to a page of this app: changes page without a reload. A
 * click with a modifier key or a middle click keeps the browser's own behaviour
 * (a new tab), and so does a link to another site.
 */
export function followLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.currentTarget;
  if (link.target !== "" && link.target !== "_self") return;
  if (link.origin !== window.location.origin) return;
  event.preventDefault();
  navigate(`${link.pathname}${link.search}${link.hash}`);
}

/** Returns to the page before, or opens `fallback` when this page was the first one in the tab (a shared link). */
export function goBack(fallback: string): void {
  if (IS_OFFLINE && offlineHistory.length > 1) {
    offlineHistory.pop();
    changed();
  } else if (!IS_OFFLINE && movedInApp) window.history.back();
  else navigate(fallback);
}

/** The search part of the current page's path, such as "?section=items", or "". */
export function currentSearch(): string {
  return IS_OFFLINE ? splitPath(currentOfflinePath()).search : window.location.search;
}

/** Replaces the search part of the current page without a new history entry or a page change. */
export function replaceSearch(search: string): void {
  if (IS_OFFLINE) {
    offlineHistory[offlineHistory.length - 1] = `${splitPath(currentOfflinePath()).pathname}${search}`;
    return;
  }
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}`);
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => (IS_OFFLINE ? splitPath(currentOfflinePath()).pathname : window.location.pathname));
  return useMemo(() => parseRoute(pathname), [pathname]);
}
