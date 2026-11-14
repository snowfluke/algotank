// Sizing rules for a list that must show its rows at once on a projector that
// nobody can scroll, such as 64 names. The list flows into columns inside a
// measured box. It keeps the largest text at which every row fits; it adds a
// column before it makes the text smaller than it must. When even the smallest
// allowed text cannot hold every row, it shows the rows that matter most and one
// line that counts the rest.

/** How a list fits its box on the big screen. */
export interface FitSize {
  /** Font size in px when the box has room for it. */
  readonly maxPx: number;
  /** Narrowest column, in em of the list's font, that still shows a useful part of a name. */
  readonly columnEm: number;
}

/** Text size the big screen keeps for up to 24 tanks at 1920x1080 (read from 5 m). */
export const FIT_FULL_PX = 26;
/** Smallest text a fitted list ever uses. Below it the list shows fewer rows instead. */
export const FIT_MIN_PX = 20;
/** Height of one row in `em`: the line (1.5em) and the padding above and below it. Every row component keeps to it. */
export const ROW_HEIGHT_EM = 2;
/** Space between two columns, in em. */
export const COLUMN_GAP_EM = 1.5;

/**
 * Size of a short label inside a row ("bot", "you", the cut line): the caption size,
 * never larger than the row's own text and never below 0.85 of it. On the big
 * screen the caption is 26px, so a label stays readable when the row text is 26px.
 */
export const ROW_LABEL_TEXT = "text-[length:max(0.85em,min(var(--text-caption,0.875rem),1em))]";

export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface FitPlan {
  readonly fontPx: number;
  readonly columns: number;
  /** Rows in the fullest column. */
  readonly rows: number;
  /** How many rows show: the count when all fit, else the most the box holds at FIT_MIN_PX. */
  readonly capacity: number;
}

function grid(box: Box, px: number, columnEm: number): { rowsPerColumn: number; maxColumns: number } {
  const rowsPerColumn = Math.max(1, Math.floor(box.height / (ROW_HEIGHT_EM * px)));
  const maxColumns = Math.max(1, Math.floor((box.width + COLUMN_GAP_EM * px) / ((columnEm + COLUMN_GAP_EM) * px)));
  return { rowsPerColumn, maxColumns };
}

/** The largest whole-pixel font from `size.maxPx` down to FIT_MIN_PX at which `count` rows fit the box, in the fewest columns. */
export function planFit(count: number, box: Box, size: FitSize): FitPlan {
  const rowCount = Math.max(1, count);
  for (let px = Math.floor(size.maxPx); px >= FIT_MIN_PX; px--) {
    const { rowsPerColumn, maxColumns } = grid(box, px, size.columnEm);
    if (rowsPerColumn * maxColumns < rowCount) continue;
    const columns = Math.ceil(rowCount / rowsPerColumn);
    return { fontPx: px, columns, rows: Math.ceil(rowCount / columns), capacity: count };
  }
  const { rowsPerColumn, maxColumns } = grid(box, FIT_MIN_PX, size.columnEm);
  return { fontPx: FIT_MIN_PX, columns: maxColumns, rows: rowsPerColumn, capacity: Math.min(count, rowsPerColumn * maxColumns) };
}

/** Which rows show when only `capacity` of `count` fit, and where the line that counts the others goes. */
export type FitWindow =
  | { readonly kind: "all" }
  | {
      readonly kind: "some";
      /** Indexes of the rows that show, in order. */
      readonly shown: readonly number[];
      /** The line goes before shown[moreAt], or at the end when moreAt equals shown.length. */
      readonly moreAt: number;
      readonly hidden: number;
    };

/**
 * The top rows first. With a `focus` row (the cut line) below them, the rows around
 * the focus too, because who is near the cut matters most during a round. One slot
 * holds the line that counts the hidden rows.
 */
export function fitWindow(count: number, capacity: number, focus: number | null): FitWindow {
  if (capacity >= count) return { kind: "all" };
  const slots = Math.max(1, capacity - 1);
  const hidden = count - slots;
  const range = (from: number, length: number) => Array.from({ length }, (_, i) => from + i);
  const around = Math.floor(slots / 2);
  const half = Math.floor(around / 2);
  // The top rows alone do when they also hold the rows just below the focus.
  if (focus === null || focus + half < slots) return { kind: "some", shown: range(0, slots), moreAt: slots, hidden };
  const top = slots - around;
  const start = Math.max(top, Math.min(focus - half, count - around));
  return { kind: "some", shown: [...range(0, top), ...range(start, around)], moreAt: top, hidden };
}
