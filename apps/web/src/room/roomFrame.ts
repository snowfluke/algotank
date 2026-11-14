// Which panes the arena room shows in each view, and how they are arranged. One pure
// table, so every view is listed and tested, and the frame (room/RoomFrame.tsx) only
// draws. On a phone the panes are tabs (BottomTabs), one at a time, and the first tab
// is where a view opens. On a laptop panes sit side by side in groups: a "main" column
// that takes the rest of the width and "side" columns of 20rem; a side column with two
// panes switches between them; a view with more than one group keeps BottomTabs for
// the groups.
//
// | View                      | Phone tabs (first opens)        | Laptop groups                                      |
// |---------------------------|---------------------------------|----------------------------------------------------|
// | lobby                     | tank, players, invite, (chat)   | [players or invite (or chat)] [tank]               |
// | live                      | arena, ranking, mytank          | [arena] [ranking or mytank]                        |
// | watching, waiting player  | arena, ranking, tank            | [arena] [ranking]; then a tab with [tank]          |
// | watching, out             | arena, ranking                  | [arena] [ranking]                                  |
// | break; finished (public)  | result, ranking, (players),     | [result] [ranking (or players) (or mytank)]; then  |
// |                           | (mytank), tank, (chat)          | tabs with [tank], ([chat])                         |
// | finished (private,        | result, history, (mytank),      | [result] [ranking (or mytank)]; then tabs with     |
// |   presenter)              | tank, (chat)                    | [history], [tank], ([chat])                        |
// | out (break, eliminated)   | result, ranking, (players),     | [result] [ranking (or players) (or mytank)]; (then |
// |                           | (mytank), (chat)                | a tab with [chat])                                 |
// | waitingBreak              | tank, ranking, (chat)           | [ranking] [tank]; (then a tab with [chat])         |
//
// (chat) is there when the arena has a chat and no round runs (chat/chatRules.ts, chatPlace):
// a private or presenter arena while people wait. During a round the screen belongs to the game.
// (players) in a break is for the owner of a private arena, who may remove a player there (spec 75).
// (mytank) after a round is the player's statistics card (K2, 81-metrics.md), there once the
// player's own statistics of this game arrived (`hasStats`); during a round it is the turn feed.
// (history) is the round history of an owner's tournament (75-organiser-tournament.md section 5).
// On a phone it takes the ranking's tab, because its final column is that ranking and the earlier
// columns show every other place; on a laptop the ranking stays beside the result.

import { isPublicKind } from "@game/arena";
import { chatPlace } from "../chat/chatRules.ts";
import type { JoinedView } from "../player/playerView.ts";

export type RoomPane = "tank" | "players" | "invite" | "arena" | "ranking" | "mytank" | "result" | "chat" | "history";

export interface FrameColumn<P extends string> {
  /** One pane, or two with a switch above them. */
  readonly panes: readonly P[];
  /** "main" takes the width that is left; "side" is 20rem. */
  readonly width: "main" | "side";
}

export interface LaptopGroup<P extends string> {
  /** The tab value of the group when a view has more than one group. */
  readonly value: P;
  readonly columns: readonly FrameColumn<P>[];
}

export interface FrameLayout<P extends string> {
  /** Phone: one pane at a time, in this order. The first one is where the view opens. */
  readonly tabs: readonly P[];
  /** Laptop: groups of panes side by side. More than one group gets BottomTabs. */
  readonly laptop: readonly LaptopGroup<P>[];
}

const main = <P extends string>(...panes: P[]): FrameColumn<P> => ({ panes, width: "main" });
const side = <P extends string>(...panes: P[]): FrameColumn<P> => ({ panes, width: "side" });

/** `isOwner`: the owner of a private arena, who removes players in a break too (spec 75, section 4), so a break gives them the Players pane. */
export function roomLayout(view: JoinedView, isOwner = false, hasStats = false): FrameLayout<RoomPane> {
  const ownerPlayers: RoomPane[] = isOwner ? ["players"] : [];
  const mytank: RoomPane[] = hasStats ? ["mytank"] : [];
  // Spread into a tab list or a column, so a room without chat has no trace of it.
  const chat: RoomPane[] = chatPlace(view.arena) === "none" ? [] : ["chat"];
  // After a round the ranking's column keeps its full height (a switch above it would take a row), so the chat is a group of its own.
  const chatGroup: LaptopGroup<RoomPane>[] = chat.length === 0 ? [] : [{ value: "chat", columns: [main("chat")] }];
  switch (view.kind) {
    case "lobby":
      return { tabs: ["tank", "players", "invite", ...chat], laptop: [{ value: "tank", columns: [side("players", "invite", ...chat), main("tank")] }] };
    case "live":
      return { tabs: ["arena", "ranking", "mytank"], laptop: [{ value: "arena", columns: [main("arena"), side("ranking", "mytank")] }] };
    case "watching":
      // A player who joined during the game prepares for the next one; a player who is out only watches.
      return view.me.status.kind === "waiting"
        ? {
            tabs: ["arena", "ranking", "tank"],
            laptop: [
              { value: "arena", columns: [main("arena"), side("ranking")] },
              { value: "tank", columns: [main("tank")] },
            ],
          }
        : { tabs: ["arena", "ranking"], laptop: [{ value: "arena", columns: [main("arena"), side("ranking")] }] };
    case "finished":
      if (!isPublicKind(view.arena.settings.kind)) {
        return {
          tabs: ["result", "history", ...mytank, "tank", ...chat],
          laptop: [
            { value: "result", columns: [main("result"), side("ranking", ...mytank)] },
            { value: "history", columns: [main("history")] },
            { value: "tank", columns: [main("tank")] },
            ...chatGroup,
          ],
        };
      }
      return {
        tabs: ["result", "ranking", ...mytank, "tank", ...chat],
        laptop: [{ value: "result", columns: [main("result"), side("ranking", ...mytank)] }, { value: "tank", columns: [main("tank")] }, ...chatGroup],
      };
    case "break":
      return {
        tabs: ["result", "ranking", ...ownerPlayers, ...mytank, "tank", ...chat],
        laptop: [{ value: "result", columns: [main("result"), side("ranking", ...ownerPlayers, ...mytank)] }, { value: "tank", columns: [main("tank")] }, ...chatGroup],
      };
    case "out":
      return {
        tabs: ["result", "ranking", ...ownerPlayers, ...mytank, ...chat],
        laptop: [{ value: "result", columns: [main("result"), side("ranking", ...ownerPlayers, ...mytank)] }, ...chatGroup],
      };
    case "waitingBreak":
      return { tabs: ["tank", "ranking", ...chat], laptop: [{ value: "tank", columns: [side("ranking"), main("tank")] }, ...chatGroup] };
  }
}

/**
 * True when `pane` is on the screen: the chosen tab on a phone; on a laptop, the pane a column
 * of the shown group shows. A step sheet covers every pane. The chat reads it for its unread mark.
 */
export function paneShown<P extends string>(layout: FrameLayout<P>, tab: P, laptop: boolean, sheetOpen: boolean, pane: P): boolean {
  if (sheetOpen) return false;
  if (!laptop) return tab === pane;
  const group = laptopGroupOf(layout, tab);
  return group?.columns.some((column) => columnPaneOf(column, tab) === pane) ?? false;
}

/**
 * A key that changes when the room moves to another phase or round, so the chosen tab
 * goes back to where the new view opens: a player who sat on Ranking during a round
 * sees the result after it, not the ranking of the round.
 */
export function frameKey(view: JoinedView): string {
  const phase = view.arena.phase;
  const round = phase.kind === "running" ? phase.round : phase.kind === "break" ? phase.nextRound : 0;
  return `${view.kind}:${view.me.status.kind}:${phase.kind}:${round}:${view.arena.game}`;
}

/** The laptop group that shows `tab`, or the first group for a tab the laptop does not have. */
export function laptopGroupOf<P extends string>(layout: FrameLayout<P>, tab: P): LaptopGroup<P> | undefined {
  return layout.laptop.find((group) => group.value === tab || group.columns.some((column) => column.panes.includes(tab))) ?? layout.laptop[0];
}

/** The pane a column shows: `tab` when the column holds it, otherwise its first pane. */
export function columnPaneOf<P extends string>(column: FrameColumn<P>, tab: P): P | undefined {
  return column.panes.includes(tab) ? tab : column.panes[0];
}

/** The tab to show: the chosen one when this view has it, otherwise the view's first tab. */
export function shownTab<P extends string>(layout: FrameLayout<P>, chosen: P | null): P | undefined {
  return chosen !== null && layout.tabs.includes(chosen) ? chosen : layout.tabs[0];
}
