// The live email codes: at most one per account and purpose ("verify" for the email check,
// "reset" for a new password). In memory, and with a data directory also in
// <DATA_DIR>/auth/codes.json (0600), saved before memory changes, like the other auth files.
//
// A code is kept only as a slow password hash (Bun.password, argon2id), with its expiry and its
// count of wrong tries; the code itself is never stored or logged. A 6-digit code has a million
// values, so a fast hash such as SHA-256 would give the code back from a copy of the file in under
// a second; with argon2id at about 50 ms per try a million tries take hours, and the code is dead
// after 15 minutes.
//
// Kept in its own file, so accounts.json keeps version 2 and a restart keeps a code that was sent.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AccountId } from "@game/arena";
import { PersistenceError, writePrivateFileAtomically } from "../arena-files.ts";
import { isRecord } from "../http.ts";

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

const CODES_FILE = "codes.json";
const CODES_VERSION = 1;

const keyOf = (accountId: AccountId, purpose: CodePurpose) => `${purpose}:${accountId}`;

export class CodeStore {
  private codes: ReadonlyMap<string, StoredCode> = new Map();

  /** `accountExists` checks the file against the accounts, so a code of an unknown account is a damaged file. */
  constructor(
    private readonly directory: string | null,
    private readonly now: () => number,
    accountExists: (id: AccountId) => boolean,
  ) {
    if (directory === null) return;
    this.codes = readCodes(join(directory, CODES_FILE), accountExists);
  }

  /** The code that still works, or undefined when there is none, it expired, or its tries are used up. */
  live(accountId: AccountId, purpose: CodePurpose): StoredCode | undefined {
    const code = this.codes.get(keyOf(accountId, purpose));
    if (code === undefined || this.now() >= code.expiresAt || code.wrongTries >= CODE_MAX_WRONG_TRIES) return undefined;
    return code;
  }

  /** Puts a new code in the place of the old one, which stops working. */
  put(accountId: AccountId, purpose: CodePurpose, codeHash: string): void {
    const code: StoredCode = { accountId, purpose, codeHash, expiresAt: this.now() + CODE_LIFETIME_MS, wrongTries: 0 };
    this.replace(new Map(this.codes).set(keyOf(accountId, purpose), code));
  }

  /**
   * Counts one try as wrong before the slow hash check, so parallel guesses cannot pass the
   * limit; a right code is dropped right after. Returns the code with the new count.
   */
  countTry(code: StoredCode): StoredCode {
    const next = { ...code, wrongTries: code.wrongTries + 1 };
    this.replace(new Map(this.codes).set(keyOf(code.accountId, code.purpose), next));
    return next;
  }

  /** True while `code` is still the account's code for its purpose (no new code replaced it). */
  isCurrent(code: StoredCode): boolean {
    return this.codes.get(keyOf(code.accountId, code.purpose))?.codeHash === code.codeHash;
  }

  drop(accountId: AccountId, purpose: CodePurpose): void {
    const key = keyOf(accountId, purpose);
    if (!this.codes.has(key)) return;
    const next = new Map(this.codes);
    next.delete(key);
    this.replace(next);
  }

  /** Drops codes that expired or are used up, so the file does not grow. */
  dropDead(): void {
    const now = this.now();
    const next = new Map([...this.codes].filter(([, c]) => now < c.expiresAt && c.wrongTries < CODE_MAX_WRONG_TRIES));
    if (next.size !== this.codes.size) this.replace(next);
  }

  private replace(next: ReadonlyMap<string, StoredCode>): void {
    if (this.directory !== null) {
      try {
        writePrivateFileAtomically(this.directory, CODES_FILE, JSON.stringify({ version: CODES_VERSION, codes: [...next.values()] }));
      } catch (error) {
        throw new PersistenceError(`${join(this.directory, CODES_FILE)} could not be saved: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.codes = next;
  }
}

function readCodes(path: string, accountExists: (id: AccountId) => boolean): ReadonlyMap<string, StoredCode> {
  const codes = new Map<string, StoredCode>();
  if (!existsSync(path)) return codes;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The auth file ${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const invalid = (reason: string) => new PersistenceError(`The auth file ${path} is not valid: ${reason}`);
  if (!isRecord(raw) || raw["version"] !== CODES_VERSION || !Array.isArray(raw["codes"])) {
    throw invalid(`it must be { "version": ${CODES_VERSION}, "codes": [...] }.`);
  }
  for (const [i, entry] of raw["codes"].entries()) {
    const purpose = isRecord(entry) ? PURPOSES.find((p) => p === entry["purpose"]) : undefined;
    if (
      !isRecord(entry) ||
      purpose === undefined ||
      typeof entry["accountId"] !== "string" ||
      typeof entry["codeHash"] !== "string" || entry["codeHash"] === "" ||
      typeof entry["expiresAt"] !== "number" || !Number.isFinite(entry["expiresAt"]) ||
      typeof entry["wrongTries"] !== "number" || !Number.isInteger(entry["wrongTries"]) || entry["wrongTries"] < 0
    ) {
      throw invalid(`code ${i} needs an accountId, a purpose, a codeHash, an expiresAt time and a count of wrongTries.`);
    }
    if (!accountExists(entry["accountId"])) throw invalid(`code ${i} belongs to an account that does not exist.`);
    const key = keyOf(entry["accountId"], purpose);
    if (codes.has(key)) throw invalid(`code ${i} repeats an account and purpose.`);
    codes.set(key, { accountId: entry["accountId"], purpose, codeHash: entry["codeHash"], expiresAt: entry["expiresAt"], wrongTries: entry["wrongTries"] });
  }
  return codes;
}
