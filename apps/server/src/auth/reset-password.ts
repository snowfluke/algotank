// Sets a new password for an account and ends its sessions. Run by the person who
// runs the server (apps/server/scripts/reset-password.ts), because a forgotten
// password cannot be recovered by email.
//
// It may run while the server runs: the server reads the account and its sessions from
// the database on each request, and SQLite lets one writer at a time in (busy_timeout).

import { openDatabase } from "../db/open.ts";
import { emailProblem, normalizeEmail, passwordProblem } from "./credentials.ts";
import { authErrorMessage } from "./errors.ts";
import { AuthStore } from "./store.ts";

/** A reason the reset did not happen. The message is safe to print: it holds no secret. */
class ResetError extends Error {}

export interface ResetResult {
  readonly email: string;
  readonly sessionsEnded: number;
}

export async function resetPassword(options: { dataDir: string; email: string; password: string }): Promise<ResetResult> {
  const email = normalizeEmail(options.email);
  if (emailProblem(email) !== null) throw new ResetError(authErrorMessage("email_invalid"));
  const db = openDatabase({ kind: "file", dataDir: options.dataDir });
  try {
    const store = new AuthStore(db, Date.now);
    const account = store.accountByEmail(email);
    if (account === undefined) throw new ResetError(`No account has the email ${email}.`);
    const problem = passwordProblem(options.password, email);
    if (problem !== null) throw new ResetError(authErrorMessage(problem));

    const passwordHash = await Bun.password.hash(options.password);
    // One transaction, so the old sessions cannot outlive the old password.
    const sessionsEnded = db.transaction(() => {
      store.replacePasswordHash(account.id, passwordHash);
      return store.endSessionsOf(account.id);
    }).immediate();
    return { email, sessionsEnded };
  } finally {
    db.close();
  }
}
