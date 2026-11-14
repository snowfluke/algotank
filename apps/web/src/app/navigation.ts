// Client-side navigation without a router library. A page change is a pushState
// plus an event, and useRoute re-reads the path on that event and on back/forward.

import { useMemo, useSyncExternalStore, type MouseEvent } from "react";
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

export function navigate(path: string): void {
  movedInApp = true;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo(0, 0);
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
  if (movedInApp) window.history.back();
  else navigate(fallback);
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  return useMemo(() => parseRoute(pathname), [pathname]);
}
