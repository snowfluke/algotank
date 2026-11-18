// "/workshop": the tank workshop, where a player builds play styles ahead of time,
// with no account and no arena, and loads them later in any arena ("Mine" on the
// Play style tab). The page never scrolls (60-no-scroll.md): the list is paged, and
// "New play style" (a start-from picker), the editor and a rename are each one view.
//
// | View      | Shows                                 | Goes to                                         |
// |-----------|---------------------------------------|-------------------------------------------------|
// | list      | my play styles, or the empty state    | startFrom (New), edit (Open, a new one), rename |
// | startFrom | the 8 built-in styles or empty       | ultimate (choose a start), list (Back)          |
// | ultimate  | the new style's ultimate choices    | edit (first save), startFrom (Back)             |
// | edit      | the editor of one play style          | list (Back)                                     |
// | rename    | the name field of one play style      | list (Save or Back)                             |
//
// A first visit (no play styles yet) starts the workshop tour (guide/tours.ts) and its
// checklist; finishing the tour shows the happy moment (FirstStyleGuide.tsx) once.

import { BookOpen, CircleHelp, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ACCOUNT_STRATEGY_LIMITS } from "@game/arena";
import { followLink } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useAccount } from "../auth/accountStore.ts";
import { guideSignal, showAround } from "../guide/guideStore.ts";
import { Tour } from "../guide/Tour.tsx";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { BuiltInStyles, styleIndex } from "../prep/BuiltInStyles.tsx";
import type { PlayStyle } from "../prep/playStyles.ts";
import { focusLater } from "../prep/rulesNav.ts";
import { usePaneWidth } from "../prep/usePaneWidth.ts";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { useToast } from "../ui/Toast.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { useMyTank } from "../mytank/useMyTank.ts";
import { MAX_PLAY_STYLES, type MyPlayStyle } from "./library.ts";
import { ChooseUltimateStep } from "./ChooseUltimateStep.tsx";
import { newStyleDraft, saveNewStyle } from "./creation.ts";
import { ChecklistLine, ChecklistSheet, FirstStyleDone } from "./FirstStyleGuide.tsx";
import { StyleCard } from "./StyleCard.tsx";
import { playStyleLibrary, useLibrary } from "./useLibrary.ts";
import { WorkshopEditor } from "./WorkshopEditor.tsx";
import { freeName } from "./workshopState.ts";

type View =
  | { readonly kind: "list" }
  | { readonly kind: "startFrom" }
  | { readonly kind: "ultimate"; readonly preset: PlayStyle | null; readonly draft: ReturnType<typeof newStyleDraft>; readonly problem: string | null }
  | { readonly kind: "edit"; readonly id: string }
  | { readonly kind: "rename"; readonly id: string };

function RenameStep({ style, onDone }: { readonly style: MyPlayStyle; onDone(): void }) {
  const m = useMessages();
  const w = m.workshop;
  const [name, setName] = useState(style.name);
  const [error, setError] = useState<string | null>(null);
  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = playStyleLibrary.rename(style.id, name);
    if (!result.ok) {
      setError(result.problem === "nameTaken" ? w.nameTaken : w.nameProblem);
      return;
    }
    onDone();
  }
  return (
    <StepSheet title={w.renameTitle} onBack={onDone}>
      <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-4">
        <TextInput
          label={w.name}
          hint={w.nameHint(ACCOUNT_STRATEGY_LIMITS.nameMax)}
          value={name}
          maxLength={ACCOUNT_STRATEGY_LIMITS.nameMax + 8}
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        <div>
          <Button type="submit">{w.save}</Button>
        </div>
      </form>
    </StepSheet>
  );
}

/** One sentence on where the play styles are kept, with the way to keep them everywhere. */
function KeptLine() {
  const m = useMessages();
  const w = m.workshop;
  const account = useAccount();
  const library = useLibrary();
  if (!library.persistent) return <p className="shrink-0 font-semibold text-warning">{w.notPersistent}</p>;
  return (
    <>
      {account.kind === "signedIn" ? null : (
        <p className="shrink-0 text-muted">
          {w.deviceOnly}{" "}
          <a href={paths.signIn(paths.workshop())} onClick={followLink} className="inline-flex min-h-11 items-center font-semibold text-water underline underline-offset-2">
            {w.signIn}
          </a>
        </p>
      )}
      {library.keptOnDevice > 0 ? <p className="shrink-0 font-semibold text-warning">{w.keptOnDevice(library.keptOnDevice, MAX_PLAY_STYLES)}</p> : null}
    </>
  );
}

/** The heading of the list and the empty state, with the help button that replays the tour. */
function ListHeading({ className }: { readonly className: string }) {
  const m = useMessages();
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <h1 className={`min-w-0 flex-1 ${className}`}>{m.workshop.heading}</h1>
      {/* The catalogue shows each play style, item and arena condition at work (catalogue/CataloguePage.tsx). */}
      <a
        href={paths.catalogue("playStyles")}
        data-catalogue-link=""
        onClick={followLink}
        className="press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border-2 border-b-4 border-guide-deep bg-guide-soft px-3 font-display font-semibold text-ink"
      >
        <BookOpen aria-hidden size={20} />
        {m.catalogue.homeTile.title}
      </a>
      <IconButton label={m.guide.showAround} icon={<CircleHelp aria-hidden size={24} />} variant="quiet" data-show-around="" onClick={() => showAround("workshop")} />
    </div>
  );
}

export function WorkshopPage() {
  const m = useMessages();
  const [language] = useLanguage();
  const w = m.workshop;
  const toast = useToast();
  const myTank = useMyTank().tank;
  const library = useLibrary();
  const [view, setView] = useState<View>({ kind: "list" });
  const [checklistOpen, setChecklistOpen] = useState(false);
  // The play style the tour was finished on, while the happy moment shows; false when it does not.
  const [celebrate, setCelebrate] = useState<string | null | false>(false);
  const tour = (
    <Tour
      id="workshop"
      phaseOn
      // A first visit: nothing built yet. Read only to start the tour (guide/tourDriver.ts).
      eligible={library.styles.length === 0}
      occurrence="workshop"
      clock={{ kind: "untimed" }}
      onFinish={() => setCelebrate(view.kind === "edit" ? view.id : null)}
    />
  );
  // The start-from carousel's position, kept above the narrow and wide layouts so a resize keeps it.
  const [startIndex, setStartIndex] = useState(0);
  const width = usePaneWidth<HTMLDivElement>();
  const full = library.styles.length >= MAX_PLAY_STYLES;
  const listDetail = useFitDetail<HTMLDivElement>(2, `${language}|${full}|${library.account.kind}|${library.keptOnDevice}`);
  const styleOf = (id: string) => library.styles.find((style) => style.id === id);

  function backToList(focusKey: string | null): void {
    setView({ kind: "list" });
    focusLater(focusKey);
  }

  function startStyle(preset: PlayStyle | null): void {
    if (preset !== null) setStartIndex(styleIndex(preset.id));
    setView({ kind: "ultimate", preset, draft: newStyleDraft(preset?.strategy ?? null, m.prep.rules.newModeName(1)), problem: null });
  }

  if (celebrate !== false) {
    return (
      <AppShell header={<AppHeader title={w.heading} />}>
        <FirstStyleDone
          styleId={celebrate}
          onBack={() => {
            setCelebrate(false);
            backToList("workshop-new");
          }}
          onAnother={() => {
            setCelebrate(false);
            setView({ kind: "startFrom" });
          }}
        />
      </AppShell>
    );
  }

  if (view.kind === "edit") {
    const style = styleOf(view.id);
    if (style !== undefined)
      return (
        <>
          {tour}
          <WorkshopEditor style={style} library={library} onBack={() => backToList(`open:${style.id}`)} />
        </>
      );
  }

  const newButton = (
    <Button size="lg" icon={<Plus aria-hidden size={22} strokeWidth={2.5} />} disabled={full} data-workshop-new="" data-coach="workshop-new" data-focus-key="workshop-new" onClick={() => setView({ kind: "startFrom" })}>
      {w.newStyle}
    </Button>
  );

  let content;
  if (checklistOpen) {
    content = (
      <ChecklistSheet
        onBack={() => {
          setChecklistOpen(false);
          focusLater("first-style-checklist");
        }}
      />
    );
  } else if (view.kind === "startFrom") {
    content = (
      <div data-workshop-start-from="" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <StepSheet
          title={w.startFromTitle}
          onBack={() => backToList("workshop-new")}
          action={<Button variant="secondary" data-focus-key="workshop-empty-start" onClick={() => startStyle(null)}>{w.startEmpty}</Button>}
        >
          {/* Where the tour's callout goes, because the styles fill the step and leave no room beside them. Empty, it takes no room. */}
          <div data-coach-dock="top" className="shrink-0 empty:hidden" />
          <div data-coach="start-from" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BuiltInStyles
              chosen={null}
              look={myTank.look}
              wide={width.wide}
              index={startIndex}
              onIndexChange={setStartIndex}
              actionLabel={w.startFrom}
              onChoose={startStyle}
            />
          </div>
        </StepSheet>
      </div>
    );
  } else if (view.kind === "ultimate") {
    content = (
      <ChooseUltimateStep
        ultimate={view.draft.ultimate}
        problem={view.problem}
        onChoose={(ultimate) => setView({ ...view, draft: { ...view.draft, ultimate }, problem: null })}
        onBack={() => {
          setView({ kind: "startFrom" });
          focusLater(view.preset === null ? "workshop-empty-start" : `style:${view.preset.id}`);
        }}
        onSave={() => {
          const name = view.preset === null ? w.newStyle : m.vocabulary.playStyles[view.preset.id].name;
          const result = saveNewStyle(playStyleLibrary, name, view.draft);
          if (!result.ok) {
            const problem = result.problem === "ultimate" ? w.needUltimate : result.problem === "full" ? w.full(MAX_PLAY_STYLES) : w.nameProblem;
            setView({ ...view, problem });
            return;
          }
          setView({ kind: "edit", id: result.style.id });
          focusLater("workshop-editor-back");
          guideSignal("styleStarted");
        }}
      />
    );
  } else if (view.kind === "rename" && styleOf(view.id) !== undefined) {
    const style = styleOf(view.id) as MyPlayStyle;
    content = <RenameStep style={style} onDone={() => backToList(`rename:${style.id}`)} />;
  } else if (library.styles.length === 0) {
    content = (
      <div data-workshop-empty="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <ListHeading className="text-heading" />
        <ChecklistLine onOpen={() => setChecklistOpen(true)} />
        <p className="text-lead">{w.emptyTitle}</p>
        <p>{w.emptyBody}</p>
        <KeptLine />
      </div>
    );
  } else {
    content = (
      <div ref={listDetail.ref} data-workshop-list="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 fit:overflow-hidden">
        <ListHeading className="text-title" />
        <ChecklistLine onOpen={() => setChecklistOpen(true)} />
        <KeptLine />
        {full ? <p className="shrink-0 text-muted">{w.full(MAX_PLAY_STYLES)}</p> : null}
        {/* Reserve room for one full card and the pager controls so fit-detail sees the shortage before Pager clips. */}
        <div className={`flex min-w-0 flex-1 flex-col ${listDetail.level === 0 ? "fit:min-h-80" : "min-h-0"}`}>
          <Pager
            label={w.listLabel}
            items={library.styles}
            itemKey={(style) => style.id}
            ordered={false}
            renderItem={(style) => (
              <StyleCard
                style={style}
                full={full}
                compactUltimate={listDetail.level > 0}
                onOpen={() => setView({ kind: "edit", id: style.id })}
                onRename={() => setView({ kind: "rename", id: style.id })}
                onCopy={() => {
                  const result = playStyleLibrary.create(freeName(style.name, library.styles), style.strategy);
                  if (result.ok) toast.show({ message: w.copied(result.style.name) });
                }}
                onDelete={() => {
                  const removed = playStyleLibrary.remove(style.id);
                  if (removed !== null) toast.show({ message: w.removed(removed.name), onUndo: () => playStyleLibrary.restore(removed) });
                  focusLater("workshop-new");
                }}
              />
            )}
          />
        </div>
      </div>
    );
  }

  const listing = !checklistOpen && (view.kind === "list" || (view.kind === "rename" && styleOf(view.id) === undefined));
  return (
    <>
    {tour}
    <AppShell
      header={<AppHeader title={w.heading} />}
      bottom={listing ? <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">{newButton}</div> : undefined}
    >
      <div ref={width.ref} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {content}
      </div>
    </AppShell>
    </>
  );
}
