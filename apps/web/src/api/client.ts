// The typed HTTP client. Every call returns an ApiResult, so a caller cannot
// read the data without first handling the failure. The route list is at the
// bottom of packages/arena/src/types.ts.

import { notePageBuild } from "../app/pageBuild.ts";
import { isResultId, parseAccountStatsResponse, parsePlayerName, parseStatsView, parseTankLook, parseTournamentResult } from "@game/arena";
import type {
  TankLook,
  AccountStatsResponse,
  AccountResultsResponse,
  ArenaAccountsResponse,
  ResultResponse,
  ResultSummary,
  ScheduleStartRequest,
  StartDelayMinutes,
  AccountResponse,
  AuthCapabilities,
  MailLanguage,
  RegisterResponse,
  ResetPasswordRequest,
  ResetSendResponse,
  AccountTank,
  AccountTankResponse,
  AccountStrategiesResponse,
  AccountStrategy,
  ArenaId,
  ArenaSettingsPatch,
  ChampionsResponse,
  ChatHistoryResponse,
  ChatMessage,
  ChatPostRequest,
  ChatSettingRequest,
  CreateArenaRequest,
  CreateArenaResponse,
  ErrorResponse,
  JoinRequest,
  JoinResponse,
  LeagueDayRecord,
  LeagueDaysResponse,
  LeagueMonthRow,
  LeagueRankingResponse,
  DayNumbers,
  MonthTank,
  MonthTankRulesResponse,
  MonthTanksResponse,
  PublishedMonthsResponse,
  TankSheetResponse,
  LeagueRow,
  LeagueTodayRow,
  LoginRequest,
  MeResponse,
  MonthlyMeResponse,
  MonthlyOverviewResponse,
  MonthRecord,
  OwnArenaResponse,
  PublicAccount,
  PublicArena,
  PublicKind,
  PublicSeatRequest,
  PublicSeatResponse,
  PublicStatusResponse,
  PutAccountStrategyRequest,
  RegisterRequest,
  SetLookRequest,
  TakeSeatRequest,
  TournamentWinner,
} from "@game/arena";
import type { StrategyInput } from "@game/engine";
import { isChatHistoryResponse, isChatMessage } from "../chat/chatWire.ts";
import { isPublicArena as isPublicArenaShape } from "../stream/parseStreamMessage.ts";

/** Error codes the client itself produces. The server sends its own codes in ErrorResponse.error. */
export const CLIENT_ERROR = {
  network: "network_error",
  badResponse: "bad_response",
} as const;

/**
 * `status` is 0 when no response arrived. `code` names the failure when it has a
 * stable name: a CLIENT_ERROR value, or the `code` field of the server's body (an
 * ArenaRouteErrorCode or an AuthErrorCode). Some server answers (a 403 for a wrong
 * player token, a 404) carry no code, so the status decides there.
 */
export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  readonly error: ErrorResponse;
  readonly code: string | null;
}

export type ApiResult<T> = { readonly ok: true; readonly data: T } | ApiFailure;

type Guard<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isCreateArenaResponse: Guard<CreateArenaResponse> = (v): v is CreateArenaResponse =>
  isRecord(v) && typeof v["arenaId"] === "string";

const isJoinResponse: Guard<JoinResponse> = (v): v is JoinResponse =>
  isRecord(v) && typeof v["playerId"] === "string" && typeof v["playerToken"] === "string" && typeof v["name"] === "string";

const isPublicAccount = (v: unknown): v is PublicAccount =>
  isRecord(v) && typeof v["id"] === "string" && typeof v["email"] === "string" && typeof v["emailVerified"] === "boolean";

const isAccountResponse: Guard<AccountResponse> = (v): v is AccountResponse => isRecord(v) && isPublicAccount(v["account"]);

const isRegisterResponse: Guard<RegisterResponse> = (v): v is RegisterResponse =>
  isRecord(v) && isPublicAccount(v["account"]) && (v["verificationEmail"] === "sent" || v["verificationEmail"] === "failed" || v["verificationEmail"] === "off");

const isAuthCapabilities: Guard<AuthCapabilities> = (v): v is AuthCapabilities => isRecord(v) && typeof v["canSendEmail"] === "boolean";

const isResetSendResponse: Guard<ResetSendResponse> = (v): v is ResetSendResponse => isRecord(v) && v["accepted"] === true;

const isMeResponse: Guard<MeResponse> = (v): v is MeResponse =>
  isRecord(v) && (v["account"] === null || isPublicAccount(v["account"]));

const isOwnArenaResponse: Guard<OwnArenaResponse> = (v): v is OwnArenaResponse => {
  if (!isRecord(v)) return false;
  const arena = v["arena"];
  return arena === null || (isRecord(arena) && typeof arena["id"] === "string" && typeof arena["kind"] === "string" && typeof arena["name"] === "string");
};

const isPublicSeatResponse: Guard<PublicSeatResponse> = (v): v is PublicSeatResponse =>
  isRecord(v) && typeof v["arenaId"] === "string";

const isPublicArena: Guard<PublicArena> = (v): v is PublicArena => isPublicArenaShape(v);

// Shallow on purpose: the server validated the strategy when it stored it, and the
// editor shows any remaining problem as a validation message.
const isStrategyInput: Guard<StrategyInput> = (v): v is StrategyInput =>
  isRecord(v) && Array.isArray(v["modes"]) && isRecord(v["build"]);

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!isRecord(value) || typeof value["error"] !== "string") return false;
  const details = value["details"];
  return details === undefined || (Array.isArray(details) && details.every((d) => typeof d === "string"));
}

function clientFailure(status: number, code: (typeof CLIENT_ERROR)[keyof typeof CLIENT_ERROR]): ApiFailure {
  return { ok: false, status, error: { error: code }, code };
}

interface RequestOptions<T> {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly bearerToken?: string;
  readonly body?: unknown;
  /** Absent for a 204 response, which has no body to read. */
  readonly guard?: Guard<T>;
}

async function request<T>(options: RequestOptions<T>): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (options.bearerToken !== undefined) headers["Authorization"] = `Bearer ${options.bearerToken}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(options.path, {
      method: options.method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    return clientFailure(0, CLIENT_ERROR.network);
  }
  notePageBuild(response.headers.get("x-page-build"));

  let payload: unknown = undefined;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      return clientFailure(response.status, CLIENT_ERROR.badResponse);
    }
  }

  if (!response.ok) {
    if (isErrorResponse(payload)) {
      const rawCode = (payload as { code?: unknown }).code;
      const code = typeof rawCode === "string" ? rawCode : null;
      return { ok: false, status: response.status, error: payload, code };
    }
    return clientFailure(response.status, CLIENT_ERROR.badResponse);
  }

  if (options.guard === undefined) return { ok: true, data: undefined as T };
  if (!options.guard(payload)) return clientFailure(response.status, CLIENT_ERROR.badResponse);
  return { ok: true, data: payload };
}

const arenaPath = (arenaId: ArenaId) => `/api/arenas/${encodeURIComponent(arenaId)}`;

export function createArena(body: CreateArenaRequest): Promise<ApiResult<CreateArenaResponse>> {
  return request({ method: "POST", path: "/api/arenas", body, guard: isCreateArenaResponse });
}

export function getArena(arenaId: ArenaId): Promise<ApiResult<PublicArena>> {
  return request({ method: "GET", path: arenaPath(arenaId), guard: isPublicArena });
}

export function joinArena(arenaId: ArenaId, body: JoinRequest): Promise<ApiResult<JoinResponse>> {
  return request({ method: "POST", path: `${arenaPath(arenaId)}/players`, body, guard: isJoinResponse });
}

export function getMyStrategy(arenaId: ArenaId, playerToken: string): Promise<ApiResult<StrategyInput>> {
  return request({
    method: "GET",
    path: `${arenaPath(arenaId)}/players/me/strategy`,
    bearerToken: playerToken,
    guard: isStrategyInput,
  });
}

export function saveMyStrategy(arenaId: ArenaId, playerToken: string, strategy: StrategyInput): Promise<ApiResult<void>> {
  return request<void>({
    method: "PUT",
    path: `${arenaPath(arenaId)}/players/me/strategy`,
    bearerToken: playerToken,
    body: strategy,
  });
}

// Owner routes. The session cookie authorizes them: fetch sends it to the same origin,
// and the browser adds the Origin header the server compares with the host.

export function startRound(arenaId: ArenaId): Promise<ApiResult<void>> {
  return request<void>({ method: "POST", path: `${arenaPath(arenaId)}/rounds` });
}

/** After the final: a new game with the same people. */
export function resetArena(arenaId: ArenaId): Promise<ApiResult<void>> {
  return request<void>({ method: "POST", path: `${arenaPath(arenaId)}/reset` });
}

export function setBotFill(arenaId: ArenaId, botFill: boolean): Promise<ApiResult<void>> {
  const body: ArenaSettingsPatch = { botFill };
  return request<void>({ method: "PATCH", path: `${arenaPath(arenaId)}/settings`, body });
}

/** The owner's "Number of tanks" in the lobby; the server refuses a number below the people in the arena. */
export function setTankCount(arenaId: ArenaId, tankCount: number): Promise<ApiResult<void>> {
  const body: ArenaSettingsPatch = { tankCount };
  return request<void>({ method: "PATCH", path: `${arenaPath(arenaId)}/settings`, body });
}

export function closeArena(arenaId: ArenaId): Promise<ApiResult<void>> {
  return request<void>({ method: "DELETE", path: arenaPath(arenaId) });
}

// Player routes, with the player token.

export function leaveArena(arenaId: ArenaId, playerToken: string): Promise<ApiResult<void>> {
  return request<void>({ method: "POST", path: `${arenaPath(arenaId)}/players/me/leave`, bearerToken: playerToken });
}

export function setMyLook(arenaId: ArenaId, playerToken: string, body: SetLookRequest): Promise<ApiResult<void>> {
  return request<void>({ method: "PATCH", path: `${arenaPath(arenaId)}/players/me`, bearerToken: playerToken, body });
}

/**
 * The owner removes a player in the lobby or a break of a private or presenter arena. `ban`
 * keeps the player's account out (a signed-in-only arena; the server answers ban_unavailable elsewhere).
 */
export function removePlayer(arenaId: ArenaId, playerId: string, ban = false): Promise<ApiResult<void>> {
  return request<void>({ method: "DELETE", path: `${arenaPath(arenaId)}/players/${encodeURIComponent(playerId)}${ban ? "?ban=1" : ""}` });
}

/** "Start in 1 / 2 / 3 / 5 minutes" (owner). */
export function scheduleStart(arenaId: ArenaId, minutes: StartDelayMinutes): Promise<ApiResult<void>> {
  const body: ScheduleStartRequest = { minutes };
  return request<void>({ method: "POST", path: `${arenaPath(arenaId)}/rounds/schedule`, body });
}

export function cancelScheduledStart(arenaId: ArenaId): Promise<ApiResult<void>> {
  return request<void>({ method: "DELETE", path: `${arenaPath(arenaId)}/rounds/schedule` });
}

const isEmailRow = (v: unknown): v is { playerId: string; email: string } => isRecord(v) && typeof v["playerId"] === "string" && typeof v["email"] === "string";

const isArenaAccountsResponse: Guard<ArenaAccountsResponse> = (v): v is ArenaAccountsResponse =>
  isRecord(v) &&
  Array.isArray(v["players"]) &&
  v["players"].every(isEmailRow) &&
  Array.isArray(v["banned"]) &&
  v["banned"].every((b) => isRecord(b) && typeof b["accountId"] === "string" && typeof b["name"] === "string" && (b["email"] === null || typeof b["email"] === "string"));

/** The owner's private view of a signed-in-only arena: each seat's email and who is kept out. */
export function getArenaAccounts(arenaId: ArenaId): Promise<ApiResult<ArenaAccountsResponse>> {
  return request({ method: "GET", path: `${arenaPath(arenaId)}/accounts`, guard: isArenaAccountsResponse });
}

/** "Allow again" for an account the owner kept out. */
export function allowAgain(arenaId: ArenaId, accountId: string): Promise<ApiResult<void>> {
  return request<void>({ method: "DELETE", path: `${arenaPath(arenaId)}/bans/${encodeURIComponent(accountId)}` });
}

// Stored results (packages/arena/src/results-protocol.ts). The result goes through the one validator.

const isResultResponse: Guard<ResultResponse> = (v): v is ResultResponse =>
  isRecord(v) && parseTournamentResult(v["result"]).ok && (v["emails"] === null || (Array.isArray(v["emails"]) && v["emails"].every(isEmailRow)));

export function getResult(resultId: string): Promise<ApiResult<ResultResponse>> {
  return request({ method: "GET", path: `/api/results/${encodeURIComponent(resultId)}`, guard: isResultResponse });
}

const isResultSummary = (v: unknown): v is ResultSummary =>
  isRecord(v) &&
  isResultId(v["id"]) &&
  typeof v["arenaName"] === "string" &&
  (v["kind"] === "private" || v["kind"] === "presenter") &&
  typeof v["finishedAt"] === "number" &&
  typeof v["game"] === "number" &&
  typeof v["winnerName"] === "string" &&
  parseTankLook(v["winnerLook"]) !== null &&
  typeof v["players"] === "number" &&
  typeof v["rounds"] === "number";

const isAccountResultsResponse: Guard<AccountResultsResponse> = (v): v is AccountResultsResponse =>
  isRecord(v) && Array.isArray(v["results"]) && v["results"].every(isResultSummary);

/** "My results": the signed-in owner's stored results, newest first. */
export function getAccountResults(): Promise<ApiResult<AccountResultsResponse>> {
  return request({ method: "GET", path: "/api/account/results", guard: isAccountResultsResponse });
}

// Arena chat (packages/arena/src/chat-protocol.ts). A player calls with the token, the owner on
// the host page with the session; a request with a token is always the player, so the host page
// sends none. chat/useArenaChat.ts is the only caller.

/** Who calls a chat route. */
export type ChatCaller = { readonly kind: "player"; readonly token: string } | { readonly kind: "host" };

const chatAuth = (caller: ChatCaller) => (caller.kind === "player" ? { bearerToken: caller.token } : {});

export function getChat(arenaId: ArenaId, caller: ChatCaller): Promise<ApiResult<ChatHistoryResponse>> {
  return request({ method: "GET", path: `${arenaPath(arenaId)}/chat`, ...chatAuth(caller), guard: isChatHistoryResponse });
}

/** `text` must be the result of parseChatText. */
export function postChat(arenaId: ArenaId, caller: ChatCaller, text: string): Promise<ApiResult<ChatMessage>> {
  const body: ChatPostRequest = { text };
  return request({ method: "POST", path: `${arenaPath(arenaId)}/chat`, ...chatAuth(caller), body, guard: isChatMessage });
}

/** The owner turns the chat on or off, in any phase. */
export function setChatOn(arenaId: ArenaId, on: boolean): Promise<ApiResult<void>> {
  const body: ChatSettingRequest = { on };
  return request<void>({ method: "PUT", path: `${arenaPath(arenaId)}/chat`, body });
}

/** The room of a public arena kind to join ("Play now"). The tournament has one room, returned even when it is full. */
export function publicSeat(kind: PublicKind): Promise<ApiResult<PublicSeatResponse>> {
  const body: PublicSeatRequest = { kind };
  return request({ method: "POST", path: "/api/public/seat", body, guard: isPublicSeatResponse });
}

/** "I'm ready" where ready is open (readyIsOpen); `false` takes it back, in a private or presenter arena only. */
export function setReady(arenaId: ArenaId, playerToken: string, ready = true): Promise<ApiResult<void>> {
  return request<void>({ method: ready ? "POST" : "DELETE", path: `${arenaPath(arenaId)}/players/me/ready`, bearerToken: playerToken });
}

// The public arenas' status, the monthly league and the champions (packages/arena/src/public-protocol.ts,
// monthly-protocol.ts).
// The pages show names and looks from these answers, so the guards check each row, not only the outer shape.

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumberOrNull = (v: unknown): v is number | null => v === null || isNumber(v);
const MONTH_ID = /^\d{4}-(0[1-9]|1[0-2])$/;
const isMonthId = (v: unknown): v is string => typeof v === "string" && MONTH_ID.test(v);
/** The chooser and the champions page draw the name and the tank, so both must be what the arena allows. */
const hasNameAndLook = (v: Record<string, unknown>): boolean => typeof v["name"] === "string" && v["name"] !== "" && parseTankLook(v["look"]) !== null;

const isLeagueRow = (v: unknown): v is LeagueRow =>
  isRecord(v) && isNumber(v["rank"]) && v["rank"] >= 1 && hasNameAndLook(v) && isNumber(v["score"]) && isNumber(v["games"]) && isNumber(v["wins"]);

const isTournamentWinner = (v: unknown): v is TournamentWinner =>
  isRecord(v) && hasNameAndLook(v) && typeof v["wonAt"] === "string" && !Number.isNaN(Date.parse(v["wonAt"])) && isNumber(v["tanks"]);

const isMonthRecord = (v: unknown): v is MonthRecord =>
  isRecord(v) && isMonthId(v["month"]) && isLeagueRow(v["champion"]) && Array.isArray(v["top"]) && v["top"].every(isLeagueRow);

const TOURNAMENT_PHASES: readonly unknown[] = ["lobby", "running", "break", "finished"];

const isPublicStatusResponse: Guard<PublicStatusResponse> = (v): v is PublicStatusResponse => {
  if (!isRecord(v)) return false;
  const practice = v["practice"];
  const tournament = v["tournament"];
  const monthly = v["monthly"];
  if (!isRecord(practice) || !isRecord(tournament) || !isRecord(monthly)) return false;
  return (
    isNumber(practice["humans"]) &&
    TOURNAMENT_PHASES.includes(tournament["phase"]) &&
    isNumber(tournament["humans"]) &&
    isNumberOrNull(tournament["startsInMs"]) &&
    isNumberOrNull(tournament["round"]) &&
    Array.isArray(tournament["recentWinners"]) &&
    tournament["recentWinners"].every(isTournamentWinner) &&
    isMonthId(monthly["month"]) &&
    isNumber(monthly["tanks"]) &&
    isNumber(monthly["leagues"]) &&
    (monthly["lastChampion"] === null || isMonthRecord(monthly["lastChampion"]))
  );
};

const isLeagueTodayRow = (v: unknown): v is LeagueTodayRow =>
  isRecord(v) && isNumber(v["rank"]) && typeof v["seatId"] === "string" && hasNameAndLook(v) && isNumber(v["points"]) && typeof v["counts"] === "boolean" && typeof v["seated"] === "boolean" && typeof v["livePoints"] === "boolean" && typeof v["gm"] === "boolean";

const isLeagueMonthRow = (v: unknown): v is LeagueMonthRow =>
  isRecord(v) && isNumberOrNull(v["rank"]) && typeof v["seatId"] === "string" && hasNameAndLook(v) && isNumber(v["score"]) && isNumber(v["countedDays"]) && typeof v["gm"] === "boolean";

const isLeagueRankingResponse: Guard<LeagueRankingResponse> = (v): v is LeagueRankingResponse =>
  isRecord(v) &&
  isNumber(v["league"]) &&
  isMonthId(v["month"]) &&
  typeof v["day"] === "string" &&
  Array.isArray(v["today"]) &&
  v["today"].every(isLeagueTodayRow) &&
  Array.isArray(v["thisMonth"]) &&
  v["thisMonth"].every(isLeagueMonthRow);

const isChampionsResponse: Guard<ChampionsResponse> = (v): v is ChampionsResponse =>
  isRecord(v) && Array.isArray(v["months"]) && v["months"].every(isMonthRecord) && Array.isArray(v["tournamentWinners"]) && v["tournamentWinners"].every(isTournamentWinner);

/** One status line per public arena kind, for the chooser on /play. */
export function getPublicStatus(): Promise<ApiResult<PublicStatusResponse>> {
  return request({ method: "GET", path: "/api/public", guard: isPublicStatusResponse });
}

/** A league's ranking of today and of this month (League 1 is the top league). */
export function getLeagueRanking(league: number): Promise<ApiResult<LeagueRankingResponse>> {
  return request({ method: "GET", path: `/api/monthly/leagues/${league}/ranking`, guard: isLeagueRankingResponse });
}

// What anyone may read about a tank (the visibility table in monthly-protocol.ts).
const isDayNumbers = (v: unknown): v is DayNumbers =>
  isRecord(v) && isNumber(v["turns"]) && isNumber(v["shots"]) && isNumber(v["hits"]) && isNumber(v["timesHit"]) && isNumber(v["squaresMoved"]);

const isTankSheetResponse: Guard<TankSheetResponse> = (v): v is TankSheetResponse =>
  isRecord(v) &&
  typeof v["seatId"] === "string" &&
  (v["rules"] === null || isStrategyInput(v["rules"])) &&
  (v["lastDay"] === null || (isRecord(v["lastDay"]) && isDayId(v["lastDay"]["day"]) && isDayNumbers(v["lastDay"]["numbers"])));

const isPublishedMonthsResponse: Guard<PublishedMonthsResponse> = (v): v is PublishedMonthsResponse => isRecord(v) && Array.isArray(v["months"]) && v["months"].every(isMonthId);

const isMonthTank = (v: unknown): v is MonthTank =>
  isRecord(v) && typeof v["seatId"] === "string" && isNumber(v["league"]) && isNumberOrNull(v["rank"]) && hasNameAndLook(v) && typeof v["gm"] === "boolean";

const isMonthTanksResponse: Guard<MonthTanksResponse> = (v): v is MonthTanksResponse => isRecord(v) && isMonthId(v["month"]) && Array.isArray(v["tanks"]) && v["tanks"].every(isMonthTank);

const isMonthTankRulesResponse: Guard<MonthTankRulesResponse> = (v): v is MonthTankRulesResponse => isRecord(v) && isStrategyInput(v["rules"]);

/** A seated tank's last finished day, and the rules of a game master's tank. */
export function getTankSheet(seatId: string): Promise<ApiResult<TankSheetResponse>> {
  return request({ method: "GET", path: `/api/monthly/tanks/${encodeURIComponent(seatId)}`, guard: isTankSheetResponse });
}

/** The closed months whose tanks' rules are open, the newest first. */
export function getPublishedMonths(): Promise<ApiResult<PublishedMonthsResponse>> {
  return request({ method: "GET", path: "/api/monthly/months", guard: isPublishedMonthsResponse });
}

export function getMonthTanks(month: string): Promise<ApiResult<MonthTanksResponse>> {
  return request({ method: "GET", path: `/api/monthly/months/${encodeURIComponent(month)}`, guard: isMonthTanksResponse });
}

export function getMonthTankRules(month: string, seatId: string): Promise<ApiResult<MonthTankRulesResponse>> {
  return request({ method: "GET", path: `/api/monthly/months/${encodeURIComponent(month)}/tanks/${encodeURIComponent(seatId)}`, guard: isMonthTankRulesResponse });
}

const LEAGUE_PHASES: readonly unknown[] = ["idle", "withBot", "withoutBot", "closing"];
const DAY_ID = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;
const isDayId = (v: unknown): v is string => typeof v === "string" && DAY_ID.test(v);

const isMonthlyOverview: Guard<MonthlyOverviewResponse> = (v): v is MonthlyOverviewResponse =>
  isRecord(v) &&
  isMonthId(v["month"]) &&
  isDayId(v["day"]) &&
  isNumber(v["dayEndsInMs"]) &&
  Array.isArray(v["leagues"]) &&
  v["leagues"].length >= 1 &&
  v["leagues"].every((l) => isRecord(l) && isNumber(l["league"]) && isNumber(l["tanks"]) && LEAGUE_PHASES.includes(l["phase"])) &&
  (v["lastChampion"] === null || isMonthRecord(v["lastChampion"]));

const isLeagueDayRecord = (v: unknown): v is LeagueDayRecord =>
  isRecord(v) && isDayId(v["day"]) && isNumber(v["league"]) && Array.isArray(v["top"]) && v["top"].every((p) => isRecord(p) && hasNameAndLook(p) && isNumber(p["points"]));

const isLeagueDays: Guard<LeagueDaysResponse> = (v): v is LeagueDaysResponse => isRecord(v) && isMonthId(v["month"]) && Array.isArray(v["days"]) && v["days"].every(isLeagueDayRecord);

const isMonthlySeat = (v: unknown): boolean =>
  isRecord(v) &&
  typeof v["seatId"] === "string" &&
  isNumber(v["league"]) &&
  hasNameAndLook(v) &&
  isNumber(v["points"]) &&
  typeof v["countsToday"] === "boolean" &&
  isNumber(v["countedDays"]) &&
  isNumber(v["score"]) &&
  isNumberOrNull(v["rank"]) &&
  isStrategyInput(v["strategy"]) &&
  // The card draws these numbers and mode names (stats-protocol.ts has the one check).
  parseStatsView(v["stats"]) !== null;

const isMonthlyMe: Guard<MonthlyMeResponse> = (v): v is MonthlyMeResponse => {
  if (!isRecord(v)) return false;
  const { seat, name, move } = v;
  const nameOk = name === null || (isRecord(name) && typeof name["name"] === "string" && isMonthId(name["month"]) && typeof name["canChange"] === "boolean");
  const moveOk = move === null || (isRecord(move) && isMonthId(move["month"]) && isNumber(move["from"]) && isNumber(move["to"]) && (move["kind"] === "up" || move["kind"] === "down" || move["kind"] === "stayed"));
  return (seat === null || isMonthlySeat(seat)) && nameOk && moveOk;
};

/** The leagues with their live numbers, the day and the last champion. */
export function getMonthlyOverview(): Promise<ApiResult<MonthlyOverviewResponse>> {
  return request({ method: "GET", path: "/api/monthly", guard: isMonthlyOverview });
}

/** This month's finished days of a league, newest first ("Juara hari ini"). */
export function getLeagueDays(league: number): Promise<ApiResult<LeagueDaysResponse>> {
  return request({ method: "GET", path: `/api/monthly/leagues/${league}/days`, guard: isLeagueDays });
}

/** The signed-in account's seat, its name of the month and the month close's move. */
export function getMonthlyMe(): Promise<ApiResult<MonthlyMeResponse>> {
  return request({ method: "GET", path: "/api/monthly/me", guard: isMonthlyMe });
}

export function takeMonthlySeat(body: TakeSeatRequest): Promise<ApiResult<MonthlyMeResponse>> {
  return request({ method: "POST", path: "/api/monthly/seat", body, guard: isMonthlyMe });
}

/** "Change rules": the seated tank plays these rules at once; its seat and points stay. */
export function putMonthlyStrategy(strategy: StrategyInput): Promise<ApiResult<void>> {
  return request<void>({ method: "PUT", path: "/api/monthly/strategy", body: { strategy } });
}

/** "Change look": the seated tank takes this look; its name and points stay. */
export function putMonthlyLook(look: TankLook): Promise<ApiResult<void>> {
  return request<void>({ method: "PUT", path: "/api/monthly/look", body: { look } });
}

export function quitMonthlySeat(): Promise<ApiResult<void>> {
  return request<void>({ method: "DELETE", path: "/api/monthly/seat" });
}

/** The month close's move has been shown, so it does not show again. */
export function markMonthlyMoveSeen(): Promise<ApiResult<void>> {
  return request<void>({ method: "POST", path: "/api/monthly/me/move-seen" });
}

/** The address of a league's event stream (monthly-protocol.ts LeagueStreamMessage). */
export function leagueEventsUrl(league: number): string {
  return `/api/monthly/leagues/${league}/events`;
}

export function getChampions(): Promise<ApiResult<ChampionsResponse>> {
  return request({ method: "GET", path: "/api/champions", guard: isChampionsResponse });
}

// Accounts (packages/arena/src/auth-protocol.ts).

export function register(body: RegisterRequest): Promise<ApiResult<RegisterResponse>> {
  return request({ method: "POST", path: "/api/auth/register", body, guard: isRegisterResponse });
}

/** Whether this server can send email, so the pages offer the code steps or say why not. */
export function getAuthCapabilities(): Promise<ApiResult<AuthCapabilities>> {
  return request({ method: "GET", path: "/api/auth/capabilities", guard: isAuthCapabilities });
}

/** A new verification code for the signed-in account, written in `language`. */
export function sendVerificationCode(language: MailLanguage): Promise<ApiResult<void>> {
  return request<void>({ method: "POST", path: "/api/auth/verify/send", body: { language } });
}

export function verifyEmail(code: string): Promise<ApiResult<AccountResponse>> {
  return request({ method: "POST", path: "/api/auth/verify", body: { code }, guard: isAccountResponse });
}

/** Always answers the same for a valid email, so the page cannot tell whether it has an account. */
export function sendResetCode(email: string, language: MailLanguage): Promise<ApiResult<ResetSendResponse>> {
  return request({ method: "POST", path: "/api/auth/reset/send", body: { email, language }, guard: isResetSendResponse });
}

/** Sets the new password and signs this browser in; every other session of the account ends. */
export function resetPassword(body: ResetPasswordRequest): Promise<ApiResult<AccountResponse>> {
  return request({ method: "POST", path: "/api/auth/reset", body, guard: isAccountResponse });
}

export function login(body: LoginRequest): Promise<ApiResult<AccountResponse>> {
  return request({ method: "POST", path: "/api/auth/login", body, guard: isAccountResponse });
}

export function logout(): Promise<ApiResult<void>> {
  return request<void>({ method: "POST", path: "/api/auth/logout" });
}

export function getMe(): Promise<ApiResult<MeResponse>> {
  return request({ method: "GET", path: "/api/auth/me", guard: isMeResponse });
}

/** The arena the signed-in account owns, or null. 401 when nobody is signed in. */
export function getOwnArena(): Promise<ApiResult<OwnArenaResponse>> {
  return request({ method: "GET", path: "/api/account/arena", guard: isOwnArenaResponse });
}

// The account's play styles, built in the tank workshop (packages/arena/src/strategies-protocol.ts).
// workshop/library.ts is the only caller.

// Shallow on the strategy, as isStrategyInput is: the server checked it before storing it.
const isAccountStrategy = (v: unknown): v is AccountStrategy =>
  isRecord(v) && typeof v["id"] === "string" && typeof v["name"] === "string" && typeof v["updatedAt"] === "number" && isStrategyInput(v["strategy"]);

const isAccountStrategiesResponse: Guard<AccountStrategiesResponse> = (v): v is AccountStrategiesResponse =>
  isRecord(v) && Array.isArray(v["strategies"]) && v["strategies"].every(isAccountStrategy);

const accountStrategyPath = (id: string) => `/api/account/strategies/${encodeURIComponent(id)}`;

export function getAccountStrategies(): Promise<ApiResult<AccountStrategiesResponse>> {
  return request({ method: "GET", path: "/api/account/strategies", guard: isAccountStrategiesResponse });
}

export function putAccountStrategy(strategy: AccountStrategy): Promise<ApiResult<void>> {
  const body: PutAccountStrategyRequest = { name: strategy.name, strategy: strategy.strategy, updatedAt: strategy.updatedAt };
  return request<void>({ method: "PUT", path: accountStrategyPath(strategy.id), body });
}

export function deleteAccountStrategy(id: string): Promise<ApiResult<void>> {
  return request<void>({ method: "DELETE", path: accountStrategyPath(id) });
}

// "My tank" in the account (packages/arena/src/account-tank-protocol.ts). mytank/myTank.ts is the only caller.

const isAccountTank = (v: unknown): v is AccountTank =>
  isRecord(v) && parsePlayerName(v["name"]) !== null && parseTankLook(v["look"]) !== null && typeof v["updatedAt"] === "number";

const isAccountTankResponse: Guard<AccountTankResponse> = (v): v is AccountTankResponse => isRecord(v) && (v["tank"] === null || isAccountTank(v["tank"]));

export function getAccountTank(): Promise<ApiResult<AccountTankResponse>> {
  return request({ method: "GET", path: "/api/account/tank", guard: isAccountTankResponse });
}

/** The signed-in account's statistics over time ("My tank"). */
export function getAccountStats(): Promise<ApiResult<AccountStatsResponse>> {
  return request({ method: "GET", path: "/api/account/stats", guard: (v): v is AccountStatsResponse => parseAccountStatsResponse(v) !== null });
}

export function putAccountTank(tank: AccountTank): Promise<ApiResult<void>> {
  return request<void>({ method: "PUT", path: "/api/account/tank", body: tank });
}
