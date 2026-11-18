// The selected league's public activity (86-monthly-activity.md). Only this pane
// scrolls, so the board and the phone's tabs stay in place on a long list.

import type { LeagueActivityEvent } from "@game/arena";
import { useMemo } from "react";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { TankBadge } from "../tank/TankBadge.tsx";
import { useNow } from "./useNow.ts";

function timeAgo(elapsed: number, format: Intl.RelativeTimeFormat, justNow: string): string {
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return justNow;
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.floor(hours / 24), "day");
}

export function ActivityList({ events, fixedNow }: { events: readonly LeagueActivityEvent[]; fixedNow: number | undefined }) {
  if (events.length === 0) return null;
  return <ActivityRows events={events} fixedNow={fixedNow} />;
}

function ActivityRows({ events, fixedNow }: { events: readonly LeagueActivityEvent[]; fixedNow: number | undefined }) {
  const t = useMessages().monthly;
  const [language] = useLanguage();
  const format = useMemo(() => new Intl.RelativeTimeFormat(language), [language]);
  const ticking = useNow();
  const now = fixedNow ?? ticking;
  return (
    <ol
      data-monthly-activity=""
      aria-label={t.tabs.activity}
      tabIndex={0}
      className="min-h-0 min-w-0 flex-1 divide-y divide-line focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-water fit:overflow-y-auto fit:overscroll-contain"
    >
      {events.map((event, index) => (
        <li key={`${event.seatId}-${event.kind}-${event.at}-${events.length - index}`} className="flex min-w-0 items-center gap-2 px-1 py-2">
          <TankBadge look={event.look} size={28} name={null} detail="full" angle={-90} className="shrink-0" />
          <div className="min-w-0">
            <p className="[overflow-wrap:anywhere]">{t.activity[event.kind](event.name)}</p>
            <time dateTime={new Date(event.at).toISOString()} className="text-caption text-muted">
              {timeAgo(now - event.at, format, t.activity.justNow)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
