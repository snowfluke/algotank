// The chat pane of the room and the presenter page (docs/specs/revamp/72-arena-chat.md, CH1b).
// It reads like a toy-tank game: each line is the sender's tank, the name and the text in a
// speech bubble; the reader's own lines sit on the other side in the "you" colours with the
// word "you"; the host's lines carry a crown and the word "Host". Four quick lines above the
// input let a child talk without typing.
//
// The list never scrolls (60-no-scroll.md): the Pager shows the newest lines that fit, newest
// at the bottom, and "Earlier messages" pages back. Outside the fixed-height layout (a phone
// with its keyboard open is shorter than 560 px) the page scrolls, so the input scrolls into
// view when it takes the focus, and the newest line sits right above it.
//
// The state lives in useArenaChat, above the panes, so this component only draws and forwards.

import { Crown, MessageCircleOff, Send } from "lucide-react";
import type { FormEvent } from "react";
import { CHAT_LIMITS, plainTankLook, type ChatMessage, type TankLook } from "@game/arena";
import { errorSentence } from "../api/errorSentences.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useSecondsUntil } from "../live/countdown.ts";
import { playSound } from "../sound/player.ts";
import { tankLetters } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { Button } from "../ui/Button.tsx";
import { INPUT_CLASSES } from "../ui/Field.tsx";
import { useFitLayout } from "../ui/layout.ts";
import { Pager } from "../ui/Pager.tsx";
import { Switch } from "../ui/Switch.tsx";
import { isOwnLine } from "./chatLog.ts";
import { waitUntil, type ChatRefusal } from "./chatRules.ts";
import type { ArenaChat } from "./useArenaChat.ts";

export interface ChatPaneProps {
  readonly chat: ArenaChat;
  /** The reader's tank for the empty state, or null for the host, who has none. */
  readonly look: TankLook | null;
}

const BADGE_PX = 36;

/**
 * The owner's on/off switch is not here but in the settings sheet, with the bots switch and
 * "Close arena": the pane shares a narrow column with Players on the presenter page and the
 * height with the start action on a phone, and the lines need that room.
 */
export function ChatPane({ chat, look }: ChatPaneProps) {
  const m = useMessages();
  const t = m.chat;
  return (
    <section aria-label={t.label} data-chat-pane={chat.place} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {chat.place === "open" ? (
        <OpenChat chat={chat} look={look} />
      ) : (
        <div data-chat-off="" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
          <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-ground text-muted">
            <MessageCircleOff size={32} />
          </span>
          <p className="text-lead [overflow-wrap:anywhere]">{t.refusals.off}</p>
        </div>
      )}
    </section>
  );
}

/** The owner's on/off switch, in the settings sheet of the room (a private arena's owner) and of the presenter page. */
export function ChatSwitch({ chat }: { readonly chat: ArenaChat }) {
  const m = useMessages();
  const t = m.chat.setting;
  return (
    <div data-chat-switch="" className="flex shrink-0 flex-col gap-1">
      <Switch label={t.label} on={chat.setting.on} disabled={chat.setting.busy} onChange={chat.setOn} />
      {chat.setting.failure === null ? null : (
        <p role="alert" className="font-semibold text-hit [overflow-wrap:anywhere]">
          {errorSentence(chat.setting.failure, "chatSetting", m.errors)}
        </p>
      )}
    </div>
  );
}

function OpenChat({ chat, look }: { readonly chat: ArenaChat; readonly look: TankLook | null }) {
  const m = useMessages();
  const t = m.chat;
  const fit = useFitLayout();
  const waitSeconds = useSecondsUntil(waitUntil(chat.refusal));
  const blocked = chat.sending || waitSeconds !== null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    chat.send(chat.draft, "draft");
  }

  return (
    <>
      <div data-chat-lines="" className="flex min-h-0 flex-1 flex-col">
        {chat.load.kind === "loading" && chat.lines.length === 0 ? (
          <p role="status" className="animate-pulse-soft text-muted">
            {t.loading}
          </p>
        ) : chat.load.kind === "failed" && chat.lines.length === 0 ? (
          <p role="alert" className="font-semibold text-hit [overflow-wrap:anywhere]">
            {errorSentence(chat.load.failure, "chat", m.errors)}
          </p>
        ) : chat.lines.length === 0 ? (
          <EmptyChat look={look} />
        ) : (
          <Pager
            label={t.list}
            items={chat.lines}
            itemKey={(line) => line.id}
            ordered={false}
            newestLast={{ earlier: t.earlier, later: t.later }}
            renderItem={(line) => <ChatLine line={line} own={isOwnLine(line, chat.seat)} />}
          />
        )}
      </div>
      <RefusalLine refusal={chat.refusal} waitSeconds={waitSeconds} />
      <div role="group" aria-label={t.quickLabel} data-chat-quick="" className="flex shrink-0 flex-wrap gap-1.5">
        {t.quick.map((text) => (
          <button
            key={text}
            type="button"
            disabled={blocked}
            onClick={() => {
              playSound("tap");
              chat.send(text, "quick");
            }}
            className="press min-h-11 min-w-11 rounded-full border-2 border-b-4 border-water-light bg-water-soft px-3 font-display font-semibold text-ink [overflow-wrap:anywhere] hover:border-water active:mb-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:border-line disabled:bg-ground disabled:text-muted"
          >
            {text}
          </button>
        ))}
      </div>
      <form onSubmit={submit} data-chat-form="" className="flex shrink-0 items-stretch gap-2">
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">{t.inputLabel}</span>
          <input
            type="text"
            value={chat.draft}
            onChange={(event) => chat.setDraft(event.currentTarget.value)}
            onFocus={(event) => {
              // Outside the fixed-height layout the page scrolls: keep the input and the newest line above it in view.
              if (!fit) event.currentTarget.form?.scrollIntoView({ block: "end" });
            }}
            // A count in UTF-16 units; parseChatText counts characters, so an emoji line may still meet the sentence.
            maxLength={CHAT_LIMITS.textMax}
            enterKeyHint="send"
            autoComplete="off"
            placeholder={t.placeholder}
            data-chat-input=""
            className={INPUT_CLASSES}
          />
        </label>
        <Button type="submit" icon={<Send aria-hidden size={20} />} disabled={blocked || chat.draft.trim() === ""} loading={chat.sending} data-chat-send="">
          {t.send}
        </Button>
      </form>
    </>
  );
}

function RefusalLine({ refusal, waitSeconds }: { readonly refusal: ChatRefusal | null; readonly waitSeconds: number | null }) {
  const m = useMessages();
  const r = m.chat.refusals;
  if (refusal === null) return null;
  switch (refusal.kind) {
    case "tooFast":
    case "busy": {
      // The wait is over: the sentence has done its job.
      if (waitSeconds === null) return null;
      const say = refusal.kind === "tooFast" ? r.tooFast : r.busy;
      return (
        <div data-chat-refusal={refusal.kind} className="shrink-0">
          {/* The visible sentence counts down; a screen reader hears it once, with the wait it started with. */}
          <p aria-hidden="true" className="tabular font-semibold text-warning [overflow-wrap:anywhere]">
            {say(waitSeconds)}
          </p>
          <WaitAnnouncement key={refusal.until} text={say(Math.ceil((refusal.until - Date.now()) / 1000))} />
        </div>
      );
    }
    case "off":
    case "closed":
    case "blocked":
    case "tooLong":
      return (
        <p role="alert" data-chat-refusal={refusal.kind} className="shrink-0 font-semibold text-hit [overflow-wrap:anywhere]">
          {r[refusal.kind]}
        </p>
      );
    case "failed":
      return (
        <p role="alert" data-chat-refusal="failed" className="shrink-0 font-semibold text-hit [overflow-wrap:anywhere]">
          {errorSentence(refusal.failure, "chat", m.errors)}
        </p>
      );
  }
}

/** Mounted once per wait (its key is the wait's end), so its text does not change while the number ticks. */
function WaitAnnouncement({ text }: { readonly text: string }) {
  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  );
}

function EmptyChat({ look }: { readonly look: TankLook | null }) {
  const m = useMessages();
  return (
    <div data-chat-empty="" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
      {/* The reader's own tank with an empty speech bubble: the next line is theirs to write. */}
      <div aria-hidden="true" className="relative pt-7 pr-10">
        <TankBadge look={look ?? plainTankLook(1)} size={64} name={null} detail="full" angle={-90} />
        <span className="absolute top-0 right-0 flex items-center gap-1 rounded-2xl rounded-bl-sm border-2 border-line bg-panel px-2.5 py-2">
          <span className="size-1.5 rounded-full bg-muted" />
          <span className="size-1.5 rounded-full bg-muted" />
          <span className="size-1.5 rounded-full bg-muted" />
        </span>
      </div>
      <p className="text-lead [overflow-wrap:anywhere]">{m.chat.empty}</p>
    </div>
  );
}

/** One line: the tank (or the host's crown), and a speech bubble with the name and the text. Its height never changes, as Pager needs. */
export function ChatLine({ line, own }: { readonly line: ChatMessage; readonly own: boolean }) {
  const m = useMessages();
  const sender = line.sender;
  const host = sender.kind === "host";
  const bubble = own
    ? "rounded-br-sm border-self bg-self-soft"
    : host
      ? "rounded-bl-sm border-water bg-water-soft"
      : "rounded-bl-sm border-line bg-panel";
  return (
    <div data-chat-line={own ? "own" : host ? "host" : "other"} className={`flex min-w-0 items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
      {sender.kind === "host" ? (
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border-b-4 border-water-deep bg-water text-water-ink">
          <Crown size={20} />
        </span>
      ) : (
        // Each tank faces its own bubble.
        <TankBadge look={sender.look} label={tankLetters(sender.name)} size={BADGE_PX} name={null} self={own} detail="full" angle={own ? 180 : 0} />
      )}
      {/*
        The name leads the text in one run, as in a game's chat, so a short line takes one row. A line
        shows at most 4 rows, so one line always fits the smallest list box (the Pager's contract);
        the text is a text node of this element, so a screen reader still reads all of it.
      */}
      <p className={`line-clamp-4 min-w-0 max-w-[85%] rounded-2xl border-2 px-3 py-1.5 [overflow-wrap:anywhere] ${bubble}`}>
        {sender.kind === "host" ? (
          <span className="mr-2 font-display font-semibold text-water">{m.chat.host}</span>
        ) : (
          <span className="mr-2 font-display font-semibold text-ink">{sender.name}</span>
        )}
        {own ? <span className="mr-2 text-caption font-semibold text-self-ink">{m.room.players.you}</span> : null}
        {line.text}
      </p>
    </div>
  );
}
