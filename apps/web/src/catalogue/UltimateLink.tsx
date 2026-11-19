import { ultimatesOn } from "@game/arena";
import type { UltimateId, UltimateState } from "@game/engine";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { chargeOf, UltimateEmblem } from "./UltimateEmblem.tsx";

/**
 * A play style's ultimate as a gold tile with its emblem, which opens the catalogue card. A game screen shows the
 * ultimate as a prize, not as a text link (owner, 2026-11-19). With `state` (a live tank), the rim shows the charge.
 */
export function UltimateLink({ ultimate, nowMs = Date.now(), iconOnly = false, state }: {
  readonly ultimate: UltimateId;
  readonly nowMs?: number | undefined;
  readonly iconOnly?: boolean;
  readonly state?: UltimateState | undefined;
}) {
  const t = useMessages().catalogue;
  const name = t.ultimates[ultimate].name;
  const released = ultimatesOn(nowMs);
  return (
    // Keep the editor or arena open while the player looks up the move (as in the board legend).
    <a
      data-ultimate-link={ultimate}
      href={`${paths.catalogue("ultimates")}&card=${ultimate}`}
      target="_blank"
      rel="noopener noreferrer"
      className={
        iconOnly
          ? "ultimate-tile press inline-flex size-12 shrink-0 items-center justify-center rounded-full"
          : "ultimate-tile press inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 self-start rounded-[var(--radius-card)] border-2 border-b-4 border-guide-deep bg-guide-soft py-0.5 pr-3 pl-1 active:border-b-2 sm:min-h-14 sm:gap-2.5 sm:py-1 sm:pr-4"
      }
    >
      {/* On a phone the tile keeps to two lines: a smaller emblem and no label, so the pane's buttons still fit (360x640). */}
      <span className={iconOnly ? "contents" : "contents max-sm:[&>svg]:size-9"}>
        <UltimateEmblem ultimate={ultimate} size={iconOnly ? 44 : 46} state={state} />
      </span>
      {iconOnly ? (
        <span className="sr-only">{name}</span>
      ) : (
        <span className="flex min-w-0 flex-col leading-tight [overflow-wrap:anywhere]">
          <span className="text-caption font-semibold text-guide-ink max-sm:sr-only">{t.ultimateLabel}</span>
          <span className="font-display text-lead font-semibold text-ink">{name}</span>
          {state === undefined ? null : (
            <span data-ultimate-state={state.kind} className={`text-caption font-semibold ${state.kind === "ready" ? "text-ok" : "text-guide-ink"}`}>
              {state.kind === "ready" ? t.ultimateReady : t.ultimateCharge(Math.round(chargeOf(state) * 100))}
            </span>
          )}
          {released ? null : <span className="text-caption text-muted">{t.soon}</span>}
        </span>
      )}
    </a>
  );
}
