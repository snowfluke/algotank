// Where the chat shows, and what a refused chat call means for the pane. Pure, so the rules
// are tested without a browser. The server's table is in docs/specs/revamp/72-arena-chat.md;
// the page derives from it:
//
// | Arena kind          | Phase                    | arena.chat | Chat entry (tab) | The pane shows                         |
// |---------------------|--------------------------|------------|------------------|----------------------------------------|
// | practice, tournament          | any            | null       | none             | (nothing)                              |
// | private, presenter  | running                  | any        | none             | (the round has the screen)             |
// | private, presenter  | lobby, break, finished   | "on"       | yes              | the lines, the quick lines, the input  |
// | private, presenter  | lobby, break, finished   | "off"      | yes              | "The host turned the chat off."        |
//
// The owner's switch (PUT, any phase) sits in the settings sheet with the other owner controls.
// Everyone keeps the entry while the chat is off, so they learn why it is quiet.

import type { PublicArena } from "@game/arena";
import type { ApiFailure } from "../api/client.ts";

export type ChatPlace = "none" | "open" | "off";

export function chatPlace(arena: PublicArena): ChatPlace {
  if (arena.chat === null || arena.phase.kind === "running") return "none";
  return arena.chat === "on" ? "open" : "off";
}

/**
 * Why the last send did not go out. A wait (`tooFast`, `busy`) ends at `until`, a Date.now()
 * time made from the server's retryAfterMs when the answer arrived; Send stays disabled until then.
 */
export type ChatRefusal =
  | { readonly kind: "tooFast"; readonly until: number }
  | { readonly kind: "busy"; readonly until: number }
  | { readonly kind: "blocked" }
  | { readonly kind: "off" }
  | { readonly kind: "closed" }
  | { readonly kind: "tooLong" }
  /** Any other failure (network, a removed seat): the errors catalog has its sentence. */
  | { readonly kind: "failed"; readonly failure: ApiFailure };

/** The refusal of a failed POST. A wait without a usable retryAfterMs is a server this page cannot read. */
export function refusalOf(failure: ApiFailure, receivedAt: number): ChatRefusal {
  switch (failure.code) {
    case "chat_too_fast":
    case "chat_busy": {
      const wait = failure.error.retryAfterMs;
      if (typeof wait !== "number" || !Number.isFinite(wait) || wait < 0) return { kind: "failed", failure: { ...failure, code: "bad_response" } };
      return { kind: failure.code === "chat_too_fast" ? "tooFast" : "busy", until: receivedAt + wait };
    }
    case "chat_text_blocked":
      return { kind: "blocked" };
    case "chat_off":
      return { kind: "off" };
    case "chat_closed":
      return { kind: "closed" };
    case "chat_text_invalid":
      return { kind: "tooLong" };
    default:
      return { kind: "failed", failure };
  }
}

/** The time a wait ends, or null when the refusal is not a wait. */
export function waitUntil(refusal: ChatRefusal | null): number | null {
  return refusal?.kind === "tooFast" || refusal?.kind === "busy" ? refusal.until : null;
}
