// The big screen for a projector, at 1920x1080 read from 5 m. It has no controls
// besides the language and the sound, and a margin against projector overscan.
// `data-scale="screen"` makes every type token larger inside it.

import type { ReactNode } from "react";
import type { ArenaId, PublicArena } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { LanguageSwitch } from "../i18n/LanguageSwitch.tsx";
import { LiveRound } from "../live/LiveRound.tsx";
import { SoundControl } from "../sound/SoundControl.tsx";
import { snapshotFor, type ArenaStreamState } from "../stream/streamState.ts";
import { useArenaStream } from "../stream/useArenaStream.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { StreamStatus } from "../ui/StreamStatus.tsx";
import { useFitLayout, useLaptopLayout } from "../ui/layout.ts";
import { BreakScreen } from "./BreakScreen.tsx";
import { FinishedScreen } from "./FinishedScreen.tsx";
import { arenaDisplayName } from "../publicplay/arenaName.ts";
import { LobbyScreen } from "./LobbyScreen.tsx";
import { SCREEN_SCALE_STYLE } from "./screenScale.ts";

export function ScreenPage({ arenaId }: { arenaId: ArenaId }) {
  const m = useMessages();
  // No chat feed: the stream asks for no chat, so a projector never carries a line nobody checked.
  const stream = useArenaStream(arenaId, null, null);
  const arena = stream.arena;
  // A projector (a laptop-wide window with the fixed-height layout) shows everything in the viewport
  // height. A phone that opens the screen link, or a short window, scrolls like any page.
  const laptop = useLaptopLayout();
  const fit = useFitLayout();
  const wide = laptop && fit;

  return (
    <main
      data-scale="screen"
      style={SCREEN_SCALE_STYLE}
      className={`flex flex-col gap-[2vh] bg-ground ${wide ? "h-dvh min-h-0 overflow-hidden px-[3vw] py-[3vh]" : "min-h-dvh p-4"}`}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <TankBadge colour={1} size={44} name={null} detail="full" angle={-20} className="h-[1.6em] w-[1.6em]" />
        <p className="min-w-0 flex-1 basis-40 truncate font-display text-title font-semibold text-muted">
          {arena === null ? null : arenaDisplayName(arena.settings, m.publicplay.names)}
          {arena === null || arena.game <= 1 ? null : <span className="ml-4 font-sans text-body">{m.screen.game(arena.game)}</span>}
        </p>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <SoundControl />
        </div>
      </div>
      <StreamStatus arenaId={arenaId} stream={stream} />
      {/* A closed stream ends the game here, so the last phase and its "what happens next" line would be stale. */}
      {stream.connection === "closed" ? null : arena === null ? (
        <p className="animate-pulse-soft text-lead text-muted">{m.screen.loading}</p>
      ) : (
        <div className={wide ? "min-h-0 flex-1" : ""}>
          <PhaseView arena={arena} stream={stream}>
            {arena.phase.kind === "running" ? (
              <LiveRound
                arena={arena}
                phase={arena.phase}
                snapshot={snapshotFor(stream, arena.phase.round)}
                throws={stream.throws}
                layout={wide ? "screen" : "narrow"}
                firstTurnAt={stream.firstTurnAt}
              />
            ) : null}
          </PhaseView>
        </div>
      )}
    </main>
  );
}

/** Picks the screen of the current phase. The running screen comes in as children because it needs the stream. */
function PhaseView({ arena, stream, children }: { arena: PublicArena; stream: ArenaStreamState; children: ReactNode }) {
  switch (arena.phase.kind) {
    case "lobby":
      return <LobbyScreen arena={arena} nextStep={stream.nextStep} />;
    case "running":
      return children;
    case "break":
      return <BreakScreen arena={arena} nextRound={arena.phase.nextRound} nextStep={stream.nextStep} />;
    case "finished":
      return <FinishedScreen arena={arena} winnerId={arena.phase.winnerId} nextStep={stream.nextStep} />;
  }
}
