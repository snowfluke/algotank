import type { UltimateId } from "@game/engine";
import { ChevronsRight, CircleDot, Cloud, Droplets, GlassWater, Magnet, Tornado, Umbrella, type LucideIcon } from "lucide-react";

// Keep the same picture on a play style and its catalogue card (85-ultimates.md).
const ICONS: Readonly<Record<UltimateId, LucideIcon>> = {
  dash: ChevronsRight,
  smoke: Cloud,
  splash: Droplets,
  fullTank: GlassWater,
  mudBomb: CircleDot,
  whirlwind: Tornado,
  bigUmbrella: Umbrella,
  magnet: Magnet,
};

export function UltimateIcon({ ultimate, size }: { readonly ultimate: UltimateId; readonly size: number }) {
  const Icon = ICONS[ultimate];
  return <Icon aria-hidden size={size} strokeWidth={2.5} className="shrink-0" />;
}
