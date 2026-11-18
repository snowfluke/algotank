import { ultimatesOn } from "@game/arena";
import type { UltimateId } from "@game/engine";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { UltimateIcon } from "./UltimateIcon.tsx";

export function UltimateLink({ ultimate, nowMs = Date.now(), iconOnly = false }: { readonly ultimate: UltimateId; readonly nowMs?: number | undefined; readonly iconOnly?: boolean }) {
  const t = useMessages().catalogue;
  return (
    // Keep the editor or arena open while the player looks up the move (as in the board legend).
    <a
      data-ultimate-link={ultimate}
      href={`${paths.catalogue("ultimates")}&card=${ultimate}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[var(--radius-control)] text-caption text-water ${iconOnly ? "min-w-11 shrink-0 justify-center" : "min-w-0 self-start"}`}
    >
      <UltimateIcon ultimate={ultimate} size={18} />
      <span className={iconOnly ? "sr-only" : "min-w-0 leading-tight [overflow-wrap:anywhere]"}>
        <span className="font-semibold underline underline-offset-2">{t.ultimates[ultimate].name}</span>
        {ultimatesOn(nowMs) ? null : <> <span className="text-muted">{t.soon}</span></>}
      </span>
    </a>
  );
}
