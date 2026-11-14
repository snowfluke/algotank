// Pure rules behind Picker: which rows an open picker shows (the groups, one group's
// choices, or a flat list), where the highlight starts and how keys move it, and where
// the list opens on a laptop. Kept apart from the component so the test runner, which
// has no DOM, can check them.

export interface PickerChoice<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Set when the choice cannot be picked now: one short sentence that says why. The row shows it and cannot be chosen. */
  readonly disabledNote?: string;
}

export interface PickerGroup<T extends string> {
  readonly name: string;
  readonly choices: readonly PickerChoice<T>[];
}

/** A flat list, or choices under group names (the 30 conditions in 5 groups). */
export type PickerOptions<T extends string> =
  | { readonly kind: "flat"; readonly choices: readonly PickerChoice<T>[] }
  | { readonly kind: "grouped"; readonly groups: readonly PickerGroup<T>[] };

/** What an open picker shows: every choice of a flat list, the group names, or the choices of one group. */
export type PickerView = { readonly kind: "choices" } | { readonly kind: "groups" } | { readonly kind: "group"; readonly group: number };

/** One row of the open picker. */
export type PickerRow<T extends string> =
  | { readonly kind: "choice"; readonly choice: PickerChoice<T>; readonly chosen: boolean }
  /** `current` is the label of the chosen choice when this group holds it, so the group list shows what is chosen now. */
  | { readonly kind: "group"; readonly group: number; readonly name: string; readonly current: string | null };

/** The open picker: its view and the highlighted row. */
export interface PickerOpen {
  readonly view: PickerView;
  readonly active: number;
}

/** The choice whose value is `value`, or null (a strategy can hold an id this game no longer knows). */
export function findChoice<T extends string>(options: PickerOptions<T>, value: string): PickerChoice<T> | null {
  const all = options.kind === "flat" ? options.choices : options.groups.flatMap((group) => group.choices);
  return all.find((choice) => choice.value === value) ?? null;
}

/** The rows of a view. */
export function viewRows<T extends string>(options: PickerOptions<T>, view: PickerView, value: string): readonly PickerRow<T>[] {
  const choiceRows = (choices: readonly PickerChoice<T>[]) => choices.map((choice) => ({ kind: "choice" as const, choice, chosen: choice.value === value }));
  if (options.kind === "flat") return choiceRows(options.choices);
  if (view.kind === "group") return choiceRows(options.groups[view.group]?.choices ?? []);
  return options.groups.map((group, index) => ({
    kind: "group" as const,
    group: index,
    name: group.name,
    current: group.choices.find((choice) => choice.value === value)?.label ?? null,
  }));
}

/** The text a row is found by when a letter is typed. */
export function rowLabel<T extends string>(row: PickerRow<T>): string {
  return row.kind === "choice" ? row.choice.label : row.name;
}

/**
 * How a picker opens: a flat list on the current choice, a grouped one on the group list
 * with the current choice's group highlighted. Without a known value, on the first row.
 */
export function openPicker<T extends string>(options: PickerOptions<T>, value: string): PickerOpen {
  if (options.kind === "flat") return { view: { kind: "choices" }, active: Math.max(0, options.choices.findIndex((choice) => choice.value === value)) };
  const group = options.groups.findIndex((g) => g.choices.some((choice) => choice.value === value));
  return { view: { kind: "groups" }, active: Math.max(0, group) };
}

/** Opens one group, highlighting the current choice when the group holds it. */
export function openGroup<T extends string>(options: PickerOptions<T>, group: number, value: string): PickerOpen {
  const choices = options.kind === "grouped" ? (options.groups[group]?.choices ?? []) : [];
  return { view: { kind: "group", group }, active: Math.max(0, choices.findIndex((choice) => choice.value === value)) };
}

/** The row a navigation key moves the highlight to, or null for any other key. The ends do not wrap, like a native list. */
export function stepRow(count: number, from: number, key: string): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, from + 1);
    case "ArrowUp":
      return Math.max(0, from - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Type-ahead: the next row after `from` whose label starts with the typed letter, going round
 * to the top, or null when none does. A second press of the same letter moves to the next match.
 */
export function typeAhead(labels: readonly string[], from: number, key: string): number | null {
  if (key.length !== 1 || key.trim() === "") return null;
  const letter = key.toLocaleLowerCase();
  for (let step = 1; step <= labels.length; step++) {
    const index = (from + step) % labels.length;
    if (labels[index]?.trimStart().toLocaleLowerCase().startsWith(letter)) return index;
  }
  return null;
}

/** A box in viewport px, as getBoundingClientRect gives it. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Space between the button and the list, and between the list and the window's edge. */
const LIST_GAP_PX = 6;
const EDGE_PX = 16;

/** Where the laptop list goes: below or above the button, and how tall and wide it may be. */
export type ListPlacement = {
  readonly left: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
} & ({ readonly direction: "down"; readonly top: number } | { readonly direction: "up"; readonly bottom: number });

/**
 * Places the laptop list. It opens downward when its natural height fits below the button,
 * else upward when it fits above. When it fits on neither side, it slides up from below the
 * button until it fits in the window (covering the button, as a native list does) and is paged
 * only when it is taller than the window. It is as wide as its longest choice (`natural.width`,
 * measured) but stays inside `bounds` (the pane) and the window, starting at the button's left
 * edge and moving left only when it must.
 */
export function placeList(anchor: Box, viewport: { readonly width: number; readonly height: number }, bounds: Box, natural: { readonly width: number; readonly height: number }): ListPlacement {
  const below = Math.max(0, viewport.height - anchor.bottom - LIST_GAP_PX - EDGE_PX);
  const above = Math.max(0, anchor.top - LIST_GAP_PX - EDGE_PX);
  const low = Math.max(bounds.left, EDGE_PX);
  const high = Math.max(low, Math.min(bounds.right, viewport.width - EDGE_PX));
  const maxWidth = high - low;
  const width = Math.min(natural.width, maxWidth);
  const left = Math.max(low, Math.min(anchor.left, high - width));
  if (natural.height <= below) return { direction: "down", top: anchor.bottom + LIST_GAP_PX, left, maxWidth, maxHeight: below };
  if (natural.height <= above) return { direction: "up", bottom: viewport.height - anchor.top + LIST_GAP_PX, left, maxWidth, maxHeight: above };
  const top = Math.max(EDGE_PX, viewport.height - EDGE_PX - natural.height);
  return { direction: "down", top, left, maxWidth, maxHeight: viewport.height - EDGE_PX - top };
}
