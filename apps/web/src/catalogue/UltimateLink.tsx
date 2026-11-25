import { ultimatesOn } from "@game/arena";
import type { UltimateId, UltimateState } from "@game/engine";
import { paths } from "../app/route.ts";
import { IS_OFFLINE } from "../offline/target.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { chargeOf, UltimateEmblem } from "./UltimateEmblem.tsx";

/**
 * How much room the ultimate takes (owner, 2026-11-19: the tile was "so bulky" in lists and the editor):
 * - "chip": a gold pill with the emblem and the name, the first of a style's trait chips;
 * - "tile": the emblem, the name and the live charge, on a tank in the arena;
 * - "icon": the emblem alone, where a row has no room for words.
 */
export type UltimateLinkSize =
  | { readonly kind: "chip" }
  | { readonly kind: "tile"; readonly state?: UltimateState | undefined }
  | { readonly kind: "icon" };

const CHIP: UltimateLinkSize = { kind: "chip" };

/** A style's ultimate with its emblem. It opens the catalogue card in a new tab, so the editor or arena stays open. */
export function UltimateLink({ ultimate, nowMs = Date.now(), size = CHIP }: {
  readonly ultimate: UltimateId;
  readonly nowMs?: number | undefined;
  readonly size?: UltimateLinkSize;
}) {
  const t = useMessages().catalogue;
  const name = t.ultimates[ultimate].name;
  // Offline, a new tab would open the portal's host, not this page, so the emblem links nowhere (offline/target.ts).
  const link = IS_OFFLINE
    ? { "data-ultimate-link": ultimate }
    : ({ "data-ultimate-link": ultimate, href: `${paths.catalogue("ultimates")}&card=${ultimate}`, target: "_blank", rel: "noopener noreferrer" } as const);
  switch (size.kind) {
    case "icon":
      return (
        <a {...link} className="ultimate-tile press inline-flex size-12 shrink-0 items-center justify-center rounded-full">
          <UltimateEmblem ultimate={ultimate} size={44} />
          <span className="sr-only">{name}</span>
        </a>
      );
    case "chip":
      return (
        <a {...link} className="ultimate-tile press inline-flex min-h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border-2 border-guide-deep bg-guide-soft py-px pr-2.5 pl-px text-caption font-semibold text-ink">
          <UltimateEmblem ultimate={ultimate} size={24} />
          <span className="min-w-0 truncate">{name}</span>
        </a>
      );
    case "tile": {
      const { state } = size;
      return (
        <a {...link} className="ultimate-tile press inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 self-start rounded-[var(--radius-card)] border-2 border-b-4 border-guide-deep bg-guide-soft py-0.5 pr-3 pl-1 active:border-b-2">
          <UltimateEmblem ultimate={ultimate} size={40} state={state} />
          <span className="flex min-w-0 flex-col leading-tight [overflow-wrap:anywhere]">
            <span className="font-display text-lead font-semibold text-ink">{name}</span>
            {state === undefined ? null : (
              <span data-ultimate-state={state.kind} className={`text-caption font-semibold ${state.kind === "ready" ? "text-ok" : "text-guide-ink"}`}>
                {state.kind === "ready" ? t.ultimateReady : t.ultimateCharge(Math.round(chargeOf(state) * 100))}
              </span>
            )}
            {ultimatesOn(nowMs) ? null : <span className="text-caption text-muted">{t.soon}</span>}
          </span>
        </a>
      );
    }
  }
}
