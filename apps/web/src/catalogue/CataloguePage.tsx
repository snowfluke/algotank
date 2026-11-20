// "/catalogue": everything a tank meets in the arena, for a child who wants to look things up
// (owner, 2026-11-17): the play styles, the items, the arena conditions, and the ultimates. A switch picks the collection; a list of picture buttons picks
// one card; the stage shows its name, its sentence and a scene that acts it out:
// - a play style: the workshop's own scene (prep/PlayStyleScene.tsx), so it looks the same there;
// - an item, a condition or an ultimate: a few turns on the game's board (ScenePlayer.tsx).
// The names are the game's own; the sentences are the catalogue's short briefs (messages.ts). On a laptop the stage stands beside the list; on a phone the list is one row of
// cards above the stage that scrolls sideways (owner, 2026-11-20), the only part that scrolls. Every
// card's scene gets the same 5 by 3 box, so the arena keeps one size across the four collections.

import { ultimatesOn } from "@game/arena";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { goBack, navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { PlayStyleScene } from "../prep/PlayStyleScene.tsx";
import { plainTankLook } from "../tank/look.ts";
import { AppShell } from "../ui/AppShell.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useMusicCondition } from "../sound/music.ts";
import { catalogueEntries, CATALOGUE_SECTIONS, musicConditionOf, placeFromSearch, searchWithPlace, type CatalogueEntry, type CatalogueSection } from "./catalogue.tsx";
import { ScenePlayer } from "./ScenePlayer.tsx";
import { boardAspect } from "../board/FittedBoard.tsx";

const YOU_LOOK = plainTankLook(3);
/** The shape of a 5 by 3 board with its wall: every card's scene box, so a board scene fills it edge to edge. */
const SCENE_BOX_RATIO = boardAspect(5, 3);

/**
 * The address holds the open collection and card ("?section=items&card=umbrella"), so a link or a
 * reload opens the same card. Each choice replaces the address instead of adding a history step,
 * so "back" leaves the catalogue at once.
 */
export function CataloguePage() {
  const [place] = useState(() => placeFromSearch(window.location.search));
  return (
    <CatalogueView
      initialSection={place.section}
      {...(place.card === null ? {} : { initialEntry: place.card })}
      onPlace={(next) => window.history.replaceState(window.history.state, "", `${window.location.pathname}${searchWithPlace(window.location.search, next)}`)}
    />
  );
}

/** The page in any state, so the tests and the audit can open a section and a card. */
export function CatalogueView({
  initialSection,
  initialEntry,
  nowMs = Date.now(),
  onPlace,
}: {
  readonly initialSection: CatalogueSection;
  readonly initialEntry?: string;
  readonly nowMs?: number;
  /** Told the collection and card on show, after each change. */
  onPlace?: (place: { readonly section: CatalogueSection; readonly card: string }) => void;
}) {
  const m = useMessages();
  const t = m.catalogue;
  const laptop = useLaptopLayout();
  const [section, setSection] = useState<CatalogueSection>(initialSection);
  const entries = catalogueEntries(m, section, ultimatesOn(nowMs));
  const [chosen, setChosen] = useState<Readonly<Partial<Record<CatalogueSection, string>>>>(initialEntry === undefined ? {} : { [initialSection]: initialEntry });
  const entry = entries.find((e) => e.key === chosen[section]) ?? entries[0];
  const sectionName = t.sections[section];
  const card = entry?.key;
  useMusicCondition(musicConditionOf(section, card));
  useEffect(() => {
    if (card !== undefined) onPlace?.({ section, card });
    // onPlace is a new function on each render of the page; only a new place is news.
  }, [section, card]);

  return (
    <AppShell>
      <div data-catalogue={section} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 shrink-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton label={m.common.back} icon={<ArrowLeft aria-hidden size={22} />} variant="quiet" data-catalogue-back="" onClick={() => goBack(paths.home())} />
            <h1 className="min-w-0 flex-1 text-heading [overflow-wrap:anywhere]">{t.heading}</h1>
            {/* The rules guide has its own page: a fifth collection did not fit the switch on a phone. */}
            {/* Words from 480px; on a narrow phone the book alone, so the heading keeps one line. */}
            <IconButton label={t.rulesGuide.open} text={t.rulesGuide.open} icon={<BookOpen aria-hidden size={22} />} data-catalogue-rules="" onClick={() => navigate(paths.rules())} />
          </div>
          <p className="max-w-[60ch] text-muted [overflow-wrap:anywhere] [@media(max-height:700px)]:hidden">{t.intro}</p>
        </div>
        <div className="shrink-0">
          <SegmentedControl
            legend={t.sections.label}
            hideLegend
            value={section}
            onChange={setSection}
            options={CATALOGUE_SECTIONS.map((value) => ({ value, label: t.sections[value], shortLabel: t.short[value] }))}
          />
        </div>
        {entry === undefined ? null : laptop ? (
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,20rem)] gap-6">
            <Stage entry={entry} />
            <EntryList entries={entries} chosen={entry.key} label={t.listLabel(sectionName)} onChoose={(key) => setChosen({ ...chosen, [section]: key })} layout="rows" />
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <EntryList entries={entries} chosen={entry.key} label={t.listLabel(sectionName)} onChoose={(key) => setChosen({ ...chosen, [section]: key })} layout="strip" />
            <Stage entry={entry} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The chosen card: its name, one short sentence and its scene. The sentence keeps two lines of room and the scene one
 * 5 by 3 box for every card of every collection, so the arena keeps its size whichever card shows (owner, 2026-11-17:
 * the scene must stay put; 2026-11-20: "all 4 catalogue have the same arena dimension").
 */
function Stage({ entry }: { readonly entry: CatalogueEntry }) {
  const m = useMessages();
  const t = m.catalogue;
  return (
    <section aria-labelledby="catalogue-entry" data-catalogue-entry={entry.key} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 shrink-0 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 id="catalogue-entry" className="min-w-0 truncate text-title">
            {entry.name}
          </h2>
          {entry.soon ? (
            <span data-catalogue-soon="" className="shrink-0 rounded-full bg-guide-soft px-2.5 py-0.5 text-caption font-semibold text-guide-ink">
              {t.soon}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 min-h-[2lh] max-w-[60ch] [overflow-wrap:anywhere]">{entry.body}</p>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center">
        <div data-catalogue-box="" className="flex max-h-full min-h-0 w-full min-w-0 max-w-[40rem] flex-col" style={{ aspectRatio: SCENE_BOX_RATIO }}>
          {entry.preview.kind === "playStyle" ? (
            // The workshop's scene, 5 by 3 squares, on the floor colour the board scenes have.
            <div role="img" aria-label={t.sceneLabel(entry.name)} data-catalogue-scene="" className="flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-[var(--radius-card)] bg-arena-floor p-2">
              <PlayStyleScene style={entry.preview.style} look={YOU_LOOK} live fill />
            </div>
          ) : (
            <ScenePlayer key={entry.key} scene={entry.preview.scene} label={t.sceneLabel(entry.name)} nextLabel={t.nextStep} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The cards of one collection. On a laptop: rows with a picture (they shrink from 48px to 40px in a short window, so
 * eight fit 1000 by 600). On a phone: one row that scrolls sideways, so the stage keeps its height (owner, 2026-11-20).
 */
function EntryList({ entries, chosen, label, onChoose, layout }: { readonly entries: readonly CatalogueEntry[]; readonly chosen: string; readonly label: string; onChoose(key: string): void; readonly layout: "rows" | "strip" }) {
  const cards = entries.map((entry) => {
    const isChosen = entry.key === chosen;
    return (
      <button
        key={entry.key}
        type="button"
        aria-pressed={isChosen}
        data-catalogue-card={entry.key}
        onClick={() => onChoose(entry.key)}
        className={`press flex min-w-0 rounded-[var(--radius-control)] border-2 ${
          isChosen ? "border-water bg-water-soft" : "border-transparent bg-panel [@media(hover:hover)]:hover:border-line-strong"
        } ${layout === "rows" ? "max-h-12 min-h-10 flex-1 items-center gap-3 px-2 py-0.5 text-left" : "min-h-11 w-[4.375rem] shrink-0 snap-start flex-col items-center gap-1 px-0.5 py-1.5 text-center"}`}
      >
        <span className={`flex shrink-0 items-center justify-center ${layout === "rows" ? "h-8 w-14" : "h-8 w-full"}`}>{entry.icon}</span>
        <span className={`min-w-0 font-display font-semibold ${layout === "rows" ? "[overflow-wrap:anywhere]" : "line-clamp-2 min-h-[2lh] w-full text-[0.75rem] leading-tight [overflow-wrap:break-word]"}`}>
          {entry.name}
        </span>
      </button>
    );
  });
  if (layout === "rows") {
    return (
      <div role="group" aria-label={label} className="flex min-h-0 min-w-0 flex-col gap-1">
        {cards}
      </div>
    );
  }
  return <CardStrip label={label} chosen={chosen}>{cards}</CardStrip>;
}

/**
 * A row of cards that scrolls sideways. The cues that more cards wait: the last visible card shows only in part, and an
 * arrow on each side moves the row by a screen of cards and dims when that end is reached. Both arrows go when every card
 * fits. The chosen card scrolls into view, so a link to the eighth card shows it.
 */
function CardStrip({ label, chosen, children }: { readonly label: string; readonly chosen: string; readonly children: ReactNode }) {
  const t = useMessages().catalogue;
  const row = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ atStart: true, atEnd: true });
  const measure = useCallback(() => {
    const el = row.current;
    if (el === null) return;
    setEnds({ atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const el = row.current;
    if (el === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  useEffect(() => {
    row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [chosen, children, measure]);
  const move = (direction: 1 | -1) => {
    const el = row.current;
    el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const fits = ends.atStart && ends.atEnd;
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      {fits ? null : <StripArrow label={t.earlierCards} disabled={ends.atStart} onClick={() => move(-1)} icon={<ChevronLeft aria-hidden size={22} />} />}
      <div
        ref={row}
        role="group"
        aria-label={label}
        data-scroll-row=""
        onScroll={measure}
        className="flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {fits ? null : <StripArrow label={t.moreCards} disabled={ends.atEnd} onClick={() => move(1)} icon={<ChevronRight aria-hidden size={22} />} />}
    </div>
  );
}

/** A narrow arrow beside the card row: as tall as a card and 32px wide, so three and a part of a fourth card still show at 360px. */
function StripArrow({ label, disabled, onClick, icon }: { readonly label: string; readonly disabled: boolean; onClick(): void; readonly icon: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} data-catalogue-arrow="" onClick={onClick} className="press flex min-h-11 w-8 shrink-0 items-center justify-center self-stretch rounded-[var(--radius-control)] text-ink disabled:cursor-default disabled:text-line-strong">
      {icon}
    </button>
  );
}
