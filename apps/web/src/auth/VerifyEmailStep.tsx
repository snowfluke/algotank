// The code step of email verification: one sentence that says where the code went, one input
// for the six digits, "Verify", and "Send a new code". The sign-in form shows it right after a
// sign-up, and the /verify-email page shows it for a signed-in account that is not verified.
//
// | From     | Event                         | To                                         |
// |----------|-------------------------------|--------------------------------------------|
// | waiting  | "Send me a code" / a new code | sending                                    |
// | sending  | the server sent it            | waiting, "a new code is on its way"        |
// | sending  | refused or failed             | waiting, the reason (and when to ask again)|
// | waiting  | "Verify" with 6 digits        | checking                                   |
// | waiting  | "Verify" without 6 digits     | waiting, "type the 6 digits first"         |
// | checking | right code                    | done: onVerified (terminal)                |
// | checking | wrong code                    | waiting, "not right", tries left           |
// | checking | expired or used up            | waiting, "ask for a new code"              |

import { useState, type FormEvent, type ReactNode } from "react";
import { EMAIL_CODE_LENGTH, type PublicAccount } from "@game/arena";
import { sendVerificationCode, verifyEmail, type ApiFailure } from "../api/client.ts";
import { errorSentence } from "../api/errorSentences.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { markSignedOut } from "./accountStore.ts";

/** What the step knows about a code when it opens: one went out, the send failed, or none was asked for yet. */
export type CodeAtStart = "sent" | "failed" | "none";

const NON_DIGIT = /\D/g;

/** Digits only, at most six: a pasted "123 456" or "Code: 123456" becomes "123456". */
export function codeDigits(typed: string): string {
  return typed.replace(NON_DIGIT, "").slice(0, EMAIL_CODE_LENGTH);
}

export interface VerifyEmailStepProps {
  readonly email: string;
  readonly codeAtStart: CodeAtStart;
  onVerified(account: PublicAccount): void;
  /** A quiet second way on, such as "Verify later" after a sign-up. */
  readonly extraAction?: ReactNode;
}

export function VerifyEmailStep({ email, codeAtStart, onVerified, extraAction }: VerifyEmailStepProps) {
  const m = useMessages();
  const a = m.auth;
  const [language] = useLanguage();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(codeAtStart === "sent");
  const [busy, setBusy] = useState<"checking" | "sending" | null>(null);
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<{ readonly tone: "info" | "problem"; readonly text: string } | null>(
    codeAtStart === "failed" ? { tone: "problem", text: a.verify.sendFailed } : null,
  );

  function sendSentence(failure: ApiFailure): string {
    if (failure.code === "rate_limited") return a.verify.resendWait(Math.max(1, Math.ceil(failure.error.retryAfterSeconds ?? 60)));
    return errorSentence(failure, "sendCode", m.errors);
  }

  async function send(): Promise<void> {
    setBusy("sending");
    setSendNote(null);
    const result = await sendVerificationCode(language);
    setBusy(null);
    if (!result.ok) {
      if (result.code === "not_signed_in") markSignedOut();
      setSendNote({ tone: "problem", text: sendSentence(result) });
      return;
    }
    setSent(true);
    setCodeProblem(null);
    setSendNote({ tone: "info", text: a.verify.newCodeSent });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (code.length !== EMAIL_CODE_LENGTH) {
      setCodeProblem(a.verify.codeEmpty);
      return;
    }
    setBusy("checking");
    setCodeProblem(null);
    const result = await verifyEmail(code);
    setBusy(null);
    if (!result.ok) {
      if (result.code === "not_signed_in") markSignedOut();
      const left = result.error.triesLeft;
      setCodeProblem(result.code === "code_wrong" && left !== undefined ? a.verify.codeWrong(left) : errorSentence(result, "verifyEmail", m.errors));
      return;
    }
    onVerified(result.data.account);
  }

  return (
    <form data-verify-step="" data-code-step="" className="flex min-w-0 flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
      <h2 className="text-title">{a.verify.heading}</h2>
      <p className="[overflow-wrap:anywhere]">{sent ? a.verify.sentTo(email) : a.verify.willSendTo(email)}</p>
      {sent ? (
        <TextInput
          label={a.verify.codeLabel}
          hint={a.verify.codeHint}
          display="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={EMAIL_CODE_LENGTH + 2}
          value={code}
          onChange={(event) => setCode(codeDigits(event.currentTarget.value))}
          error={codeProblem}
        />
      ) : null}
      {sendNote === null ? null : (
        <p role={sendNote.tone === "problem" ? "alert" : "status"} className={sendNote.tone === "problem" ? "font-semibold text-hit [overflow-wrap:anywhere]" : "text-muted"}>
          {sendNote.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {sent ? (
          <>
            <Button type="submit" size="lg" loading={busy === "checking"}>
              {a.verify.submit}
            </Button>
            <Button variant="secondary" loading={busy === "sending"} onClick={() => void send()}>
              {a.verify.sendNew}
            </Button>
          </>
        ) : (
          <Button size="lg" loading={busy === "sending"} onClick={() => void send()}>
            {a.verify.sendFirst}
          </Button>
        )}
        {extraAction}
      </div>
    </form>
  );
}
