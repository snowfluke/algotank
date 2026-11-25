// The bar at the top of every page except the big screen: the AlgoTank wordmark
// (a link to the start), an optional title such as the arena name, the player's own
// tank (the way into "My tank"), the language switch, the sound button (music and effects), "Support" (support/)
// and a slot for the account control.

import type { ReactNode } from "react";
import { AccountMenu } from "../auth/AccountMenu.tsx";
import { followLink } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { GAME_NAME } from "../brand.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { LanguageSwitch } from "../i18n/LanguageSwitch.tsx";
import { MyTankEntry } from "../mytank/MyTankEntry.tsx";
import { IS_OFFLINE } from "../offline/target.ts";
import { SoundControl } from "../sound/SoundControl.tsx";
import { ThemeControl } from "../theme/ThemeControl.tsx";
import { SupportEntry } from "../support/SupportEntry.tsx";
import { TankBadge } from "../tank/TankBadge.tsx";

export interface AppHeaderProps {
  /** Shown after the wordmark, for example the arena name. Long titles are cut with an ellipsis. */
  readonly title?: string;
  /** The account control, placed last. Defaults to the sign-in link or the account menu; null hides it. */
  readonly account?: ReactNode;
  /** The home page shows the name large in its hero, so it hides the wordmark here. */
  readonly showWordmark?: boolean;
}

function Wordmark() {
  const m = useMessages();
  return (
    <a
      href={paths.home()}
      onClick={followLink}
      aria-label={`${GAME_NAME}, ${m.common.goHome}`}
      className="flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] text-ink no-underline"
    >
      <TankBadge colour={1} size={34} name={null} detail="full" angle={-20} />
      {/* Below 560px the name gives its room to the controls, so the header stays one row; the link keeps its name. */}
      <span className="font-display text-title font-bold tracking-tight max-[560px]:sr-only">{GAME_NAME}</span>
    </a>
  );
}

// Offline there are no accounts, so the default slot is empty (offline/target.ts).
export function AppHeader({ title, account = IS_OFFLINE ? null : <AccountMenu />, showWordmark = true }: AppHeaderProps) {
  return (
    // One row, 56px, at every width (the language switch is 52px plus 2px above and below): the title shrinks and cuts with an ellipsis instead of pushing the controls to a second row.
    // Every control stays on the row at every width, the dark mode button too (owner 2026-11-25: "no menu to toggle the theme on mobile").
    // Measured signed out, the widest case: below 376px the gutter and gaps are 4px and 2px, below 440px 8px and 4px; below 768px the
    // language switch is one 44px button (i18n/LanguageSwitch.tsx); below 560px the name hides. With the name and both languages the row is 706px.
    <header className="mx-auto flex w-full max-w-6xl items-center gap-x-0.5 px-1 py-0.5 min-[376px]:gap-x-1 min-[376px]:px-2 min-[440px]:gap-x-3 min-[440px]:px-4 min-[480px]:gap-x-4">
      {showWordmark ? <Wordmark /> : null}
      {title === undefined ? null : (
        // Below 480px the controls leave the title a few letters at most, so it gives its room away and stays for screen readers.
        <p className="min-w-0 flex-1 basis-0 truncate font-display text-lead font-semibold text-muted max-[479px]:sr-only">{title}</p>
      )}
      <div className="ml-auto flex shrink-0 items-center justify-end gap-0.5 min-[376px]:gap-1 min-[440px]:gap-2">
        <SupportEntry />
        <MyTankEntry />
        <LanguageSwitch />
        <SoundControl />
        <ThemeControl />
        {account}
      </div>
    </header>
  );
}
