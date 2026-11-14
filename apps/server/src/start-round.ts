// Starting the next round, for the owner's start route and the public arena timer:
// bots fill the seats first when the arena has bots on and waits in the lobby, then
// the round starts and the runner plays it. One function, so both callers follow
// the same rule.

import { botsToAddAtStart, type ArenaError } from "@game/arena";
import { botsToFill } from "./bots.ts";
import type { RoundRunner } from "./round-runner.ts";
import { ruleSetToStart } from "./rule-set-draw.ts";
import { newBotId, newSeed } from "./secrets.ts";
import type { ArenaRecord, Store } from "./store.ts";

export type StartResult = { readonly ok: true } | { readonly ok: false; readonly error: ArenaError };

/** A rejected event changes nothing more. A failed save or a round that cannot start throws. */
export function startNextRound(store: Store, runner: RoundRunner, record: ArenaRecord): StartResult {
  const { arena } = record;
  if (arena.phase.kind === "lobby" && botsToAddAtStart(arena.settings, arena.players.length) > 0) {
    // ponytail: two saves; when the start fails after the bots were saved, they sit in the lobby
    // until the next start uses them or a failed round removes them. One combined event clears it.
    const added = store.apply(record, { kind: "addBots", bots: botsToFill(arena, newBotId) });
    if (!added.ok) return added;
  }
  // The seed and, in surprise mode, the rule set are drawn here, so a client cannot choose or predict them.
  const started = store.apply(record, { kind: "startRound", seed: newSeed(), ruleSetId: ruleSetToStart(record.arena) });
  if (!started.ok) return started;
  runner.begin(record);
  return { ok: true };
}
