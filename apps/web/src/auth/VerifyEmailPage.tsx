// "/verify-email": the code step for a signed-in account whose email is not verified, reached
// from the account menu and from a join that needs a verified email. `?next=` names the page to
// return to (nextPath.ts accepts only a page of this app).

import { navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button, LinkButton } from "../ui/Button.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { markEmailVerified, useAccount } from "./accountStore.ts";
import { cannotSendEmail, useMailCapability } from "./mailCapability.ts";
import { nextFromSearch } from "./nextPath.ts";
import { VerifyEmailStep } from "./VerifyEmailStep.tsx";

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function VerifyEmailPage() {
  const m = useMessages();
  const a = m.auth;
  const account = useAccount();
  const mail = useMailCapability();
  const next = () => navigate(nextFromSearch(window.location.search));

  let content;
  if (account.kind === "unknown" || (account.kind === "signedIn" && !account.account.emailVerified && mail.kind !== "ready")) {
    content = (
      <p role="status" className="animate-pulse-soft text-muted">
        {m.room.loading}
      </p>
    );
  } else if (account.kind === "signedOut" || account.kind === "unreachable") {
    content = (
      <>
        <StatusBanner tone="info" title={a.verifySignInFirst} />
        <div>
          <LinkButton href={paths.signIn(currentPath())} variant="primary" size="lg">
            {a.signInLink}
          </LinkButton>
        </div>
      </>
    );
  } else if (account.account.emailVerified || cannotSendEmail(mail)) {
    content = (
      <>
        <StatusBanner tone={account.account.emailVerified ? "success" : "warning"} title={account.account.emailVerified ? a.verifyDone : a.mailOffRegister} />
        <div>
          <Button size="lg" onClick={next}>
            {a.verifyContinue}
          </Button>
        </div>
      </>
    );
  } else {
    content = (
      <VerifyEmailStep
        email={account.account.email}
        codeAtStart="none"
        onVerified={(verified) => {
          markEmailVerified(verified);
          next();
        }}
      />
    );
  }

  return (
    <AppShell header={<AppHeader />} width="narrow" align="center">
      <div data-verify-page="" className="flex min-h-0 min-w-0 flex-col gap-4">
        <h1 className="sr-only">{a.verifyPageTitle}</h1>
        {content}
      </div>
    </AppShell>
  );
}
