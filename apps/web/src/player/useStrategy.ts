// Loads the player's saved strategy from the server and saves the draft back
// automatically. The session logic is in prep/strategySession.ts; this file only
// connects it to the API and to the copy of the draft this browser keeps, so a
// reload or a discarded tab does not lose an unsaved edit.

import { useMemo } from "react";
import type { ArenaId } from "@game/arena";
import { getMyStrategy, saveMyStrategy, type ApiFailure } from "../api/client.ts";
import { describeError, isTokenRefused, type ErrorAction } from "../api/errorSentences.ts";
import type { SaveFailure, SaveFailureReason, StrategySource } from "../prep/strategySession.ts";
import { useStrategySession, type StrategyHandle } from "../prep/useStrategySession.ts";
import { browserStore, clearStrategyDraft, readStrategyDraft, saveStrategyDraft } from "../session/storage.ts";

export type { StrategyHandle } from "../prep/useStrategySession.ts";

/** The kind of failure decides what the page says and when it tries again. */
function failureReason(failure: ApiFailure): SaveFailureReason {
  if (failure.status === 0 || failure.code === "network_error") return "offline";
  if (isTokenRefused(failure)) return "refused";
  // The server refuses a save while a round runs with 409 (wrong_phase); it sends no code yet.
  if (failure.status === 409 || failure.code === "wrong_phase") return "roundRunning";
  return "other";
}

/** Keeps the API failure, not a sentence, so the page words it in the language shown at the time. */
export function saveFailureOf(failure: ApiFailure, action: ErrorAction): SaveFailure {
  return { reason: failureReason(failure), describe: (text) => describeError(failure, action, text) };
}

/**
 * Pass the player token, or null before the player has joined. `onTokenRefused` runs
 * when the server rejects the token, so the page can drop the stored slot.
 */
export function useStrategy(arenaId: ArenaId, playerToken: string | null, onTokenRefused: () => void): StrategyHandle {
  const source = useMemo((): StrategySource | null => {
    if (playerToken === null) return null;
    return {
      load: async () => {
        const result = await getMyStrategy(arenaId, playerToken);
        return result.ok ? result : { ok: false, failure: saveFailureOf(result, "loadStrategy") };
      },
      save: async (strategy) => {
        const result = await saveMyStrategy(arenaId, playerToken, strategy);
        return result.ok ? result : { ok: false, failure: saveFailureOf(result, "saveStrategy") };
      },
      readDraft: () => readStrategyDraft(browserStore(), arenaId),
      writeDraft: (draft) => {
        if (draft === null) clearStrategyDraft(browserStore(), arenaId);
        else saveStrategyDraft(browserStore(), arenaId, draft);
      },
    };
  }, [arenaId, playerToken]);
  return useStrategySession(source, `${arenaId}:${playerToken ?? ""}`, onTokenRefused);
}
