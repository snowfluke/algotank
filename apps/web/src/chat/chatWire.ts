// The one check of a chat message from the server, used by the stream (`chat` events) and by
// the answers of GET and POST /api/arenas/:id/chat (api/client.ts). The page draws the
// sender's name and tank and the text, so each of them is checked before the page trusts it.

import { parseChatText, parseTankLook, type ChatHistoryResponse, type ChatMessage, type ChatSender, type StreamMessage } from "@game/arena";

/** The stream messages of the chat, which only a player's and the owner's streams carry. */
export type ChatStreamMessage = Extract<StreamMessage, { readonly type: "chat" | "chatRemoved" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatSender(value: unknown): value is ChatSender {
  if (!isRecord(value)) return false;
  if (value["kind"] === "host") return true;
  return (
    value["kind"] === "player" &&
    typeof value["playerId"] === "string" &&
    typeof value["name"] === "string" &&
    value["name"] !== "" &&
    parseTankLook(value["look"]) !== null
  );
}

export function isChatMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    value["id"] !== "" &&
    typeof value["at"] === "number" &&
    Number.isFinite(value["at"]) &&
    // The server stores the result of parseChatText, so a text it would change did not come from that server.
    typeof value["text"] === "string" &&
    parseChatText(value["text"]) === value["text"] &&
    isChatSender(value["sender"])
  );
}

export function isChatHistoryResponse(value: unknown): value is ChatHistoryResponse {
  return isRecord(value) && Array.isArray(value["messages"]) && value["messages"].every(isChatMessage);
}
