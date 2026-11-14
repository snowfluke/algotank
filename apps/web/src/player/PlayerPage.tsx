// The arena room (/a/:id): one page for a player in any kind of arena, under the
// no-scroll rule. Before the player has a seat (or after the seat is gone) it is one
// centred form or sentence. With a seat it is the room frame (room/RoomFrame.tsx):
// the status line, the panes of the view (room/roomFrame.ts has the table), and the
// bottom bar with the owner's start action and the tabs. The owner of a private arena
// also gets the bots switch and "Close arena" in the settings. A public arena adds the
// parts in publicplay/roomParts.ts: "I'm ready" in the bottom bar of the lobby and the
// result, and the tournament's winner line. A public seat the server
// lost is taken again without a form (publicplay/rejoin.ts), and a new seat starts with
// the play style used last, while a style asked for by "Play now with it" goes to any seat
// once (prep/lastStyle.ts). A public result links to the chooser (publicplay/OtherArenasLink.tsx).

import { ChartBar, Columns3, History, LayoutGrid, ListOrdered, MessageCircle, SlidersHorizontal, Trophy, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isPublicKind, type ArenaId, type PublicArena, type PublicPlayer } from "@game/arena";
import { joinArena } from "../api/client.ts";
import { describeError } from "../api/errorSentences.ts";
import { paths } from "../app/route.ts";
import { ownsArena, useAccount, type AccountState } from "../auth/accountStore.ts";
import { ChampionsLink } from "../champions/ChampionsLink.tsx";
import { useChatFeed, type ChatFeed } from "../chat/chatFeed.ts";
import { ChatPane } from "../chat/ChatPane.tsx";
import { useArenaChat } from "../chat/useArenaChat.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { joinRequest } from "../mytank/joinRequest.ts";
import { myTankStore } from "../mytank/useMyTank.ts";
import { formatClock } from "../live/clock.ts";
import { useSecondsUntil } from "../live/countdown.ts";
import { ArenaPane, FinalRankingPane, MyTankPane, RankingPane, ResultPane, roundClock } from "../live/panes.tsx";
import { OwnStatsPane } from "../stats/OwnStatsPane.tsx";
import { replayRoomTour, RoomTours } from "../guide/RoomTours.tsx";
import { EndedArena, useEndedResult } from "../results/EndedArena.tsx";
import { HistoryPane } from "../results/HistoryPane.tsx";
import { ConnectionBanner } from "../room/ConnectionBanner.tsx";
import { HowItWorks, HowItWorksButton } from "../room/HowItWorks.tsx";
import { canChangeLook, LeaveButton, LookSheet } from "../room/MyTankControls.tsx";
import { StartControl } from "../room/OwnerControls.tsx";
import { PlayersPane } from "../room/PlayerList.tsx";
import { canRemovePlayers, usePlayerRemoval } from "../room/usePlayerRemoval.ts";
import { useArenaAccounts } from "../room/useArenaAccounts.ts";
import { RoomFrame, type FramePane } from "../room/RoomFrame.tsx";
import { frameKey, paneShown, roomLayout, shownTab, type RoomPane } from "../room/roomFrame.ts";
import { roomStatus } from "../room/roomStatus.ts";
import { hasSettings, SettingsButton, SettingsSheet, type SettingsParts } from "../room/SettingsSheet.tsx";
import { NoticeLine, StatusLine, type StatusTimer } from "../room/StatusLine.tsx";
import { arenaDisplayName } from "../publicplay/arenaName.ts";
import { hasFinishedGame, markFinishedGame, playedToTheEnd } from "../publicplay/firstGame.ts";
import { useRoundSteps } from "../metrics/useUsageCounts.ts";
import { ReadyBar, showsReadyBar } from "../publicplay/ReadyBar.tsx";
import { OtherArenasLink } from "../publicplay/OtherArenasLink.tsx";
import { linksToChampions, publicResultNotes, otherArenasFrom, showsReadyTags, statusSentenceShown } from "../publicplay/roomParts.ts";
import { rejoinsNow, seatIsGone, type SeatDrop } from "../publicplay/rejoin.ts";
import { useStartStyle } from "../prep/lastStyle.ts";
import { testMatchShown } from "../practice/testMatchShown.ts";
import { nextRulesOf } from "../rules/nextRules.ts";
import {
  browserStore,
  clearPlayerSession,
  clearStrategyDraft,
  readPlayerSession,
  saveNewSeat,
  type PlayerSession,
} from "../session/storage.ts";
import { InvitePane } from "../share/InvitePane.tsx";
import type { ArenaStreamState } from "../stream/streamState.ts";
import { useArenaStream } from "../stream/useArenaStream.ts";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button, LinkButton } from "../ui/Button.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { useToast } from "../ui/Toast.tsx";
import { JoinForm } from "./JoinForm.tsx";
import { SignInToJoin } from "./SignInToJoin.tsx";
import { playerView, type JoinedView, type PlayerView } from "./playerView.ts";
import { StrategyPanel, type PrepTab } from "./StrategyPanel.tsx";
import { useStrategy, type StrategyHandle } from "./useStrategy.ts";

/** The arena name, or the translated name of its kind for a public one (whose name is ""). */
function useArenaName(arena: PublicArena | null): string | undefined {
  const m = useMessages();
  if (arena === null) return undefined;
  return arenaDisplayName(arena.settings, m.publicplay.names);
}

/** True or false once the account answer is known; null while it is not. A server that cannot be reached counts as signed out. */
function signedInOf(account: AccountState): boolean | null {
  return account.kind === "signedIn" ? true : account.kind === "unknown" ? null : false;
}

/** A step sheet in place of the panes. The look sheet remembers where it was opened, so Back returns there. */
type Sheet = { readonly kind: "settings" } | { readonly kind: "look"; readonly from: "settings" | "players" };

interface RoomProps {
  readonly view: JoinedView;
  readonly session: PlayerSession;
  readonly stream: ArenaStreamState;
  /** The stream's chat messages (chat/chatFeed.ts). */
  readonly chatFeed: ChatFeed;
  readonly strategy: StrategyHandle;
  readonly isOwner: boolean;
  readonly arenaName: string;
  readonly autoSeconds: number | null;
  /** A public arena after a game: whole seconds until the next game's first round, or null. */
  readonly nextGameSeconds: number | null;
  /** This finished game is the first one this device played to the end (the result's first-timer tour, guide/RoomTours.tsx). */
  readonly firstResult: boolean;
  /** Notices of the page (this browser cannot remember the seat). */
  readonly notices: ReactNode;
  onLeft(): void;
}

function Prepare({ arena, me, strategy, tab, onTab }: { arena: PublicArena; me: PublicPlayer; strategy: StrategyHandle; tab: PrepTab; onTab(next: PrepTab): void }) {
  return (
    <StrategyPanel
      strategy={strategy}
      playerName={me.name}
      nextRules={nextRulesOf(arena)}
      showRuleSets={arena.settings.ruleSetMode !== "standard"}
      look={me.look}
      tab={tab}
      onTab={onTab}
    />
  );
}

/**
 * The clock of the status line: the round's time left, or a public arena's next step. After
 * a game it counts to the next game's first round (the result time and the lobby's countdown),
 * so a tournament says when the next tournament starts.
 */
function statusTimer(
  view: JoinedView,
  stream: ArenaStreamState,
  seconds: { readonly auto: number | null; readonly nextGame: number | null },
  m: ReturnType<typeof useMessages>,
): StatusTimer | null {
  const { arena } = view;
  const t = m.room.timer;
  if (arena.phase.kind === "running") {
    const clock = roundClock(arena, stream);
    return clock === null ? null : { label: t.timeLeft, text: clock };
  }
  // An owner's arena counts down only to a scheduled start (spec 75); the server's `auto` carries it.
  if (!isPublicKind(arena.settings.kind)) {
    if (seconds.auto === null || arena.phase.kind === "finished") return null;
    return { label: arena.phase.kind === "lobby" ? t.startsIn : t.nextRoundIn, text: formatClock(seconds.auto * 1000) };
  }
  if (arena.phase.kind === "finished") {
    const left = seconds.nextGame ?? seconds.auto;
    if (left === null) return null;
    return { label: arena.settings.kind === "tournament" ? m.publicplay.tournament.nextIn : t.nextGameIn, text: formatClock(left * 1000) };
  }
  if (seconds.auto === null) return null;
  return { label: arena.phase.kind === "lobby" ? t.startsIn : t.nextRoundIn, text: formatClock(seconds.auto * 1000) };
}

/** The Invite pane. The page's address is read when the pane draws, not when the tabs are listed, so a server render (a test) never needs it. */
function RoomInvite({ arenaId }: { readonly arenaId: ArenaId }) {
  return <InvitePane link={`${window.location.origin}${paths.player(arenaId)}`} code={arenaId} />;
}

/** Moves focus back to the control that opened a sheet; it is drawn again after the sheet closes. */
function focusOpener(opens: "settings" | "look"): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-opens="${opens}"]`)?.focus());
}

export function JoinedRoom({ view, session, stream, chatFeed, strategy, isOwner, arenaName, autoSeconds, nextGameSeconds, firstResult, notices, onLeft }: RoomProps) {
  const m = useMessages();
  const { arena, me } = view;
  // The player's statistics card after a round, once their own stream sent this game's (K2).
  const ownStats = stream.ownStats !== null && stream.ownStats.game === arena.game ? stream.ownStats : null;
  const layout = roomLayout(view, isOwner, ownStats !== null);
  const key = frameKey(view);
  const [choice, setChoice] = useState<{ readonly key: string; readonly tab: RoomPane } | null>(null);
  const tab = shownTab(layout, choice?.key === key ? choice.tab : null) ?? "tank";
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  // The tank pane's own tab lives here, above the pane that the frame mounts again when it switches between the phone and laptop layouts.
  const [prepTab, setPrepTab] = useState<PrepTab>("style");
  const accounts = useArenaAccounts(arena, isOwner);
  const removal = usePlayerRemoval(arena, accounts?.reload);
  const laptop = useLaptopLayout();
  const chat = useArenaChat({
    arena,
    seat: { kind: "player", token: session.playerToken, playerId: me.id },
    opens: stream.opens,
    feed: chatFeed,
    visible: paneShown(layout, tab, laptop, sheet !== null, "chat"),
  });

  // A seat this browser just took starts with the play style used last, and any seat gets the style "Play now with it"
  // asked for; the server refuses a save only while the tank plays, so both wait for that.
  useStartStyle(arena.id, me.id, view.kind !== "live", strategy);

  // A sheet belongs to the phase it was opened in: the look cannot change once a round runs.
  const phaseKind = arena.phase.kind;
  useEffect(() => setSheet(null), [phaseKind]);
  // Spec 75, section 6: the real round closes a test match in the Try it tab, and says so.
  const toast = useToast();
  const closedByRound = m.practice.closedByRound;
  useEffect(() => {
    if (phaseKind === "running" && testMatchShown()) toast.show({ message: closedByRound });
    // The toast and the sentence are read when the phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKind]);

  // In the lobby the look is in the Players pane; later the settings hold it, because the panes of those views are about the round.
  const settings: SettingsParts = {
    look: canChangeLook(arena) && view.kind !== "lobby" ? () => setSheet({ kind: "look", from: "settings" }) : null,
    owner: isOwner,
    // The chat's switch sits with the other owner controls, so the chat pane keeps its height for the lines.
    chat: isOwner && arena.chat !== null ? chat : null,
    accounts,
  };
  const status = roomStatus(view, { isOwner, autoSeconds }, m.room);
  const timer = statusTimer(view, stream, { auto: autoSeconds, nextGame: nextGameSeconds }, m);
  const viewerId = view.kind === "live" ? me.id : null;
  const otherArenas = otherArenasFrom(arena);
  // "Show me around" in the board's legend replays the first-round tour (null for a viewer without a tank in the round).
  const showAround = replayRoomTour(view);
  // A public arena's countdown is in the clock; a sentence that changes every second would be read aloud every second.
  const statusBody = timer !== null && arena.phase.kind !== "running" ? undefined : status?.body;
  const action =
    isOwner && arena.phase.kind !== "running" ? (
      <StartControl arena={arena} ownId={me.id} />
    ) : showsReadyBar(arena, me) ? (
      // On a result too: the next game is the next step. The way to the other public arenas is the quiet
      // "Other arenas" link in the status line (OtherArenasLink), so it does not compete with this action.
      <ReadyBar arena={arena} me={me} playerToken={session.playerToken} />
    ) : null;

  function choose(next: RoomPane): void {
    setSheet(null);
    setChoice({ key, tab: next });
  }

  function closeSheet(): void {
    if (sheet?.kind === "look") {
      setSheet(sheet.from === "settings" ? { kind: "settings" } : null);
      focusOpener("look");
      return;
    }
    setSheet(null);
    focusOpener("settings");
  }

  const t = m.room.tabs;
  const pane = (value: RoomPane): FramePane => {
    switch (value) {
      case "tank":
        return { label: t.tank, icon: <SlidersHorizontal aria-hidden size={22} />, content: <Prepare arena={arena} me={me} strategy={strategy} tab={prepTab} onTab={setPrepTab} /> };
      case "players":
        return {
          label: t.players,
          icon: <Users aria-hidden size={22} />,
          content: (
            <PlayersPane
              players={arena.players}
              meId={me.id}
              gameOver={arena.phase.kind === "finished"}
              showReady={showsReadyTags(arena)}
              {...(canRemovePlayers(arena, isOwner) ? { removal } : {})}
              {...(accounts === null ? {} : { emails: accounts.emails })}
              footer={
                <>
                  {canChangeLook(arena) ? (
                    <Button variant="secondary" data-opens="look" onClick={() => setSheet({ kind: "look", from: "players" })}>
                      {m.mytank.change}
                    </Button>
                  ) : null}
                  <LeaveButton arena={arena} playerToken={session.playerToken} onLeft={onLeft} />
                </>
              }
            />
          ),
        };
      case "invite":
        return { label: t.invite, icon: <UserPlus aria-hidden size={22} />, content: <RoomInvite arenaId={arena.id} /> };
      case "arena":
        return { label: t.arena, icon: <LayoutGrid aria-hidden size={22} />, keepMounted: true, content: <ArenaPane arena={arena} stream={stream} viewerId={viewerId} {...(showAround === null ? {} : { onShowAround: showAround })} /> };
      case "ranking":
        return {
          label: t.ranking,
          icon: <ListOrdered aria-hidden size={22} />,
          content: arena.phase.kind === "running" ? <RankingPane arena={arena} stream={stream} viewerId={viewerId} /> : <FinalRankingPane arena={arena} me={me} />,
        };
      case "mytank":
        return {
          label: arena.phase.kind === "running" ? t.mytank : m.stats.tab,
          icon: arena.phase.kind === "running" ? <History aria-hidden size={22} /> : <ChartBar aria-hidden size={22} />,
          content:
            arena.phase.kind !== "running" && ownStats !== null ? (
              <OwnStatsPane stats={ownStats} gameOver={arena.phase.kind === "finished"} />
            ) : strategy.load.kind === "ready" ? (
              <MyTankPane decisions={stream.ownDecisions} strategy={strategy.load.saved} />
            ) : (
              <p role="status" className="animate-pulse-soft text-muted">
                {m.room.loading}
              </p>
            ),
        };
      case "result":
        return { label: t.result, icon: <Trophy aria-hidden size={22} />, content: <ResultPane arena={arena} me={me} notes={publicResultNotes(view, m.publicplay)} /> };
      case "history":
        return { label: m.results.page.tabs.history, icon: <Columns3 aria-hidden size={22} />, content: <HistoryPane arena={arena} viewerId={me.id} /> };
      case "chat":
        return {
          label: t.chat,
          icon: <MessageCircle aria-hidden size={22} />,
          content: <ChatPane chat={chat} look={me.look} />,
          ...(chat.unread ? { dot: m.chat.unread } : {}),
        };
    }
  };

  const sheetContent =
    sheet === null ? null : sheet.kind === "settings" ? (
      <SettingsSheet arena={arena} arenaName={arenaName} parts={settings} onBack={closeSheet} />
    ) : (
      <LookSheet arena={arena} me={me} playerToken={session.playerToken} onBack={closeSheet} />
    );

  return (
    <>
      <RoomFrame
        idBase="room"
        title={arenaName}
        heading={arenaName}
        notices={
          <>
            <ConnectionBanner stream={stream} />
            {notices}
            {view.kind === "live" && strategy.dirty ? <NoticeLine tone="warning" text={m.room.unsavedInRound} /> : null}
          </>
        }
        status={
          status === null ? null : (
            <StatusLine
              tone={status.tone}
              title={status.title}
              sentenceHidden={!statusSentenceShown(view)}
              {...(statusBody === undefined ? {} : { body: statusBody })}
              timer={timer}
              actions={
                <>
                  {/* During a round the arena pane has its own help button (the legend), so a second one here would look the same and mean something else. */}
                  {arena.phase.kind === "running" ? null : <HowItWorksButton onOpen={() => setHowOpen(true)} />}
                  {linksToChampions(arena) ? <ChampionsLink /> : null}
                  {otherArenas === null ? null : <OtherArenasLink kind={otherArenas} />}
                  {hasSettings(settings) ? <SettingsButton onOpen={() => setSheet({ kind: "settings" })} /> : null}
                </>
              }
            />
          )
        }
        action={action}
        layout={layout}
        pane={pane}
        tab={tab}
        onTab={choose}
        sheet={sheetContent}
      />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} onShowAround={replayRoomTour(view)} />
      <RoomTours view={view} stream={stream} isOwner={isOwner} autoSeconds={autoSeconds} firstResult={firstResult} />
    </>
  );
}

/** The page before the player has a seat, or after it is gone: one centred form or sentence. */
function OutsideRoom({ view, arenaId, arenaName, left, notices, onJoined, onJoinAgain }: {
  readonly view: Exclude<PlayerView, JoinedView>;
  readonly arenaId: ArenaId;
  readonly arenaName: string | undefined;
  readonly left: boolean;
  readonly notices: ReactNode;
  onJoined(session: PlayerSession, name: string): void;
  onJoinAgain(): void;
}) {
  const m = useMessages();
  // The tournament has one room; when it is full, the practice arena is offered in the same sentence.
  const fullTournament = view.kind === "join" && view.full && view.arena.settings.kind === "tournament";
  const status = fullTournament ? { tone: "warning" as const, title: m.publicplay.problems.tournamentFull } : roomStatus(view, { isOwner: false, autoSeconds: null }, m.room);
  const joinForm = view.kind === "join" && !view.full;
  // An arena that is gone may have left its result behind (results/EndedArena.tsx).
  const endedResult = useEndedResult(arenaId, view.kind === "closed" || view.kind === "notFound");
  if (endedResult !== null) {
    return (
      <AppShell header={<AppHeader {...(arenaName === undefined ? {} : { title: arenaName })} />} width="narrow" align="center">
        <h1 className="sr-only">{arenaName ?? m.common.pageTitles.player}</h1>
        <EndedArena resultId={endedResult} />
      </AppShell>
    );
  }
  return (
    <AppShell header={<AppHeader {...(arenaName === undefined ? {} : { title: arenaName })} />} width="narrow" align="center">
      {/* While "Change my tank" shows its step sheet, the column takes the main area's height, because the editor fits the box it is given (11.2). */}
      <div className="flex min-w-0 flex-col gap-5 has-[[data-step-sheet]]:min-h-0 has-[[data-step-sheet]]:flex-1">
        {/* The join form names the arena in its own heading. */}
        {joinForm ? null : <h1 className="sr-only">{arenaName ?? m.common.pageTitles.player}</h1>}
        {notices}
        {left && view.kind === "join" ? <NoticeLine tone="info" text={`${m.room.left} ${m.room.leftBody}`} /> : null}
        {/* The join form says what to do in its heading and labels, so it needs no banner above it. */}
        {status === null || joinForm ? null : <StatusBanner {...status} />}
        {view.kind === "loading" ? (
          <p role="status" className="animate-pulse-soft text-muted">
            {m.room.loading}
          </p>
        ) : null}
        {joinForm ? <JoinForm arena={view.arena} arenaName={arenaName ?? view.arena.id} onJoined={onJoined} /> : null}
        {view.kind === "signInToPlay" ? <SignInToJoin arena={view.arena} /> : null}
        {fullTournament ? (
          <div>
            <LinkButton href={paths.playIn("practice")} variant="primary" size="lg">
              {m.publicplay.problems.goToPractice}
            </LinkButton>
          </div>
        ) : view.kind === "join" && view.full ? (
          <HomeLink />
        ) : null}
        {view.kind === "cannotJoin" ? (
          <div className="flex flex-wrap gap-3">
            <LinkButton href={paths.screen(arenaId)} variant="primary" size="lg">
              {m.room.watch}
            </LinkButton>
            <HomeLink quiet />
          </div>
        ) : null}
        {view.kind === "lostSlot" ? (
          <Button size="lg" className="self-start" onClick={onJoinAgain}>
            {m.room.joinAgain}
          </Button>
        ) : null}
        {view.kind === "closed" || view.kind === "notFound" ? <HomeLink /> : null}
      </div>
    </AppShell>
  );
}

export function PlayerPage({ arenaId }: { arenaId: ArenaId }) {
  const m = useMessages();
  const toast = useToast();
  const account = useAccount();
  const [session, setSession] = useState<PlayerSession | null>(() => readPlayerSession(browserStore(), arenaId));
  const [notRemembered, setNotRemembered] = useState(false);
  const [left, setLeft] = useState(false);
  const [drop, setDrop] = useState<SeatDrop | null>(null);
  const [rejoinProblem, setRejoinProblem] = useState<string | null>(null);
  const rejoining = useRef(false);
  const chatFeed = useChatFeed();
  const stream = useArenaStream(arenaId, session?.playerToken ?? null, chatFeed);
  const strategy = useStrategy(arenaId, session?.playerToken ?? null, () => forgetSlot("lost"));
  const arena = stream.arena;
  const view = playerView(stream.connection, arena, session, signedInOf(account));
  const arenaName = useArenaName(arena);
  // The stream state anchors the server's next step and the next game (public arenas) to absolute times.
  const autoSeconds = useSecondsUntil(stream.nextStep?.at ?? null);
  const nextGameSeconds = useSecondsUntil(stream.nextGameAt);
  const firstResult = useFirstResult("me" in view ? view : null);
  useRoundSteps(view);
  // The room's owner controls are for a private arena; a presenter runs the game from the presenter page.
  const isOwner = arena !== null && arena.settings.kind === "private" && ownsArena(account, arenaId);

  // The panel's automatic save waits after a refusal; a new phase is the moment to try again.
  const { clearSaveError } = strategy;
  const phaseKind = arena?.phase.kind;
  useEffect(() => {
    clearSaveError();
  }, [phaseKind, clearSaveError]);

  /** `announce`: a join the person made says the tank's name; a join again after a lost seat keeps the name it had. */
  function joined(next: PlayerSession, name: string, announce: boolean) {
    setNotRemembered(!saveNewSeat(browserStore(), arenaId, next));
    setLeft(false);
    setRejoinProblem(null);
    setSession(next);
    if (announce && arena !== null && isPublicKind(arena.settings.kind)) toast.show({ message: m.room.youAre(name) });
  }

  function forgetSlot(why: SeatDrop) {
    clearPlayerSession(browserStore(), arenaId);
    clearStrategyDraft(browserStore(), arenaId);
    setSession(null);
    setDrop(why);
  }

  // A public arena that no longer lists the stored player (only when the arena was seen with this seat's token).
  const gone = seatIsGone(view, stream.playerToken, session?.playerToken ?? null);
  useEffect(() => {
    if (gone) forgetSlot("lost");
    // forgetSlot only writes state and storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);

  const rejoin = rejoinsNow(drop, view);
  useEffect(() => {
    if (!rejoin || rejoining.current) return;
    rejoining.current = true;
    const { tank } = myTankStore.getSnapshot();
    void joinArena(arenaId, joinRequest(tank.name, tank.look)).then((result) => {
      rejoining.current = false;
      setDrop(null);
      if (!result.ok) {
        // The join form shows with the reason, and the person tries from there.
        setRejoinProblem(describeError(result, "join", m.errors).sentence);
        return;
      }
      myTankStore.setName(result.data.name);
      joined({ playerId: result.data.playerId, playerToken: result.data.playerToken }, result.data.name, false);
    });
    // Runs once per lost seat; the ref keeps a second render from joining twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejoin]);

  const notices = notRemembered ? <NoticeLine tone="warning" text={m.room.notRemembered} /> : null;
  if ("me" in view && session !== null && arenaName !== undefined) {
    return (
      <JoinedRoom
        view={view}
        session={session}
        stream={stream}
        chatFeed={chatFeed}
        strategy={strategy}
        isOwner={isOwner}
        arenaName={arenaName}
        autoSeconds={autoSeconds}
        nextGameSeconds={nextGameSeconds}
        firstResult={firstResult}
        notices={notices}
        onLeft={() => {
          forgetSlot("left");
          setLeft(true);
        }}
      />
    );
  }
  if ("me" in view) return null;
  return (
    <OutsideRoom
      // While the page joins again, it shows the loading line instead of a form that would go a moment later.
      view={rejoin ? { kind: "loading" } : view}
      arenaId={arenaId}
      arenaName={arenaName}
      left={left}
      notices={
        <>
          <ConnectionBanner stream={stream} />
          {notices}
          {rejoinProblem === null || view.kind !== "join" ? null : <NoticeLine tone="warning" text={rejoinProblem} />}
        </>
      }
      onJoined={(next, name) => joined(next, name, true)}
      onJoinAgain={() => forgetSlot("left")}
    />
  );
}

/**
 * Marks this device as one that finished a game, the first time its player's tank plays
 * a game to the end, and says whether the finished game on the screen is that first one.
 * The answer stays true until the room leaves the finished phase, so the result's tour
 * stays eligible for the whole result.
 */
function useFirstResult(view: JoinedView | null): boolean {
  const [first, setFirst] = useState(false);
  const ended = view !== null && playedToTheEnd(view);
  const finished = view?.kind === "finished";
  useEffect(() => {
    if (!finished) {
      setFirst(false);
      return;
    }
    if (ended && !hasFinishedGame()) {
      markFinishedGame();
      setFirst(true);
    }
  }, [finished, ended]);
  return first;
}

function HomeLink({ quiet = false }: { readonly quiet?: boolean }) {
  const m = useMessages();
  return (
    <div>
      <LinkButton href={paths.home()} variant={quiet ? "quiet" : "primary"} size="lg">
        {m.common.goHome}
      </LinkButton>
    </div>
  );
}
