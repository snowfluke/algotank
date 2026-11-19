// An arena is one game place: a code, a player list, knockout rounds and one
// winner per game. This file holds its state machine and the messages between the
// server and the browser. The reducer in arena.ts is the only code that changes an
// Arena.
//
// Arena kinds (maxPlayersOf and botFillSizeOf in arena.ts hold the numbers). The two
// public kinds are run by the server (apps/server/src/public-arenas.ts holds their timings,
// docs/specs/revamp/67-public-arenas.md the reasons). The monthly arena is not an arena of this
// reducer: it is a league that always runs (monthly-protocol.ts, apps/server/src/monthly/).
// |                     | private               | presenter             | practice, tournament                |
// |---------------------|-----------------------|-----------------------|-------------------------------------|
// | Created by          | a signed-in account   | a signed-in account   | the server                          |
// | Owner plays         | yes, joins like anyone| no                    | no owner                            |
// | Tanks in a game     | tankCount, 2 to 64,   | tankCount, 2 to 512,  | fixed by kind (tankCount null)      |
// |                     | default 16            | default 512           |                                     |
// | Most human players  | tankCount             | tankCount             | 8, 64                               |
// | Bots fill seats to  | tankCount, botFill    | tankCount, botFill    | 8, 16 (always)                      |
// |                     | default on            | default off           |                                     |
// | Player names        | typed or from the game| typed or from the game| typed or from the game              |
// | Rounds start, reset | owner, now or at a    | owner, now or at a    | the server, on a timer              |
// |                     | scheduled time        | scheduled time        |                                     |
// | Ready               | lobby and break,      | lobby and break,      | lobby and result; shortens the      |
// |                     | informs the owner     | informs the owner     | countdown                           |
// | Who can join        | setting joinPolicy    | setting joinPolicy    | anyone                              |
// | Owner removes       | lobby and break       | lobby and break       | no owner                            |
// (Typed names follow parsePlayerName and pass the server's block list. A join without a
// name gets a two-word name from the game.)
//
// State machine. Terminal state: none inside the reducer. An arena ends when it is
// closed or expires, which removes it from the server's store.
//
// | From     | To       | Actor                        | Guard                                                     |
// |----------|----------|------------------------------|-----------------------------------------------------------|
// | lobby    | running  | owner, or the server (public)| at least 2 playing players after bots were added, and the |
// |          |          |                              | rule set fits the mode and the lobby                      |
// | running  | break    | engine                       | last tick played, not the final, and the next             |
// |          |          |                              | announcement fits the mode                                |
// | running  | finished | engine                       | last tick played, and the round was the final             |
// | running  | lobby    | engine                       | the round failed and no round has completed               |
// | running  | break    | engine                       | the round failed and an earlier round has completed       |
// | break    | running  | owner, or the server (public)| the rule set fits the mode and the break                  |
// | finished | lobby    | owner, or the server (public)| none. Removes every bot and every removed player, sets    |
// |          |          |                              | every remaining player to "playing", clears the rounds,   |
// |          |          |                              | raises `game` by 1, takes the announcement for the new    |
// |          |          |                              | lobby                                                     |
//
// Scheduled start (organiser tournament, docs/specs/revamp/75-organiser-tournament.md). The lobby
// and the break of a private or presenter arena carry `start`, the owner's plan for the next
// round. The owner always decides; ready only informs. The reducer owns the plan; the server owns
// the timer (apps/server/src/scheduled-start.ts) and drops a plan back to waiting at a restart.
// | From (lobby or break) | Event         | Actor  | Guard                         | Next                       |
// |-----------------------|---------------|--------|-------------------------------|----------------------------|
// | waiting or missed     | startRound    | owner  | enough players                | running                    |
// | waiting or missed     | scheduleStart | owner  | 1, 2, 3 or 5 minutes (server) | scheduled (`startsAt`)     |
// | scheduled             | cancelStart   | owner  |                               | waiting                    |
// | scheduled             | scheduleStart | owner  | as above                      | scheduled (the new time)   |
// | scheduled             | startRound    | owner, | enough players                | running                    |
// |                       |               | server | (the time is reached)         |                            |
// | scheduled             | startMissed   | server | the time is reached with too  | missed (the owner's page   |
// |                       |               |        | few players                   | says so)                   |
// | scheduled             | cancelStart   | server | the server restarted          | waiting                    |
// A public arena's plan is always waiting: its own timers start its rounds.
//
// Every round plays under one rule set of the engine (RULE_SETS). The arena's
// ruleSetMode decides which one:
// | Mode      | Rule set of a round                                  | Known to players             |
// |-----------|------------------------------------------------------|------------------------------|
// | standard  | always the standard set                              | always                       |
// | announced | drawn by the server when the lobby or a break starts | during that lobby or break   |
// | surprise  | drawn by the server when the owner starts the round  | from the first tick          |
// The lobby and break phases carry `nextRuleSetId`: the standard id, the announced
// id, or null in surprise mode, where nothing exists that could leak. startRound is
// rejected ("rule_set_mismatch") when its rule set is unknown, is not the standard id
// in standard mode, or differs from a non-null announcement. roundCompleted carries the
// announcement for the next break and is rejected with the same error when it breaks
// the mode, or when it is not null after a final. A failed round returns to the
// announcement it had: the id of the failed round in standard and announced mode,
// null in surprise mode. reset carries the announcement for the new lobby.
//
// A round is the final when 8 or fewer players start it. Otherwise the cut
// keeps max(8, ceil(n / 2)) players. Any other transition is rejected.
//
// A failed round (a bug in the engine or the server) counts for nothing: it adds
// no RoundSummary and eliminates nobody. The arena returns to the phase before the
// round, so the owner starts the same round number again with a new seed. A failed
// round that returns to the lobby also sets "waiting" players to "playing", because
// the game they waited for has not begun, and removes the bots, so the next start
// fills the seats again.
//
// Player actions and their guards. Every event is sent by the server; "player" means
// the server acts for the holder of that player's token.
// | Action          | Allowed in                        | Guard                                              |
// |-----------------|-----------------------------------|----------------------------------------------------|
// | join            | lobby; any phase in a public arena| name valid and free, look valid, fewer humans      |
// |                 |                                   | than seatsOf(settings).people. Outside the lobby the|
// |                 |                                   | player gets "waiting" and plays from the next game.|
// |                 |                                   | A new player is not ready                          |
// | addBots         | lobby                             | server only; players + bots <= seatsOf().people,   |
// |                 |                                   | bots <= seatsOf().botsFillTo                       |
// | removePlayers   | lobby                             | server only (public pruning, "leave" for the      |
// |                 |                                   | player's own id); every id is in the arena        |
// | ownerRemove     | lobby, break                      | owner, private or presenter arena; a human who is |
// |                 |                                   | not removed. Lobby: the seat goes. Break: status  |
// |                 |                                   | "removed" (out of the game, kept for the round    |
// |                 |                                   | history), refused when fewer than 2 playing would |
// |                 |                                   | stay. `ban` needs a signed-in-only arena and adds the     |
// |                 |                                   | account to `banned`                               |
// | allowAgain      | any phase                         | owner; the account is on `banned`                 |
// | scheduleStart,  | lobby, break                      | owner (startMissed: server); not a public arena   |
// | cancelStart,    |                                   | (see Scheduled start)                             |
// | startMissed     |                                   |                                                   |
// | resultStored    | finished                          | server, after it wrote the result row; private    |
// |                 |                                   | or presenter arena                                |
// | setLook         | lobby, break, finished            | the player exists; look valid (parseTankLook)      |
// | submitStrategy  | any phase                         | rejected while a round runs that this player plays |
// |                 |                                   | in, and for an eliminated player before finished   |
// | setBotFill      | lobby                             | owner; not a public arena (always on there)        |
// | setTankCount    | lobby                             | owner; not a public arena; inside tankCountRange   |
// |                 |                                   | (removes bots a failed start left in the lobby)    |
// |                 |                                   | (tank_count_invalid), and not below the humans     |
// |                 |                                   | already in (tank_count_below_players)              |
// | setReady        | readyIsOpen: lobby or finished of | the player exists and is not a bot. Private and    |
// |                 | a public arena; lobby or break of | presenter: status "playing", and `ready: false`    |
// |                 | a private or presenter arena      | takes it back; a public arena has no take-back     |
// | setChat         | any phase                         | owner (the server checks); not a public arena,    |
// |                 |                                   | which has no chat (chat-protocol.ts)               |
//
// Ready. The reducer owns who is ready; the server owns the timers. In a public arena ready
// shortens the countdown (apps/server/src/public-arenas.ts), and a player who taps "I'm ready" on
// the result is ready in the next lobby (first-timer test, 2026-11-12). In a private or presenter
// arena ready only informs the owner ("7 of 12 ready"); the owner always decides when to start.
// | From      | To        | Actor  | Guard                                                    |
// |-----------|-----------|--------|----------------------------------------------------------|
// | (joined)  | not ready | player | join: every player starts not ready                      |
// | not ready | ready     | player | setReady true: readyIsOpen, a human player; in a private |
// |           |           |        | or presenter arena one with status "playing"             |
// | ready     | ready     | player | setReady true again: accepted, nothing changes           |
// | ready     | not ready | player | setReady false: private or presenter arena only          |
// | ready     | ready     | server | reset: a player who tapped ready on the result stays     |
// |           |           |        | ready in the new lobby (only a public result opens ready)|
// | ready     | not ready | server | startRound, roundAborted: every player                   |
// | any       | (removed) | server | removePlayers, ownerRemove                               |
// Terminal state: none; a player leaves the machine when removed. A public arena has no "not
// ready": a player who changes their mind waits for the normal countdown.

import type {
  BotId,
  BotState,
  UltimateFire,
  Decision,
  ItemHand,
  MagnetFire,
  Move,
  Pickup,
  RuleSetId,
  Snapshot,
  Standing,
  Strategy,
  ThrowEvent,
} from "@game/engine";
import type { AccountId } from "./auth-protocol.ts";
import type { ChatErrorCode, ChatMessage, ChatSetting } from "./chat-protocol.ts";
import type { MonthlyErrorCode } from "./monthly-protocol.ts";
import type { CompactTick } from "./compact-tick.ts";
import type { OwnStats } from "./stats-protocol.ts";

export type ArenaId = string;
export type PlayerId = BotId;

/** A round with this many players or fewer is the final. Bots fill an arena up to this size. */
export const FINAL_SIZE = 8;

// The arena code a person reads aloud or types. 31 characters without the look-alikes
// I, L, O, 0 and 1. The server draws codes from this alphabet (apps/server/src/secrets.ts),
// and the web reads typed codes against the same shape.
export const ARENA_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ARENA_CODE_LENGTH = 6;
const ARENA_CODE = new RegExp(`^[${ARENA_CODE_ALPHABET}]{${ARENA_CODE_LENGTH}}$`);

/** True for an upper-case string the server can produce as an arena code. */
export function isArenaCode(value: string): boolean {
  return ARENA_CODE.test(value);
}

// ---------------------------------------------------------------------------
// A tank's look (docs/specs/revamp/69-tank-identity.md). A player builds it in "My tank"
// and sends it when joining; bots get a plain look from the server (apps/server/src/bots.ts).
// 12 colours x 12 skins x 11 second colours x 13 plates x 25 icons = 514,800 values. A plain
// skin does not draw its second colour, so 475,800 look different: 12 x 11 x 11 x 13 x 25 =
// 471,900 with a pattern, plus 12 x 13 x 25 = 3,900 plain.
// ---------------------------------------------------------------------------

/** The tank colours: the hull, the pattern and the plate each use one. */
export const TANK_COLOUR_COUNT = 12;
export type TankColour = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export const TANK_COLOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const satisfies readonly TankColour[];
export const isTankColour = (value: unknown): value is TankColour => TANK_COLOURS.some((colour) => colour === value);

/** The patterns drawn on the hull in the second colour. "plain" draws none. */
export const TANK_SKINS = [
  "plain",
  "dots",
  "stripes",
  "slants",
  "checks",
  "zigzag",
  "waves",
  "stars",
  "hearts",
  "splashes",
  "bricks",
  "scales",
] as const;
export type TankSkin = (typeof TANK_SKINS)[number];
export const isTankSkin = (value: unknown): value is TankSkin => TANK_SKINS.some((skin) => skin === value);

/** The drawings on the turret hatch, in place of the name's letters. */
export const TANK_ICONS = [
  "star",
  "heart",
  "bolt",
  "drop",
  "leaf",
  "sun",
  "moon",
  "crown",
  "fish",
  "cat",
  "bird",
  "flower",
  "rocket",
  "key",
  "bell",
  "anchor",
  "cloud",
  "flame",
  "gem",
  "paw",
  "note",
  "snowflake",
  "mushroom",
  "smile",
] as const;
export type TankIcon = (typeof TANK_ICONS)[number];
export const isTankIcon = (value: unknown): value is TankIcon => TANK_ICONS.some((icon) => icon === value);

/**
 * The country flags a tank can fly at its back (owner, 2026-11-16: "full all country flag"):
 * ISO 3166-1 alpha-2 codes in lower case, each a file apps/web/public/flags/<code>.svg (from
 * flag-icons, see the README there). The page names each country in the player's language
 * (Intl.DisplayNames).
 */
export const FLAG_COUNTRIES = [
  "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "aq", "ar", "as", "at", "au", "aw", "ax", "az", "ba", "bb", "bd", "be",
  "bf", "bg", "bh", "bi", "bj", "bl", "bm", "bn", "bo", "bq", "br", "bs", "bt", "bv", "bw", "by", "bz", "ca", "cc", "cd",
  "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn", "co", "cp", "cr", "cu", "cv", "cw", "cx", "cy", "cz", "de", "dg", "dj",
  "dk", "dm", "do", "dz", "ec", "ee", "eg", "eh", "er", "es", "et", "eu", "fi", "fj", "fk", "fm", "fo", "fr", "ga", "gb",
  "gd", "ge", "gf", "gg", "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs", "gt", "gu", "gw", "gy", "hk", "hm", "hn",
  "hr", "ht", "hu", "ic", "id", "ie", "il", "im", "in", "io", "iq", "ir", "is", "it", "je", "jm", "jo", "jp", "ke", "kg",
  "kh", "ki", "km", "kn", "kp", "kr", "kw", "ky", "kz", "la", "lb", "lc", "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly",
  "ma", "mc", "md", "me", "mf", "mg", "mh", "mk", "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw",
  "mx", "my", "mz", "na", "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz", "om", "pa", "pe", "pf", "pg",
  "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py", "qa", "re", "ro", "rs", "ru", "rw", "sa", "sb", "sc", "sd",
  "se", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn", "so", "sr", "ss", "st", "sv", "sx", "sy", "sz", "tc", "td", "tf",
  "tg", "th", "tj", "tk", "tl", "tm", "tn", "to", "tr", "tt", "tv", "tw", "tz", "ua", "ug", "um", "un", "us", "uy", "uz",
  "va", "vc", "ve", "vg", "vi", "vn", "vu", "wf", "ws", "xk", "ye", "yt", "za", "zm", "zw",
] as const;
export type FlagCountry = (typeof FLAG_COUNTRIES)[number];
export const isFlagCountry = (value: unknown): value is FlagCountry => FLAG_COUNTRIES.some((code) => code === value);


export interface TankLook {
  /** The hull. */
  readonly colour: TankColour;
  readonly skin: TankSkin;
  /**
   * The pattern's colour. Always different from `colour`, also for "plain", where it is
   * not drawn, so switching from "plain" to a pattern never shows a pattern in the hull's own colour.
   */
  readonly second: TankColour;
  /** The rounded plate under the tank and behind it in lists; null for none. */
  readonly plate: TankColour | null;
  /** null shows the first one or two letters of the name instead. */
  readonly icon: TankIcon | null;
  /**
   * The country whose flag flies at the back of the tank; null for none. Its own key, not `flag`:
   * pages built before 2026-11-17 reject a look whose `flag` they cannot read (it held a two-colour
   * flag for one evening) and ignore a key they do not know, so an open old tab still loads.
   */
  readonly country: FlagCountry | null;
}

/** The colour after `colour`, wrapping 12 to 1. The second colour of a plain look. */
function nextColour(colour: TankColour): TankColour {
  // 1..11 become 2..12 and 12 becomes 1, so the cast stays inside TankColour.
  return ((colour % TANK_COLOUR_COUNT) + 1) as TankColour;
}

/** A plain look in one colour: no pattern, no plate, no icon. Bots and old stored arenas use it. */
export function plainTankLook(colour: TankColour): TankLook {
  return { colour, skin: "plain", second: nextColour(colour), plate: null, icon: null, country: null };
}

/**
 * The one check of a look that arrives as unknown data (a request body, a stored file,
 * the browser's own storage, the event stream). It returns a new object with exactly
 * the six fields (a missing flag reads as none), or null when any field is missing, unknown or out of range, or when
 * `second` equals `colour`.
 */
export function parseTankLook(value: unknown): TankLook | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { colour, skin, second, plate, icon, country: rawCountry } = value as Record<string, unknown>;
  if (!isTankColour(colour) || !isTankSkin(skin) || !isTankColour(second) || second === colour) return null;
  if (plate !== null && !isTankColour(plate)) return null;
  if (icon !== null && !isTankIcon(icon)) return null;
  // A look saved before country flags has no `country`: it has none. Its `flag` key, a two-colour
  // flag of the evening of 2026-11-16 that country flags replaced, is left out, so it still loads.
  const country = rawCountry === undefined || rawCountry === null ? null : isFlagCountry(rawCountry) ? rawCountry : undefined;
  if (country === undefined) return null;
  return { colour, skin, second, plate, icon, country };
}

// ---------------------------------------------------------------------------
// A player's name. One rule for every arena kind, the account's "My tank" and bots.
// ---------------------------------------------------------------------------

export const PLAYER_NAME_MIN = 3;
export const PLAYER_NAME_MAX = 16;
/** Words of ASCII letters and digits with one space between two words. */
const PLAYER_NAME_SHAPE = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/;
const SPACE_RUN = / {2,}/g;

/**
 * The name as it is stored, or null when it breaks the rule: 3 to 16 characters of the
 * letters A to Z in either case, the digits 0 to 9, and single spaces between words.
 * NFKC first maps full-width letters and digits to the plain ones; then the ends are
 * trimmed and a run of spaces inside becomes one space, so a typing slip is not an error.
 * "Name taken" compares the result without case (arena.ts). The server also refuses a
 * name with a blocked word (apps/server/src/name-filter.ts); that list stays on the server.
 */
export function parsePlayerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").trim().replace(SPACE_RUN, " ");
  if (name.length < PLAYER_NAME_MIN || name.length > PLAYER_NAME_MAX) return null;
  return PLAYER_NAME_SHAPE.test(name) ? name : null;
}

/** See the table of arena kinds at the top of this file. */
export type ArenaKind = "private" | "presenter" | "practice" | "tournament";
export const ARENA_KINDS = ["private", "presenter", "practice", "tournament"] as const satisfies readonly ArenaKind[];
export const isArenaKind = (value: unknown): value is ArenaKind => ARENA_KINDS.some((kind) => kind === value);

/** The arenas the server runs ("Play now"). */
export type PublicKind = "practice" | "tournament";
export const PUBLIC_KINDS = ["practice", "tournament"] as const satisfies readonly PublicKind[];
/** The one test for "a public arena"; it replaced every `kind === "public"`. */
export function isPublicKind(kind: ArenaKind): kind is PublicKind {
  return PUBLIC_KINDS.some((publicKind) => publicKind === kind);
}

/** Who can join an owner's arena. See ArenaSettings.joinPolicy. */
export type JoinPolicy = "anyone" | "account" | "verified";
export const JOIN_POLICIES = ["anyone", "account", "verified"] as const satisfies readonly JoinPolicy[];
export const isJoinPolicy = (value: unknown): value is JoinPolicy => JOIN_POLICIES.some((policy) => policy === value);
/** The one test for "a signed-in-only arena": a session per join, one seat per account, emails for the owner, bans. */
export function joinNeedsAccount(policy: JoinPolicy): boolean {
  return policy !== "anyone";
}

/** Which rule set each round plays under. See the table at the top of this file. */
export type RuleSetMode = "standard" | "announced" | "surprise";
export const RULE_SET_MODES = ["standard", "announced", "surprise"] as const satisfies readonly RuleSetMode[];
export const isRuleSetMode = (value: unknown): value is RuleSetMode => RULE_SET_MODES.some((mode) => mode === value);

export interface ArenaSettings {
  /** "" for a public arena; the client shows the translated name of its kind. 1 to 60 characters otherwise. */
  readonly name: string;
  readonly kind: ArenaKind;
  readonly ticksPerRound: number;
  /** Milliseconds between ticks on the live screen. */
  readonly tickMs: number;
  readonly ruleSetMode: RuleSetMode;
  /** Bots fill the seats up to seatsOf(settings).botsFillTo when a game starts. Always true for a public arena. */
  readonly botFill: boolean;
  /**
   * How many tanks a game has (owner, 2026-11-14): the most people who may join, and the number
   * bots fill to when botFill is on. A whole number in tankCountRange(kind) in a private or
   * presenter arena. null means the kind's fixed numbers (maxPlayersOf, botFillSizeOf): always in
   * a public arena, and in an owner's arena stored before version 8, which plays as it did then
   * until the owner sets a number in the lobby. seatsOf(settings) is the one reader.
   */
  readonly tankCount: number | null;
  /**
   * "Who can join" (owner, 2026-11-13). "account" and "verified" (a signed-in-only arena): a join
   * needs a session, an account holds one seat, and the owner sees each player's email and may
   * keep an account out (`banned`); "verified" also needs the account's email to be verified.
   * "anyone" in a public arena. Set when the
   * arena is created.
   */
  readonly joinPolicy: JoinPolicy;
}

export type PlayerStatus =
  | { readonly kind: "playing" }
  | { readonly kind: "eliminated"; readonly inRound: number; readonly finalRank: number }
  | { readonly kind: "winner" }
  /** Joined a public arena during a game; plays from the next game. */
  | { readonly kind: "waiting" }
  /**
   * The owner removed the player in a break: out of the game, kept only so the round history
   * keeps their name. The reset drops them. Never in a lobby or a public arena.
   */
  | { readonly kind: "removed" };

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  /** Never null: a player joins with the default preset, a bot with its own preset. */
  readonly strategy: Strategy;
  readonly status: PlayerStatus;
  /** A built-in opponent added by the server. It has no token. */
  readonly isBot: boolean;
  readonly look: TankLook;
  /** Tapped "I'm ready" in this lobby, or on the result before it, of a public arena. False everywhere else (see Ready above). */
  readonly ready: boolean;
}

export interface RoundSummary {
  /** 1 for the first round. */
  readonly round: number;
  readonly isFinal: boolean;
  readonly seed: number;
  readonly ruleSetId: RuleSetId;
  /** The players who started the round, best rank first. */
  readonly standings: readonly Standing[];
  /** Ids of the players who stay in the event after this round. For a final: the winner only. */
  readonly survivors: readonly PlayerId[];
}

/** The owner's plan for the next round, in a lobby or a break. See "Scheduled start" above. */
export type StartPlan =
  | { readonly kind: "waiting" }
  /** `startsAt`: milliseconds since 1970 on the server's clock. Clients count with PublicArena.auto, not with their own clock. */
  | { readonly kind: "scheduled"; readonly startsAt: number }
  /** The scheduled time came with too few players; the owner's page says so until the next plan. */
  | { readonly kind: "missed" };

export const WAITING: StartPlan = { kind: "waiting" };

export type ArenaPhase =
  | { readonly kind: "lobby"; readonly nextRuleSetId: RuleSetId | null; readonly start: StartPlan }
  | {
      readonly kind: "running";
      readonly round: number;
      readonly isFinal: boolean;
      readonly seed: number;
      readonly ruleSetId: RuleSetId;
      /** Ids of the players in this round. */
      readonly playerIds: readonly PlayerId[];
      readonly survivorsAfterRound: number | null;
    }
  | { readonly kind: "break"; readonly nextRound: number; readonly nextRuleSetId: RuleSetId | null; readonly start: StartPlan }
  /** `resultId`: the stored result (results-protocol.ts) of a private or presenter arena once the server wrote it; null before and in a public arena. */
  | { readonly kind: "finished"; readonly winnerId: PlayerId; readonly resultId: string | null };

/** An account the owner kept out of a signed-in-only arena. `name` is the tank's name when it was removed, for the owner's list. */
export interface BannedAccount {
  readonly accountId: AccountId;
  readonly name: string;
}

export interface Arena {
  readonly id: ArenaId;
  readonly settings: ArenaSettings;
  readonly players: readonly Player[];
  readonly phase: ArenaPhase;
  /** Completed rounds of the current game, oldest first. */
  readonly rounds: readonly RoundSummary[];
  /** 1 for the first game, raised by 1 at each reset. */
  readonly game: number;
  /**
   * Whether people may chat (docs/specs/revamp/72-arena-chat.md): "on" or "off" in a private or
   * presenter arena, set by the owner with setChat; null in a public arena, which has no chat.
   * The phase decides the rest: nobody posts while a round runs.
   */
  readonly chat: ChatSetting | null;
  /** Accounts that may not join again (signed-in-only arena only; empty elsewhere). Private: never in PublicArena. */
  readonly banned: readonly BannedAccount[];
}

/** A bot the server adds. Its id never collides with a player id (the server uses another prefix). */
export interface BotSeat {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly strategy: Strategy;
  readonly look: TankLook;
}

export type ArenaEvent =
  /** The status is derived from the phase: "playing" in the lobby, "waiting" otherwise. */
  | {
      readonly kind: "join";
      readonly playerId: PlayerId;
      readonly name: string;
      readonly strategy: Strategy;
      readonly look: TankLook;
    }
  | { readonly kind: "addBots"; readonly bots: readonly BotSeat[] }
  | { readonly kind: "removePlayers"; readonly playerIds: readonly PlayerId[] }
  | { readonly kind: "setLook"; readonly playerId: PlayerId; readonly look: TankLook }
  | { readonly kind: "setBotFill"; readonly botFill: boolean }
  | { readonly kind: "setTankCount"; readonly tankCount: number }
  /** `ready: false` takes it back (private and presenter arenas only). */
  | { readonly kind: "setReady"; readonly playerId: PlayerId; readonly ready: boolean }
  /** The owner's "Remove from arena". `ban`: the player's account, to keep it out (signed-in-only arena). */
  | { readonly kind: "ownerRemove"; readonly playerId: PlayerId; readonly ban: AccountId | null }
  | { readonly kind: "allowAgain"; readonly accountId: AccountId }
  /** `startsAt` on the server's clock; the server checks the allowed minutes. */
  | { readonly kind: "scheduleStart"; readonly startsAt: number }
  | { readonly kind: "cancelStart" }
  | { readonly kind: "startMissed" }
  | { readonly kind: "resultStored"; readonly resultId: string }
  /** The owner turns the chat on or off. The server checks that the owner sent it. */
  | { readonly kind: "setChat"; readonly on: boolean }
  | { readonly kind: "reset"; readonly nextRuleSetId: RuleSetId | null }
  | { readonly kind: "submitStrategy"; readonly playerId: PlayerId; readonly strategy: Strategy }
  | { readonly kind: "startRound"; readonly seed: number; readonly ruleSetId: RuleSetId }
  /** `nextRuleSetId` is the announcement for the next round: null in surprise mode and after a final. */
  | {
      readonly kind: "roundCompleted";
      readonly standings: readonly Standing[];
      readonly nextRuleSetId: RuleSetId | null;
    }
  /** The engine could not play the running round. */
  | { readonly kind: "roundAborted" };

export type ArenaError =
  | "wrong_phase"
  | "arena_full"
  | "name_taken"
  | "name_invalid"
  | "unknown_player"
  | "player_eliminated"
  | "not_enough_players"
  | "standings_mismatch"
  | "rule_set_mismatch"
  | "look_invalid"
  /** A ban in an arena that anyone may join, where nothing identifies a visitor reliably. */
  | "ban_unavailable"
  | "not_banned"
  /** A tank count outside tankCountRange(kind), or one for an arena whose numbers are fixed. */
  | "tank_count_invalid"
  /** A tank count below the people already in the arena. */
  | "tank_count_below_players";

export type ArenaResult =
  | { readonly ok: true; readonly arena: Arena }
  | { readonly ok: false; readonly error: ArenaError };

// ---------------------------------------------------------------------------
// Protocol: HTTP bodies and the server-sent event stream.
// ---------------------------------------------------------------------------

/** What every viewer may see. It leaves out strategies, which stay private. */
export interface PublicPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly status: PlayerStatus;
  readonly isBot: boolean;
  readonly look: TankLook;
  /** Meaningful in the lobby and the result of a public arena; false elsewhere. Ready on the result stays ready in the next lobby. */
  readonly ready: boolean;
}

/**
 * What the server will do by itself and when: start the next round or reset after the
 * final. `inMs` is measured at the moment the message is sent. Null when the server
 * waits for nobody's timer, which is always the case outside a public arena.
 */
export type AutoStep = { readonly action: "start" | "reset"; readonly inMs: number } | null;

export interface PublicArena {
  readonly id: ArenaId;
  readonly settings: ArenaSettings;
  readonly players: readonly PublicPlayer[];
  readonly phase: ArenaPhase;
  readonly rounds: readonly RoundSummary[];
  readonly game: number;
  readonly auto: AutoStep;
  /**
   * Public arenas only: the time until the next game's first round starts, measured when
   * the message is sent. In the lobby it equals `auto.inMs` while a countdown runs. In the
   * finished phase it is the result time left plus the full lobby countdown of the kind,
   * which holds when a human stays for the next game. Null while a game runs, in a lobby
   * without a countdown, and in private and presenter arenas.
   */
  readonly nextGameInMs: number | null;
  /** Arena.chat: null in a public arena. */
  readonly chat: ChatSetting | null;
}
// PublicArena leaves out Arena.banned: account ids are for the owner only (GET /api/arenas/:id/accounts).

/**
 * A bot as every viewer sees it. This is an allow-list: a field of BotState
 * reaches viewers only when it is named here. The mode a bot is in stays
 * private, because it shows opponents when a player's rules fire. Who may read the rules
 * themselves of a monthly tank: monthly-protocol.ts, the table at the top.
 */
export type PublicBot = Pick<
  BotState,
  "id" | "x" | "y" | "direction" | "score" | "wasHit" | "build" | "hitsLanded" | "hitsTaken" | "water" | "effect" | "ultimate" | "ultimateEffect"
> & ItemHand;

/**
 * A snapshot as every viewer sees it. A full Snapshot can be passed where this is expected.
 * `layout` maps the areas of a hybrid monthly board. Every other board has one `ruleSetId`.
 */
export interface PublicSnapshot
  extends Pick<Snapshot, "width" | "height" | "tick" | "ticksTotal" | "survivorsAfterRound" | "ruleSetId" | "items" | "layout"> {
  readonly bots: readonly PublicBot[];
}

/** A monthly tank's destination after the turn's moves (77-monthly-league.md, 2026-11-19). */
export interface FreshStart {
  readonly id: PlayerId;
  readonly x: number;
  readonly y: number;
}

/** One tick as every viewer sees it: moves and outcomes, without the rules behind them. */
export interface PublicTick {
  readonly tick: number;
  readonly order: readonly PlayerId[];
  readonly moves: readonly { readonly botId: PlayerId; readonly move: Move }[];
  readonly throws: readonly ThrowEvent[];
  /** Items taken on this tick (docs/specs/revamp/84-items.md). Every viewer sees an item on the board and on its tank. */
  readonly pickups: readonly Pickup[];
  readonly snapshot: PublicSnapshot;
  /** The items moved by each Magnet, in move order. */
  readonly magnetFires?: readonly MagnetFire[];
  /** Every ultimate fire in move order, including Magnet. */
  readonly fires?: readonly UltimateFire[];
  /** In tunnel order. The snapshot is from after the moves, before the tunnels. */
  readonly freshStarts?: readonly FreshStart[];
}

/**
 * Messages on GET /api/arenas/:id/events. Each is one server-sent event whose
 * `event` field is the `type` below and whose `data` is this object as JSON.
 */
export type StreamMessage =
  /** Sent on connect and after every change to the arena. */
  | { readonly type: "arena"; readonly arena: PublicArena }
  /**
   * Sent on connect while a round runs, and once when a round starts: the spawn state.
   * `startsInMs` is the pause before the first tick, measured when the message is sent,
   * so a client can count down while players find their tank. 0 once the ticks run.
   */
  | { readonly type: "roundStart"; readonly round: number; readonly snapshot: PublicSnapshot; readonly startsInMs: number }
  /**
   * `tick` is compact (compact-tick.ts): its indexes refer to the bots of this round's
   * roundStart snapshot, and expandTick turns it back into a PublicTick.
   * `own` is the connected player's decision, or null for a viewer without a player token.
   */
  | { readonly type: "tick"; readonly round: number; readonly tick: CompactTick; readonly own: Decision | null }
  /** Sent once before the server ends the stream of an arena that was closed or expired. */
  | { readonly type: "closed" }
  /**
   * A new chat line (chat-protocol.ts). Sent only to a stream opened with a player token of a
   * player in the arena or with the owner's session, never to a viewer. The history is not
   * sent on connect: the page reads GET /api/arenas/:id/chat.
   */
  | { readonly type: "chat"; readonly message: ChatMessage }
  /** The owner removed this player, and every chat line of the player is gone. Sent to the same streams as `chat`. */
  | { readonly type: "chatRemoved"; readonly playerId: PlayerId }
  /**
   * The connected player's own statistics (stats-protocol.ts): at a round's end just before the
   * arena message, and on connect while the game they belong to lasts. Only to a stream opened with
   * that player's token, never to a viewer or another player.
   */
  | { readonly type: "stats"; readonly stats: OwnStats };

/** Body of POST /api/arenas/:id/rounds/schedule. */
export interface ScheduleStartRequest {
  readonly minutes: StartDelayMinutes;
}
/** "Start in 1 / 2 / 3 / 5 minutes". */
export const START_DELAY_MINUTES = [1, 2, 3, 5] as const;
export type StartDelayMinutes = (typeof START_DELAY_MINUTES)[number];
export const isStartDelayMinutes = (value: unknown): value is StartDelayMinutes => START_DELAY_MINUTES.some((m) => m === value);

/** GET /api/arenas/:id/accounts (owner, signed-in-only arena): who is behind each seat, and who is kept out. Personal data: the owner only. */
export interface ArenaAccountsResponse {
  readonly players: readonly { readonly playerId: PlayerId; readonly email: string }[];
  /** `email` is null when the account no longer exists. */
  readonly banned: readonly { readonly accountId: AccountId; readonly name: string; readonly email: string | null }[];
}

export interface CreateArenaRequest {
  readonly kind: "private" | "presenter";
  readonly settings: Omit<ArenaSettings, "kind">;
}
export interface CreateArenaResponse {
  readonly arenaId: ArenaId;
}

export interface JoinRequest {
  /**
   * Any arena kind. Without it the server makes a two-word name, such as "Brave Otter".
   * A name that breaks parsePlayerName is 400 name_invalid; one with a blocked word is
   * 400 name_blocked with a `suggestion` in the ErrorResponse.
   */
  readonly name?: string;
  readonly look: TankLook;
}
export interface JoinResponse {
  readonly playerId: PlayerId;
  /** Secret. The browser stores it so a refresh keeps the player's slot. */
  readonly playerToken: string;
  /** The name as stored: the result of parsePlayerName, or the name the server made. */
  readonly name: string;
}

/** Body of PATCH /api/arenas/:id/players/me. */
export interface SetLookRequest {
  readonly look: TankLook;
}

/** Body of PATCH /api/arenas/:id/settings: exactly one setting per request. */
export type ArenaSettingsPatch = { readonly botFill: boolean } | { readonly tankCount: number };

/** The arena the signed-in account owns (at most one), or null. */
export interface OwnArenaResponse {
  readonly arena: { readonly id: ArenaId; readonly kind: ArenaKind; readonly name: string } | null;
}

/** Body of POST /api/public/seat. */
export interface PublicSeatRequest {
  readonly kind: PublicKind;
}
export interface PublicSeatResponse {
  readonly arenaId: ArenaId;
}

/** GET /api/health. */
export interface HealthResponse {
  readonly ok: true;
  /** When this server process started, ISO 8601 in UTC, from the server's clock. */
  readonly startedAt: string;
  /** The open arenas of every kind, public ones included. */
  readonly arenas: number;
}

/** Replay of a completed round, recomputed from its seed. */
export interface ReplayResponse {
  readonly round: number;
  readonly spawn: PublicSnapshot;
  /** Compact, indexed by the bots of `spawn` (expandTick). */
  readonly ticks: readonly CompactTick[];
  /** The requesting player's decisions, one per tick, or null for a viewer. */
  readonly own: readonly Decision[] | null;
}

/**
 * Codes an error answer of the arena routes can carry. The arena errors come from the
 * state machine. The others come from the routes:
 * - not_owner: a signed-in account that does not own the arena (403).
 * - arena_limit: the account already owns an open arena; `arenaId` names it (409).
 * - no_public_seat: every public arena is full and no new one may be made (503).
 * - rate_limited: too many requests from this address; `retryAfterSeconds` says how long to wait (429).
 * - name_blocked: the name holds a word of the server's block list; `suggestion` is a name
 *   the server made that is free in this arena (400). The page offers it instead.
 * - banned: the owner kept this account out of the arena (403).
 * - email_not_verified: a join in an arena whose joinPolicy is "verified" by an account whose
 *   email is not verified yet (403).
 * - mail_off: a new arena with joinPolicy "verified" on a server without mail settings, where
 *   no email can be verified, so nobody could join it (400). Also an AuthErrorCode.
 * The sign-in errors of auth.requireAccount (not_signed_in, bad_origin) use AuthErrorResponse.
 * The monthly routes use MonthlyErrorCode (monthly-protocol.ts).
 */
export type ArenaRouteErrorCode =
  | ArenaError
  | "not_owner"
  | "arena_limit"
  | "no_public_seat"
  | "rate_limited"
  | "name_blocked"
  | "banned"
  | "email_not_verified"
  | "mail_off";

export interface ErrorResponse {
  readonly error: string;
  /** Set when the client can branch on the reason. The chat routes use ChatErrorCode (chat-protocol.ts). */
  readonly code?: ArenaRouteErrorCode | ChatErrorCode | MonthlyErrorCode;
  /** Validation messages, for example from a rejected strategy. */
  readonly details?: readonly string[];
  /** With arena_limit: the arena the account already owns. */
  readonly arenaId?: ArenaId;
  /** With rate_limited; the Retry-After header carries the same number. */
  readonly retryAfterSeconds?: number;
  /** With the sign-in code code_wrong (auth-protocol.ts): wrong tries the code still allows. */
  readonly triesLeft?: number;
  /** With chat_too_fast and chat_busy: the wait before the next line passes. The Retry-After header carries it in whole seconds, rounded up. */
  readonly retryAfterMs?: number;
  /** With name_blocked: a name from the game to offer instead. */
  readonly suggestion?: string;
  /** On a 404 for an arena that ended: its last stored result (results-protocol.ts), when one is kept. */
  readonly resultId?: string;
}

// HTTP routes. A player token travels in the `Authorization: Bearer` header. "Account"
// means the session cookie of a signed-in account (see auth-protocol.ts); a request that
// changes state with the cookie must send an Origin header that matches the Host. No
// session is 401 not_signed_in; another account than the owner is 403 not_owner.
//
// POST   /api/arenas                               (account) CreateArenaRequest -> CreateArenaResponse; 409 arena_limit;
//                                                   400 mail_off for joinPolicy "verified" without mail settings
// GET    /api/account/arena                        (account) -> OwnArenaResponse
// GET    /api/arenas/:id                           -> PublicArena; 404 for an arena that does not exist, with
//                                                   `resultId` when it ended and its last result is kept
// GET    /api/arenas/:id/events[?token=player][&chat=0] -> text/event-stream of StreamMessage. `chat` and
//                                                   `chatRemoved` need the player token or the owner's session cookie;
//                                                   `chat=0` sends no chat at all, even with them (the big screen)
// POST   /api/arenas/:id/players                   JoinRequest -> JoinResponse (1,200 per minute per address).
//                                                   signed-in-only arena: (account) 401 not_signed_in, 403
//                                                   banned; joinPolicy "verified": 403 email_not_verified. An
//                                                   account with a seat here gets that seat back with a new
//                                                   token (any phase; the old token stops working); a seat the
//                                                   owner removed in a break is 409 wrong_phase
// POST   /api/arenas/:id/players/me/leave          (player token) -> 204, lobby only
// POST   /api/arenas/:id/players/me/ready          (player token) -> 204; readyIsOpen (409 wrong_phase). Ready on a
//                                                   public result carries into the next lobby
// DELETE /api/arenas/:id/players/me/ready          (player token) -> 204; takes ready back, private or presenter
//                                                   arena only (409 wrong_phase)
// PATCH  /api/arenas/:id/players/me                (player token) SetLookRequest -> 204; not while a round runs
// DELETE /api/arenas/:id/players/:playerId[?ban=1] (owner) -> 204; private or presenter arena, lobby or break
//                                                   (ownerRemove). The player's token stops working; without a
//                                                   ban they may join again. ban=1 needs a signed-in-only arena (400
//                                                   ban_unavailable). Their chat lines go too (`chatRemoved`)
// GET    /api/arenas/:id/accounts                  (owner) -> ArenaAccountsResponse; signed-in-only arena only (404)
// DELETE /api/arenas/:id/bans/:accountId           (owner) -> 204; allowAgain (404 not_banned)
// GET    /api/arenas/:id/players/me/strategy       (player token) -> StrategyInput
// PUT    /api/arenas/:id/players/me/strategy       (player token) StrategyInput -> 204
// POST   /api/arenas/:id/rounds                    (owner) -> 204; adds bots first when botFill is on in the lobby
// POST   /api/arenas/:id/rounds/schedule           (owner) ScheduleStartRequest -> 204; lobby or break, not public
// DELETE /api/arenas/:id/rounds/schedule           (owner) -> 204; cancels a scheduled start (409 wrong_phase)
// POST   /api/arenas/:id/reset                     (owner) -> 204; finished to lobby
// PATCH  /api/arenas/:id/settings                  (owner) ArenaSettingsPatch -> 204; lobby only. tankCount:
//                                                   400 tank_count_invalid, 409 tank_count_below_players
// DELETE /api/arenas/:id                           (owner) -> 204; sends `closed`, ends the streams, removes the arena
// GET    /api/arenas/:id/rounds/:round/replay      (optional player token) -> ReplayResponse, current game only
// GET    /api/arenas/:id/chat                      (player token, or owner) -> ChatHistoryResponse; also while a
//                                                   round runs. 404 no_chat in a public arena, 409 chat_off
// POST   /api/arenas/:id/chat                      (player token, or owner) ChatPostRequest -> 201 ChatMessage, and
//                                                   `chat` on the stream. 400 chat_text_invalid, 422
//                                                   chat_text_blocked, 409 chat_off or chat_closed (a round
//                                                   runs), 429 chat_too_fast or chat_busy with retryAfterMs
// PUT    /api/arenas/:id/chat                      (owner) ChatSettingRequest -> 204; any phase
// A chat call with a player token acts as that player; without one it needs the owner's
// session and acts as the host. The chat messages are described in chat-protocol.ts.
// POST   /api/public/seat                          PublicSeatRequest -> PublicSeatResponse (30 per minute per
//                                                   address); 503 no_public_seat. The tournament
//                                                   has one arena, returned even when it is full: its join is
//                                                   then 409 arena_full
// GET    /api/public                               -> PublicStatusResponse (public-protocol.ts)
// GET    /api/champions                            -> ChampionsResponse
// The monthly league's routes are listed in monthly-protocol.ts.
// GET    /api/account/strategies                   (account) -> AccountStrategiesResponse (the player's saved play styles)
// PUT    /api/account/strategies/:id               (account) PutAccountStrategyRequest -> 204
// DELETE /api/account/strategies/:id               (account) -> 204
// GET    /api/account/tank                         (account) -> AccountTankResponse ("My tank": name and look)
// GET    /api/results/:id                          -> ResultResponse (results-protocol.ts); emails with the owner's session
// GET    /api/account/results                      (account) -> AccountResultsResponse, the account's results, newest first
// PUT    /api/account/tank                         (account) AccountTank -> 204
// The play style routes and their errors are described in strategies-protocol.ts, the
// "My tank" routes and theirs in account-tank-protocol.ts.
//
// GET    /api/health                               -> HealthResponse, 200; no session, reads no file (for a
//                                                   proxy's or a monitor's check)
//
// The replay response is large (a 512-player replay of 300 turns is about 5.6 MB).
// The server sends it gzip-compressed when the request has `Accept-Encoding: gzip`.
