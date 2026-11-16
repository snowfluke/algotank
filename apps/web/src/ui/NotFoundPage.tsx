// The page of an unknown address, and of an admin page for anyone who is not the admin (the
// server answers 404 then, so the page looks the same as for an address that does not exist).

import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { AppShell } from "./AppShell.tsx";
import { LinkButton } from "./Button.tsx";

export function NotFoundPage() {
  const m = useMessages();
  return (
    <AppShell width="narrow" align="center">
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-heading">{m.common.notFound.heading}</h1>
        <p className="text-lead text-muted">{m.common.notFound.body}</p>
        <LinkButton href={paths.home()} variant="primary" size="lg">
          {m.common.goHome}
        </LinkButton>
      </div>
    </AppShell>
  );
}
