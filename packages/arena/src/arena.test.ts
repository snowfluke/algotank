import { describe, expect, test } from "bun:test";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID, type RuleSetId, type Standing, type Strategy } from "@game/engine";
import { applyEvent, botFillSizeOf, botsToAddAtStart, createArena, finalPlaceOf, isBanned, isFinalRound, maxPlayersOf, parseArenaSettings, seatsOf, survivorCount, tankCountRange, toPublicArena } from "./arena.ts";
import { ARENA_KINDS, isPublicKind, PUBLIC_KINDS, parsePlayerName, parseTankLook, plainTankLook, type Arena, type ArenaError, type ArenaEvent, type ArenaKind, type ArenaSettings, type RuleSetMode, type TankLook } from "./types.ts";

// Placeholder: real strategies come from parseStrategy in @game/engine. The
// reducer never looks inside a strategy, so an empty object cast is enough.
const strategy = (label = "s"): Strategy => ({ label }) as unknown as Strategy;

// A presenter arena holds the most players (512), so the knockout tests below fit in it.
const SETTINGS: ArenaSettings = {
  name: "Friday fight",
  kind: "presenter",
  ticksPerRound: 100,
  tickMs: 500,
  ruleSetMode: "standard",
  botFill: false,
  joinPolicy: "anyone",
  tankCount: 512,
};

const OTHER_RULE_SET: RuleSetId = "downpour";

/** The first announcement a server would draw for this mode. */
function firstAnnouncement(mode: RuleSetMode): RuleSetId | null {
  return mode === "standard" ? STANDARD_RULE_SET_ID : mode === "announced" ? OTHER_RULE_SET : null;
}

function newArena(settings: ArenaSettings = SETTINGS): Arena {
  return createArena("a1", settings, firstAnnouncement(settings.ruleSetMode));
}

/** Starts under the rule set the arena announced, or `ruleSetId` when the mode announces none. */
function startEvent(seed: number, ruleSetId: RuleSetId = STANDARD_RULE_SET_ID): ArenaEvent {
  return { kind: "startRound", seed, ruleSetId };
}

/** The roundCompleted event a server would send: the next announcement for the mode, or none after a final. */
function completed(arena: Arena, standings: readonly Standing[], nextRuleSetId?: RuleSetId | null): ArenaEvent {
  if (nextRuleSetId !== undefined) return { kind: "roundCompleted", standings, nextRuleSetId };
  const isFinal = arena.phase.kind === "running" && arena.phase.isFinal;
  const mode = arena.settings.ruleSetMode;
  return { kind: "roundCompleted", standings, nextRuleSetId: isFinal ? null : firstAnnouncement(mode) };
}

function ok(arena: Arena, event: ArenaEvent): Arena {
  const result = applyEvent(arena, event);
  if (!result.ok) throw new Error(`expected ok, got ${result.error} for ${event.kind}`);
  return result.arena;
}

function err(arena: Arena, event: ArenaEvent): ArenaError {
  const result = applyEvent(arena, event);
  if (result.ok) throw new Error(`expected an error for ${event.kind}`);
  return result.error;
}

function lobbyWith(count: number): Arena {
  let arena = newArena();
  for (let i = 1; i <= count; i++) {
    arena = ok(arena, { kind: "join", playerId: `p${i}`, name: `Player ${i}`, strategy: strategy(), look: plainTankLook(1) });
  }
  return arena;
}

/** Ranks the round's players in the order given by `order`, or in id order when omitted. */
function standingsFor(ids: readonly string[], order: readonly string[] = ids): Standing[] {
  return order.map((botId, i) => ({ botId, score: 100 - i, rank: i + 1, hitsLanded: 0, hitsTaken: 0 }));
}

function runningIds(arena: Arena): readonly string[] {
  if (arena.phase.kind !== "running") throw new Error("not running");
  return arena.phase.playerIds;
}

function playRound(arena: Arena, seed: number): Arena {
  const started = ok(arena, startEvent(seed, announced(arena)));
  return ok(started, completed(started, standingsFor(runningIds(started))));
}

/** The id a start must carry: the announcement, or the standard id when there is none. */
function announced(arena: Arena): RuleSetId {
  const phase = arena.phase;
  return (phase.kind === "lobby" || phase.kind === "break" ? phase.nextRuleSetId : null) ?? STANDARD_RULE_SET_ID;
}

const playing = (arena: Arena) => arena.players.filter((p) => p.status.kind === "playing").length;

describe("cut rule", () => {
  test("survivorCount keeps half, never fewer than 8", () => {
    expect(survivorCount(64)).toBe(32);
    expect(survivorCount(20)).toBe(10);
    expect(survivorCount(10)).toBe(8);
    expect(survivorCount(9)).toBe(8);
    expect(survivorCount(17)).toBe(9);
  });

  test("a round is the final at 8 players or fewer", () => {
    expect(isFinalRound(8)).toBe(true);
    expect(isFinalRound(2)).toBe(true);
    expect(isFinalRound(9)).toBe(false);
  });
});

describe("createArena", () => {
  test("starts in the lobby with no players and trims the name", () => {
    const arena = newArena({ ...SETTINGS, name: "  Friday fight  " });
    expect(arena.phase).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(arena.players).toEqual([]);
    expect(arena.rounds).toEqual([]);
    expect(arena.settings.name).toBe("Friday fight");
  });

  test("accepts the limits", () => {
    expect(() => newArena({ ...SETTINGS, name: "x", ticksPerRound: 20, tickMs: 100 })).not.toThrow();
    expect(() => newArena({ ...SETTINGS, name: "x".repeat(60), ticksPerRound: 600, tickMs: 5000 })).not.toThrow();
  });

  test.each([
    ["empty name", { ...SETTINGS, name: "" }],
    ["blank name", { ...SETTINGS, name: "   " }],
    ["name over 60", { ...SETTINGS, name: "x".repeat(61) }],
    ["ticksPerRound 19", { ...SETTINGS, ticksPerRound: 19 }],
    ["ticksPerRound 601", { ...SETTINGS, ticksPerRound: 601 }],
    ["ticksPerRound fraction", { ...SETTINGS, ticksPerRound: 20.5 }],
    ["ticksPerRound NaN", { ...SETTINGS, ticksPerRound: Number.NaN }],
    ["tickMs 99", { ...SETTINGS, tickMs: 99 }],
    ["tickMs 5001", { ...SETTINGS, tickMs: 5001 }],
    ["tickMs fraction", { ...SETTINGS, tickMs: 100.5 }],
  ])("throws on %s", (_label, settings) => {
    expect(() => newArena(settings)).toThrow(Error);
  });
});

describe("join", () => {
  test("adds a trimmed name with status playing", () => {
    const arena = ok(newArena(), {
      kind: "join",
      playerId: "p1",
      name: "  Ayu  ",
      strategy: strategy(),
      look: plainTankLook(3),
    });
    expect(arena.players).toHaveLength(1);
    expect(arena.players[0]).toMatchObject({ id: "p1", name: "Ayu", status: { kind: "playing" } });
  });

  test("rejects names shorter than 3 or longer than 16 characters after trimming", () => {
    const arena = newArena();
    for (const name of ["", "   ", "Bo", " Bo ", "x".repeat(17)]) {
      expect(err(arena, { kind: "join", playerId: "p1", name, strategy: strategy(), look: plainTankLook(1) })).toBe("name_invalid");
    }
    for (const name of ["Ayu", "x".repeat(16)]) {
      expect(ok(arena, { kind: "join", playerId: "p1", name, strategy: strategy(), look: plainTankLook(1) }).players).toHaveLength(1);
    }
  });

  test("rejects anything but letters A to Z, digits and spaces", () => {
    const arena = newArena();
    for (const name of ["Al\u200bice", "\u202eAlice", "Ali\tce", "Ali\u2028ce", "Alice\u0000", "Zoë", "Ayu!", "Ayu_Putri", "Ayu-Putri", "\u{1F600}Ayu", "Андрей"]) {
      expect(err(arena, { kind: "join", playerId: "p1", name, strategy: strategy(), look: plainTankLook(1) })).toBe("name_invalid");
    }
  });

  test("a name that looks like a taken name is rejected, and the stored name is NFKC", () => {
    const arena = ok(newArena(), { kind: "join", playerId: "p1", name: "Alice", strategy: strategy(), look: plainTankLook(1) });
    expect(err(arena, { kind: "join", playerId: "p2", name: "Alice\u200b", strategy: strategy(), look: plainTankLook(1) })).toBe("name_invalid");
    // Full-width letters fold to ASCII, so they collide with "Alice".
    expect(err(arena, { kind: "join", playerId: "p2", name: "\uff21lice", strategy: strategy(), look: plainTankLook(1) })).toBe("name_taken");
    const wide = ok(newArena(), { kind: "join", playerId: "p1", name: "\uff21\uff22\uff23", strategy: strategy(), look: plainTankLook(1) });
    expect(wide.players[0]?.name).toBe("ABC");
  });

  test("rejects a name already taken, ignoring case and outer spaces", () => {
    const arena = ok(newArena(), { kind: "join", playerId: "p1", name: "Ayu", strategy: strategy(), look: plainTankLook(1) });
    expect(err(arena, { kind: "join", playerId: "p2", name: " aYU ", strategy: strategy(), look: plainTankLook(1) })).toBe("name_taken");
  });

  test("rejects the 513th player", () => {
    const full = lobbyWith(512);
    expect(full.players).toHaveLength(512);
    expect(err(full, { kind: "join", playerId: "p513", name: "Late", strategy: strategy(), look: plainTankLook(1) })).toBe("arena_full");
  });

  test("a full presenter arena of 512 plays 6 cut rounds and then the final, 7 rounds in all", () => {
    const sizes: number[] = [];
    for (let n = 512; !isFinalRound(n); n = survivorCount(n)) sizes.push(n);
    expect(sizes).toEqual([512, 256, 128, 64, 32, 16]);
    expect(survivorCount(16)).toBe(8);
    expect(isFinalRound(8)).toBe(true);
  });

  test("rejects a join while a round runs", () => {
    const running = ok(lobbyWith(3), startEvent(1));
    expect(err(running, { kind: "join", playerId: "x", name: "Late", strategy: strategy(), look: plainTankLook(1) })).toBe("wrong_phase");
  });

  test("rejects a join during a break and after the event", () => {
    const afterBreak = playRound(lobbyWith(10), 1);
    expect(afterBreak.phase.kind).toBe("break");
    expect(err(afterBreak, { kind: "join", playerId: "x", name: "Late", strategy: strategy(), look: plainTankLook(1) })).toBe("wrong_phase");

    const finished = playRound(lobbyWith(3), 1);
    expect(finished.phase.kind).toBe("finished");
    expect(err(finished, { kind: "join", playerId: "x", name: "Late", strategy: strategy(), look: plainTankLook(1) })).toBe("wrong_phase");
  });
});

describe("submitStrategy", () => {
  test("replaces the strategy in the lobby and in a break", () => {
    const next = strategy("new");
    const inLobby = ok(lobbyWith(10), { kind: "submitStrategy", playerId: "p1", strategy: next });
    expect(inLobby.players.find((p) => p.id === "p1")?.strategy).toBe(next);

    const inBreak = ok(playRound(lobbyWith(10), 1), { kind: "submitStrategy", playerId: "p1", strategy: next });
    expect(inBreak.players.find((p) => p.id === "p1")?.strategy).toBe(next);
  });

  test("rejects a submit while a round runs", () => {
    const running = ok(lobbyWith(3), startEvent(1));
    expect(err(running, { kind: "submitStrategy", playerId: "p1", strategy: strategy() })).toBe("wrong_phase");
  });

  test("rejects an unknown player", () => {
    expect(err(lobbyWith(2), { kind: "submitStrategy", playerId: "nobody", strategy: strategy() })).toBe("unknown_player");
  });

  test("rejects an eliminated player", () => {
    // 10 players, ranks in id order: p9 and p10 are cut after round 1.
    const inBreak = playRound(lobbyWith(10), 1);
    expect(inBreak.players.find((p) => p.id === "p10")?.status.kind).toBe("eliminated");
    expect(err(inBreak, { kind: "submitStrategy", playerId: "p10", strategy: strategy() })).toBe("player_eliminated");
  });

  test("accepts a submit after the final from every player, the eliminated ones included", () => {
    const finished = playRound(lobbyWith(3), 1);
    expect(finished.players.find((p) => p.id === "p3")?.status.kind).toBe("eliminated");
    for (const playerId of ["p1", "p3"]) {
      const next = strategy(`next-${playerId}`);
      expect(ok(finished, { kind: "submitStrategy", playerId, strategy: next }).players.find((p) => p.id === playerId)?.strategy).toBe(next);
    }
  });

  test("while a round runs, rejects a player in it and a player already out", () => {
    // 10 players: p9 and p10 are out after round 1. A waiting player is accepted (see the public arena tests).
    const inBreak = playRound(lobbyWith(10), 1);
    const running = ok(inBreak, startEvent(2));
    expect(err(running, { kind: "submitStrategy", playerId: "p10", strategy: strategy() })).toBe("player_eliminated");
    expect(err(running, { kind: "submitStrategy", playerId: "p1", strategy: strategy() })).toBe("wrong_phase");
  });
});

describe("startRound", () => {
  test("needs at least 2 players", () => {
    expect(err(newArena(), startEvent(1))).toBe("not_enough_players");
    expect(err(lobbyWith(1), startEvent(1))).toBe("not_enough_players");
    expect(ok(lobbyWith(2), startEvent(1)).phase.kind).toBe("running");
  });

  test("rejects a start while a round runs", () => {
    const running = ok(lobbyWith(3), startEvent(1));
    expect(err(running, startEvent(2))).toBe("wrong_phase");
  });

  test("rejects a start after the event is finished", () => {
    const finished = playRound(lobbyWith(3), 1);
    expect(err(finished, startEvent(2))).toBe("wrong_phase");
  });

  test("8 players or fewer make round 1 the final", () => {
    for (const count of [2, 5, 8]) {
      const running = ok(lobbyWith(count), startEvent(7));
      expect(running.phase).toMatchObject({
        kind: "running",
        round: 1,
        isFinal: true,
        seed: 7,
        survivorsAfterRound: null,
      });
      expect(runningIds(running)).toHaveLength(count);
    }
  });

  test("9 players start a cut round that keeps 8", () => {
    const running = ok(lobbyWith(9), startEvent(3));
    expect(running.phase).toMatchObject({ kind: "running", round: 1, isFinal: false, survivorsAfterRound: 8 });
  });

  test("a round holds only players with status playing, in join order", () => {
    const inBreak = playRound(lobbyWith(10), 1);
    const running = ok(inBreak, startEvent(2));
    expect(runningIds(running)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]);
  });
});

describe("roundCompleted", () => {
  test("rejects a completion in the lobby, in a break and when finished", () => {
    const lobby = lobbyWith(3);
    expect(err(lobby, completed(lobby, standingsFor(["p1", "p2", "p3"])))).toBe("wrong_phase");

    const inBreak = playRound(lobbyWith(10), 1);
    expect(err(inBreak, completed(inBreak, standingsFor(["p1", "p2"])))).toBe("wrong_phase");

    const finished = playRound(lobbyWith(3), 1);
    expect(err(finished, completed(finished, standingsFor(["p1", "p2", "p3"])))).toBe("wrong_phase");
  });

  test.each<[string, (ids: readonly string[]) => Standing[]]>([
    ["a missing player", (ids) => standingsFor(ids.slice(1))],
    ["an extra player", (ids) => standingsFor([...ids, "stranger"])],
    ["a player replaced by a stranger", (ids) => standingsFor(["stranger", ...ids.slice(1)])],
    ["a repeated player", (ids) => standingsFor([ids[0]!, ...ids.slice(0, -1)])],
    ["a duplicated rank", (ids) => standingsFor(ids).map((s) => ({ ...s, rank: 1 }))],
    ["a rank of 0", (ids) => standingsFor(ids).map((s, i) => ({ ...s, rank: i }))],
    ["a rank above n", (ids) => standingsFor(ids).map((s, i) => ({ ...s, rank: i + 2 }))],
    ["a fractional rank", (ids) => standingsFor(ids).map((s, i) => ({ ...s, rank: i + 0.5 }))],
  ])("rejects standings with %s", (_label, build) => {
    const running = ok(lobbyWith(4), startEvent(1));
    expect(err(running, completed(running, build(runningIds(running))))).toBe("standings_mismatch");
  });

  test("rejects standings that list an eliminated player in a later round", () => {
    const inBreak = playRound(lobbyWith(10), 1);
    const running = ok(inBreak, startEvent(2));
    const bad = standingsFor(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p9"]);
    expect(err(running, completed(running, bad))).toBe("standings_mismatch");
  });

  test("keeps the best survivorsAfterRound ranks and eliminates the rest with their rank", () => {
    const running = ok(lobbyWith(10), startEvent(5));
    // Reverse order: p10 ranks 1, p1 ranks 10. The cut keeps 8, so p2 and p1 go.
    const order = [...runningIds(running)].reverse();
    const done = ok(running, completed(running, standingsFor(runningIds(running), order)));

    expect(done.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } });
    const byId = (id: string) => done.players.find((p) => p.id === id)!.status;
    expect(byId("p10")).toEqual({ kind: "playing" });
    expect(byId("p3")).toEqual({ kind: "playing" });
    expect(byId("p2")).toEqual({ kind: "eliminated", inRound: 1, finalRank: 9 });
    expect(byId("p1")).toEqual({ kind: "eliminated", inRound: 1, finalRank: 10 });

    expect(done.rounds).toHaveLength(1);
    expect(done.rounds[0]).toMatchObject({ round: 1, isFinal: false, seed: 5 });
    expect(done.rounds[0]!.standings.map((s) => s.botId)).toEqual(order);
    expect(done.rounds[0]!.survivors).toEqual(order.slice(0, 8));
  });

  test("sorts the summary standings by rank when the event lists them out of order", () => {
    const running = ok(lobbyWith(3), startEvent(1));
    const shuffled = [
      { botId: "p2", score: 5, rank: 3, hitsLanded: 0, hitsTaken: 0 },
      { botId: "p3", score: 9, rank: 1, hitsLanded: 0, hitsTaken: 0 },
      { botId: "p1", score: 7, rank: 2, hitsLanded: 0, hitsTaken: 0 },
    ];
    const done = ok(running, completed(running, shuffled));
    expect(done.rounds[0]!.standings.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(done.phase).toEqual({ kind: "finished", winnerId: "p3", resultId: null });
  });

  test("the final names one winner and eliminates the others with their rank", () => {
    const running = ok(lobbyWith(4), startEvent(9));
    const done = ok(running, completed(running, standingsFor(runningIds(running), ["p3", "p1", "p4", "p2"])));

    expect(done.phase).toEqual({ kind: "finished", winnerId: "p3", resultId: null });
    const byId = (id: string) => done.players.find((p) => p.id === id)!.status;
    expect(byId("p3")).toEqual({ kind: "winner" });
    expect(byId("p1")).toEqual({ kind: "eliminated", inRound: 1, finalRank: 2 });
    expect(byId("p4")).toEqual({ kind: "eliminated", inRound: 1, finalRank: 3 });
    expect(byId("p2")).toEqual({ kind: "eliminated", inRound: 1, finalRank: 4 });
    expect(done.rounds[0]).toMatchObject({ isFinal: true, survivors: ["p3"] });
  });
});

describe("roundAborted", () => {
  test("returns the arena to the lobby when no round has completed, and the same round starts again", () => {
    const running = ok(lobbyWith(3), startEvent(1));
    const aborted = ok(running, { kind: "roundAborted" });
    expect(aborted.phase).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(aborted.rounds).toEqual([]);
    expect(aborted.players).toEqual(running.players);

    const again = ok(aborted, startEvent(2));
    expect(again.phase).toMatchObject({ kind: "running", round: 1, seed: 2 });
  });

  test("returns to the break of the failed round and keeps the earlier rounds and eliminations", () => {
    const inBreak = playRound(lobbyWith(10), 1);
    const running = ok(inBreak, startEvent(2));
    const aborted = ok(running, { kind: "roundAborted" });
    expect(aborted.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(aborted.rounds).toEqual(inBreak.rounds);
    expect(aborted.players).toEqual(inBreak.players);

    const again = ok(aborted, startEvent(3));
    expect(again.phase).toMatchObject({ kind: "running", round: 2, seed: 3 });
  });

  test("is rejected in every phase except running", () => {
    const states: Arena[] = [lobbyWith(3), playRound(lobbyWith(10), 1), playRound(lobbyWith(3), 1)];
    for (const state of states) expect(err(state, { kind: "roundAborted" })).toBe("wrong_phase");
  });
});

const announcedSettings: ArenaSettings = { ...SETTINGS, ruleSetMode: "announced" };
const surpriseSettings: ArenaSettings = { ...SETTINGS, ruleSetMode: "surprise" };

function withPlayers(arena: Arena, count: number): Arena {
  let next = arena;
  for (let i = 1; i <= count; i++) {
    next = ok(next, { kind: "join", playerId: `p${i}`, name: `Player ${i}`, strategy: strategy(), look: plainTankLook(1) });
  }
  return next;
}

describe("rule set modes", () => {
  test("createArena takes the first announcement for the mode", () => {
    expect(createArena("a", SETTINGS, "standard").phase).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(createArena("a", announcedSettings, "downpour").phase).toEqual({ kind: "lobby", nextRuleSetId: "downpour", start: { kind: "waiting" } });
    expect(createArena("a", surpriseSettings, null).phase).toEqual({ kind: "lobby", nextRuleSetId: null, start: { kind: "waiting" } });
  });

  test.each<[string, ArenaSettings, RuleSetId | null]>([
    ["standard with another id", SETTINGS, "downpour"],
    ["standard with null", SETTINGS, null],
    ["announced with null", announcedSettings, null],
    ["announced with an unknown id", announcedSettings, "nope" as RuleSetId],
    ["surprise with an id", surpriseSettings, "standard"],
  ])("createArena rejects %s", (_label, settings, next) => {
    expect(() => createArena("a", settings, next)).toThrow(/rule set announcement/);
  });

  test("createArena rejects an unknown ruleSetMode", () => {
    expect(() => createArena("a", { ...SETTINGS, ruleSetMode: "random" as never }, "standard")).toThrow(/ruleSetMode/);
  });

  test("parseArenaSettings names each field that is wrong", () => {
    const good = parseArenaSettings(SETTINGS);
    expect(good).toEqual({ ok: true, settings: SETTINGS });

    const { ruleSetMode: _r, ...missing } = SETTINGS;
    const bad = parseArenaSettings({ ...missing, tickMs: "fast" });
    if (bad.ok) throw new Error("expected problems");
    expect(bad.problems.join(" ")).toMatch(/tickMs.*ruleSetMode/);
    expect(bad.problems.find((p) => p.startsWith("ruleSetMode"))).toContain("standard, announced, surprise");
    // A client from before the developer mode was removed still sends inputMode; the settings drop it.
    expect(parseArenaSettings({ ...SETTINGS, inputMode: "api" })).toEqual({ ok: true, settings: SETTINGS });
    expect(parseArenaSettings(null).ok).toBe(false);
  });

  test("startRound records the rule set in the phase and, after the round, in the summary", () => {
    const lobby = withPlayers(newArena(announcedSettings), 3);
    const running = ok(lobby, startEvent(1, "downpour"));
    expect(running.phase).toMatchObject({ kind: "running", ruleSetId: "downpour" });
    const done = ok(running, completed(running, standingsFor(runningIds(running))));
    expect(done.rounds[0]).toMatchObject({ ruleSetId: "downpour" });
  });

  test("standard mode accepts only the standard id", () => {
    const lobby = lobbyWith(3);
    for (const id of RULE_SET_IDS.filter((x) => x !== STANDARD_RULE_SET_ID)) {
      expect(err(lobby, startEvent(1, id))).toBe("rule_set_mismatch");
    }
    expect(err(lobby, startEvent(1, "nope" as RuleSetId))).toBe("rule_set_mismatch");
    expect(ok(lobby, startEvent(1)).phase.kind).toBe("running");
  });

  test("announced mode accepts only the announced id, in the lobby and after a break", () => {
    const lobby = withPlayers(newArena(announcedSettings), 10);
    expect(err(lobby, startEvent(1, "standard"))).toBe("rule_set_mismatch");
    expect(err(lobby, startEvent(1, "nope" as RuleSetId))).toBe("rule_set_mismatch");

    const running = ok(lobby, startEvent(1, "downpour"));
    const inBreak = ok(running, completed(running, standingsFor(runningIds(running)), "sharp-eyes"));
    expect(inBreak.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "sharp-eyes", start: { kind: "waiting" } });
    expect(err(inBreak, startEvent(2, "downpour"))).toBe("rule_set_mismatch");
    expect(ok(inBreak, startEvent(2, "sharp-eyes")).phase).toMatchObject({ round: 2, ruleSetId: "sharp-eyes" });
  });

  test("surprise mode holds no announcement and accepts any known id at the start", () => {
    const lobby = withPlayers(newArena(surpriseSettings), 10);
    expect(lobby.phase).toEqual({ kind: "lobby", nextRuleSetId: null, start: { kind: "waiting" } });
    expect(err(lobby, startEvent(1, "nope" as RuleSetId))).toBe("rule_set_mismatch");
    const running = ok(lobby, startEvent(1, "arms-length"));
    expect(running.phase).toMatchObject({ ruleSetId: "arms-length" });
    const inBreak = ok(running, completed(running, standingsFor(runningIds(running))));
    expect(inBreak.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: null, start: { kind: "waiting" } });
    expect(ok(inBreak, startEvent(2, "open-field")).phase).toMatchObject({ ruleSetId: "open-field" });
  });

  test("roundCompleted rejects an announcement that breaks the mode", () => {
    const cases: [ArenaSettings, RuleSetId | null][] = [
      [SETTINGS, "downpour"],
      [SETTINGS, null],
      [announcedSettings, null],
      [announcedSettings, "nope" as RuleSetId],
      [surpriseSettings, "standard"],
    ];
    for (const [settings, next] of cases) {
      const running = ok(withPlayers(newArena(settings), 10), startEvent(1, announced(newArena(settings))));
      expect(err(running, completed(running, standingsFor(runningIds(running)), next))).toBe("rule_set_mismatch");
    }
  });

  test("roundCompleted after a final must carry null", () => {
    for (const settings of [SETTINGS, announcedSettings, surpriseSettings]) {
      const running = ok(withPlayers(newArena(settings), 4), startEvent(1, announced(newArena(settings))));
      const standings = standingsFor(runningIds(running));
      expect(err(running, completed(running, standings, "standard"))).toBe("rule_set_mismatch");
      expect(ok(running, completed(running, standings, null)).phase.kind).toBe("finished");
    }
  });

  test("a rejected completion leaves the arena running", () => {
    const running = ok(withPlayers(newArena(announcedSettings), 10), startEvent(1, "downpour"));
    expect(err(running, completed(running, standingsFor(runningIds(running)), null))).toBe("rule_set_mismatch");
    expect(running.phase.kind).toBe("running");
  });

  test("roundAborted returns to the announcement the failed round had", () => {
    const standardRunning = ok(lobbyWith(3), startEvent(1));
    expect(ok(standardRunning, { kind: "roundAborted" }).phase).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });

    const announcedRunning = ok(withPlayers(newArena(announcedSettings), 3), startEvent(1, "downpour"));
    expect(ok(announcedRunning, { kind: "roundAborted" }).phase).toEqual({ kind: "lobby", nextRuleSetId: "downpour", start: { kind: "waiting" } });

    const surpriseRunning = ok(withPlayers(newArena(surpriseSettings), 3), startEvent(1, "downpour"));
    expect(ok(surpriseRunning, { kind: "roundAborted" }).phase).toEqual({ kind: "lobby", nextRuleSetId: null, start: { kind: "waiting" } });
  });

  test("roundAborted after a completed round returns to the break with the same announcement", () => {
    const lobby = withPlayers(newArena(announcedSettings), 10);
    const first = ok(lobby, startEvent(1, "downpour"));
    const inBreak = ok(first, completed(first, standingsFor(runningIds(first)), "dry-spell"));
    const second = ok(inBreak, startEvent(2, "dry-spell"));
    const aborted = ok(second, { kind: "roundAborted" });
    expect(aborted.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "dry-spell", start: { kind: "waiting" } });
    expect(ok(aborted, startEvent(3, "dry-spell")).phase).toMatchObject({ round: 2, ruleSetId: "dry-spell" });
  });
});

describe("full event", () => {
  test("20 players go 20 -> 10 -> 8 -> final -> finished with one winner", () => {
    let arena = lobbyWith(20);
    expect(playing(arena)).toBe(20);

    arena = ok(arena, startEvent(1));
    expect(arena.phase).toMatchObject({ round: 1, isFinal: false, survivorsAfterRound: 10 });
    expect(runningIds(arena)).toHaveLength(20);
    arena = ok(arena, completed(arena, standingsFor(runningIds(arena))));
    expect(arena.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(playing(arena)).toBe(10);

    arena = ok(arena, startEvent(2));
    expect(arena.phase).toMatchObject({ round: 2, isFinal: false, survivorsAfterRound: 8 });
    expect(runningIds(arena)).toHaveLength(10);
    arena = ok(arena, completed(arena, standingsFor(runningIds(arena))));
    expect(arena.phase).toEqual({ kind: "break", nextRound: 3, nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(playing(arena)).toBe(8);

    arena = ok(arena, startEvent(3));
    expect(arena.phase).toMatchObject({ round: 3, isFinal: true, survivorsAfterRound: null });
    expect(runningIds(arena)).toHaveLength(8);
    arena = ok(arena, completed(arena, standingsFor(runningIds(arena))));
    expect(arena.phase).toEqual({ kind: "finished", winnerId: "p1", resultId: null });

    expect(arena.rounds.map((r) => [r.round, r.isFinal, r.seed, r.standings.length, r.survivors.length])).toEqual([
      [1, false, 1, 20, 10],
      [2, false, 2, 10, 8],
      [3, true, 3, 8, 1],
    ]);
    expect(arena.players.filter((p) => p.status.kind === "winner").map((p) => p.id)).toEqual(["p1"]);
    expect(playing(arena)).toBe(0);
    expect(arena.players.filter((p) => p.status.kind === "eliminated")).toHaveLength(19);
  });

  test("9 players are cut to 8, then the 8 play the final", () => {
    let arena = playRound(lobbyWith(9), 1);
    expect(arena.phase).toEqual({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(playing(arena)).toBe(8);
    expect(arena.players.find((p) => p.id === "p9")?.status).toEqual({ kind: "eliminated", inRound: 1, finalRank: 9 });

    arena = ok(arena, startEvent(2));
    expect(arena.phase).toMatchObject({ round: 2, isFinal: true });
    arena = ok(arena, completed(arena, standingsFor(runningIds(arena))));
    expect(arena.phase.kind).toBe("finished");
  });

  test("after the final, joins, starts, completions and bots are rejected", () => {
    const finished = playRound(lobbyWith(2), 1);
    const events: ArenaEvent[] = [
      { kind: "join", playerId: "x", name: "Late", strategy: strategy(), look: plainTankLook(1) },
      { kind: "addBots", bots: [{ playerId: "b1", name: "Splashy", strategy: strategy(), look: plainTankLook(2) }] },
      { kind: "removePlayers", playerIds: ["p1"] },
      { kind: "setBotFill", botFill: true },
      startEvent(1),
      { kind: "roundCompleted", standings: standingsFor(["p1", "p2"]), nextRuleSetId: null },
    ];
    for (const event of events) expect(err(finished, event)).toBe("wrong_phase");
  });
});

describe("immutability", () => {
  function deepFreeze<T>(value: T): T {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  }

  test("applyEvent never mutates its input and returns a new object", () => {
    const events = (arena: Arena): ArenaEvent[] => {
      const ids = arena.phase.kind === "running" ? arena.phase.playerIds : [];
      return [
        { kind: "join", playerId: "new", name: "New", strategy: strategy(), look: plainTankLook(1) },
        { kind: "submitStrategy", playerId: "p1", strategy: strategy("other") },
        startEvent(4),
        { kind: "roundCompleted", standings: standingsFor(ids), nextRuleSetId: "standard" },
        { kind: "roundAborted" },
        { kind: "addBots", bots: [{ playerId: "b1", name: "Splashy", strategy: strategy(), look: plainTankLook(2) }] },
        { kind: "removePlayers", playerIds: ["p2"] },
        { kind: "setLook", playerId: "p1", look: plainTankLook(5) },
        { kind: "setBotFill", botFill: true },
        { kind: "reset", nextRuleSetId: "standard" },
      ];
    };

    const states: Arena[] = [lobbyWith(10)];
    states.push(ok(states[0]!, startEvent(4)));
    states.push(playRound(lobbyWith(10), 4));
    states.push(playRound(lobbyWith(3), 4));

    for (const state of states) {
      const before = JSON.stringify(state);
      deepFreeze(state);
      for (const event of events(state)) {
        const result = applyEvent(state, event);
        if (result.ok) expect(result.arena).not.toBe(state);
        expect(JSON.stringify(state)).toBe(before);
      }
    }
  });
});

describe("toPublicArena", () => {
  test("contains no strategy and keeps the rest", () => {
    let arena = playRound(lobbyWith(10), 1);
    arena = ok(arena, { kind: "submitStrategy", playerId: "p1", strategy: strategy("secret-rule-set") });

    const view = toPublicArena(arena, { action: "start", inMs: 1500 }, 1500);
    expect(JSON.stringify(view)).not.toContain("secret-rule-set");
    for (const player of view.players) expect("strategy" in player).toBe(false);

    expect(view.id).toBe(arena.id);
    expect(view.settings).toEqual(arena.settings);
    expect(view.phase).toEqual(arena.phase);
    expect(view.rounds).toEqual(arena.rounds);
    expect(view.players.map((p) => [p.id, p.name, p.status, p.isBot, p.look, p.ready])).toEqual(
      arena.players.map((p) => [p.id, p.name, p.status, p.isBot, p.look, p.ready]),
    );
    expect(view.game).toBe(1);
    expect(view.auto).toEqual({ action: "start", inMs: 1500 });
    expect(view.nextGameInMs).toBe(1500);
    expect(view.chat).toBe("on");
  });
});

// ---------------------------------------------------------------------------
// Arena kinds, bots, looks and games
// ---------------------------------------------------------------------------

const bot = (playerId: string, name: string, look: TankLook = plainTankLook(2)) => ({ playerId, name, strategy: strategy(`bot-${playerId}`), look });

function arenaOfKind(kind: ArenaKind): Arena {
  return createArena("k1", isPublicKind(kind) ? { ...SETTINGS, kind, name: "", botFill: true, tankCount: null } : { ...SETTINGS, kind, tankCount: maxPlayersOf(kind) }, STANDARD_RULE_SET_ID);
}

function withHumans(arena: Arena, count: number, from = 1): Arena {
  let next = arena;
  for (let i = from; i < from + count; i++) next = ok(next, { kind: "join", playerId: `p${i}`, name: `Player ${i}`, strategy: strategy(), look: plainTankLook(1) });
  return next;
}

describe("arena kinds", () => {
  test("maxPlayersOf holds the capacity of each kind", () => {
    expect(ARENA_KINDS.map(maxPlayersOf)).toEqual([64, 512, 8, 64]);
    expect(ARENA_KINDS.map(botFillSizeOf)).toEqual([8, 8, 8, 16]);
  });

  test.each<[ArenaKind, number]>([
    ["private", 64],
    ["presenter", 512],
    ["practice", 8],
    ["tournament", 64],
  ])("a %s arena takes %i humans and rejects one more", (kind, max) => {
    const full = withHumans(arenaOfKind(kind), max);
    expect(err(full, { kind: "join", playerId: "late", name: "Late", strategy: strategy(), look: plainTankLook(1) })).toBe("arena_full");
  });

  test.each(PUBLIC_KINDS)("a %s arena has no name and always fills with bots; the others need a name", (kind) => {
    expect(arenaOfKind(kind).settings).toMatchObject({ name: "", kind, botFill: true });
    const publicSettings: ArenaSettings = { ...SETTINGS, kind, name: "", botFill: true, tankCount: null };
    expect(() => createArena("k", { ...publicSettings, name: "Mine" }, "standard")).toThrow(/no name/);
    expect(() => createArena("k", { ...publicSettings, botFill: false }, "standard")).toThrow(/bots/);
    expect(() => createArena("k", { ...SETTINGS, kind: "private", name: "" }, "standard")).toThrow(/name/);
    expect(() => createArena("k", { ...SETTINGS, kind: "nope" as never }, "standard")).toThrow(/kind/);
  });

  test("parseArenaSettings names a missing kind or botFill", () => {
    const { kind: _k, botFill: _b, ...missing } = SETTINGS;
    const parsed = parseArenaSettings(missing);
    if (parsed.ok) throw new Error("expected problems");
    expect(parsed.problems.some((p) => p.startsWith("kind"))).toBe(true);
    expect(parsed.problems.some((p) => p.startsWith("botFill"))).toBe(true);
  });
});

describe("join in each phase and kind", () => {
  test("a private or presenter arena takes joins in the lobby only", () => {
    for (const kind of ["private", "presenter"] as const) {
      const running = ok(withHumans(arenaOfKind(kind), 2), startEvent(1));
      expect(err(running, { kind: "join", playerId: "x", name: "Late", strategy: strategy(), look: plainTankLook(1) })).toBe("wrong_phase");
    }
  });

  test("a public arena takes joins in every phase; outside the lobby the player waits for the next game", () => {
    const lobby = withHumans(arenaOfKind("practice"), 2);
    expect(lobby.players.every((p) => p.status.kind === "playing")).toBe(true);
    const running = ok(lobby, startEvent(1));
    const joined = ok(running, { kind: "join", playerId: "late", name: "Late", strategy: strategy(), look: plainTankLook(4) });
    expect(joined.players.find((p) => p.id === "late")).toMatchObject({ status: { kind: "waiting" }, look: plainTankLook(4), isBot: false });
    // A waiting player is not in the running round, so a strategy edit is accepted.
    expect(ok(joined, { kind: "submitStrategy", playerId: "late", strategy: strategy("x") }).players.at(-1)?.strategy).toEqual(strategy("x"));

    const finished = ok(running, { kind: "roundCompleted", standings: standingsFor(runningIds(running)), nextRuleSetId: null });
    expect(ok(finished, { kind: "join", playerId: "late", name: "Late", strategy: strategy(), look: plainTankLook(1) }).players.at(-1)?.status).toEqual({ kind: "waiting" });
  });

  test("a public arena counts humans only, so bots in a game leave room for late joiners", () => {
    const lobby = ok(withHumans(arenaOfKind("practice"), 1), { kind: "addBots", bots: Array.from({ length: 7 }, (_, i) => bot(`b${i}`, `Bot ${i}`)) });
    const running = ok(lobby, startEvent(1));
    const late = withHumans(running, 7, 2);
    expect(late.players.filter((p) => p.status.kind === "waiting")).toHaveLength(7);
    expect(err(late, { kind: "join", playerId: "x", name: "Ninth", strategy: strategy(), look: plainTankLook(1) })).toBe("arena_full");
  });

  test("keeps a full look and rejects a look that parseTankLook refuses", () => {
    const look: TankLook = { colour: 3, skin: "dots", second: 5, plate: 7, icon: "star" };
    expect(ok(newArena(), { kind: "join", playerId: "p1", name: "Ayu", strategy: strategy(), look }).players[0]?.look).toEqual(look);
    for (const bad of [{ ...look, colour: 13 }, { ...look, second: 3 }, { ...look, skin: "tartan" }, null]) {
      expect(err(newArena(), { kind: "join", playerId: "p1", name: "Ayu", strategy: strategy(), look: bad as TankLook })).toBe("look_invalid");
    }
  });

  test("a failed first round turns waiting players into playing ones and removes the bots", () => {
    const lobby = ok(withHumans(arenaOfKind("practice"), 2), { kind: "addBots", bots: [bot("b1", "Splashy"), bot("b2", "Bubbles")] });
    const running = ok(lobby, startEvent(1));
    const joined = ok(running, { kind: "join", playerId: "late", name: "Late", strategy: strategy(), look: plainTankLook(1) });
    const aborted = ok(joined, { kind: "roundAborted" });
    expect(aborted.phase.kind).toBe("lobby");
    expect(aborted.players.map((p) => p.id)).toEqual(["p1", "p2", "late"]);
    expect(aborted.players.every((p) => p.status.kind === "playing")).toBe(true);
  });
});

describe("addBots", () => {
  test("adds bots as playing players with isBot, in the lobby", () => {
    const arena = ok(withHumans(arenaOfKind("private"), 1), { kind: "addBots", bots: [bot("b1", "Splashy", plainTankLook(3)), bot("b2", "Bubbles", plainTankLook(4))] });
    expect(arena.players.slice(1)).toEqual([
      expect.objectContaining({ id: "b1", name: "Splashy", isBot: true, look: plainTankLook(3), status: { kind: "playing" } }),
      expect.objectContaining({ id: "b2", name: "Bubbles", isBot: true, look: plainTankLook(4), status: { kind: "playing" } }),
    ]);
    // One human and bots are enough to start.
    expect(ok(arena, startEvent(1)).phase.kind).toBe("running");
  });

  test("rejects bots outside the lobby, over capacity, with a taken name or a bad look", () => {
    const lobby = withHumans(arenaOfKind("practice"), 2);
    expect(err(ok(lobby, startEvent(1)), { kind: "addBots", bots: [bot("b1", "Splashy")] })).toBe("wrong_phase");
    expect(err(lobby, { kind: "addBots", bots: Array.from({ length: 7 }, (_, i) => bot(`b${i}`, `Bot ${i}`)) })).toBe("arena_full");
    expect(err(lobby, { kind: "addBots", bots: [bot("b1", "player 1")] })).toBe("name_taken");
    expect(err(lobby, { kind: "addBots", bots: [bot("b1", "Twin"), bot("b2", "twin")] })).toBe("name_taken");
    expect(err(lobby, { kind: "addBots", bots: [bot("b1", "Splashy", { ...plainTankLook(1), colour: 0 } as unknown as TankLook)] })).toBe("look_invalid");
  });

  test("throws when the server repeats an id, because that is a server bug", () => {
    expect(() => applyEvent(withHumans(arenaOfKind("private"), 1), { kind: "addBots", bots: [bot("p1", "Splashy")] })).toThrow(/p1/);
  });
});

describe("removePlayers", () => {
  test("removes the named players in the lobby", () => {
    const arena = ok(withHumans(arenaOfKind("private"), 3), { kind: "removePlayers", playerIds: ["p1", "p3"] });
    expect(arena.players.map((p) => p.id)).toEqual(["p2"]);
  });

  test("rejects an unknown id and every phase but the lobby", () => {
    const lobby = withHumans(arenaOfKind("private"), 3);
    expect(err(lobby, { kind: "removePlayers", playerIds: ["p1", "nobody"] })).toBe("unknown_player");
    const running = ok(lobby, startEvent(1));
    expect(err(running, { kind: "removePlayers", playerIds: ["p1"] })).toBe("wrong_phase");
    const finished = ok(running, { kind: "roundCompleted", standings: standingsFor(runningIds(running)), nextRuleSetId: null });
    expect(err(finished, { kind: "removePlayers", playerIds: ["p1"] })).toBe("wrong_phase");
  });
});

describe("setLook", () => {
  test("changes the look in the lobby, the break and after the final", () => {
    const look: TankLook = { colour: 3, skin: "dots", second: 5, plate: 7, icon: "star" };
    const lobby = lobbyWith(10);
    const inBreak = playRound(lobby, 1);
    const finished = playRound(lobbyWith(3), 1);
    for (const arena of [lobby, inBreak, finished]) {
      expect(ok(arena, { kind: "setLook", playerId: "p1", look }).players.find((p) => p.id === "p1")?.look).toEqual(look);
    }
  });

  test("rejects a running round, an unknown player and a bad look", () => {
    expect(err(ok(lobbyWith(3), startEvent(1)), { kind: "setLook", playerId: "p1", look: plainTankLook(2) })).toBe("wrong_phase");
    expect(err(lobbyWith(3), { kind: "setLook", playerId: "nobody", look: plainTankLook(2) })).toBe("unknown_player");
    expect(err(lobbyWith(3), { kind: "setLook", playerId: "p1", look: { ...plainTankLook(1), plate: 0 } as unknown as TankLook })).toBe("look_invalid");
  });
});

describe("setBotFill", () => {
  test("changes botFill in the lobby only, and never in a public arena", () => {
    const lobby = withHumans(arenaOfKind("private"), 2);
    expect(ok(lobby, { kind: "setBotFill", botFill: true }).settings.botFill).toBe(true);
    expect(err(ok(lobby, startEvent(1)), { kind: "setBotFill", botFill: true })).toBe("wrong_phase");
    expect(err(arenaOfKind("practice"), { kind: "setBotFill", botFill: false })).toBe("wrong_phase");
  });
});

describe("tank count (78-arena-seats.md)", () => {
  const privateArena = (tankCount: number, botFill = true) => createArena("t1", { ...SETTINGS, kind: "private", tankCount, botFill }, STANDARD_RULE_SET_ID);
  const join = (id: string): ArenaEvent => ({ kind: "join", playerId: id, name: `Tank ${id}`, strategy: strategy(), look: plainTankLook(1) });
  const bots = (count: number) => Array.from({ length: count }, (_, i) => bot(`b${i}`, `Bot ${i}`));

  test("an owner's tank count gives both the join limit and the bot fill; null keeps the kind's old numbers", () => {
    expect(seatsOf({ kind: "private", tankCount: 48 })).toEqual({ people: 48, botsFillTo: 48 });
    expect(seatsOf({ kind: "private", tankCount: null })).toEqual({ people: 64, botsFillTo: 8 });
    expect(seatsOf({ kind: "presenter", tankCount: null })).toEqual({ people: 512, botsFillTo: 8 });
    expect(seatsOf({ kind: "tournament", tankCount: null })).toEqual({ people: 64, botsFillTo: 16 });
    expect(tankCountRange("private")).toEqual({ min: 2, max: 64, initial: 16 });
    expect(tankCountRange("presenter")).toEqual({ min: 2, max: 512, initial: 512 });
    expect(tankCountRange("practice")).toBeNull();
  });

  test("a join at the limit is refused with arena_full", () => {
    let arena = privateArena(3);
    for (const id of ["p1", "p2", "p3"]) arena = ok(arena, join(id));
    expect(err(arena, join("p4"))).toBe("arena_full");
  });

  test("bots fill to 48 with the switch on, and none come with it off", () => {
    const one = ok(privateArena(48), join("p1"));
    expect(botsToAddAtStart(one.settings, one.players.length)).toBe(47);
    const full = ok(one, { kind: "addBots", bots: bots(47) });
    expect(full.players.length).toBe(48);
    expect(err(one, { kind: "addBots", bots: bots(48) })).toBe("arena_full");
    const off = ok(privateArena(48, false), join("p1"));
    expect(botsToAddAtStart(off.settings, off.players.length)).toBe(0);
  });

  test("createArena refuses a missing or out-of-range tank count for an owner's arena, and any for a public one", () => {
    expect(() => createArena("t", { ...SETTINGS, kind: "private", tankCount: null }, STANDARD_RULE_SET_ID)).toThrow(/tankCount/);
    expect(() => createArena("t", { ...SETTINGS, kind: "private", tankCount: 65 }, STANDARD_RULE_SET_ID)).toThrow(/2 to 64/);
    expect(() => createArena("t", { ...SETTINGS, kind: "presenter", tankCount: 1 }, STANDARD_RULE_SET_ID)).toThrow(/2 to 512/);
    expect(() => createArena("t", { ...SETTINGS, kind: "private", tankCount: 2.5 }, STANDARD_RULE_SET_ID)).toThrow(/tankCount/);
    expect(() => createArena("t", { ...SETTINGS, kind: "practice", name: "", botFill: true, tankCount: 8 }, STANDARD_RULE_SET_ID)).toThrow(/tankCount/);
  });

  test("the owner changes it in the lobby, inside the range and not below the people in", () => {
    let lobby = privateArena(16);
    for (const id of ["p1", "p2", "p3"]) lobby = ok(lobby, join(id));
    expect(ok(lobby, { kind: "setTankCount", tankCount: 48 }).settings.tankCount).toBe(48);
    expect(ok(lobby, { kind: "setTankCount", tankCount: 3 }).settings.tankCount).toBe(3);
    expect(err(lobby, { kind: "setTankCount", tankCount: 2 })).toBe("tank_count_below_players");
    expect(err(lobby, { kind: "setTankCount", tankCount: 65 })).toBe("tank_count_invalid");
    expect(err(lobby, { kind: "setTankCount", tankCount: 7.5 })).toBe("tank_count_invalid");
    expect(err(ok(lobby, startEvent(1)), { kind: "setTankCount", tankCount: 48 })).toBe("wrong_phase");
    expect(err(arenaOfKind("tournament"), { kind: "setTankCount", tankCount: 16 })).toBe("wrong_phase");
  });

  test("a change removes bots left in the lobby by a start that failed, so the next start fills the seats again", () => {
    const withBots = ok(ok(privateArena(16), join("p1")), { kind: "addBots", bots: bots(15) });
    const smaller = ok(withBots, { kind: "setTankCount", tankCount: 4 });
    expect(smaller.players.map((p) => p.id)).toEqual(["p1"]);
    expect(botsToAddAtStart(smaller.settings, smaller.players.length)).toBe(3);
  });

  test("an arena stored before tank counts keeps its numbers until the owner sets one", () => {
    const old: Arena = { ...privateArena(16), settings: { ...privateArena(16).settings, tankCount: null } };
    let lobby = withHumans(old, 3);
    expect(botsToAddAtStart(lobby.settings, lobby.players.length)).toBe(5);
    lobby = withHumans(lobby, 61, 4);
    expect(lobby.players.length).toBe(64);
    expect(err(lobby, join("late"))).toBe("arena_full");
    expect(ok(lobby, { kind: "setTankCount", tankCount: 64 }).settings.tankCount).toBe(64);
  });
});

describe("setChat", () => {
  test.each<ArenaKind>(["private", "presenter"])("a %s arena starts with the chat on, and setChat switches it in every phase", (kind) => {
    const lobby = withHumans(arenaOfKind(kind), 2);
    expect(lobby.chat).toBe("on");
    const off = ok(lobby, { kind: "setChat", on: false });
    expect(off.chat).toBe("off");
    expect(toPublicArena(off, null, null).chat).toBe("off");
    const running = ok(off, startEvent(1));
    expect(ok(running, { kind: "setChat", on: true }).chat).toBe("on");
    expect(running.chat).toBe("off");
  });

  test.each(PUBLIC_KINDS)("a %s arena has no chat and refuses setChat", (kind) => {
    const arena = arenaOfKind(kind);
    expect(arena.chat).toBeNull();
    expect(toPublicArena(arena, null, null).chat).toBeNull();
    expect(err(arena, { kind: "setChat", on: true })).toBe("wrong_phase");
  });
});

describe("reset", () => {
  function finishedWithBots(): Arena {
    const lobby = ok(withHumans(arenaOfKind("private"), 2), { kind: "addBots", bots: [bot("b1", "Splashy"), bot("b2", "Bubbles")] });
    const running = ok(lobby, startEvent(1));
    return ok(running, { kind: "roundCompleted", standings: standingsFor(runningIds(running)), nextRuleSetId: null });
  }

  test("finished to lobby: removes bots, sets everyone to playing, clears the rounds and raises game", () => {
    const finished = finishedWithBots();
    expect(finished.game).toBe(1);
    const lobby = ok(finished, { kind: "reset", nextRuleSetId: "standard" });
    expect(lobby.phase).toEqual({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } });
    expect(lobby.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(lobby.players.every((p) => p.status.kind === "playing")).toBe(true);
    expect(lobby.rounds).toEqual([]);
    expect(lobby.game).toBe(2);
    // The next game starts like the first.
    expect(ok(lobby, startEvent(2)).phase).toMatchObject({ kind: "running", round: 1 });
  });

  test("keeps the strategy and the look of each remaining player", () => {
    const finished = ok(finishedWithBots(), { kind: "setLook", playerId: "p2", look: plainTankLook(6) });
    const lobby = ok(finished, { kind: "reset", nextRuleSetId: "standard" });
    expect(lobby.players.find((p) => p.id === "p2")?.look).toEqual(plainTankLook(6));
    expect(lobby.players.map((p) => p.strategy)).toEqual(finished.players.filter((p) => !p.isBot).map((p) => p.strategy));
  });

  test("is rejected outside finished, and with an announcement that breaks the mode", () => {
    expect(err(lobbyWith(2), { kind: "reset", nextRuleSetId: "standard" })).toBe("wrong_phase");
    expect(err(ok(lobbyWith(2), startEvent(1)), { kind: "reset", nextRuleSetId: "standard" })).toBe("wrong_phase");
    expect(err(playRound(lobbyWith(10), 1), { kind: "reset", nextRuleSetId: "standard" })).toBe("wrong_phase");
    expect(err(finishedWithBots(), { kind: "reset", nextRuleSetId: null })).toBe("rule_set_mismatch");
  });
});

describe("parseTankLook", () => {
  test("returns a new object with exactly the five fields", () => {
    const raw = { colour: 12, skin: "scales", second: 1, plate: null, icon: "smile", extra: "dropped" };
    expect(parseTankLook(raw)).toEqual({ colour: 12, skin: "scales", second: 1, plate: null, icon: "smile" });
  });

  test.each<[string, unknown]>([
    ["a colour of 0", { colour: 0, skin: "plain", second: 2, plate: null, icon: null }],
    ["a colour of 13", { colour: 13, skin: "plain", second: 2, plate: null, icon: null }],
    ["a colour as text", { colour: "1", skin: "plain", second: 2, plate: null, icon: null }],
    ["a second colour equal to the body, also on plain", { colour: 4, skin: "plain", second: 4, plate: null, icon: null }],
    ["an unknown skin", { colour: 1, skin: "tartan", second: 2, plate: null, icon: null }],
    ["an unknown icon", { colour: 1, skin: "plain", second: 2, plate: null, icon: "dragon" }],
    ["a missing plate", { colour: 1, skin: "plain", second: 2, icon: null }],
    ["a plate out of range", { colour: 1, skin: "plain", second: 2, plate: 13, icon: null }],
    ["a list", [1, "plain", 2, null, null]],
  ])("rejects %s", (_label, raw) => {
    expect(parseTankLook(raw)).toBeNull();
  });

  test("plainTankLook gives a valid look for every colour, with the next colour as the second", () => {
    for (let c = 1; c <= 12; c++) {
      const look = plainTankLook(c as TankLook["colour"]);
      expect(parseTankLook(look)).toEqual(look);
    }
    expect(plainTankLook(12).second).toBe(1);
  });
});

describe("parsePlayerName", () => {
  test("trims the ends and turns a run of spaces inside into one", () => {
    expect(parsePlayerName("  Ayu   Putri  ")).toBe("Ayu Putri");
    expect(parsePlayerName("Tank 007")).toBe("Tank 007");
  });

  test("rejects what is not text", () => {
    for (const value of [undefined, null, 123, ["Ayu"]]) expect(parsePlayerName(value)).toBeNull();
  });
});

describe("ready (public lobby and result only)", () => {
  const ready = (playerId: string): ArenaEvent => ({ kind: "setReady", playerId, ready: true });
  const readyOf = (arena: Arena) => arena.players.map((p) => p.ready);

  test.each(PUBLIC_KINDS)("in a %s lobby a human becomes ready, and again changes nothing", (kind) => {
    const lobby = withHumans(arenaOfKind(kind), 2);
    expect(readyOf(lobby)).toEqual([false, false]);
    const once = ok(lobby, ready("p1"));
    expect(readyOf(once)).toEqual([true, false]);
    expect(ok(once, ready("p1"))).toEqual(once);
  });

  test("is refused for a bot, for a stranger, while a round runs, and taking it back in a public arena", () => {
    expect(err(ok(withHumans(arenaOfKind("practice"), 1), ready("p1")), { kind: "setReady", playerId: "p1", ready: false })).toBe("wrong_phase");
    const lobby = ok(withHumans(arenaOfKind("practice"), 1), { kind: "addBots", bots: [bot("b1", "Splashy")] });
    expect(err(lobby, ready("b1"))).toBe("unknown_player");
    expect(err(lobby, ready("ghost"))).toBe("unknown_player");
    const running = ok(lobby, startEvent(1));
    expect(err(running, ready("p1"))).toBe("wrong_phase");
    const finished = ok(running, completed(running, standingsFor(runningIds(running))));
    expect(err(finished, ready("b1"))).toBe("unknown_player");
  });

  test("a new player is not ready, and the start and a failed round clear it", () => {
    const lobby = ok(ok(withHumans(arenaOfKind("practice"), 2), ready("p1")), ready("p2"));
    expect(readyOf(withHumans(lobby, 1, 3))).toEqual([true, true, false]);
    const running = ok(lobby, startEvent(1));
    expect(readyOf(running)).toEqual([false, false]);
    expect(readyOf(ok(ok(lobby, startEvent(1)), { kind: "roundAborted" }))).toEqual([false, false]);
  });

  test("a player who taps ready on the result is ready in the next lobby; the others are not", () => {
    const running = ok(withHumans(arenaOfKind("practice"), 2), startEvent(1));
    const finished = ok(running, completed(running, standingsFor(runningIds(running))));
    expect(readyOf(finished)).toEqual([false, false]);
    const tapped = ok(finished, ready("p2"));
    expect(readyOf(tapped)).toEqual([false, true]);
    const next = ok(tapped, { kind: "reset", nextRuleSetId: STANDARD_RULE_SET_ID });
    expect(next.phase.kind).toBe("lobby");
    expect(readyOf(next)).toEqual([false, true]);
    expect(readyOf(ok(next, startEvent(2)))).toEqual([false, false]);
  });

  test("a player who joined during the game may tap ready on the result too", () => {
    const running = ok(withHumans(arenaOfKind("practice"), 2), startEvent(1));
    const late = withHumans(running, 1, 3);
    expect(err(late, ready("p3"))).toBe("wrong_phase");
    const finished = ok(late, completed(late, standingsFor(runningIds(late))));
    const next = ok(ok(finished, ready("p3")), { kind: "reset", nextRuleSetId: STANDARD_RULE_SET_ID });
    expect(next.players.map((p) => [p.id, p.status.kind, p.ready])).toEqual([
      ["p1", "playing", false],
      ["p2", "playing", false],
      ["p3", "playing", true],
    ]);
  });
});

describe("tournament", () => {
  test("holds at most 16 bots, and 16 players play a cut round before the final", () => {
    const lobby = withHumans(arenaOfKind("tournament"), 1);
    const sixteen = Array.from({ length: 16 }, (_, i) => bot(`b${i}`, `Bot ${String.fromCharCode(97 + i)}`));
    expect(err(lobby, { kind: "addBots", bots: [...sixteen, bot("b99", "Bot extra")] })).toBe("arena_full");
    const fifteen = sixteen.slice(0, 15);
    const full = ok(lobby, { kind: "addBots", bots: fifteen });
    expect(full.players).toHaveLength(16);
    const running = ok(full, startEvent(1));
    expect(running.phase).toMatchObject({ kind: "running", round: 1, isFinal: false, survivorsAfterRound: 8 });
  });

  test("a visitor joins while a round runs and waits, up to 64 people in all", () => {
    const running = ok(ok(withHumans(arenaOfKind("tournament"), 2), { kind: "addBots", bots: [bot("b1", "Splashy")] }), startEvent(1));
    const crowded = withHumans(running, 62, 3);
    expect(crowded.players.filter((p) => p.status.kind === "waiting")).toHaveLength(62);
    expect(err(crowded, { kind: "join", playerId: "late", name: "Late", strategy: strategy(), look: plainTankLook(1) })).toBe("arena_full");
  });
});

describe("organiser tournament (75-organiser-tournament.md)", () => {
  const ready = (playerId: string, on = true): ArenaEvent => ({ kind: "setReady", playerId, ready: on });
  const signedIn = (count: number): Arena => withPlayers(newArena({ ...SETTINGS, joinPolicy: "account" }), count);

  test("a public arena cannot be signed-in only", () => {
    expect(() => createArena("a1", { ...SETTINGS, kind: "practice", name: "", botFill: true, joinPolicy: "account", tankCount: null }, STANDARD_RULE_SET_ID)).toThrow(/joinPolicy/);
  });

  test("ready in a lobby and a break informs, and a player can take it back; the start clears it", () => {
    const lobby = ok(withPlayers(newArena(), 10), ready("p1"));
    expect(lobby.players.filter((p) => p.ready).map((p) => p.id)).toEqual(["p1"]);
    expect(ok(lobby, ready("p1", false)).players.every((p) => !p.ready)).toBe(true);
    const inBreak = playRound(lobby, 1);
    expect(inBreak.phase.kind).toBe("break");
    expect(inBreak.players.every((p) => !p.ready)).toBe(true);
    // p1..p8 went through (id order), p9 and p10 are out and have nothing to be ready for.
    expect(ok(inBreak, ready("p2")).players.find((p) => p.id === "p2")?.ready).toBe(true);
    expect(err(inBreak, ready("p9"))).toBe("player_eliminated");
    const finished = playRound(inBreak, 2);
    expect(err(finished, ready("p1"))).toBe("wrong_phase");
  });

  test("the start plan: schedule, move, cancel, miss, and start from each", () => {
    const lobby = withPlayers(newArena(), 2);
    const plan = (arena: Arena) => (arena.phase.kind === "lobby" || arena.phase.kind === "break" ? arena.phase.start : null);
    expect(plan(lobby)).toEqual({ kind: "waiting" });
    const scheduled = ok(lobby, { kind: "scheduleStart", startsAt: 60_000 });
    expect(plan(scheduled)).toEqual({ kind: "scheduled", startsAt: 60_000 });
    expect(plan(ok(scheduled, { kind: "scheduleStart", startsAt: 120_000 }))).toEqual({ kind: "scheduled", startsAt: 120_000 });
    expect(plan(ok(scheduled, { kind: "cancelStart" }))).toEqual({ kind: "waiting" });
    expect(err(lobby, { kind: "cancelStart" })).toBe("wrong_phase");
    expect(err(lobby, { kind: "startMissed" })).toBe("wrong_phase");
    const missed = ok(scheduled, { kind: "startMissed" });
    expect(plan(missed)).toEqual({ kind: "missed" });
    expect(ok(missed, startEvent(1)).phase.kind).toBe("running");
    expect(ok(scheduled, startEvent(1)).phase.kind).toBe("running");
    expect(err(arenaOfKind("practice"), { kind: "scheduleStart", startsAt: 1 })).toBe("wrong_phase");
    const finished = playRound(lobby, 1);
    expect(err(finished, { kind: "scheduleStart", startsAt: 1 })).toBe("wrong_phase");
  });

  test("the owner removes a player in the lobby (the seat goes) and in a break (out, kept for the history)", () => {
    const lobby = withPlayers(newArena(), 10);
    expect(ok(lobby, { kind: "ownerRemove", playerId: "p3", ban: null }).players.map((p) => p.id)).not.toContain("p3");
    const inBreak = playRound(lobby, 1);
    const removed = ok(inBreak, { kind: "ownerRemove", playerId: "p1", ban: null });
    expect(removed.players.find((p) => p.id === "p1")?.status).toEqual({ kind: "removed" });
    expect(err(removed, { kind: "ownerRemove", playerId: "p1", ban: null })).toBe("unknown_player");
    expect(err(removed, { kind: "submitStrategy", playerId: "p1", strategy: strategy() })).toBe("unknown_player");
    const next = ok(removed, startEvent(2));
    expect(runningIds(next)).not.toContain("p1");
    expect(runningIds(next)).toHaveLength(7);
    const reset = ok(ok(next, completed(next, standingsFor(runningIds(next)))), { kind: "reset", nextRuleSetId: STANDARD_RULE_SET_ID });
    expect(reset.players.map((p) => p.id)).not.toContain("p1");
    expect(finalPlaceOf({ kind: "removed" })).toBeNull();
  });

  test("a break keeps two playing tanks, and other phases and bots refuse a removal", () => {
    let arena = playRound(withPlayers(newArena(), 9), 1);
    for (const id of ["p1", "p2", "p3", "p4", "p5", "p6"]) arena = ok(arena, { kind: "ownerRemove", playerId: id, ban: null });
    expect(err(arena, { kind: "ownerRemove", playerId: "p7", ban: null })).toBe("not_enough_players");
    // p9 is out already, so removing them leaves the two playing tanks.
    expect(ok(arena, { kind: "ownerRemove", playerId: "p9", ban: null }).players.find((p) => p.id === "p9")?.status.kind).toBe("removed");
    const running = ok(withPlayers(newArena(), 2), startEvent(1));
    expect(err(running, { kind: "ownerRemove", playerId: "p1", ban: null })).toBe("wrong_phase");
    expect(err(ok(withPlayers(arenaOfKind("practice"), 1), { kind: "addBots", bots: [bot("b1", "Splashy")] }), { kind: "ownerRemove", playerId: "p1", ban: null })).toBe("wrong_phase");
  });

  test("a ban needs a signed-in-only arena, keeps one entry per account, and allow again lifts it", () => {
    expect(err(withPlayers(newArena(), 2), { kind: "ownerRemove", playerId: "p1", ban: "acc-1" })).toBe("ban_unavailable");
    const banned = ok(signedIn(3), { kind: "ownerRemove", playerId: "p1", ban: "acc-1" });
    expect(banned.banned).toEqual([{ accountId: "acc-1", name: "Player 1" }]);
    expect(isBanned(banned, "acc-1")).toBe(true);
    const twice = ok(banned, { kind: "ownerRemove", playerId: "p2", ban: "acc-1" });
    expect(twice.banned).toHaveLength(1);
    const allowed = ok(banned, { kind: "allowAgain", accountId: "acc-1" });
    expect(allowed.banned).toEqual([]);
    expect(err(allowed, { kind: "allowAgain", accountId: "acc-1" })).toBe("not_banned");
  });

  test("the stored result's id is set once the game is finished, in an owner's arena only", () => {
    const lobby = withPlayers(newArena(), 2);
    expect(err(lobby, { kind: "resultStored", resultId: "r" })).toBe("wrong_phase");
    const finished = ok(playRound(lobby, 1), { kind: "resultStored", resultId: "abcdefghijklmnopqrstuv" });
    expect(finished.phase).toMatchObject({ kind: "finished", resultId: "abcdefghijklmnopqrstuv" });
  });
});
