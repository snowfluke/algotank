// "Forgot password" inside the sign-in form, for a server that can send email. Two steps:
// the email address, then the code from the email with the new password. The server answers
// the first step the same way for every address, so the page never says whether an account
// exists. The second step signs this browser in and ends every other session of the account.
//
// | From  | Event                                 | To                                  |
// |-------|---------------------------------------|-------------------------------------|
// | email | "Send the code" with an email         | code (the sentence names the email) |
// | email | refused (not an email, too many tries)| email, the reason                   |
// | code  | code + new password accepted          | done: onSignedIn (terminal)         |
// | code  | code or password refused              | code, the reason under its field    |
// | code  | "Send a new code"                     | code, a new code is on its way      |
// | any   | "Back to sign in"                     | onBack                              |

import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { EMAIL_CODE_LENGTH } from "@game/arena";
import { resetPassword, sendResetCode, type ApiFailure } from "../api/client.ts";
import { errorSentence } from "../api/errorSentences.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { markSignedIn } from "./accountStore.ts";
import { codeDigits } from "./VerifyEmailStep.tsx";

const PASSWORD_CODES = new Set(["password_too_short", "password_too_long", "password_is_email"]);

export function ResetPasswordForm({ onSignedIn, onBack }: { onSignedIn(): void; onBack(): void }) {
  const m = useMessages();
  const a = m.auth;
  const [language] = useLanguage();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState<"sending" | "saving" | null>(null);
  const [problem, setProblem] = useState<{ readonly field: "email" | "code" | "password" | "form"; readonly text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function sendProblem(failure: ApiFailure): string {
    return errorSentence(failure, "resetPassword", m.errors);
  }

  async function send(): Promise<void> {
    if (email.trim() === "") {
      setProblem({ field: "email", text: a.emailEmpty });
      return;
    }
    setBusy("sending");
    setProblem(null);
    setNote(null);
    const result = await sendResetCode(email, language);
    setBusy(null);
    if (!result.ok) {
      setProblem({ field: step === "email" && result.code === "email_invalid" ? "email" : "form", text: sendProblem(result) });
      return;
    }
    if (step === "code") setNote(a.verify.newCodeSent);
    setStep("code");
  }

  async function save(): Promise<void> {
    if (code.length !== EMAIL_CODE_LENGTH) {
      setProblem({ field: "code", text: a.verify.codeEmpty });
      return;
    }
    if (password === "") {
      setProblem({ field: "password", text: a.passwordEmpty });
      return;
    }
    setBusy("saving");
    setProblem(null);
    const result = await resetPassword({ email, code, password });
    setBusy(null);
    if (!result.ok) {
      const field = result.code !== null && PASSWORD_CODES.has(result.code) ? "password" : result.code === "code_invalid" ? "code" : "form";
      setProblem({ field, text: sendProblem(result) });
      return;
    }
    markSignedIn(result.data.account);
    onSignedIn();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void (step === "email" ? send() : save());
  }

  return (
    <form data-reset-form="" data-code-step="" data-reset-step={step} className="flex min-w-0 flex-col gap-3" noValidate onSubmit={submit}>
      <div className="flex min-w-0 items-center gap-2">
        <IconButton variant="quiet" label={a.reset.back} icon={<ChevronLeft aria-hidden size={24} />} onClick={onBack} />
        <h2 className="min-w-0 text-title [overflow-wrap:anywhere]">{a.reset.heading}</h2>
      </div>
      <p className="[overflow-wrap:anywhere]">{step === "email" ? a.reset.intro : a.reset.sentTo(email.trim())}</p>
      {step === "email" ? (
        <TextInput
          label={a.email}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="off"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          error={problem?.field === "email" ? problem.text : null}
        />
      ) : (
        <>
          <TextInput
            label={a.verify.codeLabel}
            display="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={EMAIL_CODE_LENGTH + 2}
            value={code}
            onChange={(event) => setCode(codeDigits(event.currentTarget.value))}
            error={problem?.field === "code" ? problem.text : null}
          />
          <TextInput
            label={a.reset.newPassword}
            type={shown ? "text" : "password"}
            autoComplete="new-password"
            hint={a.passwordHint}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            error={problem?.field === "password" ? problem.text : null}
            trailing={
              <IconButton
                variant="quiet"
                label={a.showPassword}
                aria-pressed={shown}
                icon={shown ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}
                onClick={() => setShown((value) => !value)}
              />
            }
          />
        </>
      )}
      {problem?.field === "form" ? (
        <p role="alert" className="font-semibold text-hit [overflow-wrap:anywhere]">
          {problem.text}
        </p>
      ) : null}
      {note === null ? null : (
        <p role="status" className="text-muted">
          {note}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={busy === (step === "email" ? "sending" : "saving")}>
          {step === "email" ? a.reset.send : a.reset.save}
        </Button>
        {step === "code" ? (
          <Button variant="secondary" loading={busy === "sending"} onClick={() => void send()}>
            {a.verify.sendNew}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
