// The 8 built-in play styles in the room a pane has: one at a time in a Carousel when
// the pane is narrow (a phone), as a 4 x 2 grid of tiles when it is wide. The arena's
// Play style tab uses it to choose a style, the workshop to pick a starting point, so
// the button's words come from the caller.
//
// One card shape everywhere (71-workshop-appeal.md, part A): the drawing in one fixed
// shape (5 by 3), then the name on one line, then one sentence of at most 9 words, for
// which two lines are always kept, so every drawing starts at the same height and every
// name sits on the same line. When the pane is short the drawing shrinks and keeps its
// shape; the words stay, and a pane too short for the grid's words gets the carousel.
// Only one scene moves at a time (movingStyle).

import { CircleCheck } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PresetId } from "@game/engine";
import { UltimateLink } from "../catalogue/UltimateLink.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { TankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";
import { Carousel } from "../ui/Carousel.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { movingStyle, PLAY_STYLES, type PlayStyle } from "./playStyles.ts";
import { PlayStyleScene } from "./PlayStyleScene.tsx";

export interface BuiltInStylesProps {
  /** The style the tank plays now, or null (own rules, or a start-from picker). */
  readonly chosen: PresetId | null;
  readonly look: TankLook;
  readonly nowMs?: number | undefined;
  /** Wide panes show the grid; narrow ones the carousel. */
  readonly wide: boolean;
  /** The carousel's position, kept by the screen so a resize or a re-render does not lose it. */
  readonly index: number;
  onIndexChange(index: number): void;
  onChoose(style: PlayStyle): void;
  /** The button of a style that is not chosen: "Use this play style" or "Start from this one". */
  readonly actionLabel: string;
}

/** The drawing, the name and the sentence: the same in a tile and in a slide. */
/** `badge` sits at the end of the name's line: the slide puts the ultimate's chip there, so it needs no row of its own. */
function CardFace({ style, chosen, look, live, badge }: { readonly style: PlayStyle; readonly chosen: boolean; readonly look: TankLook; readonly live: boolean; readonly badge?: ReactNode }) {
  const m = useMessages();
  const text = m.vocabulary.playStyles[style.id];
  return (
    <>
      {/* The drawing keeps its 5:3 shape: it is as wide as the card, and on a short pane it shrinks inside its box. */}
      <span className="relative block aspect-[5/3] min-h-10 w-full min-w-0 shrink overflow-hidden rounded-[0.75rem]">
        <span className="absolute inset-0 flex">
          <PlayStyleScene style={style.id} look={look} live={live} fill />
        </span>
      </span>
      <span className="flex w-full min-w-0 shrink-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-display font-semibold leading-tight">{text.name}</span>
        {badge}
        {chosen ? <CircleCheck aria-label={m.prep.style.chosen} size={20} strokeWidth={2.5} className="shrink-0 text-water" /> : null}
      </span>
      {/* Two lines are always kept, so the cards of a row end together whatever the sentence's length. */}
      <span className="block min-h-[2lh] w-full shrink-0 text-caption text-muted [overflow-wrap:anywhere]">{text.summary}</span>
    </>
  );
}

/** One style with its drawing as large as the slide allows, and the button to choose it. */
function Slide({ style, chosen, look, nowMs, onChoose, actionLabel }: { readonly style: PlayStyle; readonly chosen: boolean; readonly look: TankLook; readonly nowMs?: number | undefined; onChoose(): void; readonly actionLabel: string }) {
  const m = useMessages();
  return (
    <article
      aria-label={m.vocabulary.playStyles[style.id].name}
      className={`mx-auto flex min-h-0 w-full max-w-md min-w-0 shrink flex-col gap-2 rounded-[var(--radius-card)] border-2 border-b-4 p-3 ${chosen ? "border-water bg-water-soft" : "border-line bg-panel"}`}
    >
      <CardFace style={style} chosen={chosen} look={look} live badge={<UltimateLink ultimate={style.strategy.ultimate} nowMs={nowMs} />} />
      {/* The chosen style needs no button: the mark beside its name says it is the one. */}
      {chosen ? null : <Button className="max-w-full shrink-0 self-start" data-style-choose={style.id} data-focus-key={`style:${style.id}`} onClick={onChoose}>{actionLabel}</Button>}
    </article>
  );
}

function Grid({ chosen, look, nowMs, onChoose, onTooShort }: Pick<BuiltInStylesProps, "chosen" | "look" | "nowMs" | "onChoose"> & { onTooShort(): void }) {
  const [hovered, setHovered] = useState<PresetId | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  // A tile that cannot hold its drawing, name and two lines says so, and the screen shows the carousel instead.
  useLayoutEffect(() => {
    const tiles = grid.current?.children ?? [];
    if ([...tiles].some((tile) => {
      const button = tile.firstElementChild;
      return tile.scrollHeight > tile.clientHeight + 1 || (button !== null && button.scrollHeight > button.clientHeight + 1);
    })) onTooShort();
  });
  const [focused, setFocused] = useState<PresetId | null>(null);
  const live = movingStyle(hovered, focused, chosen);
  return (
    // Rows take the height their tiles need, and share it out when the pane is shorter (minmax(0, auto)).
    <div ref={grid} className="grid min-h-0 min-w-0 flex-1 grid-cols-4 grid-rows-[repeat(2,minmax(0,auto))] content-start gap-2 fit:overflow-hidden">
      {PLAY_STYLES.map((style) => {
        const isChosen = style.id === chosen;
        return (
          // The catalogue link has its own action and focus stop, beside the style's button.
          <article
            key={style.id}
            data-style-tile={style.id}
            className={`flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border-2 border-b-4 p-2 ${isChosen ? "border-water bg-water-soft" : "border-line bg-panel [@media(hover:hover)]:hover:border-line-strong"}`}
          >
            <button
              type="button"
              aria-pressed={isChosen}
              data-style-choose={style.id}
              data-focus-key={`style:${style.id}`}
              onClick={() => onChoose(style)}
              onPointerEnter={() => setHovered(style.id)}
              onPointerLeave={() => setHovered((now) => (now === style.id ? null : now))}
              onFocus={() => setFocused(style.id)}
              onBlur={() => setFocused((now) => (now === style.id ? null : now))}
              className="press flex min-h-0 min-w-0 shrink flex-col items-stretch gap-1.5 rounded-[var(--radius-control)] text-left"
            >
              <CardFace style={style} chosen={isChosen} look={look} live={live === style.id} />
            </button>
            <UltimateLink ultimate={style.strategy.ultimate} nowMs={nowMs} />
          </article>
        );
      })}
    </div>
  );
}

export function BuiltInStyles(props: BuiltInStylesProps) {
  const { ref, box } = useBoxSize<HTMLDivElement>();
  // The height below which the grid clipped a tile, measured once it did; until the pane is taller, the carousel shows.
  const [gridNeeds, setGridNeeds] = useState(0);
  const grid = props.wide && (box === null || box.height >= gridNeeds);
  return (
    <div ref={ref} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {grid ? (
        <Grid chosen={props.chosen} look={props.look} nowMs={props.nowMs} onChoose={props.onChoose} onTooShort={() => setGridNeeds((need) => Math.max(need, (box?.height ?? 0) + 1))} />
      ) : (
        <StyleCarousel {...props} />
      )}
    </div>
  );
}

function StyleCarousel({ chosen, look, nowMs, index, onIndexChange, onChoose, actionLabel }: BuiltInStylesProps) {
  const m = useMessages();
  return (
    // The carousel takes the height its slide needs, so the card hugs its content and the pager sits right under it;
    // on a short pane it shrinks, and the drawing gives way first.
    <div className="flex min-h-0 min-w-0 shrink flex-col">
    <Carousel
      label={m.prep.style.legend}
      items={PLAY_STYLES}
      itemKey={(style) => style.id}
      index={index}
      onIndexChange={onIndexChange}
      renderItem={(style) => <Slide style={style} chosen={style.id === chosen} look={look} nowMs={nowMs} onChoose={() => onChoose(style)} actionLabel={actionLabel} />}
    />
    </div>
  );
}

/** The carousel position of a style, so the carousel opens on the chosen one. */
export function styleIndex(id: PresetId | null): number {
  return Math.max(0, PLAY_STYLES.findIndex((style) => style.id === id));
}
