// One of my play styles in the workshop list: its tank, its name, two traits read from
// its rules (or that it has a problem), when it last changed, and its actions: open,
// copy, rename, delete. One row when the card is wide (a laptop), two rows on a phone,
// decided by the card's own width. Its height does not change on hover or focus (Pager).

import { useMyTank } from "../mytank/useMyTank.ts";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { UltimateLink } from "../catalogue/UltimateLink.tsx";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { Traits } from "../prep/Traits.tsx";
import { traitsOf } from "../prep/playStyles.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { isLoadable, type MyPlayStyle } from "./library.ts";

export interface StyleCardProps {
  readonly style: MyPlayStyle;
  readonly full: boolean;
  readonly nowMs?: number;
  readonly compactUltimate?: boolean;
  onOpen(): void;
  onCopy(): void;
  onRename(): void;
  onDelete(): void;
}

export function StyleCard({ style, full, nowMs, compactUltimate = false, onOpen, onCopy, onRename, onDelete }: StyleCardProps) {
  const m = useMessages();
  const w = m.workshop;
  const [language] = useLanguage();
  const { tank } = useMyTank();
  const loadable = isLoadable(style);
  const date = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(style.updatedAt);
  return (
    <div className="@container min-w-0">
      <article aria-label={style.name} className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border-2 border-b-4 border-line bg-panel p-3 @2xl:flex-row @2xl:items-center @2xl:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <TankBadge look={tank.look} size={40} name={null} detail="full" angle={-90} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="truncate text-lead">{style.name}</h2>
            {loadable ? <Traits traits={traitsOf(style.strategy)} /> : <p className="text-caption font-semibold text-hit">{w.hasProblem}</p>}
            {compactUltimate ? null : <UltimateLink ultimate={style.strategy.ultimate} nowMs={nowMs} />}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="secondary" className={compactUltimate ? "!min-w-20 !px-3" : ""} data-workshop-open="" data-focus-key={`open:${style.id}`} aria-label={w.openNamed(style.name)} onClick={onOpen}>
            {w.open}
          </Button>
          <IconButton label={w.copy(style.name)} icon={<Copy aria-hidden size={20} />} disabled={full} onClick={onCopy} />
          <IconButton label={w.rename(style.name)} icon={<Pencil aria-hidden size={20} />} data-focus-key={`rename:${style.id}`} onClick={onRename} />
          <IconButton label={w.remove(style.name)} icon={<Trash2 aria-hidden size={20} />} onClick={onDelete} />
          {compactUltimate ? <UltimateLink ultimate={style.strategy.ultimate} nowMs={nowMs} iconOnly /> : null}
          <p className="min-w-0 text-caption text-muted @2xl:order-first @2xl:w-44">
            <time dateTime={new Date(style.updatedAt).toISOString()}>{w.changed(date)}</time>
          </p>
        </div>
      </article>
    </div>
  );
}
