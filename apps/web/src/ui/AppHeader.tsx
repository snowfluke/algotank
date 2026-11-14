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
import { SoundControl } from "../sound/SoundControl.tsx";
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
      {/* Below 480px the name gives its room to the switches, so the header stays one row; the link keeps its name. */}
      <span className="font-display text-title font-bold tracking-tight max-[479px]:sr-only">{GAME_NAME}</span>
    </a>
  );
}

export function AppHeader({ title, account = <AccountMenu />, showWordmark = true }: AppHeaderProps) {
  return (
    // One row, 56px, at every width (the language switch is 52px plus 2px above and below): the title shrinks and cuts with an ellipsis instead of pushing the controls to a second row.
    // Below 400px six 44px controls and the language switch need the narrow gutter and 4px gaps to stay on the row (the Support heart is the sixth).
    <header className="mx-auto flex w-full max-w-6xl items-center gap-x-1 px-2 py-0.5 min-[400px]:gap-x-3 min-[400px]:px-4 min-[480px]:gap-x-4">
      {showWordmark ? <Wordmark /> : null}
      {title === undefined ? null : (
        // Below 480px the controls leave the title a few letters at most, so it gives its room away and stays for screen readers.
        <p className="min-w-0 flex-1 basis-0 truncate font-display text-lead font-semibold text-muted max-[479px]:sr-only">{title}</p>
      )}
      <div className="ml-auto flex shrink-0 items-center justify-end gap-1 min-[400px]:gap-2">
        <SupportEntry />
        <MyTankEntry />
        <LanguageSwitch />
        <SoundControl />
        {account}
      </div>
    </header>
  );
}
