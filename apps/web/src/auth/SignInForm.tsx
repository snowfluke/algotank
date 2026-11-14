// The sign-in step: two tabs, "Sign in" and "Create account", each an email, a
// password with a show or hide control, and one primary action. The /sign-in page
// and the create page (for a signed-out visitor) both show it.
//
// With email (mail settings on the server): a sign-up goes on to the code step before the
// account store learns of the account, so a page that swaps this form for its signed-in view
// (the create page) shows the code step first; "Sign in" offers "Forgot password". Without
// email: the sign-up tab says the address cannot be verified, and a forgotten password goes
// to the person who runs the server.

import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { PublicAccount, VerificationEmail } from "@game/arena";
import { login, register } from "../api/client.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { TextInput } from "../ui/Field.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { Tabs } from "../ui/Tabs.tsx";
import { markSignedIn } from "./accountStore.ts";
import { authProblem, type AuthProblem } from "./authProblem.ts";
import { cannotSendEmail, canSendEmail, useMailCapability } from "./mailCapability.ts";
import { ResetPasswordForm } from "./ResetPasswordForm.tsx";
import { VerifyEmailStep } from "./VerifyEmailStep.tsx";

type Mode = "signIn" | "register";

interface CredentialsFormProps {
  readonly mode: Mode;
  readonly onSignedIn: () => void;
  readonly brief: boolean;
  /** After a sign-up whose code went out (or failed to): the code step comes next. */
  readonly onRegistered: (account: PublicAccount, verificationEmail: Exclude<VerificationEmail, "off">) => void;
  readonly onForgot: () => void;
}

function CredentialsForm({ mode, onSignedIn, brief, onRegistered, onForgot }: CredentialsFormProps) {
  const m = useMessages();
  const a = m.auth;
  const [language] = useLanguage();
  const mail = useMailCapability();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<AuthProblem | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (email.trim() === "") {
      setProblem({ field: "email", sentence: a.emailEmpty });
      return;
    }
    if (password === "") {
      setProblem({ field: "password", sentence: a.passwordEmpty });
      return;
    }
    setBusy(true);
    setProblem(null);
    if (mode === "register") {
      const result = await register({ email, password, language });
      setBusy(false);
      if (!result.ok) {
        setProblem(authProblem(result, mode, m.errors));
        return;
      }
      const sent = result.data.verificationEmail;
      if (sent !== "off") {
        onRegistered(result.data.account, sent);
        return;
      }
      markSignedIn(result.data.account);
      onSignedIn();
      return;
    }
    const result = await login({ email, password });
    setBusy(false);
    if (!result.ok) {
      setProblem(authProblem(result, mode, m.errors));
      return;
    }
    markSignedIn(result.data.account);
    onSignedIn();
  }

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={(event) => void submit(event)}>
      {/* Without email the sentence on verifying takes the place of the one on why, so the tab stays as tall; a short pane drops it like the other. */}
      {mode === "register" && !brief && !cannotSendEmail(mail) ? <p className="text-muted">{a.why}</p> : null}
      {mode === "register" && !brief && cannotSendEmail(mail) ? <p data-mail-off="" className="text-muted">{a.mailOffRegister}</p> : null}
      <TextInput
        label={a.email}
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="off"
        spellCheck={false}
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
        error={problem?.field === "email" ? problem.sentence : null}
      />
      <TextInput
        label={a.password}
        type={shown ? "text" : "password"}
        autoComplete={mode === "signIn" ? "current-password" : "new-password"}
        {...(mode === "register" ? { hint: a.passwordHint } : {})}
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
        error={problem?.field === "password" ? problem.sentence : null}
        trailing={
          // One name for both states and aria-pressed for the state, so a screen reader says "Show password, pressed".
          <IconButton
            variant="quiet"
            label={a.showPassword}
            aria-pressed={shown}
            icon={shown ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}
            onClick={() => setShown((value) => !value)}
          />
        }
      />
      {problem?.field === "form" ? <StatusBanner tone="danger" title={problem.sentence} /> : null}
      <Button type="submit" size="lg" loading={busy} className="w-full fit:w-auto fit:self-start">
        {a.submit[mode]}
      </Button>
      {mode === "signIn" && canSendEmail(mail) ? (
        <Button variant="quiet" data-forgot="" className="self-start" onClick={onForgot}>
          {a.reset.open}
        </Button>
      ) : null}
      {mode === "signIn" && cannotSendEmail(mail) ? <p className="text-caption text-muted">{a.forgot}</p> : null}
    </form>
  );
}

export interface SignInFormProps {
  readonly onSignedIn: () => void;
  /** Leaves out the sentence on why an account is needed, for a page that is short of height (useFitDetail). */
  readonly brief?: boolean;
}

type View =
  | { readonly kind: "tabs" }
  | { readonly kind: "reset" }
  | { readonly kind: "verify"; readonly account: PublicAccount; readonly codeAtStart: "sent" | "failed" };

export function SignInForm({ onSignedIn, brief = false }: SignInFormProps) {
  const m = useMessages();
  const [mode, setMode] = useState<Mode>("signIn");
  const [view, setView] = useState<View>({ kind: "tabs" });

  if (view.kind === "reset") return <ResetPasswordForm onSignedIn={onSignedIn} onBack={() => setView({ kind: "tabs" })} />;
  if (view.kind === "verify") {
    const done = (account: PublicAccount) => {
      markSignedIn(account);
      onSignedIn();
    };
    return (
      <VerifyEmailStep
        email={view.account.email}
        codeAtStart={view.codeAtStart}
        onVerified={done}
        extraAction={
          <Button variant="quiet" data-verify-later="" onClick={() => done(view.account)}>
            {m.auth.verify.later}
          </Button>
        }
      />
    );
  }

  const formProps = {
    onSignedIn,
    brief,
    onRegistered: (account: PublicAccount, codeAtStart: "sent" | "failed") => setView({ kind: "verify", account, codeAtStart }),
    onForgot: () => setView({ kind: "reset" }),
  };
  return (
    <Tabs
      label={m.auth.tabsLabel}
      value={mode}
      onChange={setMode}
      tabs={[
        { value: "signIn", label: m.auth.tabs.signIn, panel: <CredentialsForm key="signIn" mode="signIn" {...formProps} /> },
        { value: "register", label: m.auth.tabs.register, panel: <CredentialsForm key="register" mode="register" {...formProps} /> },
      ]}
    />
  );
}
