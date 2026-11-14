// The header's way into "My tank": the player's own tank as a button-like link, so a
// player sees their tank on every page and finds where to change it.

import { followLink } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { tankLetters } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { useMyTank } from "./useMyTank.ts";

export function MyTankEntry() {
  const m = useMessages();
  const { tank } = useMyTank();
  return (
    <a
      href={paths.myTank()}
      onClick={followLink}
      aria-label={m.mytank.open}
      title={m.mytank.heading}
      data-mytank-entry=""
      className="press flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-b-4 border-line bg-panel no-underline hover:border-line-strong"
    >
      <TankBadge look={tank.look} label={tankLetters(tank.name)} size={34} name={null} detail="full" angle={-90} />
    </a>
  );
}
