// The way to "/champions" from a room: an icon link with the trophy, in the status
// line of the tournament and monthly rooms, beside the help button. It looks like the
// quiet icon buttons there, and a screen reader reads its name.

import { Trophy } from "lucide-react";
import { followLink } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";

export function ChampionsLink() {
  const m = useMessages();
  return (
    <a
      href={paths.champions()}
      aria-label={m.champions.heading}
      title={m.champions.heading}
      data-champions-link=""
      onClick={(event) => {
        playSound("tap");
        followLink(event);
      }}
      className="press inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-transparent text-ink active:bg-water-soft [@media(hover:hover)]:hover:bg-water-soft"
    >
      <Trophy aria-hidden size={24} />
    </a>
  );
}
