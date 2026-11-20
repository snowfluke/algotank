// The catalogue's cards: for each collection, the cards in order with the game's own names and
// sentences, a small picture for the list, and the scene the stage plays. The one place that says
// what the catalogue holds; CataloguePage.tsx only draws it.
// - Play styles: the workshop's order (PICKER_ORDER) and texts (vocabulary playStyles).
// - Items: the board legend's texts (board/messages.ts legend), and the item drawings.
// - Arena conditions: every rule set (RULE_SET_IDS) with its name and note (vocabulary roundRules).
// - Ultimates: one description each, with a tag before release (85-ultimates.md).

import type { ReactNode } from "react";
import { isRuleSetId, ITEM_KINDS, PICKER_ORDER, RULE_SET_IDS, ULTIMATE_IDS, type ItemKind, type PresetId, type RuleSetId } from "@game/engine";
import { ARENA_GROUNDS, groundMarksPath, marksFilled } from "../board/arenaGround.ts";
import { ItemShape } from "../board/itemShapes.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { PlayStyleScene } from "../prep/PlayStyleScene.tsx";
import { plainTankLook } from "../tank/look.ts";
import { CONDITION_SCENES, ITEM_SCENES, ULTIMATE_SCENES, type Scene } from "./scenes.ts";
import { UltimateEmblem } from "./UltimateEmblem.tsx";

export const CATALOGUE_SECTIONS = ["playStyles", "items", "conditions", "ultimates"] as const;
export type CatalogueSection = (typeof CATALOGUE_SECTIONS)[number];

/**
 * The arena condition whose music plays while a card is open (owner, 2026-11-19: "when viewing different arena
 * condition, the bgm must follow"): a condition card plays its own track, every other card the standard one.
 */
export function musicConditionOf(section: CatalogueSection, card: string | undefined): RuleSetId | null {
  return section === "conditions" && card !== undefined && isRuleSetId(card) ? card : null;
}

/** The cards of a collection, by key, in order: the same keys the page draws. */
export function catalogueKeys(section: CatalogueSection): readonly string[] {
  switch (section) {
    case "playStyles":
      return PICKER_ORDER;
    case "items":
      return ITEM_KINDS;
    case "conditions":
      return RULE_SET_IDS;
    case "ultimates":
      return ULTIMATE_IDS;
  }
}

/** Where the catalogue is open: a collection and, when the address names one, a card of it. */
export interface CataloguePlace {
  readonly section: CatalogueSection;
  readonly card: string | null;
}

const isSection = (value: string | null): value is CatalogueSection => value !== null && (CATALOGUE_SECTIONS as readonly string[]).includes(value);

/** The place in "?section=items&card=umbrella". A missing or unknown value falls back to the first collection or card. */
export function placeFromSearch(search: string): CataloguePlace {
  const params = new URLSearchParams(search);
  const asked = params.get("section");
  const section = isSection(asked) ? asked : CATALOGUE_SECTIONS[0];
  const card = params.get("card");
  return { section, card: card !== null && catalogueKeys(section).includes(card) ? card : null };
}

/** `search` with the place written in, keeping its other values (such as "lang"). */
export function searchWithPlace(search: string, place: CataloguePlace): string {
  const params = new URLSearchParams(search);
  params.set("section", place.section);
  if (place.card === null) params.delete("card");
  else params.set("card", place.card);
  return `?${params.toString()}`;
}

export type CataloguePreview = { readonly kind: "playStyle"; readonly style: PresetId } | { readonly kind: "board"; readonly scene: Scene };

export interface CatalogueEntry {
  readonly key: string;
  readonly name: string;
  /** One short sentence: the catalogue's own brief, or a play style's summary, which is already one. */
  readonly body: string;
  /** True for what the game does not have yet. */
  readonly soon: boolean;
  readonly icon: ReactNode;
  readonly preview: CataloguePreview;
}

const ICON_LOOK = plainTankLook(3);

function ItemIcon({ kind }: { readonly kind: ItemKind }) {
  return (
    <svg viewBox="-6 -6 12 12" className="block h-full max-h-9 w-auto overflow-visible" aria-hidden="true">
      <ItemShape kind={kind} />
    </svg>
  );
}

/** A patch of the condition's ground: 3 by 2 squares with its marks, inside its wall. */
/** The condition's ground as a small board: the catalogue's cards and the workshop's condition step show it. */
export function GroundIcon({ ruleSetId }: { readonly ruleSetId: RuleSetId }) {
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

export function catalogueEntries(m: ReturnType<typeof useMessages>, section: CatalogueSection, released: boolean): readonly CatalogueEntry[] {
  const v = m.vocabulary;
  const legend = m.board.legend;
  switch (section) {
    case "playStyles":
      return PICKER_ORDER.map((style) => ({
        key: style,
        name: v.playStyles[style].name,
        body: v.playStyles[style].summary,
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
        body: m.catalogue.briefs.items[kind],
        soon: false,
        icon: <ItemIcon kind={kind} />,
        preview: { kind: "board", scene: ITEM_SCENES[kind] },
      }));
    case "conditions":
      return RULE_SET_IDS.map((id) => ({
        key: id,
        name: v.roundRules[id].name,
        body: m.catalogue.briefs.conditions[id],
        soon: false,
        icon: <GroundIcon ruleSetId={id} />,
        preview: { kind: "board", scene: CONDITION_SCENES[id] },
      }));
    case "ultimates":
      return ULTIMATE_IDS.map((id) => ({
        key: id,
        name: m.catalogue.ultimates[id].name,
        body: m.catalogue.briefs.ultimates[id],
        soon: !released,
        icon: <UltimateEmblem ultimate={id} size={40} />,
        preview: { kind: "board", scene: ULTIMATE_SCENES[id] },
      }));
  }
}
