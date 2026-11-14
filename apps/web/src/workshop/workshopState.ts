// Pure rules of the workshop page: a free name for a new play style or a copy, and what
// the editor's save line says. Kept apart from the components so the tests run without a DOM.

import { ACCOUNT_STRATEGY_LIMITS } from "@game/arena";
import type { AccountCopy, MyPlayStyle } from "./library.ts";
import type { en } from "./messages.ts";

type WorkshopText = typeof en;

/**
 * `base` when no play style has that name, otherwise "base 2", "base 3" and so on.
 * The base is shortened so the number still fits the 24-character limit.
 */
export function freeName(base: string, styles: readonly Pick<MyPlayStyle, "name">[]): string {
  const taken = new Set(styles.map((style) => style.name.toLocaleLowerCase()));
  const trimmed = base.trim();
  if (trimmed !== "" && !taken.has(trimmed.toLocaleLowerCase()) && [...trimmed].length <= ACCOUNT_STRATEGY_LIMITS.nameMax) return trimmed;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const room = ACCOUNT_STRATEGY_LIMITS.nameMax - suffix.length;
    const candidate = `${[...trimmed].slice(0, room).join("").trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

export type WorkshopSaveView =
  | { readonly kind: "saved"; readonly text: string }
  | { readonly kind: "saving"; readonly text: string }
  | { readonly kind: "problem"; readonly text: string };

/**
 * The editor's save line. Every edit is on the device at once, so the line says where
 * the copy is: on this device only, in the account, on its way there, or behind.
 */
export function workshopSaveView(valid: boolean, account: AccountCopy, text: WorkshopText): WorkshopSaveView {
  if (!valid) return { kind: "problem", text: text.problemKept };
  switch (account.kind) {
    case "deviceOnly":
      return { kind: "saved", text: text.savedHere };
    case "synced":
      return { kind: "saved", text: text.savedEverywhere };
    case "syncing":
      return { kind: "saving", text: text.savingToAccount };
    case "behind":
      return { kind: "problem", text: account.offline ? text.accountOffline : text.accountBehind };
  }
}
