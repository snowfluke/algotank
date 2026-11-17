// The catalogue's cards: for each collection, the cards in order with the game's own names and
// sentences, a small picture for the list, and the scene the stage plays. The one place that says
// what the catalogue holds; CataloguePage.tsx only draws it.
// - Play styles: the workshop's order (PICKER_ORDER) and texts (vocabulary playStyles).
// - Items: the board legend's texts (board/messages.ts legend), and the item drawings.
// - Arena conditions: every rule set (RULE_SET_IDS) with its name and note (vocabulary roundRules).
// - Ultimates: not in the game yet, so "Coming soon"; each names the play style it is the default of.

import type { ReactNode } from "react";
import { ITEM_KINDS, PICKER_ORDER, RULE_SET_IDS, type ItemKind, type PresetId, type RuleSetId } from "@game/engine";
import { ChevronsRight, Cloud, Droplets, GlassWater, Magnet, Tornado, Umbrella, CircleDot } from "lucide-react";
import { ARENA_GROUNDS, groundMarksPath, marksFilled } from "../board/arenaGround.ts";
import { ItemShape } from "../board/itemShapes.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { PlayStyleScene } from "../prep/PlayStyleScene.tsx";
import { plainTankLook } from "../tank/look.ts";
import { ULTIMATE_IDS, type UltimateId } from "./messages.ts";
import { CONDITION_SCENES, ITEM_SCENES, ULTIMATE_SCENES, type Scene } from "./scenes.ts";

export const CATALOGUE_SECTIONS = ["playStyles", "items", "conditions", "ultimates"] as const;
export type CatalogueSection = (typeof CATALOGUE_SECTIONS)[number];

/** The play style each ultimate starts on (owner's examples: leader chaser dash, evader smoke, wanderer ring, sneak water). */
export const ULTIMATE_DEFAULT_STYLE: Readonly<Record<UltimateId, PresetId>> = {
  dash: "leader-chaser",
  smoke: "evader",
  splash: "random-walker",
  fullTank: "backstabber",
  mudBomb: "ambusher",
  whirlwind: "picker",
  bigUmbrella: "dry-hunter",
  magnet: "item-hunter",
};

export type CataloguePreview = { readonly kind: "playStyle"; readonly style: PresetId } | { readonly kind: "board"; readonly scene: Scene };

export interface CatalogueEntry {
  readonly key: string;
  readonly name: string;
  readonly body: string;
  /** A second, quieter line, or null. */
  readonly extra: string | null;
  /** True for what the game does not have yet. */
  readonly soon: boolean;
  readonly icon: ReactNode;
  readonly preview: CataloguePreview;
}

const ICON_LOOK = plainTankLook(3);

const ULTIMATE_ICONS: Readonly<Record<UltimateId, ReactNode>> = {
  dash: <ChevronsRight aria-hidden size={26} strokeWidth={2.5} />,
  smoke: <Cloud aria-hidden size={26} strokeWidth={2.5} />,
  splash: <Droplets aria-hidden size={26} strokeWidth={2.5} />,
  fullTank: <GlassWater aria-hidden size={26} strokeWidth={2.5} />,
  mudBomb: <CircleDot aria-hidden size={26} strokeWidth={2.5} />,
  whirlwind: <Tornado aria-hidden size={26} strokeWidth={2.5} />,
  bigUmbrella: <Umbrella aria-hidden size={26} strokeWidth={2.5} />,
  magnet: <Magnet aria-hidden size={26} strokeWidth={2.5} />,
};

function ItemIcon({ kind }: { readonly kind: ItemKind }) {
  return (
    <svg viewBox="-6 -6 12 12" className="block h-full max-h-9 w-auto overflow-visible" aria-hidden="true">
      <ItemShape kind={kind} />
    </svg>
  );
}

/** A patch of the condition's ground: 3 by 2 squares with its marks, inside its wall. */
function GroundIcon({ ruleSetId }: { readonly ruleSetId: RuleSetId }) {
  const ground = ARENA_GROUNDS[ruleSetId];
  const marks = groundMarksPath(3, 2, ruleSetId);
  const filled = marksFilled(ground.marks);
  return (
    <svg viewBox="-2 -2 34 24" className="block h-full max-h-9 w-auto" aria-hidden="true">
      <rect x={-2} y={-2} width={34} height={24} rx={4} style={{ fill: ground.wall }} />
      <rect width={30} height={20} rx={1.5} style={{ fill: ground.floor }} />
      {marks === "" ? null : <path d={marks} strokeWidth={filled ? undefined : 0.6} strokeLinecap="round" style={filled ? { fill: ground.mark } : { fill: "none", stroke: ground.mark }} />}
      <path d="M10 0V20M20 0V20M0 10H30" strokeWidth={ground.gridWidth} fill="none" style={{ stroke: ground.grid }} />
    </svg>
  );
}

export function catalogueEntries(m: ReturnType<typeof useMessages>, section: CatalogueSection): readonly CatalogueEntry[] {
  const v = m.vocabulary;
  const legend = m.board.legend;
  switch (section) {
    case "playStyles":
      return PICKER_ORDER.map((style) => ({
        key: style,
        name: v.playStyles[style].name,
        body: v.playStyles[style].summary,
        extra: null,
        soon: false,
        icon: (
          <span className="block aspect-[5/3] h-full overflow-hidden rounded-[0.35rem]">
            <PlayStyleScene style={style} look={ICON_LOOK} fill />
          </span>
        ),
        preview: { kind: "playStyle", style },
      }));
    case "items":
      return ITEM_KINDS.map((kind) => ({
        key: kind,
        name: legend[kind].term,
        body: legend[kind].body,
        extra: kind === "pinwheel" ? legend.dizzy.body : kind === "mudBall" ? legend.stuck.body : null,
        soon: false,
        icon: <ItemIcon kind={kind} />,
        preview: { kind: "board", scene: ITEM_SCENES[kind] },
      }));
    case "conditions":
      return RULE_SET_IDS.map((id) => ({
        key: id,
        name: v.roundRules[id].name,
        body: v.roundRules[id].summary,
        extra: null,
        soon: false,
        icon: <GroundIcon ruleSetId={id} />,
        preview: { kind: "board", scene: CONDITION_SCENES[id] },
      }));
    case "ultimates":
      return ULTIMATE_IDS.map((id) => ({
        key: id,
        name: m.catalogue.ultimates[id].name,
        body: m.catalogue.ultimates[id].body,
        extra: `${m.catalogue.defaultFor(v.playStyles[ULTIMATE_DEFAULT_STYLE[id]].name)} ${m.catalogue.ultimatesNote}`,
        soon: true,
        icon: <span className="flex size-9 items-center justify-center rounded-[0.5rem] bg-guide-soft text-guide-ink">{ULTIMATE_ICONS[id]}</span>,
        preview: { kind: "board", scene: ULTIMATE_SCENES[id] },
      }));
  }
}
