import type { StrategyInput, UltimateId } from "@game/engine";
import { completeBuild } from "../editor/build.ts";
import { actionOf } from "../editor/edit.ts";
import type { CreateResult, PlayStyleLibrary } from "./library.ts";
import { freeName } from "./workshopState.ts";

type NewStyleDraft = Omit<StrategyInput, "ultimate"> & { readonly ultimate: UltimateId | null };

/** A preset starts with its own ultimate. A blank style waits for the player (85-ultimates.md). */
export function newStyleDraft(preset: StrategyInput | null, modeName: string): NewStyleDraft {
  return preset ?? {
    modes: [{ id: "mode-1", name: modeName, rules: [], fallback: actionOf("wait") }],
    build: completeBuild({}),
    ultimate: null,
  };
}

/** First save takes the chosen ultimate and starts the usual autosave flow. */
export function saveNewStyle(library: PlayStyleLibrary, baseName: string, draft: NewStyleDraft): CreateResult | { readonly ok: false; readonly problem: "ultimate" } {
  if (draft.ultimate === null) return { ok: false, problem: "ultimate" };
  return library.create(freeName(baseName, library.getSnapshot().styles), { ...draft, ultimate: draft.ultimate });
}
