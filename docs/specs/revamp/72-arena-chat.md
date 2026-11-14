# Work packages CH1a and CH1b: chat in an arena's waiting room

Read `00-overview.md` first. Owner's request, verbatim (2026-11-12): "Arena chat with 1 day retention should be good, in the waiting room, I plan to organize a tournament for my friends, while they wait for the organizer (me) to start it, they can have chit chat, rate limit it."

## Decided by the lead

| Question | Decision | Reason |
|----------|----------|--------|
| Which arenas | Private and presenter arenas only | People there came by a code or link from someone they know. A public arena puts strangers and children in one room, and nobody asked for chat there. |
| When | While people wait: lobby, break between rounds, and after the game. Closed while a round runs. | The request is the waiting room. During a round the screen belongs to the game. |
| Who reads | A joined player and the arena's owner | The chat stays inside the group. A viewer without a seat, and the big screen, get no chat: a projector must not show text that nobody checked. |
| Who writes | A joined player and the owner (the presenter does not play, so the owner is a sender of its own kind) | |
| Text | Plain text of 1 to 200 characters on one line. Shown as text; a link is never made clickable. | Children play. |
| Words | The block list of `apps/server/src/name-filter.ts` applies, with matching made for sentences (below). A refused message is not stored and not sent. | Children play. |
| Moderation | The owner can turn the chat off and on for the arena. Removing a player (exists) also removes that player's messages. No deletion of single messages. | One switch is the smallest control that lets an organiser stop a chat that goes wrong. |
| Retention | A message is kept for 24 hours, at most the newest 500 per arena. Closing or expiring the arena removes its chat. | Owner: "1 day retention". |
| Rate limit | Per sender: 5 messages at once, then 1 every 3 seconds. Per arena: 20 at once, then 5 per second. | The sender limit stops one person flooding; the arena limit protects a room of 512. |
| Sound | None | Owner's rule: sound only for the player's own tank. |

Named limits (write them in the server file's header and the decision log): a block list never catches everything; a message lost in the second before a crash is not recovered; a player who rejoins under a new seat gets a fresh sender limit.

## When the chat is open (state table)

`chat` is a setting of the arena: `"on"` (default) or `"off"`. Actor of the only transition: the owner, in any phase (`setChat`). Everything else is derived:

| Arena kind | Phase | Chat setting | Read | Post |
|------------|-------|--------------|------|------|
| private, presenter | lobby, break, finished | on | player, owner | player, owner |
| private, presenter | running | on | player, owner | nobody (409 `chat_closed`) |
| private, presenter | any | off | nobody new; clients hide the list | nobody (409 `chat_off`) |
| practice, tournament, monthly | any | (no chat) | 404 `no_chat` | 404 `no_chat` |

A player with the status "waiting" (joined during a round) may read and post like any player.

## Contract (CH1a writes it first; CH1b codes against it)

```ts
// packages/arena/src/chat-protocol.ts (new, exported from the index)
export const CHAT_LIMITS = { textMax: 200, keepMs: 24 * 60 * 60 * 1000, keepCount: 500, pageSize: 100 } as const;
export type ChatSender =
  | { readonly kind: "player"; readonly playerId: PlayerId; readonly name: string; readonly look: TankLook }
  | { readonly kind: "host" };
export interface ChatMessage { readonly id: string; readonly at: number /* ms since epoch */; readonly sender: ChatSender; readonly text: string }
export interface ChatPostRequest { readonly text: string }
export interface ChatHistoryResponse { readonly messages: readonly ChatMessage[] /* oldest first, up to pageSize */ }
export type ChatErrorCode = "no_chat" | "chat_off" | "chat_closed" | "chat_text_invalid" | "chat_text_blocked" | "chat_too_fast" | "chat_busy";
export function parseChatText(value: unknown): string | null;   // the one validator: trims, removes control characters, joins lines, 1 to 200 characters

// packages/arena/src/types.ts
// PublicArena gains `chat: "on" | "off" | null` (null in a public arena). Event `setChat { on: boolean }`, owner only.
// StreamMessage gains:
//   | { readonly type: "chat"; readonly message: ChatMessage }
//   | { readonly type: "chatRemoved"; readonly playerId: PlayerId }      // that player's messages are gone
```

The name and the look are stored in the message, so a message outlives its sender's seat.

| Route | Who | Does |
|-------|-----|------|
| `GET /api/arenas/:id/chat` | player (token) or owner (session) | `ChatHistoryResponse`: the newest 100 that are younger than 24 hours |
| `POST /api/arenas/:id/chat` | player or owner | Body `ChatPostRequest`. 201 with the `ChatMessage`; the same message goes to every player's and the owner's stream as `chat`. Errors: 400 `chat_text_invalid`, 422 `chat_text_blocked`, 409 `chat_off` or `chat_closed`, 429 `chat_too_fast` or `chat_busy` with `retryAfterMs` in the body and a `Retry-After` header. |
| `PUT /api/arenas/:id/chat` | owner | Body `{ on: boolean }`; applies `setChat` |

`chat` stream messages go only to connections that carry a player token or the owner's session, never to a viewer.

## CH1a: arena package and server

You own `packages/arena/**`, `apps/server/**`, the README (routes) and a decision log section "Arena chat, 2026-11-12". Another builder is changing `apps/web/src/prep`, `vocabulary`, `editor`, `workshop` and `guide` at the same time. You do not edit `apps/web`, with one exception: when the two new `StreamMessage` kinds break an exhaustive `switch` in `apps/web/src/stream/**` or `apps/web/src/session/**`, add a case that ignores them there and report it.

- `apps/server/src/chat.ts`: the store of messages per arena (append, history, prune, remove a player's messages, remove an arena's chat), with an injected clock. Kept in `DATA_DIR/chat/<arenaId>.json`, written atomically at most once per second per arena, loaded at start, a damaged file stops the start with its name (as the other stores do). Pruning runs on every read and in the existing 10-minute sweep (`arena-lifetime.ts`), not only on a write. `closeArena` removes the chat.
- `apps/server/src/rate-limit.ts`: one small token bucket (capacity, refill per second, injected clock) that answers allowed or the wait in milliseconds. The server has no rate limit yet, so this is the first; keep it generic enough for a second caller and no more. Buckets of senders who left are dropped with the arena.
- The block list for sentences: add `hasBlockedWordInText(text)` to `name-filter.ts`, using the same word lists (one data source). A name is 3 to 16 characters, a chat line is a sentence, so the substring matching of names refuses innocent words. Before you choose the matching, run at least 40 ordinary Indonesian and 40 ordinary English chat lines through it (for example "santai dulu", "pasukan siap", "class starts at eight", "pass the ball", "ayo mulai", "analysis") and keep them as a test that must stay green together with the lines that must be refused.
- The reducer owns the `chat` setting (`setChat`, owner only, any phase); the stored arena's version rises with a migration that sets `chat: "on"` for private and presenter arenas, with a test.
- Removing a player (the existing route) also removes that player's messages and sends `chatRemoved`.
- Tests through the routes: the state table row by row, both rate limits with the injected clock (the 6th message at once is refused with the right wait; after the wait it passes; the arena limit with many senders), retention (a message of 24 hours and 1 second is gone from the history and from the file after the sweep), the cap of 500, restart keeps the chat, a viewer's stream gets no `chat`, a blocked line is refused and not stored, a public arena answers `no_chat`.
- Check: `bun test packages/arena apps/server`, then `bun run type-check`. When the type check fails only in web folders the other builder is editing, wait two minutes and run it once more; report an error that stays, do not fix it. One real run on port 8992 with a temporary `DATA_DIR`, with `curl` only (no browser): two players and the owner chat in a lobby, a round starts and a post is refused, the owner turns the chat off and on, the history survives a restart.
- Never run `bun run build`. Never use port 8787 and never stop the server on it.

## CH1b: web (starts after W2 has finished)

You own `apps/web/src/chat/**` (new), the room's and the host page's tab bars and panes where the chat is placed, the stream client, the audit's states for the chat, and the foundation guide's section for it. Read `11-foundation-guide.md` (section 11), `60-no-scroll.md` and `65-guidance.md`.

- Place: a "Chat" / "Obrolan" entry next to Players and Invite on the player's page (a bottom tab on a phone, the left column's switch on a laptop) and a chat pane on the owner's page (`/a/:id/host`) with the on/off switch. It shows in the lobby, the break and after the game, and it is absent in a public arena and while a round runs. Check the extra tab at 360 px in both languages and the lobby tour's keep-clear rule on the bottom bar before you build further.
- The list never scrolls (the owner's no-scroll rule): it shows the newest lines that fit, newest at the bottom, and "Earlier messages" pages back with the existing `Pager`. A line is the sender's tank badge, the name and the text; the player's own lines are marked with the "you" colour; the host's lines carry the word "Host" / "Tuan rumah". Long words break (`overflow-wrap: anywhere`).
- The input sits at the bottom of the pane with a Send button (Enter sends). Its font size is 16 px or more. Four one-tap lines sit above it for a child who does not want to type ("Hi!", "Ready!", "Good luck!", "Good game!" and their Indonesian forms); a tap sends that line as an ordinary message.
- An unread dot on the Chat entry while another pane is open. No sound.
- A refusal answers in the pane, in one sentence that says why and what to do: too fast (with the seconds to wait, counted down, and the Send button disabled for that time), a blocked word ("Use other words, because this arena is for everyone."), chat off ("The host turned the chat off."), a round is running.
- Empty state: one sentence ("Nobody has written yet, so say hi.").
- The owner's switch says what it does and shows the state in words, not by colour alone.
- Audit states: empty, a few lines, a full page with "Earlier messages", a long word and a long name, each refusal, chat off, the owner's pane, and one state at a keyboard-open height (390 x 450) where the input and the newest line must both stay visible.
- Check: `bun test`, `bun run type-check`, the audit for your states and the room's lobby states at every supported size in both languages, and one browser run on a phone in Indonesian with two players and the owner. Build into your own folder and serve on port 8993 (`bunx vite build --outDir <scratch>/revamp/ch1b/dist --emptyOutDir`; never `bun run build`, never port 8787).

### Facts from CH1a as built (2026-11-12) that CH1b needs

- The history is not sent when a stream connects. Read `GET /api/arenas/:id/chat` when the stream opens and after each reconnect, and drop lines whose id the page already has.
- `STREAM_EVENT_NAMES`, `parseStreamMessage` and `isPublicArena` in the web do not know `chat` and `chatRemoved` yet; `stream/streamState.ts` ignores them in its switch.
- Chat error codes are a separate type (`ChatErrorCode`), outside `ArenaRouteErrorCode`, so the chat has its own sentences. The wait for the countdown is `error.retryAfterMs`.
- `GET` answers 409 `chat_off` while the chat is off; the lines are kept and come back when the owner turns it on. With the chat off during a round, POST answers `chat_off`.
- A request with a player token is always the player; a wrong or stale token is 403 and does not fall back to the owner's session. The host page must send no player token.
- The server sends `chat` to the owner's stream, and it recognises the owner by the session cookie. The big-screen page (`/a/:id/screen`) opened in the owner's browser therefore receives chat messages: it must never render them. Do not listen for `chat` on that page.
- `GET` has no cursor, so "Earlier messages" pages back through the newest 100 lines only. This is named debt: a `before` id parameter on the route would clear it.
- Several web fixtures carry `chat: null` on a private arena, a state the stored form rejects. Fix them when the code starts to read `chat`.
- Removing a player sends `chatRemoved { playerId }`; drop that player's lines from the list.

## Report (both)

The common report, plus: for CH1a the contract as built, the matching rule of the sentence filter with its test lines, and every decision this file does not state; for CH1b each screen's text in both languages and the captures you read.
