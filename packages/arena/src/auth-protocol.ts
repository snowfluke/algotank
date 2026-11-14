// The messages between the browser and the server for accounts and sign-in.
// The server sets the session as an HttpOnly cookie, so no token appears here.
//
// POST /api/auth/register  RegisterRequest -> AccountResponse and the session cookie;
//                          400 (email_invalid, password_too_short, password_too_long, password_is_email),
//                          409 email_taken, 429 rate_limited
// POST /api/auth/login     LoginRequest -> AccountResponse and a new session cookie;
//                          401 invalid_credentials (also for an unknown email), 429 rate_limited
// POST /api/auth/logout    -> 204, also when no session exists; 403 bad_origin
// GET  /api/auth/me        -> MeResponse (account null when not signed in)
// GET  /api/auth/capabilities -> AuthCapabilities: whether this server can send email (SMTP settings)
//
// Email codes (6 digits, valid 15 minutes, 5 wrong tries; a new code ends the old one). Sending a
// code: at most 1 per minute and 5 per hour per account, and for a reset also per client address.
// POST /api/auth/register  also takes `language`; the answer is RegisterResponse, which says whether
//                          the verification code went out ("sent", "failed", or "off" without mail)
// POST /api/auth/verify/send (account) SendCodeRequest -> 204; 409 already_verified, 503 mail_off,
//                          429 rate_limited, 502 mail_failed
// POST /api/auth/verify    (account) VerifyEmailRequest -> AccountResponse (emailVerified true);
//                          400 code_wrong (tries left), 400 code_expired (no live code: expired, used
//                          up, replaced or never sent). An already verified account gets the account.
// POST /api/auth/reset/send ResetSendRequest -> 202 ResetSendResponse, the same answer whether the
//                          email has an account or not; 429 rate_limited per client address only,
//                          503 mail_off
// POST /api/auth/reset     ResetPasswordRequest -> AccountResponse and a new session cookie; every
//                          other session of the account ends; 400 code_invalid (one code for a wrong,
//                          expired or missing code and an unknown email), 400 password problems, 503 mail_off

export type AccountId = string;
export interface PublicAccount {
  readonly id: AccountId;
  readonly email: string;
  /** The owner of the account entered a code sent to this email (or reset the password with one). */
  readonly emailVerified: boolean;
}
/** The language of the page, so an email the request causes is written in it. */
export type MailLanguage = "en" | "id";
export const MAIL_LANGUAGES = ["en", "id"] as const satisfies readonly MailLanguage[];
export interface LoginRequest { readonly email: string; readonly password: string }
export interface RegisterRequest extends LoginRequest { readonly language?: MailLanguage }
/** What happened to the verification code of a new account. */
export type VerificationEmail = "sent" | "failed" | "off";
export interface RegisterResponse { readonly account: PublicAccount; readonly verificationEmail: VerificationEmail }
export interface AuthCapabilities { readonly canSendEmail: boolean }
export interface SendCodeRequest { readonly language?: MailLanguage }
export interface VerifyEmailRequest { readonly code: string }
export interface ResetSendRequest { readonly email: string; readonly language?: MailLanguage }
/** Always the same, so the answer does not tell whether the email has an account. */
export interface ResetSendResponse { readonly accepted: true }
export interface ResetPasswordRequest { readonly email: string; readonly code: string; readonly password: string }
/** The six digits a code email carries. */
export const EMAIL_CODE_LENGTH = 6;
export interface AccountResponse { readonly account: PublicAccount }
export interface MeResponse { readonly account: PublicAccount | null }
export type AuthErrorCode =
  | "email_invalid" | "password_too_short" | "password_too_long" | "password_is_email"
  | "email_taken" | "invalid_credentials" | "rate_limited" | "not_signed_in" | "bad_origin"
  | "mail_off" | "mail_failed" | "already_verified" | "code_wrong" | "code_expired" | "code_invalid";
export interface AuthErrorResponse {
  readonly error: string;
  readonly code: AuthErrorCode;
  readonly retryAfterSeconds?: number;
  /** With code_wrong: wrong tries this code still allows. */
  readonly triesLeft?: number;
}
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
