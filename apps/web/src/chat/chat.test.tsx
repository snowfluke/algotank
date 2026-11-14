/// <reference types="bun" />
// Arena chat on the page (docs/specs/revamp/72-arena-chat.md, CH1b): merging the history with
// the stream, a removed player's lines, where the chat shows, the wait after a refusal, the
// unread mark, the checks of the server's messages, and what a line and the pane say.

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { plainTankLook, type ArenaPhase, type ChatMessage, type PublicArena } from "@game/arena";
import type { ApiFailure } from "../api/client.ts";
import { hostLayout } from "../host/hostLayout.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { secondsUntil } from "../live/countdown.ts";
import { playerView } from "../player/playerView.ts";
import { paneShown, roomLayout } from "../room/roomFrame.ts";
import { lobbyArena, TEST_SETTINGS } from "../stream/fixtures.ts";
import { parseStreamMessage } from "../stream/parseStreamMessage.ts";
import { EMPTY_CHAT_LOG, hasUnread, reduceChatLog, seenMarkOf, type ChatLog, type ChatLogAction } from "./chatLog.ts";
import { ChatLine, ChatPane, ChatSwitch } from "./ChatPane.tsx";
import { chatPlace, refusalOf, waitUntil } from "./chatRules.ts";
import { isChatMessage } from "./chatWire.ts";
import type { ArenaChat } from "./useArenaChat.ts";

const ana = { kind: "player", playerId: "p1", name: "Ana", look: plainTankLook(1) } as const;
const budi = { kind: "player", playerId: "p2", name: "Budi", look: plainTankLook(2) } as const;
const line = (id: string, at: number, sender: ChatMessage["sender"] = ana, text = `line ${id}`): ChatMessage => ({ id, at, sender, text });
const run = (...actions: ChatLogAction[]): ChatLog => actions.reduce(reduceChatLog, EMPTY_CHAT_LOG);
const ids = (log: ChatLog) => log.lines.map((l) => l.id);

describe("the chat log", () => {
  test("the history and the stream overlap, and each line shows once, in time order", () => {
    const log = run(
      { type: "chat", message: line("c", 30) },
      { type: "history", messages: [line("a", 10), line("b", 20), line("c", 30)] },
      { type: "chat", message: line("b", 20) },
      { type: "chat", message: line("d", 40) },
      // After a reconnect the history comes again.
      { type: "history", messages: [line("b", 20), line("c", 30), line("d", 40)] },
    );
    expect(ids(log)).toEqual(["a", "b", "c", "d"]);
  });

  test("lines of the same millisecond keep the server's order, and the history's order wins", () => {
    expect(ids(run({ type: "chat", message: line("y", 5) }, { type: "chat", message: line("x", 5) }))).toEqual(["y", "x"]);
    expect(ids(run({ type: "chat", message: line("y", 5) }, { type: "history", messages: [line("x", 5), line("y", 5)] }))).toEqual(["x", "y"]);
  });

  test("a removed player's lines go, and a late history cannot bring them back", () => {
    const before = run({ type: "history", messages: [line("a", 10, ana), line("b", 20, budi), line("h", 25, { kind: "host" })] });
    const removed = reduceChatLog(before, { type: "chatRemoved", playerId: "p1" });
    expect(ids(removed)).toEqual(["b", "h"]);
    const late = reduceChatLog(removed, { type: "history", messages: [line("a", 10, ana), line("b", 20, budi)] });
    expect(ids(late)).toEqual(["b", "h"]);
    expect(ids(reduceChatLog(late, { type: "chat", message: line("c", 30, ana) }))).toEqual(["b", "h"]);
  });

  test("the page keeps at most as many lines as the server does", () => {
    const many = Array.from({ length: 520 }, (_, i) => line(`m${String(i).padStart(3, "0")}`, i));
    const log = run({ type: "history", messages: many });
    expect(log.lines.length).toBe(500);
    expect(log.lines[0]?.id).toBe("m020");
  });
});

describe("the unread mark", () => {
  const reader = { kind: "player", playerId: "p1" } as const;

  test("a line someone else wrote after the newest seen line is unread; the reader's own lines never are", () => {
    const lines = [line("a", 10, budi), line("b", 20, ana)];
    expect(hasUnread(lines, null, reader)).toBe(true);
    const seen = seenMarkOf(lines);
    expect(hasUnread(lines, seen, reader)).toBe(false);
    expect(hasUnread([...lines, line("c", 30, ana)], seen, reader)).toBe(false);
    expect(hasUnread([...lines, line("d", 30, { kind: "host" })], seen, reader)).toBe(true);
  });

  test("a line of the same millisecond after the seen one is unread, and a removed seen line still marks a time", () => {
    const seen = seenMarkOf([line("a", 10, budi)]);
    expect(hasUnread([line("a", 10, budi), line("b", 10, budi)], seen, reader)).toBe(true);
    expect(hasUnread([line("c", 9, budi)], seen, reader)).toBe(false);
    expect(hasUnread([line("c", 11, budi)], seen, reader)).toBe(true);
  });

  test("on the host page the host's own lines are the reader's", () => {
    expect(hasUnread([line("h", 1, { kind: "host" })], null, { kind: "host" })).toBe(false);
    expect(hasUnread([line("a", 1, ana)], null, { kind: "host" })).toBe(true);
  });
});

function arena(kind: PublicArena["settings"]["kind"], phase: ArenaPhase, chat: PublicArena["chat"]): PublicArena {
  return { ...lobbyArena(), settings: { ...TEST_SETTINGS, kind }, phase, chat };
}

const LOBBY: ArenaPhase = { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } };
const RUNNING: ArenaPhase = { kind: "running", round: 1, isFinal: false, seed: 1, ruleSetId: "standard", playerIds: ["p1"], survivorsAfterRound: null };
const BREAK: ArenaPhase = { kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } };
const FINISHED: ArenaPhase = { kind: "finished", winnerId: "p1", resultId: null };

describe("where the chat shows", () => {
  test("the table of chatRules.ts, row by row", () => {
    for (const kind of ["practice", "tournament"] as const) expect(chatPlace(arena(kind, LOBBY, null))).toBe("none");
    for (const kind of ["private", "presenter"] as const) {
      expect(chatPlace(arena(kind, RUNNING, "on"))).toBe("none");
      for (const phase of [LOBBY, BREAK, FINISHED]) {
        expect(chatPlace(arena(kind, phase, "on"))).toBe("open");
        expect(chatPlace(arena(kind, phase, "off"))).toBe("off");
      }
    }
  });

  function roomTabs(a: PublicArena) {
    const withMe: PublicArena = { ...a, players: [{ id: "p1", name: "Ana", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(1) }] };
    const view = playerView("open", withMe, { playerId: "p1", playerToken: "t" }, null);
    if (!("me" in view)) throw new Error(`not a joined view: ${view.kind}`);
    return roomLayout(view);
  }

  test("the room has a Chat tab in the lobby, the break and after the game, also while the chat is off", () => {
    expect(roomTabs(arena("private", LOBBY, "on")).tabs).toEqual(["tank", "players", "invite", "chat"]);
    expect(roomTabs(arena("private", LOBBY, "off")).tabs).toContain("chat");
    expect(roomTabs(arena("private", BREAK, "on")).tabs).toEqual(["result", "ranking", "tank", "chat"]);
    expect(roomTabs(arena("presenter", FINISHED, "on")).tabs).toEqual(["result", "history", "tank", "chat"]);
  });

  test("the room has no Chat tab while a round runs, nor in a public arena", () => {
    expect(roomTabs(arena("private", RUNNING, "on")).tabs).not.toContain("chat");
    expect(roomTabs(arena("practice", LOBBY, null)).tabs).toEqual(["tank", "players", "invite"]);
  });

  test("on a laptop the chat shares the lobby's side column with Players and Invite", () => {
    const lobby = roomTabs(arena("private", LOBBY, "on"));
    expect(lobby.laptop[0]?.columns[0]?.panes).toEqual(["players", "invite", "chat"]);
    expect(paneShown(lobby, "tank", true, false, "chat")).toBe(false);
    expect(paneShown(lobby, "chat", true, false, "chat")).toBe(true);
    expect(paneShown(lobby, "chat", true, true, "chat")).toBe(false);
    expect(paneShown(lobby, "chat", false, false, "chat")).toBe(true);
    expect(paneShown(lobby, "players", false, false, "chat")).toBe(false);
    // After a round the ranking keeps its column, and the chat is a laptop tab of its own.
    const pause = roomTabs(arena("private", BREAK, "on"));
    expect(pause.laptop.map((group) => group.value)).toEqual(["result", "tank", "chat"]);
    expect(paneShown(pause, "chat", true, false, "chat")).toBe(true);
    expect(paneShown(pause, "ranking", true, false, "chat")).toBe(false);
  });

  test("the presenter page has the chat in the lobby, the break and the end, but not during a round", () => {
    expect(hostLayout(arena("presenter", LOBBY, "on")).tabs).toEqual(["invite", "players", "screen", "chat"]);
    expect(hostLayout(arena("presenter", LOBBY, "on")).laptop[0]?.columns[1]?.panes).toEqual(["players", "chat"]);
    expect(hostLayout(arena("presenter", BREAK, "off")).tabs).toEqual(["through", "chat"]);
    expect(hostLayout(arena("presenter", FINISHED, "on")).tabs).toEqual(["winner", "history", "chat"]);
    expect(hostLayout(arena("presenter", RUNNING, "on")).tabs).toEqual(["ranking"]);
  });
});

describe("a refused send", () => {
  const failure = (code: string, extra: Record<string, unknown> = {}): ApiFailure => ({ ok: false, status: 429, error: { error: "x", ...extra }, code });

  test("too fast: the wait is counted from the answer's arrival with the server's retryAfterMs", () => {
    const refusal = refusalOf(failure("chat_too_fast", { retryAfterMs: 2500 }), 10_000);
    expect(refusal).toEqual({ kind: "tooFast", until: 12_500 });
    const until = waitUntil(refusal);
    expect(secondsUntil(until, 10_000)).toBe(3);
    expect(secondsUntil(until, 11_600)).toBe(1);
    expect(secondsUntil(until, 12_500)).toBeNull();
    expect(refusalOf(failure("chat_busy", { retryAfterMs: 200 }), 0)).toEqual({ kind: "busy", until: 200 });
  });

  test("a wait without a usable retryAfterMs is an answer the page cannot read, not a guess", () => {
    for (const retryAfterMs of [undefined, "3000", Number.NaN, -5]) {
      const refusal = refusalOf(failure("chat_too_fast", retryAfterMs === undefined ? {} : { retryAfterMs }), 0);
      expect(refusal.kind).toBe("failed");
      expect(waitUntil(refusal)).toBeNull();
    }
  });

  test("each other code has its own refusal", () => {
    expect(refusalOf(failure("chat_text_blocked"), 0)).toEqual({ kind: "blocked" });
    expect(refusalOf(failure("chat_off"), 0)).toEqual({ kind: "off" });
    expect(refusalOf(failure("chat_closed"), 0)).toEqual({ kind: "closed" });
    expect(refusalOf(failure("chat_text_invalid"), 0)).toEqual({ kind: "tooLong" });
    expect(refusalOf(failure("network_error"), 0).kind).toBe("failed");
  });
});

describe("the server's messages", () => {
  test("a chat line is trusted only with a name, a tank and a text the validator keeps", () => {
    expect(isChatMessage(line("a", 1))).toBe(true);
    expect(isChatMessage(line("h", 1, { kind: "host" }))).toBe(true);
    expect(isChatMessage({ ...line("a", 1), text: "two\nlines" })).toBe(false);
    expect(isChatMessage({ ...line("a", 1), text: "" })).toBe(false);
    expect(isChatMessage({ ...line("a", 1), sender: { ...ana, look: { colour: 99 } } })).toBe(false);
    expect(isChatMessage({ ...line("a", 1), at: "now" })).toBe(false);
  });

  test("the stream's chat events are read, and a bad one is a protocol error", () => {
    expect(parseStreamMessage("chat", JSON.stringify({ type: "chat", message: line("a", 1) }))).toEqual({ ok: true, message: { type: "chat", message: line("a", 1) } });
    expect(parseStreamMessage("chatRemoved", JSON.stringify({ type: "chatRemoved", playerId: "p1" }))).toEqual({ ok: true, message: { type: "chatRemoved", playerId: "p1" } });
    expect(parseStreamMessage("chat", JSON.stringify({ type: "chat", message: { id: "a" } })).ok).toBe(false);
  });

  test("an arena message without the chat setting is from a server that predates the chat", () => {
    const { chat: _gone, ...old } = lobbyArena();
    expect(parseStreamMessage("arena", JSON.stringify({ type: "arena", arena: old })).ok).toBe(false);
    expect(parseStreamMessage("arena", JSON.stringify({ type: "arena", arena: lobbyArena() })).ok).toBe(true);
  });
});

const indonesian = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>{node}</I18nProvider>);

function chatOf(over: Partial<ArenaChat>): ArenaChat {
  return {
    place: "open",
    seat: { kind: "player", token: "t", playerId: "p1" },
    lines: [],
    load: { kind: "ready" },
    draft: "",
    setDraft: () => undefined,
    send: () => undefined,
    sending: false,
    refusal: null,
    unread: false,
    setting: { on: true, busy: false, failure: null },
    setOn: () => undefined,
    ...over,
  };
}

describe("what the pane says", () => {
  test("a line marks the reader's own side and the host in words, not by colour alone", () => {
    const own = renderToStaticMarkup(<ChatLine line={line("a", 1, ana, "halo")} own />);
    expect(own).toContain('data-chat-line="own"');
    expect(own).toContain(">you<");
    expect(renderToStaticMarkup(<ChatLine line={line("h", 1, { kind: "host" })} own={false} />)).toContain(">Host<");
    expect(indonesian(<ChatLine line={line("h", 1, { kind: "host" })} own={false} />)).toContain(">Tuan rumah<");
    // Text is shown as text: markup in a line is escaped, never rendered.
    expect(renderToStaticMarkup(<ChatLine line={line("x", 1, budi, "<b>hi</b> https://example.com")} own={false} />)).toContain("&lt;b&gt;hi&lt;/b&gt; https://example.com");
  });

  test("empty, the pane invites with one sentence and the four quick lines", () => {
    const html = renderToStaticMarkup(<ChatPane chat={chatOf({})} look={plainTankLook(3)} />);
    expect(html).toContain("Nobody has written yet, so say hi.");
    for (const quick of ["Hi!", "Ready!", "Good luck!", "Good game!"]) expect(html).toContain(`>${quick}</button>`);
    expect(indonesian(<ChatPane chat={chatOf({})} look={null} />)).toContain("Belum ada yang menulis, jadi sapa teman-temanmu.");
  });

  test("off, the pane says why and has no input; the owner's switch carries the state", () => {
    const pane = renderToStaticMarkup(<ChatPane chat={chatOf({ place: "off" })} look={null} />);
    expect(pane).toContain("The host turned the chat off.");
    expect(pane).not.toContain("data-chat-input");
    const owner = renderToStaticMarkup(<ChatSwitch chat={chatOf({ place: "off", setting: { on: false, busy: false, failure: null } })} />);
    expect(owner).toContain('role="switch"');
    expect(owner).not.toContain('checked=""');
    expect(owner).not.toContain("aria-describedby");
    expect(renderToStaticMarkup(<ChatSwitch chat={chatOf({})} />)).toMatch(/role="switch"[^>]*checked=""|checked=""[^>]*role="switch"/);
  });

  test("a blocked word answers in the pane with what to do", () => {
    const html = renderToStaticMarkup(<ChatPane chat={chatOf({ refusal: { kind: "blocked" } })} look={null} />);
    expect(html).toContain("Use other words, because this arena is for everyone.");
  });
});
