// Puts a failed sign-in or sign-up next to the field it concerns. The sentence
// itself comes from api/errorSentences.ts, so each code has one sentence.

import type { ApiFailure } from "../api/client.ts";
import { errorSentence } from "../api/errorSentences.ts";
import type { ErrorText } from "../api/messages.ts";

export type AuthField = "email" | "password" | "form";

export interface AuthProblem {
  readonly field: AuthField;
  readonly sentence: string;
}

const FIELD_OF_CODE: Readonly<Record<string, AuthField>> = {
  email_invalid: "email",
  email_taken: "email",
  password_too_short: "password",
  password_too_long: "password",
  password_is_email: "password",
  // The server does not say which of the two is wrong, so the sentence sits under the last field.
  invalid_credentials: "password",
};

export function authProblem(failure: ApiFailure, mode: "signIn" | "register", text: ErrorText): AuthProblem {
  const field = (failure.code !== null && Object.hasOwn(FIELD_OF_CODE, failure.code) ? FIELD_OF_CODE[failure.code] : undefined) ?? "form";
  return { field, sentence: errorSentence(failure, mode, text) };
}
