// Whether the signed-in account is an admin (GET /api/admin/me: 200 for an admin, 404 for anyone
// else), so the account menu can link to the admin pages (owner, 2026-11-17). The links are a
// convenience: every admin route checks the account on the server. Asked once per account in a
// page load; a network failure is not remembered, so the next menu asks again.

import { useEffect, useState } from "react";

const known = new Map<string, boolean>();

export function useIsAdmin(accountId: string | null): boolean {
  const [admin, setAdmin] = useState(() => accountId !== null && known.get(accountId) === true);
  useEffect(() => {
    if (accountId === null) {
      setAdmin(false);
      return;
    }
    const cached = known.get(accountId);
    if (cached !== undefined) {
      setAdmin(cached);
      return;
    }
    let live = true;
    fetch("/api/admin/me")
      .then((response) => {
        known.set(accountId, response.ok);
        if (live) setAdmin(response.ok);
      })
      .catch((error: unknown) => {
        console.error("The account menu could not ask whether this account is an admin:", error);
        if (live) setAdmin(false);
      });
    return () => {
      live = false;
    };
  }, [accountId]);
  return admin;
}
