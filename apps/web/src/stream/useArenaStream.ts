// The one hook that opens the event stream of an arena. EventSource reconnects by
// itself after a network drop, and the server resends the arena state on each
// connect. After an HTTP error status the browser gives up, so the hook opens a
// new EventSource after a growing wait, until the arena itself answers 404. Before
// the first open the hook asks at once, so a wrong code shows "does not exist"
// right after the loading state (stream/reconnect.ts has the rule).

import { useEffect, useReducer, useRef } from "react";
import type { ArenaId } from "@game/arena";
import { getArena } from "../api/client.ts";
import type { ChatFeed } from "../chat/chatFeed.ts";
import { CHAT_EVENT_NAMES, parseStreamMessage, STREAM_EVENT_NAMES } from "./parseStreamMessage.ts";
import { nextRetryDelayMs, RETRY_FIRST_MS, streamErrorPlan } from "./reconnect.ts";
import { INITIAL_STREAM_STATE, reduceStream, type ArenaStreamState } from "./streamState.ts";

/**
 * Pass the player token to receive the player's own decisions, or null to watch. `chat` is the
 * feed that gets the chat's stream messages (chat/chatFeed.ts); with null the stream asks the
 * server for no chat at all (`chat=0`), because the big screen opened in the owner's browser
 * carries the owner's session, and a projector must never show chat.
 */
export function useArenaStream(arenaId: ArenaId, playerToken: string | null, chat: ChatFeed | null): ArenaStreamState {
  const [state, dispatch] = useReducer(reduceStream, INITIAL_STREAM_STATE);
  // A ref, so a new feed object does not reopen the stream; whether the page reads chat at all is fixed per page.
  const feed = useRef(chat);
  feed.current = chat;
  const readsChat = chat !== null;

  useEffect(() => {
    const params = new URLSearchParams(playerToken === null ? {} : { token: playerToken });
    if (!readsChat) params.set("chat", "0");
    const search = params.toString();
    const query = search === "" ? "" : `?${search}`;
    const url = `/api/arenas/${encodeURIComponent(arenaId)}/events${query}`;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let everOpened = false;
    let waitMs = RETRY_FIRST_MS;

    // The old state belongs to another arena or token. A reopen after an error keeps it, so a screen does not blank.
    dispatch({ kind: "reset", playerToken });

    function scheduleReopen(checkInMs: number, reopenAfterMs: number) {
      timer = setTimeout(async () => {
        const result = await getArena(arenaId);
        if (stopped) return;
        if (!result.ok && result.status === 404) {
          dispatch({ kind: "connection", connection: "closed" });
          return;
        }
        // The arena exists (or the server did not answer), so the failed stream is a connection problem worth saying.
        dispatch({ kind: "connection", connection: "reconnecting" });
        timer = setTimeout(open, reopenAfterMs);
      }, checkInMs);
      waitMs = nextRetryDelayMs(waitMs);
    }

    function open() {
      const next = new EventSource(url);
      source = next;
      next.onopen = () => {
        everOpened = true;
        waitMs = RETRY_FIRST_MS;
        dispatch({ kind: "connection", connection: "open" });
      };
      next.onerror = () => {
        const plan = streamErrorPlan(everOpened, next.readyState === EventSource.CLOSED, waitMs);
        if (plan.sayReconnecting) dispatch({ kind: "connection", connection: "reconnecting" });
        if (plan.checkArenaInMs !== null) scheduleReopen(plan.checkArenaInMs, plan.reopenAfterCheckMs);
      };
      for (const name of STREAM_EVENT_NAMES) {
        next.addEventListener(name, (event) => {
          const parsed = parseStreamMessage(name, (event as MessageEvent<string>).data);
          dispatch(parsed.ok ? { kind: "message", message: parsed.message, receivedAt: Date.now() } : { kind: "unreadable", reason: parsed.reason });
          // The arena is gone, so reconnecting would only meet a 404.
          if (parsed.ok && parsed.message.type === "closed") {
            stopped = true;
            next.close();
          }
        });
      }
      if (!readsChat) return;
      for (const name of CHAT_EVENT_NAMES) {
        next.addEventListener(name, (event) => {
          const parsed = parseStreamMessage(name, (event as MessageEvent<string>).data);
          if (!parsed.ok) dispatch({ kind: "unreadable", reason: parsed.reason });
          else if (parsed.message.type === "chat" || parsed.message.type === "chatRemoved") feed.current?.publish(parsed.message);
        });
      }
    }

    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [arenaId, playerToken, readsChat]);

  // The player reads only the catalog's sentence (room/ConnectionBanner.tsx); the parser's own
  // English reason goes to the console for whoever debugs it.
  useEffect(() => {
    if (state.protocolError !== null) console.error(`Unreadable arena message: ${state.protocolError}`);
  }, [state.protocolError]);

  return state;
}
