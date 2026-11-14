// The chat of one arena for one reader: the lines, the draft, the last refusal, the unread
// mark and the owner's switch. The room (player/PlayerPage.tsx) and the presenter page
// (host/HostPage.tsx) call it once, above their panes, because a pane unmounts when another
// tab shows and the unread dot on the Chat tab must know about lines that arrive meanwhile.
//
// The lines come from three places (chat/chatLog.ts merges them by id): the history (GET),
// read when the hook mounts, after every reconnect of the stream and when the owner turns the
// chat on again; the stream's `chat` and `chatRemoved` (through the page's ChatFeed); and the
// answer to this page's own POST, which may arrive before the stream's copy.

import { useEffect, useReducer, useState } from "react";
import { parseChatText, type ChatMessage, type PlayerId, type PublicArena } from "@game/arena";
import { getChat, postChat, setChatOn, type ApiFailure } from "../api/client.ts";
import type { ChatFeed } from "./chatFeed.ts";
import { EMPTY_CHAT_LOG, hasUnread, reduceChatLog, seenMarkOf, type SeenMark } from "./chatLog.ts";
import { chatPlace, refusalOf, waitUntil, type ChatPlace, type ChatRefusal } from "./chatRules.ts";

/** Who reads and writes: a player by their seat and token, or the owner on the host page (the session, no token). */
export type ChatSeat = { readonly kind: "player"; readonly token: string; readonly playerId: PlayerId } | { readonly kind: "host" };

export interface ArenaChatInput {
  readonly arena: PublicArena;
  readonly seat: ChatSeat;
  /** ArenaStreamState.opens: the history is read again after every reconnect. */
  readonly opens: number;
  readonly feed: ChatFeed;
  /** The chat pane is on the screen now, so its lines count as seen. */
  readonly visible: boolean;
}

export type ChatLoad = { readonly kind: "loading" } | { readonly kind: "ready" } | { readonly kind: "failed"; readonly failure: ApiFailure };

export interface ArenaChat {
  readonly place: ChatPlace;
  readonly seat: ChatSeat;
  /** Oldest first. */
  readonly lines: readonly ChatMessage[];
  /** "loading" only until the first history arrives; a later read keeps the lines on screen. */
  readonly load: ChatLoad;
  readonly draft: string;
  setDraft(text: string): void;
  /** Sends the draft ("draft", which then clears) or a quick line ("quick", which leaves the draft alone). */
  send(text: string, source: "draft" | "quick"): void;
  readonly sending: boolean;
  /** Why the last send did not go out, until the next send or until the chat opens or closes. */
  readonly refusal: ChatRefusal | null;
  /** Someone else wrote while the pane was not on the screen. */
  readonly unread: boolean;
  /** The owner's switch: the state it shows (the asked one while the server answers), and a failed PUT. */
  readonly setting: { readonly on: boolean; readonly busy: boolean; readonly failure: ApiFailure | null };
  setOn(on: boolean): void;
}

export function useArenaChat({ arena, seat, opens, feed, visible }: ArenaChatInput): ArenaChat {
  const place = chatPlace(arena);
  const [log, dispatch] = useReducer(reduceChatLog, EMPTY_CHAT_LOG);
  const [load, setLoad] = useState<ChatLoad>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<ChatRefusal | null>(null);
  const [seen, setSeen] = useState<SeenMark>(null);
  const [requested, setRequested] = useState<boolean | null>(null);
  const [settingBusy, setSettingBusy] = useState(false);
  const [settingFailure, setSettingFailure] = useState<ApiFailure | null>(null);

  const token = seat.kind === "player" ? seat.token : null;
  const on = arena.chat === "on";

  useEffect(() => feed.subscribe(dispatch), [feed]);

  // GET answers chat_off while the chat is off, so the history is read while it is on: on mount,
  // after each reconnect, and again when the owner turns it on (the kept lines come back).
  useEffect(() => {
    if (!on) return;
    let live = true;
    void getChat(arena.id, token === null ? { kind: "host" } : { kind: "player", token }).then((result) => {
      if (!live) return;
      if (result.ok) {
        dispatch({ type: "history", messages: result.data.messages });
        setLoad({ kind: "ready" });
      } else {
        setLoad((old) => (old.kind === "ready" ? old : { kind: "failed", failure: result }));
      }
    });
    return () => {
      live = false;
    };
  }, [arena.id, token, opens, on]);

  // A refusal belongs to the moment it answered: when the chat opens, closes or a round starts, it no longer holds.
  useEffect(() => setRefusal(null), [place]);

  const newest = seenMarkOf(log.lines);
  const showing = visible && place === "open";
  useEffect(() => {
    if (showing) setSeen(newest);
    // The mark is two values; the effect follows them, not the object made each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing, newest?.at, newest?.id]);

  useEffect(() => {
    if (requested !== null && on === requested) setRequested(null);
  }, [on, requested]);

  function send(raw: string, source: "draft" | "quick"): void {
    const until = waitUntil(refusal);
    if (sending || (until !== null && Date.now() < until)) return;
    // The one validator of chat text (packages/arena), so the server's 400 is prevented, not answered.
    const text = parseChatText(raw);
    if (text === null) {
      setRefusal(raw.trim() === "" ? null : { kind: "tooLong" });
      return;
    }
    setSending(true);
    setRefusal(null);
    void postChat(arena.id, token === null ? { kind: "host" } : { kind: "player", token }, text).then((result) => {
      setSending(false);
      if (!result.ok) {
        setRefusal(refusalOf(result, Date.now()));
        return;
      }
      dispatch({ type: "chat", message: result.data });
      // Only the text that was sent clears: a draft typed while the line was on its way stays.
      if (source === "draft") setDraft((current) => (current === raw ? "" : current));
    });
  }

  function setOn(next: boolean): void {
    setRequested(next);
    setSettingBusy(true);
    setSettingFailure(null);
    void setChatOn(arena.id, next).then((result) => {
      setSettingBusy(false);
      if (result.ok) return;
      setRequested(null);
      setSettingFailure(result);
    });
  }

  return {
    place,
    seat,
    lines: log.lines,
    load,
    draft,
    setDraft,
    send,
    sending,
    refusal,
    unread: !showing && place === "open" && hasUnread(log.lines, seen, seat),
    setting: { on: requested ?? on, busy: settingBusy, failure: settingFailure },
    setOn,
  };
}
