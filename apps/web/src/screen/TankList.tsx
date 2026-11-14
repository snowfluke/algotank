// Tanks with their names, for the big screen: the players in the lobby and the two
// sides of a break. It fills its parent's height in as many columns as it needs,
// so up to 64 names stay on screen and readable. Each row is 2em tall (a 1.5em line and
// its padding), the height FitList plans for, so the badge is 1.5em.

import { useMessages } from "../i18n/I18nProvider.tsx";
import type { RowTank } from "../standings/standings.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { FitList } from "../ui/FitList.tsx";
import { ROW_LABEL_TEXT, type FitSize } from "../ui/fitList.ts";

export interface TankListItem {
  readonly tank: RowTank;
  /** Shown after the name, for example the points. */
  readonly trailing?: string;
}

export function TankList({ label, items, fit, focus, more, muted = false }: {
  label: string;
  items: readonly TankListItem[];
  fit: FitSize;
  /** The row to keep in view when not every row fits, or null for the top rows only. */
  focus: number | null;
  /** The line for the tanks that do not fit, for example "12 more players have joined." */
  more: (hidden: number) => string;
  muted?: boolean;
}) {
  const m = useMessages();
  return (
    <FitList label={label} fit={{ size: fit, focus, more }}>
      {items.map(({ tank, trailing }) => (
        <li
          key={tank.playerId}
          className={`grid grid-cols-[1.5em_minmax(0,1fr)_auto] items-center gap-x-[0.5em] py-[0.25em] ${muted ? "text-muted" : "text-ink"}`}
        >
          <TankBadge look={tank.look} size={40} name={null} angle={-90} className="h-[1.5em] w-[1.5em]" />
          <span className="flex min-w-0 items-baseline gap-x-[0.4em]">
            <span className="min-w-0 truncate font-semibold" title={tank.name}>
              {tank.name}
            </span>
            {tank.isBot ? <span className={`shrink-0 ${ROW_LABEL_TEXT} text-muted`}>{m.results.table.bot}</span> : null}
          </span>
          {trailing === undefined ? null : <span className="tabular font-display font-semibold">{trailing}</span>}
        </li>
      ))}
    </FitList>
  );
}
