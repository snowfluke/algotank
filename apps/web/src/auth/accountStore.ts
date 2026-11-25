// Who is signed in on this browser, and the one arena that account owns. One store
// for the whole app, so the header, the create page, the room and the presenter
// page agree. The session itself is an HttpOnly cookie the page cannot read, so
// the store asks GET /api/auth/me.
//
// | From       | Event                         | To                                  |
// |------------|-------------------------------|-------------------------------------|
// | unknown    | /me answers without account   | signedOut                           |
// | unknown    | /me answers with an account   | signedIn, own arena loading         |
// | unknown    | /me fails                     | unreachable                         |
// | unreachable| refresh                       | unknown                             |
// | signedOut  | sign-in or sign-up succeeds   | signedIn, own arena loading         |
// | signedIn   | own arena answers or fails    | signedIn, own arena ready or failed |
// | signedIn   | create, close (refreshOwn)    | signedIn, own arena loading         |
// | signedIn   | email verified (code step)    | signedIn, same own arena            |
// | signedIn   | sign-out succeeds             | signedOut                           |
// | signedIn   | a route answers not_signed_in | signedOut (the session ended)       |
// No state is terminal. Nothing is fetched at import time, so a static render
// (tests) sees "unknown" and draws the signed-out header without a request.

import { useEffect, useSyncExternalStore } from "react";
import type { OwnArenaResponse, PublicAccount } from "@game/arena";
import { getMe, getOwnArena, logout, type ApiFailure } from "../api/client.ts";
import { IS_OFFLINE } from "../offline/target.ts";

export type OwnArena = OwnArenaResponse["arena"];

export type OwnArenaState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly arena: OwnArena }
  | { readonly kind: "failed"; readonly failure: ApiFailure };

export type AccountState =
  | { readonly kind: "unknown" }
  | { readonly kind: "unreachable"; readonly failure: ApiFailure }
  | { readonly kind: "signedOut" }
  | { readonly kind: "signedIn"; readonly account: PublicAccount; readonly own: OwnArenaState };

let state: AccountState = { kind: "unknown" };
let started = false;
/** Bumped on every change of account, so a late answer for an earlier account is dropped. */
let generation = 0;
const listeners = new Set<() => void>();

function set(next: AccountState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = (): AccountState => state;

async function loadOwnArena(account: PublicAccount, at: number): Promise<void> {
  const result = await getOwnArena();
  if (at !== generation) return;
  if (!result.ok && result.code === "not_signed_in") {
    markSignedOut();
    return;
  }
  set({ kind: "signedIn", account, own: result.ok ? { kind: "ready", arena: result.data.arena } : { kind: "failed", failure: result } });
}

/** Asks the server who is signed in. The pages call it through useAccount. */
export async function refreshAccount(): Promise<void> {
  started = true;
  // Offline there are no accounts, so the device copies of the play styles and the tank are the only ones.
  if (IS_OFFLINE) {
    set({ kind: "signedOut" });
    return;
  }
  const at = ++generation;
  if (state.kind === "unreachable") set({ kind: "unknown" });
  const result = await getMe();
  if (at !== generation) return;
  if (!result.ok) {
    set({ kind: "unreachable", failure: result });
    return;
  }
  if (result.data.account === null) {
    set({ kind: "signedOut" });
    return;
  }
  set({ kind: "signedIn", account: result.data.account, own: { kind: "loading" } });
  await loadOwnArena(result.data.account, at);
}

/** After sign-in or sign-up: the answer names the account, so no /me request is needed. */
export function markSignedIn(account: PublicAccount): void {
  started = true;
  const at = ++generation;
  set({ kind: "signedIn", account, own: { kind: "loading" } });
  void loadOwnArena(account, at);
}

/** After the code step verified the email: the same account with emailVerified true, and the own arena as it was. */
export function markEmailVerified(account: PublicAccount): void {
  if (state.kind !== "signedIn" || state.account.id !== account.id) {
    markSignedIn(account);
    return;
  }
  set({ ...state, account });
}

/** After a route answered not_signed_in: the session expired or ended elsewhere. */
export function markSignedOut(): void {
  started = true;
  generation++;
  set({ kind: "signedOut" });
}

/** After the account created or closed an arena. */
export function refreshOwnArena(): void {
  if (state.kind !== "signedIn") return;
  const at = ++generation;
  const account = state.account;
  set({ kind: "signedIn", account, own: { kind: "loading" } });
  void loadOwnArena(account, at);
}

/** Returns the failure, or null when the session ended. */
export async function signOut(): Promise<ApiFailure | null> {
  const result = await logout();
  if (!result.ok) return result;
  markSignedOut();
  return null;
}

/** The account state. The first page that mounts asks the server once. */
export function useAccount(): AccountState {
  const current = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    if (!started) void refreshAccount();
  }, []);
  return current;
}

/** True when the signed-in account owns this arena. False while the answer is unknown. */
export function ownsArena(account: AccountState, arenaId: string): boolean {
  return account.kind === "signedIn" && account.own.kind === "ready" && account.own.arena?.id === arenaId;
}
