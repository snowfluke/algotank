// "My results" (/my-results, the account menu): the signed-in owner's stored results, newest
// first, each a link to its result page. Paged, so a long list never scrolls. A visitor who is
// not signed in is sent to sign in and back here.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ResultSummary } from "@game/arena";
import { getAccountResults } from "../api/client.ts";
import { followLink } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useAccount } from "../auth/accountStore.ts";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { TankBadge } from "../tank/TankBadge.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button, LinkButton } from "../ui/Button.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";

export type MyResultsLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "signedOut" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly results: readonly ResultSummary[] };

function ResultRow({ summary }: { readonly summary: ResultSummary }) {
  const t = useMessages().results.mine;
  const f = useFormat();
  return (
    <a
      href={paths.result(summary.id)}
      onClick={followLink}
      className="press flex min-h-14 min-w-0 items-center gap-3 border-b border-line py-1 text-ink no-underline"
    >
      <TankBadge look={summary.winnerLook} size={40} name={null} detail="full" angle={-90} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold" title={summary.arenaName}>
          {summary.arenaName}
        </span>
        <span className="truncate text-caption text-muted">{`${t.won(summary.winnerName)}. ${t.details(f.date(new Date(summary.finishedAt).toISOString()), summary.players)}`}</span>
      </span>
    </a>
  );
}

/** The page in any state of its data. Exported for its test. */
function MyResultsView({ load, onRetry }: { readonly load: MyResultsLoad; onRetry(): void }) {
  const m = useMessages();
  const t = m.results.mine;
  let body: ReactNode;
  switch (load.kind) {
    case "loading":
      body = (
        <p role="status" className="animate-pulse-soft text-muted">
          {t.loading}
        </p>
      );
      break;
    case "signedOut":
      body = (
        <div>
          <LinkButton href={paths.signIn(paths.myResults())} variant="primary" size="lg">
            {m.auth.signInLink}
          </LinkButton>
        </div>
      );
      break;
    case "failed":
      body = (
        <StatusBanner
          tone="danger"
          title={t.failed}
          action={
            <Button variant="secondary" onClick={onRetry}>
              {t.tryAgain}
            </Button>
          }
        />
      );
      break;
    case "ready":
      body =
        load.results.length === 0 ? (
          <p className="text-lead">{t.empty}</p>
        ) : (
          <Pager label={t.list} items={load.results} itemKey={(r) => r.id} gap={0} uniformHeight renderItem={(r) => <ResultRow summary={r} />} />
        );
      break;
  }
  return (
    <AppShell width="narrow">
      <div data-my-results={load.kind} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <h1 className="shrink-0 text-heading">{t.heading}</h1>
        {body}
      </div>
    </AppShell>
  );
}

export function MyResultsPage() {
  const account = useAccount();
  const [load, setLoad] = useState<MyResultsLoad>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const signedIn = account.kind === "signedIn";
  const signedOut = account.kind === "signedOut";
  useEffect(() => {
    if (signedOut) {
      setLoad({ kind: "signedOut" });
      return;
    }
    if (account.kind === "unreachable") {
      setLoad({ kind: "failed" });
      return;
    }
    if (!signedIn) return;
    let current = true;
    setLoad({ kind: "loading" });
    void getAccountResults().then((answer) => {
      if (!current) return;
      if (answer.ok) setLoad({ kind: "ready", results: answer.data.results });
      else setLoad(answer.status === 401 ? { kind: "signedOut" } : { kind: "failed" });
    });
    return () => {
      current = false;
    };
  }, [signedIn, signedOut, account.kind, attempt]);
  return <MyResultsView load={load} onRetry={useCallback(() => setAttempt((n) => n + 1), [])} />;
}
