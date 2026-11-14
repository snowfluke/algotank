// The one library of this browser, connected to the account the app knows about.
// Both the workshop and the arena's "Mine" call useLibrary, so a player who signs in
// on a second device and goes straight to an arena still gets their play styles.

import { useEffect, useSyncExternalStore } from "react";
import { deleteAccountStrategy, getAccountStrategies, putAccountStrategy } from "../api/client.ts";
import { useAccount } from "../auth/accountStore.ts";
import { browserStore } from "../session/storage.ts";
import { browserClock } from "../ui/timer.ts";
import { LIBRARY_KEY, PlayStyleLibrary, type LibrarySnapshot } from "./library.ts";

export const playStyleLibrary = new PlayStyleLibrary(
  browserStore(),
  { list: getAccountStrategies, put: putAccountStrategy, remove: deleteAccountStrategy },
  browserClock,
  () => crypto.randomUUID(),
);

if (typeof window !== "undefined") {
  // Another tab of this browser (a workshop tab beside an arena tab) changed the styles.
  window.addEventListener("storage", (event) => {
    if (event.key === LIBRARY_KEY || event.key === null) playStyleLibrary.reload();
  });
  window.addEventListener("online", playStyleLibrary.online);
}

/** The play styles and the state of the account copy. Signing in or out connects the library. */
export function useLibrary(): LibrarySnapshot {
  const account = useAccount();
  const accountId = account.kind === "signedIn" ? account.account.id : account.kind === "signedOut" ? null : undefined;
  useEffect(() => {
    // "unknown" and "unreachable" leave the connection as it is: the device copy keeps working.
    if (accountId !== undefined) playStyleLibrary.connect(accountId);
  }, [accountId]);
  return useSyncExternalStore(playStyleLibrary.subscribe, playStyleLibrary.getSnapshot, playStyleLibrary.getSnapshot);
}
