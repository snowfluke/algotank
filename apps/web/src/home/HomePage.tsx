// The front of the game at "/": the name with a tank, one sentence, the arena
// scene, and the five ways in. Two main tiles come first, side by side: Play now (water
// blue) and the tank workshop (the guide colour), because a player learns what an
// algorithm is by building one there (docs/specs/revamp/65-guidance.md, section 5).
// The other ways in are rows under them; the first, watching the monthly arena live, has a live
// line that stays when the page is short. A first-time visitor sees one gentle
// cue on the workshop tile (a one-step tour, guide/), never a multi-step tour.
//
// No scroll: on a phone the name and sentence come first, the scene takes whatever
// height is left and hides when that is too little, and the entries sit at the bottom
// near the thumb. On a laptop the scene and the entries sit side by side. When the
// entries do not fit, the rows leave out their sentence, then the main tiles do, and last
// the page takes the compact form (useFitDetail): the rows take less padding, and the monthly
// tile's live line becomes one short line, or none when no tank plays
// (docs/specs/revamp/82-fit-fixes.md).

import { paths } from "../app/route.ts";
import { GAME_NAME } from "../brand.ts";
import type { Catalog } from "../i18n/catalog.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { TankBadge } from "../tank/TankBadge.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Tour } from "../guide/Tour.tsx";
import { ArenaArt } from "../publicplay/ArenaArt.tsx";
import { hasFinishedGame } from "../publicplay/firstGame.ts";
import { usePublicStatus } from "../publicplay/usePublicStatus.ts";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { EntryCard, type EntryDetail } from "./EntryCard.tsx";
import { CatalogueArt, JoinArt, PlayNowArt, PresenterArenaArt, PrivateArenaArt, WorkshopArt } from "./EntryArt.tsx";
import { HomeScene } from "./HomeScene.tsx";

/** Level 0 shows every sentence; level 1 leaves out the sentences of the rows; level 2 those of the main tiles too; level 3 is the compact form. */
const DETAIL_LEVELS = 4;
const COMPACT_LEVEL = 3;

/** The monthly tile's live line: the full sentence, or in the compact form the short line, and nothing when no tank plays. */
export function monthlyLiveLine(tanks: number, compact: boolean, m: Catalog): string | null {
  if (!compact) return m.publicplay.live.monthly(tanks);
  return tanks === 0 ? null : m.home.watchMonthly.playingNow(tanks);
}

export function HomePage() {
  const m = useMessages();
  const [language] = useLanguage();
  const home = m.home;
  const { ref, level } = useFitDetail<HTMLDivElement>(DETAIL_LEVELS, language);
  const compact = level >= COMPACT_LEVEL;
  const rowDetail: EntryDetail = compact ? "compact" : level >= 1 ? "brief" : "full";
  const mainDetail: EntryDetail = level >= 2 ? "brief" : "full";
  // The monthly arena's live line; nothing until the server answered, because the entry works without it.
  const status = usePublicStatus();
  const monthlyLive = status.kind === "ready" ? monthlyLiveLine(status.status.monthly.tanks, compact, m) : null;
  return (
    <>
    {/* The cue for a first-time visitor: a device that never finished a game and never closed it. */}
    <Tour id="home" phaseOn eligible={!hasFinishedGame()} occurrence="home" clock={{ kind: "untimed" }} />
    <AppShell header={<AppHeader showWordmark={false} />}>
      <div
        ref={ref}
        data-home=""
        className="flex min-h-0 flex-1 flex-col gap-3 fit:overflow-hidden laptop:grid laptop:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] laptop:grid-rows-[minmax(0,1fr)] laptop:gap-x-10"
      >
        {/* min-h-min: the section never shrinks below the name and its sentence, so on a short phone the page overflows its box, useFitDetail sees it and the tiles give way instead of covering the sentence. */}
        <section className="flex min-h-min min-w-0 flex-1 flex-col gap-3 laptop:justify-center">
          {/* data-coach-keep-clear: the first-visit cue never covers the name and its sentence, which a first-timer has not read yet. */}
          <div data-coach-keep-clear="" className="flex flex-col gap-1">
            <h1 className="flex flex-wrap items-center gap-3 font-display text-display font-bold tracking-tight">
              <TankBadge colour={1} size={56} name={null} angle={-20} className="animate-pop" />
              {GAME_NAME}
            </h1>
            <p className="max-w-[40ch] text-body text-muted laptop:text-lead">{home.tagline}</p>
          </div>
          {/* The first-visit cue's place on a laptop (guide/tours.ts): under the sentence, so it hides no way in. Empty, it takes no room. */}
          <div data-coach-dock="top" data-coach-dock-when="laptop" className="max-w-[24rem] shrink-0 empty:hidden" />
          {/* The scene takes the height that is left, and hides below 7rem, where it would be too small to read. In the scrolling fallback it has a fixed height. */}
          <div className="flex h-56 min-h-0 items-center justify-center [container-type:size] fit:h-auto fit:flex-1 laptop:max-h-[26rem]">
            <div className="hide-when-short size-full">
              <HomeScene label={home.sceneLabel} />
            </div>
          </div>
        </section>
        <nav aria-labelledby="home-choices" className="flex min-w-0 shrink-0 flex-col gap-2 laptop:min-h-0 laptop:justify-center">
          <h2 id="home-choices" className="sr-only">
            {home.choicesHeading}
          </h2>
          {/* The cue points at the workshop tile and keeps both main tiles in view (data-coach-keep-clear), so it floats under them on a phone. */}
          <div data-coach-keep-clear="" className="grid min-w-0 grid-cols-2 gap-2">
            <EntryCard tone="water" detail={mainDetail} href={paths.play()} title={home.playNow.title} body={home.playNow.body} art={<PlayNowArt />} />
            <EntryCard tone="guide" detail={mainDetail} coach="home-workshop" href={paths.workshop()} title={home.workshop.title} body={home.workshop.body} art={<WorkshopArt />} />
          </div>
          <EntryCard detail={rowDetail} href={paths.monthly()} title={home.watchMonthly.title} body={home.watchMonthly.body} live={monthlyLive} art={<ArenaArt kind="monthly" />} />
          <EntryCard detail={rowDetail} href={paths.join()} title={home.joinCode.title} body={home.joinCode.body} art={<JoinArt />} />
          {/* Under 700px of height the seven cards do not fit, so the catalogue's card gives way; the workshop and the board's help link to it too. */}
          <div className="min-w-0 [@media(max-height:700px)]:hidden">
            <EntryCard detail={rowDetail} href={paths.catalogue()} title={m.catalogue.homeTile.title} body={m.catalogue.homeTile.body} art={<CatalogueArt />} />
          </div>
          <EntryCard
            detail={rowDetail}
            href={paths.create("private")}
            title={home.createPrivate.title}
            body={home.createPrivate.body}
            note={home.signInNeeded}
            art={<PrivateArenaArt />}
          />
          <EntryCard
            detail={rowDetail}
            href={paths.create("presenter")}
            title={home.createPresenter.title}
            body={home.createPresenter.body}
            note={home.signInNeeded}
            art={<PresenterArenaArt />}
          />
        </nav>
      </div>
    </AppShell>
    </>
  );
}
