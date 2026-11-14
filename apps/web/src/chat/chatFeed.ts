// Carries the chat messages of the event stream from the page that opens the stream
// (stream/useArenaStream.ts) to the chat hook further down the page (chat/useArenaChat.ts).
// The stream opens before the room knows the player has a seat, so the two cannot share one
// hook; the feed keeps them apart without a module-level store. A message published while no
// one listens is lost on purpose: the chat hook reads the history when it mounts.

import { useState } from "react";
import type { ChatStreamMessage } from "./chatWire.ts";

export interface ChatFeed {
  publish(message: ChatStreamMessage): void;
  /** Returns the function that stops listening. */
  subscribe(listener: (message: ChatStreamMessage) => void): () => void;
}

function createChatFeed(): ChatFeed {
  const listeners = new Set<(message: ChatStreamMessage) => void>();
  return {
    publish(message) {
      for (const listener of listeners) listener(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One feed for the life of the page. */
export function useChatFeed(): ChatFeed {
  return useState(createChatFeed)[0];
}
