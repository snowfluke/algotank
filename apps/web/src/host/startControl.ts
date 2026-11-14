// The owner's next step in an arena and whether it can be taken now, for the
// arena room (private) and the presenter page. The guards follow the state machine
// at the top of packages/arena/src/types.ts, and the bot count follows the server's
// start route (apps/server/src/start-round.ts): in the lobby, with bots on, bots
// fill the seats up to the arena's tank count (botsToAddAtStart).

import { ARENA_LIMITS, botsToAddAtStart, isFinalRound, type PlayerId, type PublicArena, type StartPlan } from "@game/arena";

const MIN_PLAYERS_TO_START = ARENA_LIMITS.minPlayersToStart;

export type StartBlock =
  /** No person has joined, so a game would be bots only. */
  | { readonly kind: "noPlayers" }
  | { readonly kind: "tooFew"; readonly tanks: number };

export type OwnerStep =
  | {
      readonly kind: "start";
      /** 1 in the lobby, the break's next round otherwise. */
      readonly round: number;
      /** Tanks that play the round, bots included. */
      readonly tanks: number;
      /** Bots the server adds at the start. */
      readonly botsAdded: number;
      readonly isFinal: boolean;
      readonly blocked: StartBlock | null;
    }
  | { readonly kind: "running"; readonly round: number; readonly isFinal: boolean }
  | { readonly kind: "reset" };

/**
 * "7 of 12 ready" for the owner (spec 75, section 3): the people who play the next round, without
 * the owner's own tank in a private arena (`ownId`), because the owner starts the round instead.
 */
export function readyCount(arena: PublicArena, ownId: PlayerId | null): { readonly ready: number; readonly of: number } {
  const next = arena.players.filter((p) => !p.isBot && p.status.kind === "playing" && p.id !== ownId);
  return { ready: next.filter((p) => p.ready).length, of: next.length };
}

/** The owner's plan for the next round, or null outside a lobby and a break. */
export function startPlanOf(arena: PublicArena): StartPlan | null {
  const { phase } = arena;
  return phase.kind === "lobby" || phase.kind === "break" ? phase.start : null;
}

export function ownerStep(arena: PublicArena): OwnerStep {
  const phase = arena.phase;
  switch (phase.kind) {
    case "running":
      return { kind: "running", round: phase.round, isFinal: phase.isFinal };
    case "finished":
      return { kind: "reset" };
    case "lobby": {
      const humans = arena.players.filter((p) => !p.isBot).length;
      const tanks = arena.players.length + botsToAddAtStart(arena.settings, arena.players.length);
      const blocked: StartBlock | null =
        humans === 0 ? { kind: "noPlayers" } : tanks < MIN_PLAYERS_TO_START ? { kind: "tooFew", tanks } : null;
      return { kind: "start", round: 1, tanks, botsAdded: tanks - arena.players.length, isFinal: isFinalRound(tanks), blocked };
    }
    case "break": {
      const tanks = arena.players.filter((p) => p.status.kind === "playing").length;
      const blocked: StartBlock | null = tanks < MIN_PLAYERS_TO_START ? { kind: "tooFew", tanks } : null;
      return { kind: "start", round: phase.nextRound, tanks, botsAdded: 0, isFinal: isFinalRound(tanks), blocked };
    }
  }
}
