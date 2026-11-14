// The email and password rules. Registration, the stored-file check and the
// reset script all use these, so each rule lives here only.

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type AuthErrorCode } from "@game/arena";

const EMAIL_MAX_LENGTH = 254;

// Whitespace and control characters are refused inside an address, because the
// email is shown to people and a hidden character would let two addresses look alike.
const WHITESPACE_OR_CONTROL = /[\s\p{Cc}\p{Cf}]/u;

/** Trimmed and lower-cased. Every lookup, comparison and stored email uses this form. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The problem with an email that is already normalized, or null. */
export function emailProblem(email: string): "email_invalid" | null {
  if ([...email].length > EMAIL_MAX_LENGTH) return "email_invalid";
  if (WHITESPACE_OR_CONTROL.test(email)) return "email_invalid";
  const parts = email.split("@");
  if (parts.length !== 2) return "email_invalid";
  const [local = "", domain = ""] = parts;
  if (local === "" || domain === "") return "email_invalid";
  // A dot with text on both sides, so "a@b." and "a@.b" are refused.
  const dot = domain.indexOf(".");
  if (dot <= 0 || domain.endsWith(".")) return "email_invalid";
  return null;
}

/**
 * The problem with a password, or null. Length counts characters (code points), not
 * UTF-16 units, so an emoji counts once. The comparison with the email ignores case
 * and surrounding spaces, because "Ada@example.org " would be as easy to guess as the email.
 */
export function passwordProblem(
  password: string,
  normalizedEmail: string,
): Extract<AuthErrorCode, "password_too_short" | "password_too_long" | "password_is_email"> | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "password_too_short";
  if (length > PASSWORD_MAX_LENGTH) return "password_too_long";
  if (normalizeEmail(password) === normalizedEmail) return "password_is_email";
  return null;
}
