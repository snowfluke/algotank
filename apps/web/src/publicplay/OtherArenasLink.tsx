// The way from a public result to the chooser of the three arenas (73-after-first-timer-test.md,
// after P4b). A first-timer is seated in the practice arena without the chooser, and the result's
// 20 s leave no time for a sentence that offers the other arenas, so this quiet link sits in the
// status line's row of small controls, beside help and Champions, away from the bottom bar's
// "I'm ready". Its words show from 480 px wide, like IconButton's `text`; below that only the icon,
// and a screen reader reads the same name at every width.
//
// It opens "/play?arena=<this arena>", not "/play": "/play" shows the first-timer's join step to a
// device that has not finished a game (publicplay/firstGame.ts), which is still the case after a
// result the player only watched (they joined while the game ran) or when the browser blocks storage.

import { ArrowLeftRight } from "lucide-react";
import type { PublicKind } from "@game/arena";
import { followLink } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";

export function OtherArenasLink({ kind }: { readonly kind: PublicKind }) {
  const m = useMessages();
  const label = m.publicplay.otherArenas;
  return (
    <a
      href={paths.playIn(kind)}
      aria-label={label}
      title={label}
      data-other-arenas=""
      onClick={(event) => {
        playSound("tap");
        followLink(event);
      }}
      className="press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-transparent text-ink no-underline active:bg-water-soft min-[480px]:px-3 [@media(hover:hover)]:hover:bg-water-soft"
    >
      <ArrowLeftRight aria-hidden size={24} className="shrink-0" />
      <span aria-hidden="true" className="font-display font-semibold whitespace-nowrap max-[479px]:hidden">
        {label}
      </span>
    </a>
  );
}
