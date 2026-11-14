// The game's own dropdown, in place of the browser's select. Closed, it is a button that
// shows the current choice and a chevron. Open on a phone, it is a sheet from the bottom
// with the label as its title and large rows; on a laptop, a list anchored to the button
// that opens downward or upward where there is room. A long list is paged (the no-scroll
// rule) and opens on the page of the current choice; grouped choices show the group
// names first, then the choices of one group.
//
// The open list is a modal <dialog> in a portal: the top layer is never cut by a pane that
// hides overflow, the page behind is inert, and the dialog's position: fixed ends the
// audit's clipping check. Keys follow a select: Enter, Space or Arrow Down opens; arrows,
// Home and End move; a letter jumps; Enter chooses; Escape and Tab close and return focus.
// The pure rules are in ui/picker.ts.

import { ArrowLeft, Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";
import { Descriptions, useDescriptions, type DescribedProps } from "./Field.tsx";
import { IconButton } from "./IconButton.tsx";
import { useFitLayout, useLaptopLayout } from "./layout.ts";
import { Pager } from "./Pager.tsx";
import {
  findChoice,
  openGroup,
  openPicker,
  placeList,
  rowLabel,
  stepRow,
  typeAhead,
  viewRows,
  type ListPlacement,
  type PickerChoice,
  type PickerGroup,
  type PickerOpen,
  type PickerOptions,
  type PickerRow,
} from "./picker.ts";

export type { PickerChoice, PickerGroup } from "./picker.ts";

/** A flat list of choices, or the same choices under group names. Never both. */
type ChoicesProps<T extends string> =
  | { readonly choices: readonly PickerChoice<T>[]; readonly groups?: undefined }
  | { readonly groups: readonly PickerGroup<T>[]; readonly choices?: undefined };

export type PickerProps<T extends string> = ChoicesProps<T> &
  DescribedProps & {
    /** The chosen value. A value that is not among the choices shows `placeholder`. */
    readonly value: string;
    onChange(next: T): void;
    readonly disabled?: boolean;
    /** Shown on the button while no known choice is chosen. Defaults to "Choose one". */
    readonly placeholder?: string;
    /**
     * "field" (default): the label above the button, which fills the width.
     * "inline": a part of a sentence; the label is only the accessible name and the open list's
     * title, and the button is as wide as its text and wraps with the sentence.
     */
    readonly look?: "field" | "inline";
    /**
     * The open list's title when it should differ from the label: an inline picker's label names
     * the part for a screen reader ("Action, tank"), while the sheet asks a plain question ("Which tank?").
     */
    readonly title?: string;
    /** A language-neutral hook for the audit, for example "condition". */
    readonly "data-picker"?: string;
  };

const FIELD_CLASSES =
  "press flex min-h-12 w-full min-w-0 items-center gap-2 rounded-[var(--radius-control)] border-2 border-line bg-panel px-3 py-2 text-left text-ink aria-expanded:border-water aria-[invalid=true]:border-hit disabled:cursor-not-allowed disabled:bg-ground disabled:text-muted [@media(hover:hover)]:hover:border-line-strong";
const INLINE_CLASSES =
  "press inline-flex min-h-11 min-w-0 max-w-full items-center gap-1 rounded-[var(--radius-control)] border-2 border-line bg-panel py-1 pr-2 pl-3 text-left font-semibold text-ink aria-expanded:border-water disabled:cursor-not-allowed disabled:text-muted [@media(hover:hover)]:hover:border-line-strong";

export function Picker<T extends string>(props: PickerProps<T>) {
  const m = useMessages();
  const options: PickerOptions<T> = props.groups === undefined ? { kind: "flat", choices: props.choices } : { kind: "grouped", groups: props.groups };
  const d = useDescriptions(props.hint, props.error);
  const labelId = `${d.id}-label`;
  const listId = `${d.id}-list`;
  const button = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState<PickerOpen | null>(null);
  const chosen = findChoice(options, props.value);
  const inline = props.look === "inline";

  function show(): void {
    if (props.disabled === true) return;
    playSound("tap");
    setOpen(openPicker(options, props.value));
  }
  function close(): void {
    setOpen(null);
    // The dialog leaves the DOM first; then the button takes the focus back.
    requestAnimationFrame(() => button.current?.focus());
  }
  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    show();
  }

  const trigger = (
    <button
      ref={button}
      type="button"
      id={d.id}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open !== null}
      aria-controls={open === null ? undefined : listId}
      {...(inline ? { "aria-label": props.label } : { "aria-labelledby": labelId })}
      aria-describedby={d.describedBy}
      aria-invalid={d.errorId === undefined ? undefined : true}
      disabled={props.disabled}
      data-picker={props["data-picker"]}
      onClick={show}
      onKeyDown={onButtonKey}
      className={inline ? INLINE_CLASSES : FIELD_CLASSES}
    >
      <span className={`min-w-0 [overflow-wrap:anywhere] ${inline ? "" : "flex-1"} ${chosen === null ? "text-muted" : ""}`}>
        {chosen?.label ?? props.placeholder ?? m.common.picker.choose}
      </span>
      <ChevronDown aria-hidden size={20} strokeWidth={2.5} className="shrink-0 text-muted" />
    </button>
  );
  const layer =
    open === null ? null : (
      <PickerLayer
        label={props.title ?? props.label}
        listId={listId}
        options={options}
        value={props.value}
        open={open}
        setOpen={setOpen}
        anchor={button}
        onClose={close}
        onChoose={(value) => {
          playSound("tap");
          close();
          if (value !== props.value) props.onChange(value);
        }}
      />
    );

  if (inline) {
    return (
      <>
        {trigger}
        {layer}
      </>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label id={labelId} htmlFor={d.id} className="font-semibold">
        {props.label}
      </label>
      {trigger}
      <Descriptions hint={props.hint} hintId={d.hintId} error={props.error} errorId={d.errorId} />
      {layer}
    </div>
  );
}

interface PickerLayerProps<T extends string> {
  readonly label: string;
  readonly listId: string;
  readonly options: PickerOptions<T>;
  readonly value: string;
  readonly open: PickerOpen;
  setOpen(next: PickerOpen): void;
  readonly anchor: RefObject<HTMLButtonElement | null>;
  onClose(): void;
  onChoose(value: T): void;
}

/** Where the list starts looking for its width limit: the step sheet or the main area that holds the button. */
const BOUNDS_SELECTOR = "[data-step-sheet], main";

function PickerLayer<T extends string>({ label, listId, options, value, open, setOpen, anchor, onClose, onChoose }: PickerLayerProps<T>) {
  const m = useMessages();
  const laptop = useLaptopLayout();
  const fit = useFitLayout();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  // Set before a change that should move the keyboard focus to the highlighted row.
  const wantFocus = useRef(true);
  const [place, setPlace] = useState<{ readonly list: ListPlacement; readonly minWidth: number } | null>(null);
  const rows = viewRows(options, open.view, value);
  const group = open.view.kind === "group" && options.kind === "grouped" ? (options.groups[open.view.group] ?? null) : null;
  const title = group?.name ?? label;

  useLayoutEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
  }, []);

  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    dialog.current?.querySelector<HTMLElement>(`[role="listbox"] [data-picker-index="${open.active}"]`)?.focus();
  });

  const viewKey = open.view.kind === "group" ? `group-${open.view.group}` : open.view.kind;
  useLayoutEffect(() => {
    const element = dialog.current;
    const button = anchor.current;
    if (!laptop || element === null || button === null) {
      setPlace(null);
      return;
    }
    const measure = () => {
      // The natural size: as wide as the longest row and as tall as every row, before the limits apply.
      const { maxWidth, maxHeight } = element.style;
      element.style.maxWidth = "none";
      element.style.maxHeight = "none";
      const natural = { width: Math.max(element.offsetWidth, button.offsetWidth), height: element.offsetHeight };
      element.style.maxWidth = maxWidth;
      element.style.maxHeight = maxHeight;
      const bounds = (button.closest(BOUNDS_SELECTOR) ?? document.body).getBoundingClientRect();
      const list = placeList(button.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, bounds, natural);
      setPlace({ list, minWidth: Math.min(button.offsetWidth, list.maxWidth) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [laptop, fit, viewKey, rows.length, anchor]);

  function move(index: number): void {
    wantFocus.current = true;
    setOpen({ view: open.view, active: index });
  }
  function pick(index: number): void {
    const row = rows[index];
    if (row === undefined) return;
    if (row.kind === "group") {
      wantFocus.current = true;
      setOpen(openGroup(options, row.group, value));
    } else if (row.choice.disabledNote === undefined) {
      onChoose(row.choice.value);
    } else {
      move(index);
    }
  }
  function backToGroups(): void {
    if (open.view.kind !== "group") return;
    wantFocus.current = true;
    setOpen({ view: { kind: "groups" }, active: open.view.group });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    // The open list owns every key: the step sheet behind it must not go back on Escape, and a Pager behind it must not turn.
    event.stopPropagation();
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const onRow = event.target instanceof HTMLElement && event.target.matches('[role="option"]');
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose();
      return;
    }
    const step = stepRow(rows.length, open.active, event.key);
    if (step !== null) {
      event.preventDefault();
      move(step);
      return;
    }
    if (open.view.kind === "group" && (event.key === "ArrowLeft" || event.key === "Backspace")) {
      event.preventDefault();
      backToGroups();
      return;
    }
    if (onRow && (event.key === "Enter" || event.key === " " || (event.key === "ArrowRight" && open.view.kind === "groups"))) {
      event.preventDefault();
      pick(open.active);
      return;
    }
    const found = typeAhead(rows.map(rowLabel), open.active, event.key);
    if (found !== null) {
      event.preventDefault();
      move(found);
    }
  }

  const showHeader = !laptop || group !== null;
  const placeStyle =
    place === null
      ? undefined
      : {
          left: place.list.left,
          maxWidth: place.list.maxWidth,
          maxHeight: place.list.maxHeight,
          minWidth: place.minWidth,
          ...(place.list.direction === "down" ? { top: place.list.top } : { bottom: place.list.bottom }),
        };
  const renderRow = (row: PickerRow<T>, index: number, live: boolean) => (
    <RowView row={row} index={index} active={live && index === open.active} compact={laptop} onPick={live ? () => pick(index) : undefined} />
  );

  return createPortal(
    <dialog
      ref={dialog}
      data-picker-list=""
      aria-labelledby={showHeader ? titleId : undefined}
      aria-label={showHeader ? undefined : label}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the backdrop lands on the dialog itself and closes it.
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      style={placeStyle}
      className={`bg-panel p-0 text-ink open:flex open:flex-col overflow-y-auto fit:overflow-hidden ${
        laptop
          ? "fixed inset-auto m-0 w-max rounded-[var(--radius-card)] border-2 border-b-4 border-line shadow-[var(--shadow-raised)] backdrop:bg-transparent"
          : "fixed inset-x-0 top-auto bottom-0 mx-auto max-h-[min(85dvh,44rem)] w-full max-w-[36rem] rounded-t-[var(--radius-card)] shadow-[var(--shadow-raised)] backdrop:bg-ink/50 animate-rise"
      }`}
    >
      {/* The padding sits inside, so a tap in it lands on this div and not on the dialog, where it would count as a tap on the backdrop. */}
      <div className={`flex min-h-0 min-w-0 flex-col ${laptop ? "p-1.5" : "px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"}`}>
      {showHeader ? (
        <div className={`flex min-w-0 shrink-0 items-center gap-2 ${laptop ? "pb-1" : "pb-2"}`}>
          {group === null ? null : <IconButton label={m.common.picker.allGroups} variant="quiet" icon={<ArrowLeft aria-hidden size={22} />} data-picker-back="" onClick={backToGroups} />}
          <h2 id={titleId} className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${laptop ? "font-display font-semibold" : "text-title"}`}>
            {title}
          </h2>
          {laptop ? null : <IconButton label={m.common.close} variant="quiet" icon={<X aria-hidden size={22} />} onClick={onClose} />}
        </div>
      ) : null}
      {/* In fit:, the invisible copy of every row sets the list's natural height, so the
          sheet is as tall as its rows up to its limit, and the Pager (laid over it) pages
          within that height without its own height feeding back into the plan. */}
      <div className="relative flex min-h-0 min-w-0 flex-col fit:overflow-hidden">
        {fit ? (
          <div aria-hidden="true" inert className="invisible flex flex-col">
            {rows.map((row, index) => (
              <div key={rowKey(row)} className="min-w-0">
                {renderRow(row, index, false)}
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-col fit:absolute fit:inset-0">
          <Pager
            label={title}
            items={rows}
            itemKey={rowKey}
            gap={0}
            ordered={false}
            listboxId={listId}
            active={{
              index: open.active,
              onChange: (index) => {
                // A page turned from a focused row keeps the focus on a row; one turned with the Next button leaves it there.
                if (document.activeElement instanceof HTMLElement && document.activeElement.matches('[role="option"]')) wantFocus.current = true;
                setOpen({ view: open.view, active: index });
              },
            }}
            renderItem={(row, index) => renderRow(row, index, true)}
          />
        </div>
      </div>
      </div>
    </dialog>,
    document.body,
  );
}

function rowKey<T extends string>(row: PickerRow<T>): string {
  return row.kind === "choice" ? `choice:${row.choice.value}` : `group:${row.group}`;
}

interface RowViewProps<T extends string> {
  readonly row: PickerRow<T>;
  readonly index: number;
  readonly active: boolean;
  /** The laptop list: 44 px rows instead of the phone's 52. */
  readonly compact: boolean;
  /** Undefined for the invisible copy that sets the list's height. */
  readonly onPick: (() => void) | undefined;
}

function RowView<T extends string>({ row, index, active, compact, onPick }: RowViewProps<T>) {
  const chosen = row.kind === "choice" && row.chosen;
  const note = row.kind === "choice" ? (row.choice.disabledNote ?? null) : null;
  const look = chosen
    ? "bg-water-soft font-semibold"
    : note !== null
      ? "cursor-not-allowed text-muted"
      : "[@media(hover:hover)]:hover:bg-ground";
  return (
    <div
      role="option"
      aria-selected={chosen}
      aria-disabled={note === null ? undefined : true}
      tabIndex={active ? 0 : -1}
      data-picker-index={index}
      {...(row.kind === "choice" ? { "data-picker-value": row.choice.value } : { "data-picker-group": row.group })}
      onClick={onPick}
      className={`press flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left focus-visible:outline-offset-[-3px] ${compact ? "min-h-11" : "min-h-13"} ${look}`}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="[overflow-wrap:anywhere]">{rowLabel(row)}</span>
        {note === null ? null : <span className="text-caption [overflow-wrap:anywhere]">{note}</span>}
        {row.kind === "group" && row.current !== null ? (
          <span className="flex min-w-0 items-center gap-1 text-caption font-semibold text-water">
            <Check aria-hidden size={16} strokeWidth={3} className="shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{row.current}</span>
          </span>
        ) : null}
      </span>
      {chosen ? <Check aria-hidden size={22} strokeWidth={3} className="shrink-0 text-water" /> : null}
      {row.kind === "group" ? <ChevronRight aria-hidden size={20} strokeWidth={2.5} className="shrink-0 text-muted" /> : null}
    </div>
  );
}
