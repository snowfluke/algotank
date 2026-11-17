// "/catalogue": everything a tank meets in the arena, for a child who wants to look things up
// (owner, 2026-11-17): the play styles, the items, the arena conditions, and the ultimates the
// game will have ("Coming soon"). A switch picks the collection; a list of picture buttons picks
// one card; the stage shows its name, its sentence and a scene that acts it out:
// - a play style: the workshop's own scene (prep/PlayStyleScene.tsx), so it looks the same there;
// - an item, a condition or an ultimate: a few turns on the game's board (ScenePlayer.tsx).
// The names and sentences are the game's own (catalogue.ts), so the catalogue never words a rule
// differently. On a laptop the stage stands beside the list; on a phone the list is a grid of
// small buttons above the stage. Nothing scrolls: the page fits its box like the other pages.

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { goBack } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { PlayStyleScene } from "../prep/PlayStyleScene.tsx";
import { plainTankLook } from "../tank/look.ts";
import { AppShell } from "../ui/AppShell.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { catalogueEntries, CATALOGUE_SECTIONS, placeFromSearch, searchWithPlace, type CatalogueEntry, type CatalogueSection } from "./catalogue.tsx";
import { ScenePlayer } from "./ScenePlayer.tsx";

const YOU_LOOK = plainTankLook(3);

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
  onPlace,
}: {
  readonly initialSection: CatalogueSection;
  readonly initialEntry?: string;
  /** Told the collection and card on show, after each change. */
  onPlace?: (place: { readonly section: CatalogueSection; readonly card: string }) => void;
}) {
  const m = useMessages();
  const t = m.catalogue;
  const laptop = useLaptopLayout();
  const [section, setSection] = useState<CatalogueSection>(initialSection);
  const entries = catalogueEntries(m, section);
  const [chosen, setChosen] = useState<Readonly<Partial<Record<CatalogueSection, string>>>>(initialEntry === undefined ? {} : { [initialSection]: initialEntry });
  const entry = entries.find((e) => e.key === chosen[section]) ?? entries[0];
  const sectionName = t.sections[section];
  const card = entry?.key;
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
            <h1 className="min-w-0 text-heading [overflow-wrap:anywhere]">{t.heading}</h1>
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
            <Stage entry={entry} entries={entries} />
            <EntryList entries={entries} chosen={entry.key} label={t.listLabel(sectionName)} onChoose={(key) => setChosen({ ...chosen, [section]: key })} layout="rows" />
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <EntryList entries={entries} chosen={entry.key} label={t.listLabel(sectionName)} onChoose={(key) => setChosen({ ...chosen, [section]: key })} layout="grid" />
            <Stage entry={entry} entries={entries} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The chosen card: its name, its sentences and its scene. Every card's text of the collection lies in
 * the same grid cell and only the chosen one shows, so the text takes the height of the longest and the
 * scene below stays put when another card is chosen (owner, 2026-11-17: the items, the arena conditions
 * and the mud bomb and magnet moved the scene).
 */
function Stage({ entry, entries }: { readonly entry: CatalogueEntry; readonly entries: readonly CatalogueEntry[] }) {
  const m = useMessages();
  const t = m.catalogue;
  return (
    <section aria-labelledby="catalogue-entry" data-catalogue-entry={entry.key} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="grid min-w-0 shrink-0">
        {entries.map((each) => {
          const shown = each.key === entry.key;
          return (
            <div key={each.key} aria-hidden={!shown} className={`flex min-w-0 flex-col gap-2 [grid-area:1/1] ${shown ? "" : "invisible"}`}>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 {...(shown ? { id: "catalogue-entry" } : {})} className="min-w-0 text-title [overflow-wrap:anywhere]">
                  {each.name}
                </h2>
                {each.soon ? (
                  <span {...(shown ? { "data-catalogue-soon": "" } : {})} className="shrink-0 rounded-full bg-guide-soft px-2.5 py-0.5 text-caption font-semibold text-guide-ink">
                    {t.soon}
                  </span>
                ) : null}
              </div>
              <p className="max-w-[60ch] [overflow-wrap:anywhere]">{each.body}</p>
              {/* The quieter line gives way on a short screen, so the scene keeps its room; the tag still says "Coming soon". */}
              {each.extra === null ? null : <p className="max-w-[60ch] text-caption text-muted [overflow-wrap:anywhere] [@media(max-height:700px)]:hidden">{each.extra}</p>}
            </div>
          );
        })}
      </div>
      {entry.preview.kind === "playStyle" ? (
        // The workshop's scene, 5 by 3 squares; the stage gives it the room that is left.
        <div role="img" aria-label={t.sceneLabel(entry.name)} data-catalogue-scene="" className="flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-[var(--radius-card)] bg-arena-floor p-2">
          <div className="aspect-[5/3] max-h-full w-full max-w-[40rem]">
            <PlayStyleScene style={entry.preview.style} look={YOU_LOOK} live fill />
          </div>
        </div>
      ) : (
        <ScenePlayer key={entry.key} scene={entry.preview.scene} label={t.sceneLabel(entry.name)} nextLabel={t.nextStep} />
      )}
    </section>
  );
}

/** The cards of one collection: rows with a picture on a laptop, a grid of small buttons on a phone. The rows shrink from 48px to 40px in a short window, so eight of them fit 1000 by 600. */
function EntryList({ entries, chosen, label, onChoose, layout }: { readonly entries: readonly CatalogueEntry[]; readonly chosen: string; readonly label: string; onChoose(key: string): void; readonly layout: "rows" | "grid" }) {
  return (
    <div role="group" aria-label={label} className={layout === "rows" ? "flex min-h-0 min-w-0 flex-col gap-1" : "grid min-w-0 shrink-0 grid-cols-4 gap-1.5"}>
      {entries.map((entry) => {
        const isChosen = entry.key === chosen;
        return (
          <button
            key={entry.key}
            type="button"
            aria-pressed={isChosen}
            data-catalogue-card={entry.key}
            onClick={() => onChoose(entry.key)}
            className={`press flex min-w-0 rounded-[var(--radius-control)] border-2 ${
              isChosen ? "border-water bg-water-soft" : "border-transparent bg-panel hover:border-line-strong"
            } ${layout === "rows" ? "max-h-12 min-h-10 flex-1 items-center gap-3 px-2 py-0.5 text-left" : "min-h-11 flex-col items-center gap-1 px-0.5 py-1.5 text-center"}`}
          >
            <span className={`flex shrink-0 items-center justify-center ${layout === "rows" ? "h-8 w-14" : "h-8 w-full"}`}>{entry.icon}</span>
            <span className={`min-w-0 font-display font-semibold ${layout === "rows" ? "[overflow-wrap:anywhere]" : "line-clamp-2 w-full text-[0.75rem] leading-tight [overflow-wrap:break-word]"}`}>
              {entry.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
