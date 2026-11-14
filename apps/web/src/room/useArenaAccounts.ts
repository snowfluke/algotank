// The owner's private view of a signed-in-only arena (spec 75, sections 2 and 4): the email
// behind each seat, for the owner's player list, and the accounts kept out, for the settings
// sheet's "Allow again". Personal data: only the owner's pages call this, and nothing here is
// stored in the browser. It reads again when the player list changes and after a ban or an
// "Allow again", because the arena message does not carry accounts.

import { useCallback, useEffect, useState } from "react";
import { joinNeedsAccount, type ArenaAccountsResponse, type PlayerId, type PublicArena } from "@game/arena";
import { allowAgain, getArenaAccounts } from "../api/client.ts";
import { describeError } from "../api/errorSentences.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";

export interface ArenaAccounts {
  /** The email of each player with an account; empty until the first answer. */
  readonly emails: ReadonlyMap<PlayerId, string>;
  readonly banned: ArenaAccountsResponse["banned"];
  /** The last refusal as a sentence, or null. */
  readonly problem: string | null;
  reload(): void;
  allowAgain(accountId: string): void;
}

/** Null for anyone but the owner of a signed-in-only arena. */
export function useArenaAccounts(arena: PublicArena, isOwner: boolean): ArenaAccounts | null {
  const m = useMessages();
  const active = isOwner && joinNeedsAccount(arena.settings.joinPolicy);
  const [data, setData] = useState<ArenaAccountsResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const playerKey = arena.players.map((p) => p.id).join(",");
  const arenaId = arena.id;

  useEffect(() => {
    if (!active) return;
    let current = true;
    void getArenaAccounts(arenaId).then((result) => {
      if (!current) return;
      if (result.ok) {
        setData(result.data);
        setProblem(null);
      } else setProblem(describeError(result, "settings", m.errors).sentence);
    });
    return () => {
      current = false;
    };
    // The language of a refusal does not need a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, arenaId, playerKey, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  if (!active) return null;
  return {
    emails: new Map((data?.players ?? []).map((p) => [p.playerId, p.email])),
    banned: data?.banned ?? [],
    problem,
    reload,
    allowAgain(accountId) {
      void allowAgain(arenaId, accountId).then((result) => {
        if (!result.ok) setProblem(describeError(result, "settings", m.errors).sentence);
        reload();
      });
    },
  };
}
