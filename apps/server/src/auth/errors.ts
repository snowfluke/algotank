// The auth rejections. An AuthError is an HttpError, so a route of another feature
// that calls requireAccount can let it pass; server.ts turns it into an
// AuthErrorResponse, with a Retry-After header when the request was rate limited.

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type AuthErrorCode, type AuthErrorResponse } from "@game/arena";
import { HttpError, jsonResponse } from "../http.ts";

// The Record type forces an entry for every AuthErrorCode.
const AUTH_ERRORS: Readonly<Record<AuthErrorCode, { status: number; message: string }>> = {
  email_invalid: { status: 400, message: "That email address is not valid." },
  password_too_short: { status: 400, message: `The password needs at least ${PASSWORD_MIN_LENGTH} characters.` },
  password_too_long: { status: 400, message: `The password can have at most ${PASSWORD_MAX_LENGTH} characters.` },
  password_is_email: { status: 400, message: "The password must not be the email address." },
  email_taken: { status: 409, message: "An account with that email already exists." },
  // One message for an unknown email and a wrong password, so the answer does not reveal which emails have accounts.
  invalid_credentials: { status: 401, message: "The email or the password is not correct." },
  rate_limited: { status: 429, message: "Too many attempts. Wait a moment and try again." },
  not_signed_in: { status: 401, message: "Sign in first." },
  bad_origin: { status: 403, message: "This request did not come from this site." },
  mail_off: { status: 503, message: "This server has no mail settings, so it cannot send email." },
  mail_failed: { status: 502, message: "The email could not be sent. Try again later." },
  already_verified: { status: 409, message: "This email is already verified." },
  code_wrong: { status: 400, message: "The code is not correct." },
  code_expired: { status: 400, message: "No code works for this account now. Ask for a new code." },
  // One message for a wrong, expired or missing code and an unknown email, so a reset does not reveal which emails have accounts.
  code_invalid: { status: 400, message: "The code is not correct or no longer works." },
};

export class AuthError extends HttpError {
  constructor(
    readonly authCode: AuthErrorCode,
    readonly retryAfterSeconds?: number,
    /** With code_wrong: the wrong tries the code still allows. */
    readonly triesLeft?: number,
  ) {
    super(AUTH_ERRORS[authCode].status, AUTH_ERRORS[authCode].message);
  }

  toResponse(): Response {
    const body: AuthErrorResponse = {
      error: this.message,
      code: this.authCode,
      ...(this.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: this.retryAfterSeconds }),
      ...(this.triesLeft === undefined ? {} : { triesLeft: this.triesLeft }),
    };
    const response = jsonResponse(body, this.status);
    if (this.retryAfterSeconds !== undefined) response.headers.set("retry-after", String(this.retryAfterSeconds));
    return response;
  }
}

/** The text for a code, for the reset script, which has no HTTP answer. */
export function authErrorMessage(code: AuthErrorCode): string {
  return AUTH_ERRORS[code].message;
}
