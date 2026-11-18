// How the workshop editor keeps its draft: a StrategySession (prep/strategySession.ts)
// whose source is the library, and an edit handler that writes every edit to the library
// before the session sees it. The session's own draft store is not used, because it
// forgets a draft that equals the saved copy again, which would leave an edit that was
// reverted quickly in the library.

import type { StrategyInput } from "@game/engine";
import type { StrategySource } from "../prep/strategySession.ts";
import type { PlayStyleLibrary } from "./library.ts";

/** `notFound` is the sentence shown when the play style is no longer on this device. */
export function editorSource(library: PlayStyleLibrary, id: string, notFound: string): StrategySource {
  return {
    load: async () => {
      const stored = library.get(id);
      if (stored !== undefined) return { ok: true, data: stored.strategy };
      return { ok: false, failure: { reason: "other", describe: () => ({ sentence: notFound, details: [] }) } };
    },
    // The edit handler has written it already; saving again is a no-op in the library.
    save: async (strategy) => {
      library.save(id, strategy);
      return { ok: true, data: undefined };
    },
    readDraft: () => null,
    writeDraft: () => undefined,
  };
}

/** The editor's change handler: the library first (any draft, one with a problem too), then the session. */
export function editDraft(library: PlayStyleLibrary, id: string, setDraft: (next: StrategyInput) => void): (next: StrategyInput) => void {
  return (next) => {
    const saved = library.save(id, next);
    if (saved !== undefined) setDraft(saved);
  };
}
