import { describe, expect, test } from "bun:test";
import { PRESETS, runRound, type RoundConfig } from "@game/engine";
import { applyEvent, createArena } from "./arena.ts";
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
  for (const id of ["a", "b"]) apply({ kind: "join", playerId: id, name: `Player ${id}`, strategy, look: { colour: 1, skin: "stripes", second: 9, plate: 12, icon: "paw", country: null } });
  apply({ kind: "addBots", bots: [{ playerId: "c", name: "Splashy", strategy, look: plainTankLook(2) }] });
  apply({ kind: "startRound", seed: 11, ruleSetId: "downpour" });
  const config: RoundConfig = {
    seed: 11,
    ticksTotal: 20,
    survivorsAfterRound: null,
    ruleSetId: "downpour",
    players: ["a", "b", "c"].map((id) => ({ id, strategy })),
    items: true,
    ultimates: false,
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

/** Round trip through JSON text, like a stored row, then edit the plain data. */
function damaged(edit: (plain: any) => void): unknown {
  const plain = JSON.parse(JSON.stringify(finishedStored()));
  edit(plain);
  return plain;
}

describe("parseStoredArena", () => {
  test("reads back what JSON.stringify wrote, unchanged", () => {
    const stored = finishedStored();
    const parsed = parseStoredArena(JSON.parse(JSON.stringify(stored)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored).toEqual(stored);
  });

  test("a round config stored before items reads as a round without items, so its replay plays as it was played", () => {
    const parsed = parseStoredArena(damaged((p) => delete p.roundConfigs[0].config.items));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.roundConfigs[0]?.config.items).toBe(false);
    const wrong = parseStoredArena(damaged((p) => (p.roundConfigs[0].config.items = "yes")));
    expect(wrong.ok ? "" : wrong.error).toMatch(/items/);
  });

  test("a handicap reads back as one number (rounds of 2026-11-21 before its two parts) or as its two parts", () => {
    const one = parseStoredArena(damaged((p) => (p.roundConfigs[0].config.players[0].handicap = 35)));
    if (!one.ok) throw new Error(one.error);
    const config = one.stored.roundConfigs[0]!.config;
    expect(config.players[0]?.handicap).toBe(35);
    // The number plays as both parts of that size, so its replay is the round that was played.
    const asParts = { ...config, players: config.players.map((p, i) => (i === 0 ? { ...p, handicap: { miss: 35, exposure: 35 } } : p)) };
    expect(runRound(asParts).standings).toEqual(runRound(config).standings);
    const two = parseStoredArena(damaged((p) => (p.roundConfigs[0].config.players[0].handicap = { miss: 2.5, exposure: 30 })));
    if (!two.ok) throw new Error(two.error);
    expect(two.stored.roundConfigs[0]?.config.players[0]?.handicap).toEqual({ miss: 2.5, exposure: 30 });
    const wrong = parseStoredArena(damaged((p) => (p.roundConfigs[0].config.players[0].handicap = { miss: -1, exposure: 3 })));
    expect(wrong.ok ? "" : wrong.error).toMatch(/handicap\.miss/);
  });

  test("a round config stored before ultimates replays with them off", () => {
    const parsed = parseStoredArena(damaged((p) => delete p.roundConfigs[0].config.ultimates));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.roundConfigs[0]?.config.ultimates).toBe(false);
    const wrong = parseStoredArena(damaged((p) => (p.roundConfigs[0].config.ultimates = "yes")));
    expect(wrong.ok ? "" : wrong.error).toMatch(/ultimates/);
  });

  test("returns strategies that parseStrategy granted, not the parsed object itself", () => {
    const parsed = parseStoredArena(JSON.parse(JSON.stringify(finishedStored())));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.stored.arena.players[0]!.strategy).not.toBe(strategy);
  });

  test.each<[string, (plain: any) => void, RegExp]>([
    ["a wrong version", (p) => (p.version = 9), /version/],
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

describe("public kinds, ready and accounts", () => {
  test("a player without ready is rejected", () => {
    const parsed = parseStoredArena(damaged((p) => delete p.arena.players[0].ready));
    if (parsed.ok) throw new Error("expected the file to be rejected");
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

  test("an arena of the old monthly kind is refused (77-monthly-league.md)", () => {
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

describe("arena chat", () => {
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
  ])("an arena with %s is rejected", (_label, edit) => {
    const parsed = parseStoredArena(damaged(edit));
    if (parsed.ok) throw new Error("expected the file to be rejected");
    expect(parsed.error).toMatch(/arena\.chat/);
  });
});

describe("organiser tournament", () => {
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

describe("arena seats (78-arena-seats.md)", () => {
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
