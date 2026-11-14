// Accounts and sessions in the tables `account` and `session` (db/schema.ts). Every call reads
// the database, so the reset-password tool can change an account while the server runs.
//
// A session is stored by the SHA-256 hash of its token, so a copy of the database does not hold
// a token that signs anyone in.

import { createHash } from "node:crypto";
import { SQLiteError, type Database, type Statement } from "bun:sqlite";
import { MAIL_LANGUAGES, type AccountId, type MailLanguage } from "@game/arena";
import { PersistenceError } from "../arena-files.ts";
import { emailProblem, normalizeEmail } from "./credentials.ts";
import { AuthError } from "./errors.ts";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** An account keeps at most this many sessions; a new login ends the oldest. */
const MAX_SESSIONS_PER_ACCOUNT = 10;

export interface StoredAccount {
  readonly id: AccountId;
  /** Normalized (see credentials.ts). */
  readonly email: string;
  readonly passwordHash: string;
  /** ISO 8601. */
  readonly createdAt: string;
  /** The owner of the email showed they read it. Set only by markEmailVerified (the email-verification package sends the codes). */
  readonly emailVerified: boolean;
  /** The language of the page the account signed up on. Stored for later emails; nothing reads it yet. */
  readonly language: MailLanguage;
}

export interface StoredSession {
  readonly tokenHash: string;
  readonly accountId: AccountId;
  /** Milliseconds since 1970: SESSION_LIFETIME_MS after the sign-in. */
  readonly expiresAt: number;
}

interface AccountRow {
  readonly id: string;
  readonly email: string;
  readonly password_hash: string;
  readonly email_verified: number;
  readonly language: string;
  readonly created_at: number;
}

interface SessionRow {
  readonly token_hash: string;
  readonly account_id: string;
  readonly expires_at: number;
}

const ACCOUNT_COLUMNS = "id, email, password_hash, email_verified, language, created_at";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthStore {
  private readonly byId: Statement<AccountRow, [string]>;
  private readonly byEmail: Statement<AccountRow, [string]>;
  private readonly insertAccount: Statement<unknown, [string, string, string, number, string, number]>;
  private readonly setVerified: Statement<unknown, [string]>;
  private readonly setPasswordHash: Statement<unknown, [string, string]>;
  private readonly liveSession: Statement<SessionRow, [string, number]>;
  private readonly insertSession: Statement<unknown, [string, string, number]>;
  private readonly trimSessions: Statement<unknown, [string, string, number]>;
  private readonly deleteSession: Statement<unknown, [string]>;
  private readonly deleteSessionsOf: Statement<unknown, [string]>;
  private readonly deleteExpired: Statement<unknown, [number]>;

  constructor(
    private readonly db: Database,
    private readonly now: () => number,
  ) {
    this.byId = db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM account WHERE id = ?`);
    this.byEmail = db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM account WHERE email = ?`);
    this.insertAccount = db.prepare(`INSERT INTO account (${ACCOUNT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`);
    this.setVerified = db.prepare("UPDATE account SET email_verified = 1 WHERE id = ?");
    this.setPasswordHash = db.prepare("UPDATE account SET password_hash = ? WHERE id = ?");
    // A session is live while now < expires_at; deleteExpired removes the rest.
    this.liveSession = db.prepare("SELECT token_hash, account_id, expires_at FROM session WHERE token_hash = ? AND expires_at > ?");
    this.insertSession = db.prepare("INSERT INTO session (token_hash, account_id, expires_at) VALUES (?, ?, ?)");
    // rowid orders two sessions of the same millisecond by when they were added.
    this.trimSessions = db.prepare(
      "DELETE FROM session WHERE account_id = ? AND token_hash NOT IN (SELECT token_hash FROM session WHERE account_id = ? ORDER BY expires_at DESC, rowid DESC LIMIT ?)",
    );
    this.deleteSession = db.prepare("DELETE FROM session WHERE token_hash = ?");
    this.deleteSessionsOf = db.prepare("DELETE FROM session WHERE account_id = ?");
    this.deleteExpired = db.prepare("DELETE FROM session WHERE expires_at <= ?");
  }

  accountById(id: AccountId): StoredAccount | undefined {
    const row = this.byId.get(id);
    return row === null ? undefined : toAccount(row);
  }

  accountByEmail(normalizedEmail: string): StoredAccount | undefined {
    const row = this.byEmail.get(normalizedEmail);
    return row === null ? undefined : toAccount(row);
  }

  /** Throws AuthError("email_taken") when another account has the email, which the UNIQUE constraint guards. */
  addAccount(account: StoredAccount): void {
    try {
      this.insertAccount.run(account.id, account.email, account.passwordHash, account.emailVerified ? 1 : 0, account.language, Date.parse(account.createdAt));
    } catch (error) {
      if (error instanceof SQLiteError && error.code === "SQLITE_CONSTRAINT_UNIQUE") throw new AuthError("email_taken");
      throw error;
    }
  }

  /** Marks the account's email as verified. */
  markEmailVerified(id: AccountId): void {
    if (this.setVerified.run(id).changes === 0) throw new Error(`Account ${id} does not exist.`);
  }

  replacePasswordHash(id: AccountId, passwordHash: string): void {
    if (this.setPasswordHash.run(passwordHash, id).changes === 0) throw new Error(`Account ${id} does not exist.`);
  }

  /** The live session for a token, or undefined for an unknown or expired one. */
  sessionOf(token: string): StoredSession | undefined {
    const row = this.liveSession.get(hashToken(token), this.now());
    return row === null ? undefined : { tokenHash: row.token_hash, accountId: row.account_id, expiresAt: row.expires_at };
  }

  /** Adds a session for `token` and ends the oldest ones above MAX_SESSIONS_PER_ACCOUNT, in one transaction. */
  addSession(token: string, accountId: AccountId): void {
    this.db.transaction(() => {
      this.insertSession.run(hashToken(token), accountId, this.now() + SESSION_LIFETIME_MS);
      this.trimSessions.run(accountId, accountId, MAX_SESSIONS_PER_ACCOUNT);
    }).immediate();
  }

  endSession(token: string): void {
    this.deleteSession.run(hashToken(token));
  }

  /** Returns how many sessions ended. */
  endSessionsOf(accountId: AccountId): number {
    return this.deleteSessionsOf.run(accountId).changes;
  }

  dropExpiredSessions(): void {
    this.deleteExpired.run(this.now());
  }
}

function invalid(table: string, key: string, reason: string): PersistenceError {
  return new PersistenceError(`The row ${key} of the table ${table} is not valid: ${reason}`);
}

/** The CHECK constraints guard the types; this checks what they cannot (db/schema.ts). */
function toAccount(row: AccountRow): StoredAccount {
  if (normalizeEmail(row.email) !== row.email || emailProblem(row.email) !== null) throw invalid("account", row.id, "the email is not valid.");
  const language = MAIL_LANGUAGES.find((l) => l === row.language);
  if (language === undefined) throw invalid("account", row.id, `the language "${row.language}" is not en or id.`);
  const createdAt = new Date(row.created_at);
  if (Number.isNaN(createdAt.getTime())) throw invalid("account", row.id, "created_at is not a time.");
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: createdAt.toISOString(), emailVerified: row.email_verified === 1, language };
}
