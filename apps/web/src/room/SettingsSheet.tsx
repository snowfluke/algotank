// The settings of the room and the presenter page, behind the gear in the status
// line: the tank's look for a player outside a round (the lobby also has it in the
// Players pane), the number of tanks and the bots switch in the lobby, the chat's on/off switch in an arena with a
// chat, the accounts kept out of a signed-in-only arena with "Allow again", and "Close arena" for the owner. A step sheet in the pane area, so it never covers the page.

import { Settings } from "lucide-react";
import { useState } from "react";
import type { PublicArena } from "@game/arena";
import type { ArenaAccounts } from "./useArenaAccounts.ts";
import { ChatSwitch } from "../chat/ChatPane.tsx";
import type { ArenaChat } from "../chat/useArenaChat.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { BotFillControl, CloseArenaControl, TankCountSetting } from "./OwnerControls.tsx";

/** What the settings hold for this viewer now. */
export interface SettingsParts {
  /** Opens "Change my tank", for a player with a seat outside a round; null when it does not apply. */
  readonly look: (() => void) | null;
  /** The bots switch and "Close arena". */
  readonly owner: boolean;
  /** The chat's on/off switch for the owner; null for anyone else and in an arena without a chat. */
  readonly chat: ArenaChat | null;
  /** The owner of a signed-in-only arena: the accounts kept out (useArenaAccounts); null otherwise. */
  readonly accounts: ArenaAccounts | null;
}

/**
 * The accounts kept out, each with "Allow again", as a step of its own: the settings of a phone
 * have no room for a list, and the list pages when an owner keeps many accounts out.
 */
function KeptOutSheet({ accounts, onBack }: { readonly accounts: ArenaAccounts; onBack(): void }) {
  const m = useMessages();
  const t = m.room.players;
  return (
    <StepSheet title={t.keptOutHeading} backLabel={m.room.settings.title} onBack={onBack}>
      <div data-kept-out="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <Pager
          label={t.keptOutHeading}
          items={accounts.banned}
          itemKey={(b) => b.accountId}
          ordered={false}
          uniformHeight
          renderItem={(b) => (
            <div className="flex min-h-14 min-w-0 items-center gap-3 border-b border-line py-1">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{b.name}</span>
                <span className="truncate text-caption text-muted">{b.email ?? t.noEmail}</span>
              </span>
              <Button variant="secondary" aria-label={t.allowAgain(b.name)} data-allow-again={b.accountId} onClick={() => accounts.allowAgain(b.accountId)}>
                {t.allowAgainShort}
              </Button>
            </div>
          )}
        />
        {accounts.problem === null ? null : (
          <p role="alert" className="shrink-0 font-semibold text-hit [overflow-wrap:anywhere]">
            {accounts.problem}
          </p>
        )}
      </div>
    </StepSheet>
  );
}

export function hasSettings(parts: SettingsParts): boolean {
  return parts.look !== null || parts.owner;
}

export function SettingsButton({ onOpen }: { onOpen(): void }) {
  const m = useMessages();
  return <IconButton label={m.room.settings.open} icon={<Settings aria-hidden size={24} />} variant="quiet" data-opens="settings" onClick={onOpen} />;
}

export interface SettingsSheetProps {
  readonly arena: PublicArena;
  readonly arenaName: string;
  readonly parts: SettingsParts;
  onBack(): void;
}

export function SettingsSheet({ arena, arenaName, parts, onBack }: SettingsSheetProps) {
  const m = useMessages();
  const [language] = useLanguage();
  const [keptOut, setKeptOut] = useState(false);
  const accounts = parts.accounts;
  // A small phone leaves out the presets of the number of tanks, then tightens the space between
  // the rows, so "Close arena" stays in view.
  const { ref, level } = useFitDetail<HTMLDivElement>(3, `${language}|${arena.phase.kind}|${parts.chat === null}|${accounts?.banned.length ?? 0}`);
  if (keptOut && accounts !== null) {
    return (
      <KeptOutSheet
        accounts={accounts}
        onBack={() => {
          setKeptOut(false);
          requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-opens-kept-out]")?.focus());
        }}
      />
    );
  }
  return (
    <StepSheet title={m.room.settings.title} onBack={onBack}>
      <div ref={ref} className={`flex min-h-0 min-w-0 flex-1 flex-col items-start ${level >= 2 ? "gap-2" : "gap-4"} fit:overflow-hidden`}>
        {parts.look === null ? null : (
          <Button variant="secondary" data-opens="look" onClick={parts.look}>
            {m.mytank.change}
          </Button>
        )}
        {parts.owner ? <TankCountSetting arena={arena} brief={level >= 1} /> : null}
        {parts.owner ? <BotFillControl arena={arena} /> : null}
        {parts.chat === null ? null : <ChatSwitch chat={parts.chat} />}
        {accounts === null || accounts.banned.length === 0 ? null : (
          <Button variant="secondary" data-opens-kept-out="" onClick={() => setKeptOut(true)}>
            {m.room.players.keptOutOpen(accounts.banned.length)}
          </Button>
        )}
        {parts.owner ? <CloseArenaControl arena={arena} name={arenaName} /> : null}
      </div>
    </StepSheet>
  );
}
