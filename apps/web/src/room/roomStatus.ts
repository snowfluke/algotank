// The one banner at the top of the arena room: where the game stands and what
// happens next. A pure function of the view, so every case is tested.

import { isPublicKind } from "@game/arena";
import type { StatusTone } from "../ui/StatusBanner.tsx";
import type { PlayerView } from "../player/playerView.ts";
import { roundKind } from "../live/roundHeading.ts";
import type { RoomText } from "./messages.ts";

export interface RoomStatus {
  readonly tone: StatusTone;
  readonly title: string;
  readonly body?: string;
}

export interface StatusContext {
  /** The signed-in account owns this arena. */
  readonly isOwner: boolean;
  /** Whole seconds until the server's next automatic step (public arenas), or null. */
  readonly autoSeconds: number | null;
}

function winnerName(view: Extract<PlayerView, { kind: "finished" }>): string | null {
  const phase = view.arena.phase;
  if (phase.kind !== "finished") return null;
  return view.arena.players.find((p) => p.id === phase.winnerId)?.name ?? null;
}

/** The title of a running round, named by roundKind (live/roundHeading.ts). */
export function liveTitle(phase: { readonly round: number; readonly isFinal: boolean }, s: RoomText["status"]): string {
  const kind = roundKind(phase);
  return kind === "game" ? s.liveGame : kind === "final" ? s.liveFinal : s.live(phase.round);
}

export function roomStatus(view: PlayerView, ctx: StatusContext, t: RoomText): RoomStatus | null {
  const s = t.status;
  const isPublic = "arena" in view && isPublicKind(view.arena.settings.kind);
  const timer = (sentence: (n: number) => string, otherwise: string): string =>
    ctx.autoSeconds === null ? otherwise : sentence(ctx.autoSeconds);
  switch (view.kind) {
    case "loading":
      return null;
    case "notFound":
      return { tone: "warning", title: s.notFound, body: s.notFoundBody };
    case "closed":
      return { tone: "info", title: s.closed, body: s.closedBody };
    case "join":
      if (view.full) return { tone: "warning", title: s.full, body: s.fullBody };
      return { tone: "info", title: s.join, body: s.joinBody };
    case "cannotJoin":
      return { tone: "info", title: view.arena.phase.kind === "finished" ? s.finished : s.started, body: s.cannotJoinBody };
    case "lostSlot":
      return { tone: "warning", title: s.lostSlot, body: s.lostSlotBody };
    case "signInToPlay":
      // player/SignInToJoin.tsx says it, with the sign-in action in the same block.
      return null;
    case "lobby":
      // A phone shows only the title when both do not fit in two lines (StatusLine.tsx), so a guest's
      // title itself says who starts the game: nothing else on a private lobby tells them.
      if (!isPublic && !ctx.isOwner) return { tone: "info", title: s.lobbyGuest, body: s.lobbyWait };
      return {
        tone: "info",
        title: isPublic ? s.lobbyPublic : s.lobby,
        body: ctx.isOwner ? s.lobbyOwner : timer(s.startsIn, s.startsSoon),
      };
    case "live": {
      const phase = view.arena.phase;
      return { tone: "info", title: phase.kind === "running" ? liveTitle(phase, s) : s.live(1), body: s.liveBody };
    }
    case "watching": {
      if (view.me.status.kind === "waiting") return { tone: "info", title: s.waiting, body: s.waitingBody };
      const round = view.arena.phase.kind === "running" ? view.arena.phase.round : 1;
      return { tone: "info", title: s.watchingOut(round), body: s.watchingOutBody };
    }
    case "break": {
      const phase = view.arena.phase;
      const tanksLeft = view.arena.players.filter((p) => p.status.kind === "playing").length;
      const title = tanksLeft <= 8 ? s.breakFinal : s.breakThrough(phase.kind === "break" ? phase.nextRound : 2);
      const body = ctx.isOwner ? s.breakOwner : isPublic ? timer(s.nextRoundIn, s.breakWait) : s.breakWait;
      return { tone: "success", title, body };
    }
    case "out":
      return { tone: "info", title: s.out, body: s.outBody };
    case "waitingBreak":
      return { tone: "info", title: s.waiting, body: s.waitingBody };
    case "finished": {
      const name = winnerName(view);
      const won = view.me.status.kind === "winner";
      const title = won ? s.winnerYou : name === null ? s.finished : s.winner(name);
      const tone = won ? "success" : "info";
      // A private guest has no clock and no button, so the title says what comes next and the
      // winner, which the result pane under it already names in large type, moves to the body.
      if (!isPublic && !ctx.isOwner) return { tone: "info", title: s.finishedWait, body: title };
      const body = ctx.isOwner ? s.finishedOwner : timer(s.nextGameIn, s.startsSoon);
      return { tone, title, body };
    }
  }
}
