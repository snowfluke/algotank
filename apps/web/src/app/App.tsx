import { useEffect } from "react";
import { SignInPage } from "../auth/SignInPage.tsx";
import { VerifyEmailPage } from "../auth/VerifyEmailPage.tsx";
import { GAME_NAME } from "../brand.ts";
import { CreateArenaPage } from "../create/CreateArenaPage.tsx";
import { HomePage } from "../home/HomePage.tsx";
import { JoinPage } from "../home/JoinPage.tsx";
import { ChampionsPage } from "../champions/ChampionsPage.tsx";
import { MonthlyPage } from "../monthly/MonthlyPage.tsx";
import { useMusicVenue } from "../sound/music.ts";
import { HostPage } from "../host/HostPage.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { KitPage } from "../kit/KitPage.tsx";
import { MyTankPage } from "../mytank/MyTankPage.tsx";
import { AdminMetricsPage } from "../metrics/AdminMetricsPage.tsx";
import { useUsageCounts } from "../metrics/useUsageCounts.ts";
import { PlayerPage } from "../player/PlayerPage.tsx";
import { MyResultsPage } from "../results/MyResultsPage.tsx";
import { ResultPage } from "../results/ResultPage.tsx";
import { PlayPage } from "../publicplay/PlayPage.tsx";
import { ScreenPage } from "../screen/ScreenPage.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { LinkButton } from "../ui/Button.tsx";
import { WorkshopPage } from "../workshop/WorkshopPage.tsx";
import { useRoute } from "./navigation.ts";
import { paths, type Route } from "./route.ts";

function NotFoundPage() {
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

function RoutePage({ route }: { route: Route }) {
  // The key restarts a page's state and its stream when the arena in the address changes.
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "join":
      return <JoinPage />;
    case "play":
      return <PlayPage />;
    case "signIn":
      return <SignInPage />;
    case "verifyEmail":
      return <VerifyEmailPage />;
    case "create":
      return <CreateArenaPage key={route.kind} kind={route.kind} />;
    case "host":
      return <HostPage key={route.arenaId} arenaId={route.arenaId} />;
    case "screen":
      return <ScreenPage key={route.arenaId} arenaId={route.arenaId} />;
    case "player":
      return <PlayerPage key={route.arenaId} arenaId={route.arenaId} />;
    case "kit":
      return <KitPage />;
    case "workshop":
      return <WorkshopPage />;
    case "myTank":
      return <MyTankPage />;
    case "champions":
      return <ChampionsPage />;
    case "monthly":
      return <MonthlyPage />;
    case "result":
      return <ResultPage key={route.resultId} resultId={route.resultId} />;
    case "myResults":
      return <MyResultsPage />;
    case "adminMetrics":
      return <AdminMetricsPage />;
    case "notFound":
      return <NotFoundPage />;
  }
}

export function App() {
  const route = useRoute();
  const m = useMessages();
  // The big screen starts without music; every other page plays it when the person's switch is on.
  useMusicVenue(route.page === "screen" ? "bigScreen" : "app");
  // The sign-in page is newer than the shared title list, so its title lives with its own text.
  const title =
    route.page === "signIn" ? m.auth.pageTitle : route.page === "verifyEmail" ? m.auth.verifyPageTitle : route.page === "adminMetrics" ? m.metrics.pageTitle : m.common.pageTitles[route.page];
  useUsageCounts(route.page);

  useEffect(() => {
    document.title = `${title} - ${GAME_NAME}`;
  }, [title]);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoutePage route={route} />
    </div>
  );
}
