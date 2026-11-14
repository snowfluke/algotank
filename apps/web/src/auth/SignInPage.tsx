// "/sign-in": the sign-in step on its own page. `?next=` names the page to return
// to; nextPath.ts accepts only a page of this app.

import { navigate } from "../app/navigation.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { nextFromSearch } from "./nextPath.ts";
import { SignInForm } from "./SignInForm.tsx";

export function SignInPage() {
  const m = useMessages();
  const [language] = useLanguage();
  // A short window leaves out the intro (the two tabs already say "Sign in" and "Create account"),
  // then the sentence on why an account is needed.
  const { ref, level } = useFitDetail<HTMLDivElement>(3, language);
  return (
    <AppShell header={<AppHeader account={null} />} width="narrow" align="center">
      {/* The code steps (reset, verify) bring their own visible heading, so the page's heading and intro step aside for the room they need. */}
      <div ref={ref} className="group flex min-h-0 flex-col gap-4 fit:overflow-hidden">
        <div className="flex flex-col gap-2 group-has-[[data-code-step]]:sr-only">
          <h1 className="text-heading">{m.auth.heading}</h1>
          {level >= 1 ? null : <p className="text-lead text-muted">{m.auth.intro}</p>}
        </div>
        <SignInForm brief={level >= 2} onSignedIn={() => navigate(nextFromSearch(window.location.search))} />
      </div>
    </AppShell>
  );
}
