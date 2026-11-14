// "/play": into a public arena (docs/specs/revamp/67-public-arenas.md).
//
// | Device                                  | Address           | Page                                           |
// |-----------------------------------------|-------------------|------------------------------------------------|
// | never finished a game (firstGame.ts)    | /play             | the join step only; Play seats it in practice  |
// | finished a game before                  | /play             | the chooser, the practice arena chosen         |
// | any                                     | /play?arena=<kind>| the chooser, that arena chosen                 |
//
// The monthly tile's action opens the monthly arena's own page (/monthly) instead of joining a room.
//
// The chooser: three tiles (a drawing, the name, one sentence, a live line from
// GET /api/public, read every 5 s while the page is visible), the join step of "My tank",
// and Play in the bottom bar. On a short screen the page gives way in steps it measures
// (useFitDetail): the name's hint, the drawings, the name field (the editor keeps it),
// then the join step, whose tank moves beside Play; the tiles' sentences always stay. Only a
// problem line on the smallest screens goes further: the heading row (its Champions link moves
// into the bar), then the live lines of the arenas not chosen.

import { Trophy } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { ChampionsLink } from "../champions/ChampionsLink.tsx";
import { PlayNowArt } from "../home/EntryArt.tsx";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { useSecondsUntil } from "../live/countdown.ts";
import { JoinTank, type JoinTankDetail } from "../mytank/JoinTank.tsx";
import { MyTankSheet } from "../mytank/MyTankSheet.tsx";
import { myTankStore, useMyTank } from "../mytank/useMyTank.ts";
import { useNameDraft, type NameDraft } from "../mytank/useNameDraft.ts";
import { focusChangeButton } from "../player/JoinForm.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button, LinkButton } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { tankLetters } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { ArenaTile } from "./ArenaTile.tsx";
import { CHOOSER_KINDS, type ChooserKind } from "./chooserKinds.ts";
import { hasFinishedGame } from "./firstGame.ts";
import { liveLines } from "./liveLines.ts";
import type { PublicJoin } from "./usePublicJoin.ts";
import { usePublicJoin } from "./usePublicJoin.ts";
import { usePublicStatus } from "./usePublicStatus.ts";

/** The arena named in "?arena=", or null. */
export function kindFromSearch(search: string): ChooserKind | null {
  const value = new URLSearchParams(search).get("arena");
  return CHOOSER_KINDS.find((kind) => kind === value) ?? null;
}

export function PlayPage() {
  const [asked] = useState(() => kindFromSearch(window.location.search));
  const [first] = useState(() => !hasFinishedGame());
  return first && asked === null ? <FirstPlay /> : <Chooser initial={asked ?? "practice"} />;
}

/** "Change my tank" replaces the page with the editor; Done returns focus to the button. */
function TankSheet({ name, onClose }: { readonly name: NameDraft; onClose(): void }) {
  const { tank } = useMyTank();
  return (
    <AppShell width="narrow">
      <MyTankSheet
        look={tank.look}
        onLook={(look) => myTankStore.setLook(look)}
        tankName={name.field.value}
        name={name}
        onClose={() => {
          onClose();
          focusChangeButton();
        }}
      />
    </AppShell>
  );
}

/** The problem under Play, with its way out when it has one. */
function ProblemLine({ join, onPractice }: { readonly join: PublicJoin; onPractice(): void }) {
  const m = useMessages();
  const t = m.publicplay.problems;
  const problem = join.problem;
  if (problem === null) return null;
  const sentence = problem.kind === "tournamentFull" ? t.tournamentFull : problem.sentence;
  let action: ReactNode = null;
  if (problem.kind === "tournamentFull") {
    action = (
      <Button variant="secondary" onClick={onPractice}>
        {t.choosePractice}
      </Button>
    );
  }
  return (
    <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-3 gap-y-1">
      <p role="alert" className="min-w-0 flex-1 basis-48 font-semibold text-hit [overflow-wrap:anywhere]">
        {sentence}
      </p>
      {action}
    </div>
  );
}

/** A device that never finished a game: its tank and Play, straight into the practice arena. */
function FirstPlay() {
  const m = useMessages();
  const t = m.publicplay.first;
  const { tank } = useMyTank();
  const name = useNameDraft(tank.name);
  const join = usePublicJoin();
  const [editing, setEditing] = useState(false);
  const [language] = useLanguage();
  // A short window leaves out the drawing above the heading, so an error banner still fits.
  const { ref, level } = useFitDetail<HTMLDivElement>(2, language);

  if (editing) return <TankSheet name={name} onClose={() => setEditing(false)} />;

  function play(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void join.play("practice", name);
  }

  const problem = join.problem;
  return (
    <AppShell width="narrow" align="center">
      <div ref={ref} className="flex min-h-0 flex-col gap-6 fit:overflow-hidden">
        <div className="flex flex-col gap-3">
          {level >= 1 ? null : (
            <span className="size-16">
              <PlayNowArt />
            </span>
          )}
          <h1 className="text-heading">{t.heading}</h1>
          <p className="text-lead text-muted">{t.intro}</p>
        </div>
        <form className="flex flex-col gap-5" data-play-first="" onSubmit={play}>
          <JoinTank look={tank.look} name={name} onChange={() => setEditing(true)} />
          {problem === null ? null : <StatusBanner tone="danger" title={problem.kind === "tournamentFull" ? m.publicplay.problems.tournamentFull : problem.sentence} />}
          <Button type="submit" size="lg" loading={join.busy} className="w-full laptop:w-auto laptop:self-start">
            {m.publicplay.chooser.play}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

/** Detail levels of the chooser, fullest first (see the table at the top). */
const CHOOSER_LEVELS = 7;
const TANK_DETAIL: readonly (JoinTankDetail | null)[] = ["full", "brief", "brief", "compact", null, null, null];

function Chooser({ initial }: { readonly initial: ChooserKind }) {
  const m = useMessages();
  const t = m.publicplay;
  const { tank } = useMyTank();
  const name = useNameDraft(tank.name);
  const join = usePublicJoin();
  const [kind, setKind] = useState<ChooserKind>(initial);
  const [editing, setEditing] = useState(false);
  const [language] = useLanguage();
  const formId = useId();
  const status = usePublicStatus();
  const tournamentSeconds = useSecondsUntil(status.kind === "ready" ? status.startsAt : null);
  const lines = liveLines(status, { tournamentSeconds }, t.live);
  // The level resets with the language and the problem line, whose height the bar takes from the page.
  const { ref, level } = useFitDetail<HTMLFormElement>(CHOOSER_LEVELS, `${language}|${join.problem?.kind ?? ""}`);

  if (editing) return <TankSheet name={name} onClose={() => setEditing(false)} />;

  const tankDetail = TANK_DETAIL[level] ?? null;
  // From level 5 the heading row gives its height to the tiles; the Champions link moves into the bar, so it stays visible.
  const headingRow = level < 5;

  function play(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (kind === "monthly") navigate(paths.monthly());
    else void join.play(kind, name);
  }

  function choose(next: ChooserKind): void {
    setKind(next);
    join.clearProblem();
  }

  const bar = (
    <div data-play-bar="" className="mx-auto flex w-full max-w-6xl min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-3 laptop:flex-none">
        <Button type="submit" form={formId} size="lg" loading={join.busy} className="min-w-0 flex-1 laptop:flex-none">
          {kind === "monthly" ? t.chooser.openMonthly : t.chooser.play}
        </Button>
        {/* At the smallest level the join step gives its room to the tiles; the tank stays reachable here. */}
        {tankDetail === null ? (
          <IconButton
            label={m.mytank.change}
            icon={<TankBadge look={tank.look} label={tankLetters(name.field.value)} size={36} name={null} detail="full" angle={-90} />}
            data-opens="mytank"
            onClick={() => setEditing(true)}
          />
        ) : null}
        {headingRow ? null : <ChampionsLink />}
      </div>
      <ProblemLine join={join} onPractice={() => choose("practice")} />
    </div>
  );

  return (
    <AppShell header={<AppHeader title={m.common.pageTitles.play} />} bottom={bar}>
      <form id={formId} ref={ref} data-chooser="" noValidate onSubmit={play} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 fit:overflow-hidden">
        {headingRow ? (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3">
            <h1 className="min-w-0 flex-1 text-title [overflow-wrap:anywhere]">{t.chooser.heading}</h1>
            <LinkButton href={paths.champions()} variant="quiet" icon={<Trophy aria-hidden size={20} />}>
              {m.champions.heading}
            </LinkButton>
          </div>
        ) : (
          <h1 className="sr-only">{t.chooser.heading}</h1>
        )}
        <fieldset className="m-0 min-w-0 shrink-0 border-0 p-0">
          <legend className="sr-only">{t.chooser.legend}</legend>
          <div className="flex min-w-0 flex-col gap-2 laptop:grid laptop:grid-cols-3 laptop:gap-3">
            {CHOOSER_KINDS.map((value) => (
              <ArenaTile
                key={value}
                kind={value}
                checked={kind === value}
                onSelect={choose}
                title={t.names[value]}
                about={t.about[value]}
                live={lines[value]}
                note={null}
                showArt={level < 2}
                showLive={level < 6 || kind === value}
              />
            ))}
          </div>
        </fieldset>
        {tankDetail === null ? null : <JoinTank look={tank.look} name={name} onChange={() => setEditing(true)} detail={tankDetail} row />}
      </form>
    </AppShell>
  );
}
