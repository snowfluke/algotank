// Accounts and sessions in memory, and, with a data directory, in
// <DATA_DIR>/auth/accounts.json and <DATA_DIR>/auth/sessions.json (0600 files in a
// 0700 directory). Every change is saved before memory changes, so a failed save
// leaves the old state and the request gets the error.
//
// A session is stored by the SHA-256 hash of its token, so a copy of the files
// does not hold a token that signs anyone in.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AccountId } from "@game/arena";
import { createPrivateDirectory, PersistenceError, writePrivateFileAtomically } from "../arena-files.ts";
import { isRecord } from "../http.ts";
import { emailProblem, normalizeEmail } from "./credentials.ts";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** An account keeps at most this many sessions; a new login ends the oldest. */
const MAX_SESSIONS_PER_ACCOUNT = 10;

/** The sessions file's version. */
const STORE_VERSION = 1;
/**
 * The accounts file's version. Version 2 added `emailVerified` (2026-11-13, for the "verified"
 * join policy of an owner's arena). A version 1 file is read with every email not verified, and
 * the next save writes version 2.
 */
const ACCOUNTS_VERSION = 2;
const ACCOUNTS_FILE = "accounts.json";
const SESSIONS_FILE = "sessions.json";
const TOKEN_HASH = /^[0-9a-f]{64}$/;

export interface StoredAccount {
  readonly id: AccountId;
  /** Normalized (see credentials.ts). */
  readonly email: string;
  readonly passwordHash: string;
  /** ISO 8601. */
  readonly createdAt: string;
  /** The owner of the email showed they read it. Set only by markEmailVerified (the email-verification package sends the codes). */
  readonly emailVerified: boolean;
}

export interface StoredSession {
  readonly tokenHash: string;
  readonly accountId: AccountId;
  /** Milliseconds since 1970. The session ends SESSION_LIFETIME_MS later. */
  readonly createdAt: number;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The one place the 30-day lifetime is applied. */
function isExpired(session: StoredSession, now: number): boolean {
  return now >= session.createdAt + SESSION_LIFETIME_MS;
}

export class AuthStore {
  private accounts: ReadonlyMap<AccountId, StoredAccount> = new Map();
  private accountIdByEmail: ReadonlyMap<string, AccountId> = new Map();
  private sessions: ReadonlyMap<string, StoredSession> = new Map();

  /**
   * Without `directory` everything stays in memory. With one, both files are read,
   * and a file that cannot be read or has a wrong shape throws a PersistenceError
   * that names it. Expired sessions are dropped at load.
   */
  constructor(
    readonly directory: string | null,
    private readonly now: () => number,
  ) {
    if (directory === null) return;
    createPrivateDirectory(directory);
    const accounts = readAccounts(join(directory, ACCOUNTS_FILE));
    this.setAccounts(accounts);
    this.sessions = readSessions(join(directory, SESSIONS_FILE), accounts);
    this.dropExpiredSessions();
  }

  accountById(id: AccountId): StoredAccount | undefined {
    return this.accounts.get(id);
  }

  accountByEmail(normalizedEmail: string): StoredAccount | undefined {
    const id = this.accountIdByEmail.get(normalizedEmail);
    return id === undefined ? undefined : this.accounts.get(id);
  }

  addAccount(account: StoredAccount): void {
    const next = new Map(this.accounts).set(account.id, account);
    this.saveAccounts(next);
    this.setAccounts(next);
  }

  /** Marks the account's email as verified. Saved before memory changes, like every change here. */
  markEmailVerified(id: AccountId): void {
    const account = this.accounts.get(id);
    if (account === undefined) throw new Error(`Account ${id} does not exist.`);
    if (account.emailVerified) return;
    const next = new Map(this.accounts).set(id, { ...account, emailVerified: true });
    this.saveAccounts(next);
    this.setAccounts(next);
  }

  replacePasswordHash(id: AccountId, passwordHash: string): void {
    const account = this.accounts.get(id);
    if (account === undefined) throw new Error(`Account ${id} does not exist.`);
    const next = new Map(this.accounts).set(id, { ...account, passwordHash });
    this.saveAccounts(next);
    this.setAccounts(next);
  }

  /** The live session for a token, or undefined for an unknown or expired one. */
  sessionOf(token: string): StoredSession | undefined {
    const session = this.sessions.get(hashToken(token));
    return session === undefined || isExpired(session, this.now()) ? undefined : session;
  }

  /** Adds a session for `token` and ends the oldest ones above MAX_SESSIONS_PER_ACCOUNT. */
  addSession(token: string, accountId: AccountId): void {
    const session: StoredSession = { tokenHash: hashToken(token), accountId, createdAt: this.now() };
    const next = new Map(this.sessions);
    const own = [...next.values()]
      .filter((s) => s.accountId === accountId)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const old of own.slice(0, Math.max(0, own.length - (MAX_SESSIONS_PER_ACCOUNT - 1)))) next.delete(old.tokenHash);
    next.set(session.tokenHash, session);
    this.replaceSessions(next);
  }

  endSession(token: string): void {
    const tokenHash = hashToken(token);
    if (!this.sessions.has(tokenHash)) return;
    const next = new Map(this.sessions);
    next.delete(tokenHash);
    this.replaceSessions(next);
  }

  /** Returns how many sessions ended. */
  endSessionsOf(accountId: AccountId): number {
    const next = new Map([...this.sessions].filter(([, s]) => s.accountId !== accountId));
    const ended = this.sessions.size - next.size;
    if (ended > 0) this.replaceSessions(next);
    return ended;
  }

  dropExpiredSessions(): void {
    const now = this.now();
    const next = new Map([...this.sessions].filter(([, s]) => !isExpired(s, now)));
    if (next.size !== this.sessions.size) this.replaceSessions(next);
  }

  private setAccounts(accounts: ReadonlyMap<AccountId, StoredAccount>): void {
    this.accounts = accounts;
    this.accountIdByEmail = new Map([...accounts.values()].map((a) => [a.email, a.id]));
  }

  private replaceSessions(next: ReadonlyMap<string, StoredSession>): void {
    if (this.directory !== null) {
      save(this.directory, SESSIONS_FILE, { version: STORE_VERSION, sessions: [...next.values()] });
    }
    this.sessions = next;
  }

  private saveAccounts(next: ReadonlyMap<AccountId, StoredAccount>): void {
    if (this.directory !== null) {
      save(this.directory, ACCOUNTS_FILE, { version: ACCOUNTS_VERSION, accounts: [...next.values()] });
    }
  }
}

function save(directory: string, name: string, content: unknown): void {
  try {
    writePrivateFileAtomically(directory, name, JSON.stringify(content));
  } catch (error) {
    throw new PersistenceError(`${join(directory, name)} could not be saved: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The parsed file, or null when it does not exist yet (the first start). */
function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PersistenceError(`The auth file ${path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function invalid(path: string, reason: string): PersistenceError {
  return new PersistenceError(`The auth file ${path} is not valid: ${reason}`);
}

function readAccounts(path: string): ReadonlyMap<AccountId, StoredAccount> {
  const raw = readJsonFile(path);
  const accounts = new Map<AccountId, StoredAccount>();
  if (raw === null) return accounts;
  const version = isRecord(raw) ? raw["version"] : undefined;
  if (!isRecord(raw) || (version !== 1 && version !== ACCOUNTS_VERSION) || !Array.isArray(raw["accounts"])) {
    throw invalid(path, `it must be { "version": ${ACCOUNTS_VERSION}, "accounts": [...] }.`);
  }
  const emails = new Set<string>();
  for (const [i, entry] of raw["accounts"].entries()) {
    if (
      !isRecord(entry) ||
      typeof entry["id"] !== "string" || entry["id"] === "" ||
      typeof entry["email"] !== "string" ||
      typeof entry["passwordHash"] !== "string" || entry["passwordHash"] === "" ||
      typeof entry["createdAt"] !== "string" || Number.isNaN(Date.parse(entry["createdAt"]))
    ) {
      throw invalid(path, `account ${i} needs an id, an email, a passwordHash and a createdAt date.`);
    }
    const email = entry["email"];
    if (normalizeEmail(email) !== email || emailProblem(email) !== null) throw invalid(path, `account ${i} has an email that is not valid.`);
    if (accounts.has(entry["id"]) || emails.has(email)) throw invalid(path, `account ${i} repeats an id or an email.`);
    emails.add(email);
    // Version 1 had no verification, so nobody's email was verified.
    const verified = version === 1 ? false : entry["emailVerified"];
    if (typeof verified !== "boolean") throw invalid(path, `account ${i} needs emailVerified as true or false.`);
    accounts.set(entry["id"], { id: entry["id"], email, passwordHash: entry["passwordHash"], createdAt: entry["createdAt"], emailVerified: verified });
  }
  return accounts;
}

function readSessions(path: string, accounts: ReadonlyMap<AccountId, StoredAccount>): ReadonlyMap<string, StoredSession> {
  const raw = readJsonFile(path);
  const sessions = new Map<string, StoredSession>();
  if (raw === null) return sessions;
  if (!isRecord(raw) || raw["version"] !== STORE_VERSION || !Array.isArray(raw["sessions"])) {
    throw invalid(path, `it must be { "version": ${STORE_VERSION}, "sessions": [...] }.`);
  }
  for (const [i, entry] of raw["sessions"].entries()) {
    if (
      !isRecord(entry) ||
      typeof entry["tokenHash"] !== "string" || !TOKEN_HASH.test(entry["tokenHash"]) ||
      typeof entry["accountId"] !== "string" ||
      typeof entry["createdAt"] !== "number" || !Number.isFinite(entry["createdAt"])
    ) {
      throw invalid(path, `session ${i} needs a tokenHash, an accountId and a createdAt time.`);
    }
    // Accounts are never deleted, so a session of an unknown account means the files do not belong together.
    if (!accounts.has(entry["accountId"])) throw invalid(path, `session ${i} belongs to an account that does not exist.`);
    if (sessions.has(entry["tokenHash"])) throw invalid(path, `session ${i} repeats a tokenHash.`);
    sessions.set(entry["tokenHash"], { tokenHash: entry["tokenHash"], accountId: entry["accountId"], createdAt: entry["createdAt"] });
  }
  return sessions;
}
