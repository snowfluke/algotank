// Who may open the host's pages (/admin/metrics, /admin/players): a signed-in account whose email
// is in ADMIN_EMAILS and, when the server sends email, whose email is verified. Everyone else gets
// the same 404 as a route that does not exist, so an admin route tells a visitor nothing.

import type { Account, Auth } from "./auth/index.ts";
import { HttpError } from "./http.ts";

export interface AdminGate {
  readonly auth: Auth;
  /** ADMIN_EMAILS, normalized (auth/credentials.ts normalizeEmail). */
  readonly adminEmails: ReadonlySet<string>;
  /** The server sends email, so an admin's email must be verified. */
  readonly mailOn: boolean;
}

function notFound(): HttpError {
  return new HttpError(404, "That route does not exist.");
}

/** The admin's account, or the 404 of a missing route. */
export function requireAdmin(gate: AdminGate, req: Request): Account {
  const account = gate.auth.accountOf(req);
  if (account === null || !gate.adminEmails.has(account.email) || (gate.mailOn && !account.emailVerified)) throw notFound();
  return account;
}
