// The presenter page (/a/:id/host), for the owner of a presenter arena on a laptop
// or a phone, in the same frame as the arena room (room/RoomFrame.tsx; the panes per
// phase are in host/hostLayout.ts). Before round 1: how players join, the tanks
// (paged), the big screen, and "Start round 1" in the bottom bar. During a round: the
// time left in the status line and the ranking (paged). In a break: who went through
// and the next rules, with the next start in the bottom bar. Finished: the winner and
// "Play again". The bots switch and "Close arena" are in the settings. Anyone else
// gets a sentence and a way to the room.

import { Columns3, ListOrdered, MessageCircle, Monitor, Trophy, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { ArenaId, PublicArena } from "@game/arena";
import { paths } from "../app/route.ts";
import { ownsArena, useAccount } from "../auth/accountStore.ts";
import { useChatFeed, type ChatFeed } from "../chat/chatFeed.ts";
import { ChatPane } from "../chat/ChatPane.tsx";
import { useArenaChat } from "../chat/useArenaChat.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { arenaDisplayName } from "../publicplay/arenaName.ts";
import { formatClock } from "../live/clock.ts";
import { useSecondsUntil } from "../live/countdown.ts";
import { RankingPane, roundClock } from "../live/panes.tsx";
import { ConnectionBanner } from "../room/ConnectionBanner.tsx";
import { StartControl } from "../room/OwnerControls.tsx";
import { PlayersPane } from "../room/PlayerList.tsx";
import { liveTitle } from "../room/roomStatus.ts";
import { canRemovePlayers, usePlayerRemoval, type PlayerRemoval } from "../room/usePlayerRemoval.ts";
import { useArenaAccounts } from "../room/useArenaAccounts.ts";
import { showsReadyTags } from "../publicplay/roomParts.ts";
import { RoomFrame, type FramePane } from "../room/RoomFrame.tsx";
import { paneShown, shownTab } from "../room/roomFrame.ts";
import { SettingsButton, SettingsSheet } from "../room/SettingsSheet.tsx";
import { StatusLine } from "../room/StatusLine.tsx";
import { useMusicCondition } from "../sound/music.ts";
import { HistoryPane } from "../results/HistoryPane.tsx";
import { ResultLink, resultIdOf } from "../results/ResultLink.tsx";
import { RuleSetLine } from "../rules/RuleSetLine.tsx";
import { InvitePane } from "../share/InvitePane.tsx";
import { snapshotFor, type ArenaStreamState } from "../stream/streamState.ts";
import { useArenaStream } from "../stream/useArenaStream.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { LinkButton } from "../ui/Button.tsx";
import { CopyField } from "../ui/CopyField.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { hostLayout, type HostPane } from "./hostLayout.ts";

function BigScreenPane({ arena }: { readonly arena: PublicArena }) {
  const t = useMessages().room.host;
  return (
    <section aria-label={t.bigScreen} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <h2 className="text-title">{t.bigScreen}</h2>
      <p className="[overflow-wrap:anywhere]">{t.bigScreenIntro}</p>
      <div>
        <LinkButton href={paths.screen(arena.id)} newTab>
          {t.bigScreen}
        </LinkButton>
      </div>
      <CopyField label={t.bigScreenLink} value={`${window.location.origin}${paths.screen(arena.id)}`} />
    </section>
  );
}

/** Who went through, with their ready marks; the owner removes a player here in a break (spec 75, section 4). */
function ThroughPane({ arena, removal, emails }: { readonly arena: PublicArena; readonly removal: PlayerRemoval; readonly emails: ReadonlyMap<string, string> | null }) {
  const m = useMessages();
  const last = arena.rounds.at(-1);
  const through = last === undefined ? [] : arena.players.filter((p) => last.survivors.includes(p.id) && p.status.kind !== "removed");
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <RuleSetLine arena={arena} className="shrink-0 text-lead" />
      <PlayersPane players={through} meId={null} heading={m.room.host.through} showReady={showsReadyTags(arena)} removal={removal} {...(emails === null ? {} : { emails })} />
    </div>
  );
}

function WinnerPane({ arena }: { readonly arena: PublicArena }) {
  const m = useMessages();
  const phase = arena.phase;
  const winner = phase.kind === "finished" ? arena.players.find((p) => p.id === phase.winnerId) : undefined;
  const resultId = resultIdOf(arena);
  return winner === undefined ? (
    <p className="text-title">{m.room.host.noWinner}</p>
  ) : (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <TankBadge look={winner.look} size={88} name={null} angle={-20} className="animate-pop" />
        <p className="min-w-0 flex-1 basis-48 font-display text-heading font-bold [overflow-wrap:anywhere]">{m.room.host.winner(winner.name)}</p>
      </div>
      {resultId === null ? null : <ResultLink resultId={resultId} />}
    </div>
  );
}

/** The presenter's status line: where the game stands. Exported for its test. */
export function statusOf(arena: PublicArena, m: ReturnType<typeof useMessages>): string {
  const s = m.room.status;
  const phase = arena.phase;
  switch (phase.kind) {
    case "lobby":
      return s.lobbyOwner;
    case "running":
      return liveTitle(phase, s);
    case "break":
      return s.breakOwner;
    case "finished":
      return s.finishedOwner;
  }
}

function HostRoom({ arena, stream, chatFeed, name }: { readonly arena: PublicArena; readonly stream: ArenaStreamState; readonly chatFeed: ChatFeed; readonly name: string }) {
  const m = useMessages();
  const t = m.room.tabs;
  const layout = hostLayout(arena);
  const [choice, setChoice] = useState<HostPane | null>(null);
  const tab = shownTab(layout, choice) ?? "invite";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const phaseKind = arena.phase.kind;
  const snapshot = arena.phase.kind === "running" ? snapshotFor(stream, arena.phase.round) : null;
  useMusicCondition(snapshot?.ruleSetId ?? null);
  useEffect(() => setSettingsOpen(false), [phaseKind]);
  const clock = roundClock(arena, stream);
  // A scheduled start (spec 75): the server's `auto` anchors it, so the clock does not trust this device's time.
  const startSeconds = useSecondsUntil(stream.nextStep?.at ?? null);
  const startTimer =
    startSeconds === null || (arena.phase.kind !== "lobby" && arena.phase.kind !== "break")
      ? null
      : { label: arena.phase.kind === "lobby" ? m.room.timer.startsIn : m.room.timer.nextRoundIn, text: formatClock(startSeconds * 1000) };

  const accounts = useArenaAccounts(arena, true);
  const removal = usePlayerRemoval(arena, accounts?.reload);
  const emails = accounts === null ? {} : { emails: accounts.emails };
  const laptop = useLaptopLayout();
  // The owner posts as the host: the session, never a player token (a token would make it a player).
  const chat = useArenaChat({ arena, seat: { kind: "host" }, opens: stream.opens, feed: chatFeed, visible: paneShown(layout, tab, laptop, settingsOpen, "chat") });

  const pane = (value: HostPane): FramePane => {
    switch (value) {
      case "invite":
        return { label: t.invite, icon: <UserPlus aria-hidden size={22} />, content: <InvitePane link={`${window.location.origin}${paths.player(arena.id)}`} code={arena.id} /> };
      case "players":
        return { label: t.players, icon: <Users aria-hidden size={22} />, content: <PlayersPane players={arena.players} meId={null} showReady={showsReadyTags(arena)} {...emails} {...(canRemovePlayers(arena, true) ? { removal } : {})} /> };
      case "screen":
        return { label: t.screen, icon: <Monitor aria-hidden size={22} />, content: <BigScreenPane arena={arena} /> };
      case "ranking":
        return { label: t.ranking, icon: <ListOrdered aria-hidden size={22} />, content: <RankingPane arena={arena} stream={stream} viewerId={null} /> };
      case "through":
        return { label: t.through, icon: <Users aria-hidden size={22} />, content: <ThroughPane arena={arena} removal={removal} emails={accounts?.emails ?? null} /> };
      case "winner":
        return { label: t.winner, icon: <Trophy aria-hidden size={22} />, content: <WinnerPane arena={arena} /> };
      case "history":
        return { label: m.results.page.tabs.history, icon: <Columns3 aria-hidden size={22} />, content: <HistoryPane arena={arena} viewerId={null} /> };
      case "chat":
        return { label: t.chat, icon: <MessageCircle aria-hidden size={22} />, content: <ChatPane chat={chat} look={null} />, ...(chat.unread ? { dot: m.chat.unread } : {}) };
    }
  };

  return (
    <RoomFrame
      idBase="host"
      title={name}
      heading={name}
      notices={<ConnectionBanner stream={stream} />}
      status={
        <StatusLine
          tone="info"
          title={statusOf(arena, m)}
          timer={clock === null ? startTimer : { label: m.room.timer.timeLeft, text: clock }}
          actions={<SettingsButton onOpen={() => setSettingsOpen(true)} />}
        />
      }
      action={arena.phase.kind === "running" ? null : <StartControl arena={arena} />}
      layout={layout}
      pane={pane}
      tab={tab}
      onTab={(next) => {
        setSettingsOpen(false);
        setChoice(next);
      }}
      sheet={
        settingsOpen ? (
          <SettingsSheet
            arena={arena}
            arenaName={name}
            parts={{ look: null, owner: true, chat: arena.chat === null ? null : chat, accounts }}
            onBack={() => {
              setSettingsOpen(false);
              requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-opens="settings"]')?.focus());
            }}
          />
        ) : null
      }
    />
  );
}

export function HostPage({ arenaId }: { arenaId: ArenaId }) {
  const m = useMessages();
  const account = useAccount();
  const chatFeed = useChatFeed();
  const stream = useArenaStream(arenaId, null, chatFeed);
  const arena = stream.arena;
  const name = arena === null ? undefined : arenaDisplayName(arena.settings, m.publicplay.names);
  const isOwner = ownsArena(account, arenaId);
  // The account answer and its own arena arrive after the stream, so a visitor is decided only once both are known.
  const decided = account.kind === "signedOut" || account.kind === "unreachable" || (account.kind === "signedIn" && account.own.kind !== "loading");

  if (stream.connection !== "closed" && arena !== null && decided && isOwner && name !== undefined) {
    return <HostRoom arena={arena} stream={stream} chatFeed={chatFeed} name={name} />;
  }

  let content;
  if (stream.connection === "closed") {
    content = (
      <>
        <StatusBanner tone="info" title={arena === null ? m.room.status.notFound : m.room.status.closed} body={arena === null ? m.room.status.notFoundBody : m.room.status.closedBody} />
        <div>
          <LinkButton href={paths.home()} variant="primary" size="lg">
            {m.common.goHome}
          </LinkButton>
        </div>
      </>
    );
  } else if (arena === null || !decided) {
    content = (
      <p role="status" className="animate-pulse-soft text-muted">
        {m.room.loading}
      </p>
    );
  } else {
    content = (
      <>
        <StatusBanner tone="info" title={m.room.host.notOwner} body={m.room.host.notOwnerBody} />
        <div className="flex flex-wrap gap-3">
          <LinkButton href={paths.player(arenaId)} variant="primary" size="lg">
            {m.room.host.openRoom}
          </LinkButton>
          {account.kind === "signedIn" ? null : (
            <LinkButton href={paths.signIn(paths.host(arenaId))} size="lg">
              {m.room.host.signIn}
            </LinkButton>
          )}
        </div>
      </>
    );
  }

  return (
    <AppShell header={<AppHeader {...(name === undefined ? {} : { title: name })} />} width="narrow" align="center">
      <div className="flex min-w-0 flex-col gap-5">
        <h1 className="sr-only">{name ?? m.common.pageTitles.host}</h1>
        <ConnectionBanner stream={stream} />
        {content}
      </div>
    </AppShell>
  );
}
