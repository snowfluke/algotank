// The live email codes in the table `email_code`: at most one per account and purpose ("verify"
// for the email check, "reset" for a new password), read from the database on each call.
//
// A code is kept only as a slow password hash (Bun.password, argon2id), with its expiry and its
// count of wrong tries; the code itself is never stored or logged. A 6-digit code has a million
// values, so a fast hash such as SHA-256 would give the code back from a copy of the database in
// under a second; with argon2id at about 50 ms per try a million tries take hours, and the code is
// dead after 15 minutes.

import type { Database, Statement } from "bun:sqlite";
import type { AccountId } from "@game/arena";
import { PersistenceError } from "../arena-files.ts";

const CODE_LIFETIME_MS = 15 * 60 * 1000;
/** Wrong tries one code allows; the fifth wrong try ends it. */
export const CODE_MAX_WRONG_TRIES = 5;

export type CodePurpose = "verify" | "reset";
const PURPOSES: readonly CodePurpose[] = ["verify", "reset"];

export interface StoredCode {
  readonly accountId: AccountId;
  readonly purpose: CodePurpose;
  readonly codeHash: string;
  /** Milliseconds since 1970. The code works while now < expiresAt. */
  readonly expiresAt: number;
  readonly wrongTries: number;
}

interface CodeRow {
  readonly account_id: string;
  readonly purpose: string;
  readonly code_hash: string;
  readonly expires_at: number;
  readonly attempts: number;
}

export class CodeStore {
  private readonly selectCode: Statement<CodeRow, [string, string]>;
  private readonly upsertCode: Statement<unknown, [string, string, string, number, number]>;
  private readonly addAttempt: Statement<CodeRow, [string, string]>;
  private readonly deleteCode: Statement<unknown, [string, string]>;
  private readonly deleteDead: Statement<unknown, [number, number]>;

  constructor(
    db: Database,
    private readonly now: () => number,
  ) {
    const columns = "account_id, purpose, code_hash, expires_at, attempts";
    this.selectCode = db.prepare(`SELECT ${columns} FROM email_code WHERE account_id = ? AND purpose = ?`);
    // A new code takes the place of the old one, which stops working.
    this.upsertCode = db.prepare(
      `INSERT INTO email_code (account_id, purpose, code_hash, attempts, expires_at, sent_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)
       ON CONFLICT (account_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, sent_at = excluded.sent_at`,
    );
    this.addAttempt = db.prepare(`UPDATE email_code SET attempts = attempts + 1 WHERE account_id = ? AND purpose = ? RETURNING ${columns}`);
    this.deleteCode = db.prepare("DELETE FROM email_code WHERE account_id = ? AND purpose = ?");
    this.deleteDead = db.prepare("DELETE FROM email_code WHERE expires_at <= ? OR attempts >= ?");
  }

  /** The code that still works, or undefined when there is none, it expired, or its tries are used up. */
  live(accountId: AccountId, purpose: CodePurpose): StoredCode | undefined {
    const row = this.selectCode.get(accountId, purpose);
    if (row === null) return undefined;
    const code = toCode(row);
    if (this.now() >= code.expiresAt || code.wrongTries >= CODE_MAX_WRONG_TRIES) return undefined;
    return code;
  }

  /** Puts a new code in the place of the old one, which stops working. */
  put(accountId: AccountId, purpose: CodePurpose, codeHash: string): void {
    const sentAt = this.now();
    this.upsertCode.run(accountId, purpose, codeHash, sentAt + CODE_LIFETIME_MS, sentAt);
  }

  /**
   * Counts one try as wrong before the slow hash check, so parallel guesses cannot pass the
   * limit; a right code is dropped right after. Returns the code with the new count.
   */
  countTry(code: StoredCode): StoredCode {
    const row = this.addAttempt.get(code.accountId, code.purpose);
    // The callers read the code in the same synchronous step, so nothing can have dropped it.
    if (row === null) throw new Error(`The ${code.purpose} code of account ${code.accountId} disappeared before its try was counted.`);
    return toCode(row);
  }

  /** True while `code` is still the account's code for its purpose (no new code replaced it). */
  isCurrent(code: StoredCode): boolean {
    return this.selectCode.get(code.accountId, code.purpose)?.code_hash === code.codeHash;
  }

  drop(accountId: AccountId, purpose: CodePurpose): void {
    this.deleteCode.run(accountId, purpose);
  }

  /** Drops codes that expired or are used up, so the table does not grow. */
  dropDead(): void {
    this.deleteDead.run(this.now(), CODE_MAX_WRONG_TRIES);
  }
}

function toCode(row: CodeRow): StoredCode {
  const purpose = PURPOSES.find((p) => p === row.purpose);
  const key = `${row.account_id}/${row.purpose}`;
  if (purpose === undefined) throw new PersistenceError(`The row ${key} of the table email_code is not valid: the purpose is not verify or reset.`);
  return { accountId: row.account_id, purpose, codeHash: row.code_hash, expiresAt: row.expires_at, wrongTries: row.attempts };
}
