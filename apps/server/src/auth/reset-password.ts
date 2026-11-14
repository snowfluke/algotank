// Sets a new password for an account and ends its sessions. Run by the person who
// runs the server (apps/server/scripts/reset-password.ts), because a forgotten
// password cannot be recovered by email.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emailProblem, normalizeEmail, passwordProblem } from "./credentials.ts";
import { authErrorMessage } from "./errors.ts";
import { AUTH_FOLDER, SERVER_PID_FILE } from "./index.ts";
import { AuthStore } from "./store.ts";

/** A reason the reset did not happen. The message is safe to print: it holds no secret. */
class ResetError extends Error {}

export interface ResetResult {
  readonly email: string;
  readonly sessionsEnded: number;
}

export async function resetPassword(options: { dataDir: string; email: string; password: string }): Promise<ResetResult> {
  const directory = join(options.dataDir, AUTH_FOLDER);
  refuseWhileServerRuns(directory);

  const email = normalizeEmail(options.email);
  if (emailProblem(email) !== null) throw new ResetError(authErrorMessage("email_invalid"));
  const store = new AuthStore(directory, Date.now);
  const account = store.accountByEmail(email);
  if (account === undefined) throw new ResetError(`No account has the email ${email}.`);
  const problem = passwordProblem(options.password, email);
  if (problem !== null) throw new ResetError(authErrorMessage(problem));

  // The hash is replaced first: if ending the sessions then fails, the old password no longer works.
  store.replacePasswordHash(account.id, await Bun.password.hash(options.password));
  return { email, sessionsEnded: store.endSessionsOf(account.id) };
}

/**
 * A running server holds the accounts and sessions in memory: it would keep the old
 * sessions valid and write the old password hash back on its next save.
 */
function refuseWhileServerRuns(directory: string): void {
  const path = join(directory, SERVER_PID_FILE);
  if (!existsSync(path)) return;
  const pid = Number(readFileSync(path, "utf8"));
  if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) {
    throw new ResetError(
      `A server (process ${pid}) is using ${directory}. Stop it first. If no server runs, delete ${path} and try again.`,
    );
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 checks that the process exists and sends nothing
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
