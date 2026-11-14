// Whether this server can send email (GET /api/auth/capabilities). Asked once per page load and
// shared, because the sign-in form, the account menu, the verify page and the create form all
// read it, and the server's settings do not change while it runs.
//
// | From     | Event                | To                    |
// |----------|----------------------|-----------------------|
// | unknown  | the answer arrives   | ready (canSendEmail)  |
// | unknown  | the request fails    | failed                |
// | failed   | a page mounts again  | unknown (asks again)  |
// "ready" is terminal for the page load.

import { useEffect, useSyncExternalStore } from "react";
import { getAuthCapabilities } from "../api/client.ts";

export type MailCapability = { readonly kind: "unknown" } | { readonly kind: "failed" } | { readonly kind: "ready"; readonly canSendEmail: boolean };

let state: MailCapability = { kind: "unknown" };
let asking = false;
const listeners = new Set<() => void>();

function set(next: MailCapability): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = (): MailCapability => state;

async function ask(): Promise<void> {
  if (asking || state.kind === "ready") return;
  asking = true;
  const result = await getAuthCapabilities();
  asking = false;
  set(result.ok ? { kind: "ready", canSendEmail: result.data.canSendEmail } : { kind: "failed" });
}

export function useMailCapability(): MailCapability {
  const current = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    void ask();
  }, []);
  return current;
}

/** True only when the server said it can send email. Unknown and failed count as not yet. */
export function canSendEmail(capability: MailCapability): boolean {
  return capability.kind === "ready" && capability.canSendEmail;
}

/** True only when the server said it cannot. */
export function cannotSendEmail(capability: MailCapability): boolean {
  return capability.kind === "ready" && !capability.canSendEmail;
}
