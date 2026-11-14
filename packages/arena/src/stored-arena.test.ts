import { describe, expect, test } from "bun:test";
import { PRESETS, runRound, type RoundConfig } from "@game/engine";
import { applyEvent, createArena, seatsOf } from "./arena.ts";
import { parseStoredArena, STORED_ARENA_VERSION, type StoredArena } from "./stored-arena.ts";
import { plainTankLook, type Arena, type ArenaEvent } from "./types.ts";

const strategy = PRESETS[0]!.strategy;

/** An announced-mode private arena of 2 players and 1 bot whose only round completed, so the game is finished. */
function finishedStored(): StoredArena {
  let arena: Arena = createArena(
    "ABC234",
    { name: "Stored", kind: "private", ticksPerRound: 20, tickMs: 100, ruleSetMode: "announced", botFill: true, joinPolicy: "anyone", tankCount: 8 },
    "downpour",
  );
  const apply = (event: ArenaEvent) => {
    const result = applyEvent(arena, event);
    if (!result.ok) throw new Error(result.error);
    arena = result.arena;
  };
  for (const id of ["a", "b"]) apply({ kind: "join", playerId: id, name: `Player ${id}`, strategy, look: { colour: 1, skin: "stripes", second: 9, plate: 12, icon: "paw" } });
  apply({ kind: "addBots", bots: [{ playerId: "c", name: "Splashy", strategy, look: plainTankLook(2) }] });
  apply({ kind: "startRound", seed: 11, ruleSetId: "downpour" });
  const config: RoundConfig = {
    seed: 11,
    ticksTotal: 20,
    survivorsAfterRound: null,
    ruleSetId: "downpour",
    players: ["a", "b", "c"].map((id) => ({ id, strategy })),
  };
  apply({ kind: "roundCompleted", standings: runRound(config).standings, nextRuleSetId: null });
  return {
    version: STORED_ARENA_VERSION,
    arena,
    ownerAccountId: "account-1",
    lastActivityAt: 1_700_000_000_000,
    playerTokens: [{ playerId: "a", token: "token-a" }],
    roundConfigs: [{ round: 1, config }],
    playerAccounts: [],
  };
}

/** Round trip through JSON text, like a file, then edit the plain data. */
function damaged(edit: (plain: any) => void): unknown {
  const plain = JSON.parse(JSON.stringify(finishedStored()));
  edit(plain);
  return plain;
}

/** Removes what version 8 added (arena seats), so an older file can be built from a new one. */
function withoutVersion8(plain: any): void {
  delete plain.arena.settings.tankCount;
}

/** What a file older than version 8 reads as: the kind's fixed numbers (tankCount null). */
function withKindSeats(stored: StoredArena): StoredArena {
  return { ...stored, arena: { ...stored.arena, settings: { ...stored.arena.settings, tankCount: null } } };
}

/** Removes what version 7 added (organiser tournament), so an older file can be built from a new one. */
function withoutVersion7(plain: any): void {
  withoutVersion8(plain);
  delete plain.arena.settings.joinPolicy;
  delete plain.arena.banned;
  delete plain.arena.phase.start;
  delete plain.arena.phase.resultId;
}

/** Turns a version 4 file's looks back into the version 3 `colour` of the same hull. */
function toColours(plain: any): void {
  plain.version = plain.version === 2 ? 2 : 3;
  withoutVersion7(plain);
  delete plain.arena.chat;
  for (const player of plain.arena.players) {
    player.colour = player.look.colour;
    delete player.look;
  }
}

/** What a version 3 file of finishedStored() reads as: every look plain in its old colour. */
function withPlainLooks(stored: StoredArena): StoredArena {
  return { ...stored, arena: { ...stored.arena, players: stored.arena.players.map((p) => ({ ...p, look: plainTankLook(p.look.colour) })) } };
}

describe("parseStoredArena", () => {
  test("reads back what JSON.stringify wrote, unchanged", () => {
    const stored = finishedStored();
    const parsed = parseStoredArena(JSON.parse(JSON.stringify(stored)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored).toEqual(stored);
  });

  test("returns strategies that parseStrategy granted, not the parsed object itself", () => {
    const parsed = parseStoredArena(JSON.parse(JSON.stringify(finishedStored())));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.players[0]!.strategy).not.toBe(strategy);
  });

  test.each<[string, (plain: any) => void, RegExp]>([
    ["a wrong version", (p) => (p.version = 9), /version/],
    ["a version 1 file, which says it comes from an older version", (p) => (p.version = 1), /older version/],
    ["a missing owner", (p) => delete p.ownerAccountId, /ownerAccountId/],
    ["an owner on a public arena", (p) => ((p.arena.settings = { ...p.arena.settings, kind: "practice", name: "", tankCount: null }), (p.arena.chat = null)), /ownerAccountId/],
    ["a missing lastActivityAt", (p) => delete p.lastActivityAt, /lastActivityAt/],
    ["a missing game", (p) => delete p.arena.game, /arena\.game/],
    ["a look with a colour out of range", (p) => (p.arena.players[0].look.colour = 13), /arena\.players\[0\]\.look/],
    ["a missing look", (p) => delete p.arena.players[0].look, /arena\.players\[0\]\.look/],
    ["a missing isBot", (p) => delete p.arena.players[0].isBot, /arena\.players\[0\]\.isBot/],
    ["a token for a bot", (p) => p.playerTokens.push({ playerId: "c", token: "token-c" }), /playerTokens\[1\]/],
    ["a waiting player outside a public arena", (p) => (p.arena.players[1].status = { kind: "waiting" }), /waiting/],
    ["a token of a stranger", (p) => (p.playerTokens[0].playerId = "zzz"), /playerTokens\[0\]/],
    ["a repeated token owner", (p) => p.playerTokens.push({ ...p.playerTokens[0] }), /playerTokens/],
    ["an invalid strategy", (p) => (p.arena.players[1].strategy = { modes: [], build: {} }), /arena\.players\[1\]\.strategy/],
    ["a missing ruleSetMode", (p) => delete p.arena.settings.ruleSetMode, /ruleSetMode/],
    ["an unknown phase", (p) => (p.arena.phase.kind = "paused"), /arena\.phase\.kind/],
    ["an unknown rule set in a summary", (p) => (p.arena.rounds[0].ruleSetId = "nope"), /arena\.rounds\[0\]\.ruleSetId/],
    ["a round number out of order", (p) => (p.arena.rounds[0].round = 4), /arena\.rounds\[0\]\.round/],
    ["a winner who is not a player", (p) => (p.arena.phase.winnerId = "ghost"), /winnerId/],
    ["two players with one id", (p) => (p.arena.players[1].id = "a"), /arena\.players/],
    ["a negative hit count", (p) => (p.arena.rounds[0].standings[0].hitsLanded = -1), /standings\[0\]\.hitsLanded/],
    ["a standing for a stranger", (p) => (p.arena.rounds[0].standings[0].botId = "ghost"), /standings/],
    ["a completed round without a config", (p) => (p.roundConfigs = []), /round 1/],
    ["a config with another seed", (p) => (p.roundConfigs[0].config.seed = 12), /round 1/],
    ["a config with another rule set", (p) => (p.roundConfigs[0].config.ruleSetId = "standard"), /round 1/],
    ["a config with other players", (p) => (p.roundConfigs[0].config.players[0].id = "ghost"), /round 1/],
    ["a config with one player", (p) => p.roundConfigs[0].config.players.splice(1), /players/],
    ["a non-object file", (p) => Object.keys(p).forEach((k) => delete p[k]), /version/],
  ])("rejects %s with a message that names the part", (_label, edit, message) => {
    const parsed = parseStoredArena(damaged(edit));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(message);
  });

  describe("a version 2 file, written while arenas had an inputMode", () => {
    const version2 = (inputMode: unknown) =>
      damaged((p) => {
        p.version = 2;
        p.arena.settings.inputMode = inputMode;
        toColours(p);
      });

    test.each(["editor", "api"])("with inputMode %p reads as version 5 without the field", (inputMode) => {
      const parsed = parseStoredArena(version2(inputMode));
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.stored).toEqual(withKindSeats(withPlainLooks(finishedStored())));
      expect(parsed.stored.version).toBe(8);
      expect("inputMode" in parsed.stored.arena.settings).toBe(false);
    });

    test("leaves the file it was given unchanged", () => {
      const file = version2("api") as any;
      parseStoredArena(file);
      expect(file.version).toBe(2);
      expect(file.arena.settings.inputMode).toBe("api");
    });

    test("is still checked in full after the field is dropped", () => {
      const parsed = parseStoredArena(
        damaged((p) => {
          p.version = 2;
          p.arena.settings.inputMode = "api";
          toColours(p);
          delete p.arena.settings.ruleSetMode;
        }),
      );
      if (parsed.ok) throw new Error("expected the file to be rejected");
      expect(parsed.error).toMatch(/ruleSetMode/);
    });

    test("without an arena object fails on the arena, not on the version", () => {
      const parsed = parseStoredArena({ ...(version2("api") as object), arena: "none" });
      if (parsed.ok) throw new Error("expected the file to be rejected");
      expect(parsed.error).toMatch(/^arena must be an object/);
    });
  });

  describe("a version 3 file, written while players had a colour", () => {
    test("reads as version 5 with a plain look in each player's colour", () => {
      const parsed = parseStoredArena(damaged(toColours));
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.stored).toEqual(withKindSeats(withPlainLooks(finishedStored())));
      expect(parsed.stored.version).toBe(8);
      expect(parsed.stored.arena.players[0]!.look).toEqual({ colour: 1, skin: "plain", second: 2, plate: null, icon: null });
      expect("colour" in parsed.stored.arena.players[0]!).toBe(false);
    });

    test("clamps a whole-number colour into 1 to 12", () => {
      const parsed = parseStoredArena(
        damaged((p) => {
          toColours(p);
          p.arena.players[0].colour = 0;
          p.arena.players[1].colour = 99;
        }),
      );
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.stored.arena.players.map((p) => p.look.colour)).toEqual([1, 12, 2]);
    });

    test("names a colour that is not a whole number", () => {
      const parsed = parseStoredArena(
        damaged((p) => {
          toColours(p);
          p.arena.players[1].colour = "red";
        }),
      );
      if (parsed.ok) throw new Error("expected the file to be rejected");
      expect(parsed.error).toMatch(/arena\.players\[1\]\.look/);
    });

    test("leaves the file it was given unchanged", () => {
      const file = damaged(toColours) as any;
      parseStoredArena(file);
      expect(file.version).toBe(3);
      expect(file.arena.players[0].colour).toBe(1);
      expect("look" in file.arena.players[0]).toBe(false);
    });
  });

  test("keeps a stored name that the current name rule would refuse, so an older file still loads", () => {
    const parsed = parseStoredArena(damaged((p) => (p.arena.players[0].name = "Bo \u{1F600} with a name of 24")));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.players[0]!.name).toBe("Bo \u{1F600} with a name of 24");
  });

  test("reads standings written before they carried hit counts as 0 hits", () => {
    const parsed = parseStoredArena(
      damaged((p) => {
        delete p.arena.rounds[0].standings[0].hitsLanded;
        delete p.arena.rounds[0].standings[0].hitsTaken;
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.rounds[0]!.standings[0]).toMatchObject({ hitsLanded: 0, hitsTaken: 0 });
  });

  test("reads a public arena with no owner and a waiting player", () => {
    const plain = damaged((p) => {
      p.arena.settings = { ...p.arena.settings, kind: "tournament", name: "", tankCount: null };
      p.arena.chat = null;
      p.ownerAccountId = null;
      p.arena.players[1].status = { kind: "waiting" };
    });
    const parsed = parseStoredArena(plain);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.ownerAccountId).toBeNull();
  });

  test("rejects a lobby or break whose announcement does not fit the mode", () => {
    const lobby = damaged((p) => {
      p.arena.phase = { kind: "lobby", nextRuleSetId: null, start: { kind: "waiting" } };
      p.arena.rounds = [];
      p.roundConfigs = [];
    });
    const parsed = parseStoredArena(lobby);
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(/nextRuleSetId/);
  });

  test("rejects a phase that disagrees with the completed rounds", () => {
    const parsed = parseStoredArena(damaged((p) => (p.arena.phase = { kind: "break", nextRound: 5, nextRuleSetId: "standard", start: { kind: "waiting" } })));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(/nextRound/);
  });

  test("rejects values that are not JSON objects", () => {
    for (const raw of [null, 5, "text", []]) expect(parseStoredArena(raw).ok).toBe(false);
  });
});

describe("version 5: public kinds, ready and accounts", () => {
  /** A version 4 file: no `ready`, no `playerAccounts`. */
  const version4 = (edit: (plain: any) => void = () => {}) =>
    damaged((p) => {
      p.version = 4;
      withoutVersion7(p);
      delete p.arena.chat;
      delete p.playerAccounts;
      for (const player of p.arena.players) delete player.ready;
      edit(p);
    });

  test("a version 4 file of a private arena reads as version 5 with nobody ready and no accounts", () => {
    const parsed = parseStoredArena(version4());
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored).toEqual(withKindSeats(finishedStored()));
    expect(parsed.stored.arena.players.every((p) => p.ready === false)).toBe(true);
  });

  test("a version 4 file of the old single public arena is retired, not rejected", () => {
    const parsed = parseStoredArena(
      version4((p) => {
        p.arena.settings = { ...p.arena.settings, kind: "public", name: "" };
        p.ownerAccountId = null;
      }),
    );
    if (parsed.ok) throw new Error("expected the file to be retired");
    expect(parsed.retired).toBe(true);
    expect(parsed.error).toMatch(/public arena/);
  });

  test("a damaged version 5 file is rejected, not retired", () => {
    const parsed = parseStoredArena(damaged((p) => delete p.arena.players[0].ready));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.retired).toBe(false);
    expect(parsed.error).toMatch(/ready/);
  });

  test("a ready player is refused outside the lobby and the result of a public arena", () => {
    const parsed = parseStoredArena(damaged((p) => (p.arena.players[0].ready = true)));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(/ready/);
  });

  test("a practice arena that shows its result keeps a player who tapped ready on it", () => {
    const parsed = parseStoredArena(
      damaged((p) => {
        p.arena.settings = { ...p.arena.settings, kind: "practice", name: "", ruleSetMode: "standard", tankCount: null };
        p.arena.chat = null;
        p.ownerAccountId = null;
        p.arena.players[0].ready = true;
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.phase.kind).toBe("finished");
    expect(parsed.stored.arena.players[0]?.ready).toBe(true);
  });

  /** A lobby of the old monthly kind: two humans, each with an account. */
  const monthlyLobby = (edit: (plain: any) => void = () => {}) =>
    damaged((p) => {
      p.arena.settings = { ...p.arena.settings, kind: "monthly", name: "", ruleSetMode: "standard", tankCount: null };
      p.arena.chat = null;
      p.ownerAccountId = null;
      p.arena.phase = { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } };
      p.arena.rounds = [];
      p.roundConfigs = [];
      p.arena.players = p.arena.players.filter((x: any) => !x.isBot);
      p.arena.players[0].ready = true;
      p.playerTokens = [
        { playerId: "a", token: "token-a" },
        { playerId: "b", token: "token-b" },
      ];
      p.playerAccounts = [
        { playerId: "a", accountId: "account-a" },
        { playerId: "b", accountId: "account-b" },
      ];
      edit(p);
    });

  test("a file of the old monthly kind is refused: the server sets such a file aside before it parses (77-monthly-league.md)", () => {
    const parsed = parseStoredArena(monthlyLobby());
    if (parsed.ok) throw new Error("expected the file to be refused");
    expect(parsed.error).toMatch(/kind/);
  });

  test("accounts outside a signed-in-only arena are rejected", () => {
    const parsed = parseStoredArena(monthlyLobby((p) => (p.arena.settings.kind = "practice")));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(/empty outside a signed-in-only arena/);
  });
});

describe("version 6: arena chat", () => {
  /** A version 5 file: no `arena.chat`. */
  const version5 = (edit: (plain: any) => void = () => {}) =>
    damaged((p) => {
      p.version = 5;
      withoutVersion7(p);
      delete p.arena.chat;
      edit(p);
    });

  test("a version 5 file of a private arena reads as version 6 with the chat on", () => {
    const parsed = parseStoredArena(version5());
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored).toEqual(withKindSeats(finishedStored()));
    expect(parsed.stored.version).toBe(8);
    expect(parsed.stored.arena.chat).toBe("on");
  });

  test("a version 5 file of a presenter arena reads with the chat on", () => {
    const parsed = parseStoredArena(version5((p) => (p.arena.settings.kind = "presenter")));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.chat).toBe("on");
  });

  test("a version 5 file of a public arena reads with no chat", () => {
    const parsed = parseStoredArena(
      version5((p) => {
        p.arena.settings = { ...p.arena.settings, kind: "tournament", name: "", tankCount: null };
        p.ownerAccountId = null;
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.chat).toBeNull();
  });

  test("a stored arena keeps the chat off", () => {
    const parsed = parseStoredArena(damaged((p) => (p.arena.chat = "off")));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.chat).toBe("off");
  });

  test.each<[string, (plain: any) => void]>([
    ["a missing chat", (p) => delete p.arena.chat],
    ["an unknown chat value", (p) => (p.arena.chat = "maybe")],
    ["no chat in a private arena", (p) => (p.arena.chat = null)],
    ["a chat in a public arena", (p) => ((p.arena.settings = { ...p.arena.settings, kind: "practice", name: "", tankCount: null }), (p.ownerAccountId = null))],
  ])("a version 6 file with %s is rejected", (_label, edit) => {
    const parsed = parseStoredArena(damaged(edit));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(/arena\.chat/);
  });
});

describe("version 7: organiser tournament", () => {
  /** A version 6 file: no joinPolicy, start plan, resultId or ban list. */
  const version6 = () =>
    damaged((p) => {
      p.version = 6;
      withoutVersion7(p);
    });

  test("a version 6 file reads as version 7 with the defaults of an arena that took any visitor", () => {
    const parsed = parseStoredArena(version6());
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored).toEqual(withKindSeats(finishedStored()));
    expect(parsed.stored.version).toBe(8);
    expect(parsed.stored.arena.settings.joinPolicy).toBe("anyone");
    expect(parsed.stored.arena.banned).toEqual([]);
    expect(parsed.stored.arena.phase).toMatchObject({ kind: "finished", resultId: null });
  });

  test.each<[string, (plain: any) => void, RegExp]>([
    ["a ban that anyone may join", (p) => (p.arena.banned = [{ accountId: "x", name: "Ann" }]), /empty outside a signed-in-only arena/],
    ["a result id of the wrong shape", (p) => (p.arena.phase.resultId = "../../etc"), /resultId/],
    ["a signed-in-only arena without an account per player", (p) => (p.arena.settings.joinPolicy = "verified"), /one entry for each human player/],
    ["a removed player in the lobby", (p) => {
      p.arena.phase = { kind: "lobby", nextRuleSetId: "downpour", start: { kind: "waiting" } };
      p.arena.rounds = [];
      p.roundConfigs = [];
      p.arena.players[0].status = { kind: "removed" };
    }, /removed/],
  ])("rejects %s", (_label, edit, message) => {
    const parsed = parseStoredArena(damaged(edit));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(message);
  });
});

describe("version 8: arena seats (78-arena-seats.md)", () => {
  test("a version 7 file reads as version 8 with tankCount null, so it keeps 64 people and bots to 8", () => {
    const parsed = parseStoredArena(
      damaged((p) => {
        p.version = 7;
        withoutVersion8(p);
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored).toEqual(withKindSeats(finishedStored()));
    expect(parsed.stored.version).toBe(8);
    expect(seatsOf(parsed.stored.arena.settings)).toEqual({ people: 64, botsFillTo: 8 });
  });

  test("a lobby of 48 tanks with 40 bots reads back unchanged", () => {
    let arena: Arena = createArena(
      "SEAT48",
      { name: "Big", kind: "private", ticksPerRound: 20, tickMs: 100, ruleSetMode: "standard", botFill: true, joinPolicy: "anyone", tankCount: 48 },
      "standard",
    );
    const apply = (event: ArenaEvent) => {
      const result = applyEvent(arena, event);
      if (!result.ok) throw new Error(result.error);
      arena = result.arena;
    };
    apply({ kind: "join", playerId: "a", name: "Ann", strategy, look: plainTankLook(1) });
    apply({ kind: "addBots", bots: Array.from({ length: 40 }, (_, i) => ({ playerId: `bot-${i}`, name: `Bot ${i}`, strategy, look: plainTankLook(2) })) });
    const stored: StoredArena = { ...finishedStored(), arena, roundConfigs: [], playerTokens: [{ playerId: "a", token: "token-a" }] };
    const parsed = parseStoredArena(JSON.parse(JSON.stringify(stored)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored).toEqual(stored);
  });

  test.each<[string, (plain: any) => void]>([
    ["a tank count above the kind's range", (p) => (p.arena.settings.tankCount = 65)],
    ["a tank count that is not a whole number", (p) => (p.arena.settings.tankCount = 8.5)],
    ["a tank count below the people in the arena", (p) => (p.arena.settings.tankCount = 1)],
    ["a tank count in a public arena", (p) => ((p.arena.settings = { ...p.arena.settings, kind: "practice", name: "", tankCount: 8 }), (p.ownerAccountId = null), (p.arena.chat = null))],
  ])("a file with %s is rejected", (_label, edit) => {
    const parsed = parseStoredArena(damaged(edit));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(/tankCount|arena\.players/);
  });
});
