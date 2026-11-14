// Which panes the presenter page shows in each phase, in the same shape as the arena
// room's table (room/roomFrame.ts), so the same frame draws both.
//
// | Phase    | Phone tabs (first opens)          | Laptop                                              |
// |----------|-----------------------------------|-----------------------------------------------------|
// | lobby    | invite, players, screen, (chat)   | [invite] [players (or chat)] [big screen], one view |
// | running  | ranking                           | [ranking]                                           |
// | break    | through, (chat)                   | [through] [chat]                                    |
// | finished | winner, history, (chat)           | [winner] [chat]; then a tab with [history]          |
//
// (chat) is there while the arena has a chat and no round runs (chat/chatRules.ts, chatPlace).
// In the lobby it shares the players column, so the big screen keeps its place.
// (history) is the round history of the game (75-organiser-tournament.md section 5), a whole pane of its own.

import type { PublicArena } from "@game/arena";
import { chatPlace } from "../chat/chatRules.ts";
import type { FrameLayout } from "../room/roomFrame.ts";

export type HostPane = "invite" | "players" | "screen" | "ranking" | "through" | "winner" | "chat" | "history";

/** One pane, with the chat beside it when the arena has one. */
const withChat = (pane: HostPane, chat: boolean): FrameLayout<HostPane> =>
  chat
    ? { tabs: [pane, "chat"], laptop: [{ value: pane, columns: [{ panes: [pane], width: "main" }, { panes: ["chat"], width: "side" }] }] }
    : { tabs: [pane], laptop: [{ value: pane, columns: [{ panes: [pane], width: "main" }] }] };

export function hostLayout(arena: PublicArena): FrameLayout<HostPane> {
  const chat = chatPlace(arena) !== "none";
  switch (arena.phase.kind) {
    case "lobby":
      return {
        tabs: ["invite", "players", "screen", ...(chat ? (["chat"] as const) : [])],
        laptop: [
          {
            value: "invite",
            columns: [
              { panes: ["invite"], width: "side" },
              { panes: ["players", ...(chat ? (["chat"] as const) : [])], width: "main" },
              { panes: ["screen"], width: "side" },
            ],
          },
        ],
      };
    case "running":
      return withChat("ranking", false);
    case "break":
      return withChat("through", chat);
    case "finished": {
      const winner = withChat("winner", chat);
      return {
        tabs: ["winner", "history", ...winner.tabs.slice(1)],
        laptop: [...winner.laptop, { value: "history", columns: [{ panes: ["history"], width: "main" }] }],
      };
    }
  }
}
