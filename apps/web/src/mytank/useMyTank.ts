// The one "My tank" of this browser, connected to the account the app knows about.
// The header, the editor, the join steps and the arena all read it here.

import { useEffect, useSyncExternalStore } from "react";
import { getAccountTank, putAccountTank } from "../api/client.ts";
import { PREFERENCE_KEYS } from "../app/preferences.ts";
import { useAccount } from "../auth/accountStore.ts";
import { browserStore } from "../session/storage.ts";
import { browserClock } from "../ui/timer.ts";
import { MyTankStore, type MyTankSnapshot } from "./myTank.ts";

export const myTankStore = new MyTankStore(browserStore(), { get: getAccountTank, put: putAccountTank }, browserClock, Math.random);

if (typeof window !== "undefined") {
  // Another tab of this browser changed the tank.
  window.addEventListener("storage", (event) => {
    if (event.key === PREFERENCE_KEYS.myTank || event.key === null) myTankStore.reload();
  });
  window.addEventListener("online", myTankStore.online);
}

/** The player's tank and the state of the account copy. Signing in or out connects the store. */
export function useMyTank(): MyTankSnapshot {
  const account = useAccount();
  const accountId = account.kind === "signedIn" ? account.account.id : account.kind === "signedOut" ? null : undefined;
  useEffect(() => {
    // "unknown" and "unreachable" leave the connection as it is: the device copy keeps working.
    if (accountId !== undefined) myTankStore.connect(accountId);
  }, [accountId]);
  return useSyncExternalStore(myTankStore.subscribe, myTankStore.getSnapshot, myTankStore.getSnapshot);
}
