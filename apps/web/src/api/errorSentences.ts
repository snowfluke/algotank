// Turns a failed call into a sentence a player can act on, plus the validation
// messages the server sent. This is the only place that picks error text; the
// text itself is in api/messages.ts, in English and Indonesian.
//
// Order: a stable code (ArenaRouteErrorCode, AuthErrorCode or a client code)
// selects a sentence, with advice that fits the action when there is some. Without
// a code the HTTP status decides. The server's own `error` text is English and
// technical, so it reaches the page only as validation details.

import { MONTHLY_RULE_CHANGES_PER_HOUR, type ArenaRouteErrorCode, type AuthErrorCode } from "@game/arena";
import { CATALOGS } from "../i18n/catalog.ts";
import { languageStore } from "../i18n/language.ts";
import { CLIENT_ERROR, type ApiFailure } from "./client.ts";
import type { ErrorText } from "./messages.ts";

/** What the person was doing when the call failed. The same failure can need different advice. */
export type ErrorAction = keyof ErrorText["refused"];

type ClientCode = (typeof CLIENT_ERROR)[keyof typeof CLIENT_ERROR];
type KnownCode = Exclude<ArenaRouteErrorCode | AuthErrorCode | ClientCode, "rate_limited">;

function isKnownCode(text: ErrorText, code: string): code is KnownCode {
  return Object.hasOwn(text.codes, code);
}

/** The catalog of the language the page shows now, for callers outside React. */
function currentText(): ErrorText {
  return CATALOGS[languageStore.get()].errors;
}

/**
 * Pass `text` from `useMessages().errors` inside a component. Without it the
 * sentence is in the current language of the app.
 */
export function errorSentence(failure: ApiFailure, action: ErrorAction, text: ErrorText = currentText()): string {
  if (failure.code === "rules_rate_limited") {
    return text.rulesRateLimited(MONTHLY_RULE_CHANGES_PER_HOUR, Math.max(1, Math.ceil((failure.error.retryAfterSeconds ?? 3600) / 60)));
  }
  if (failure.code === "rate_limited") {
    return text.rateLimited(Math.max(1, Math.ceil(failure.error.retryAfterSeconds ?? 60)));
  }
  if (failure.code !== null && isKnownCode(text, failure.code)) {
    const byAction: Partial<Record<string, string>> = text.byAction[action as keyof ErrorText["byAction"]] ?? {};
    return byAction[failure.code] ?? text.codes[failure.code];
  }
  switch (failure.status) {
    case 401:
    case 403:
      return text.refused[action];
    case 404:
      return text.notFound;
    case 400:
    case 413:
      return text.invalid;
    default:
      return text.generic;
  }
}

/** The sentence and the validation messages for one failed call. */
export interface ErrorView {
  readonly sentence: string;
  readonly details: readonly string[];
}

export function describeError(failure: ApiFailure, action: ErrorAction, text: ErrorText = currentText()): ErrorView {
  return { sentence: errorSentence(failure, action, text), details: failure.error.details ?? [] };
}

/** True when the server refused the player token that was sent, so a stored token is useless. */
export function isTokenRefused(failure: ApiFailure): boolean {
  return failure.status === 401 || failure.status === 403;
}
