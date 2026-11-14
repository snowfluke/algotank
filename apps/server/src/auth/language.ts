// The language of the page that sent a request, so an email it causes is written in it.

import { MAIL_LANGUAGES, type MailLanguage } from "@game/arena";
import { HttpError } from "../http.ts";

/** English when the page sent none, because older pages did not send it. Anything else is a bad request. */
export function readLanguage(body: Readonly<Record<string, unknown>>): MailLanguage {
  const sent = body["language"];
  if (sent === undefined) return "en";
  const language = MAIL_LANGUAGES.find((l) => l === sent);
  if (language === undefined) throw new HttpError(400, 'Send the language as "en" or "id".');
  return language;
}
