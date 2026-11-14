// The name field of "My tank": the text the player types, kept apart from the stored
// name, because "Ab" on the way to "Abi" is not a name yet. A valid name (or an empty
// field) is stored as it is typed; an invalid one waits and shows its sentence on Done.
// When the stored name changes from elsewhere (the account's copy arrives, or the account
// replaced a blocked name) and the player has not typed over it, the field follows.

import { useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { NameField } from "./MyTankEditor.tsx";
import { myTankStore } from "./useMyTank.ts";

export interface NameDraft {
  readonly field: NameField;
  /** Stores the typed name. False when it breaks the name rule; the field then shows why. */
  commit(): boolean;
  /** Puts a name in the field and stores it, such as the game's suggestion for a blocked name. */
  replace(name: string, sentence: string | null): void;
}

/** The field's text and the stored name it was last in step with. */
export interface DraftState {
  readonly value: string;
  readonly base: string;
}

/** The field after the stored name became `stored`: it follows unless the player typed something else. */
export function followStored(draft: DraftState, stored: string): DraftState {
  if (stored === draft.base) return draft;
  return { value: draft.value === draft.base ? stored : draft.value, base: stored };
}

export function useNameDraft(stored: string): NameDraft {
  const m = useMessages();
  const [draft, setDraft] = useState<DraftState>({ value: stored, base: stored });
  // Adjusting state during render (React's pattern for a value derived from a prop) avoids a frame with the old name.
  const current = followStored(draft, stored);
  if (current !== draft) setDraft(current);
  const value = current.value;
  const setValue = (next: string) => setDraft((old) => ({ ...old, value: next }));
  const [error, setError] = useState<string | null>(null);
  return {
    field: {
      value,
      error,
      onChange(next) {
        setValue(next);
        setError(null);
        myTankStore.setName(next);
      },
    },
    commit() {
      const ok = myTankStore.setName(value);
      setError(ok ? null : m.mytank.nameInvalid);
      return ok;
    },
    replace(name, sentence) {
      setValue(name);
      setError(sentence);
      myTankStore.setName(name);
    },
  };
}
