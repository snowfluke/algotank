// Shared by the server tests: a manual clock and scheduler, a JSON client that can carry
// a session cookie, account and arena helpers, and an event-stream reader.

import type {
  CreateArenaRequest,
  CreateArenaResponse,
  JoinResponse,
  PublicArena,
  StreamMessage,
  TankLook,
} from "@game/arena";
import { plainTankLook } from "@game/arena";
import { startServer, type RunningServer, type ServerOptions } from "./server.ts";
import type { Scheduler } from "./timers.ts";

export interface ManualScheduler extends Scheduler {
  /** The clock of this scheduler. Pass it as the server's `now`. */
  now(): number;
  /** Runs the one-shot timers that are due now, then every repeating timer once. */
  tick(): void;
  /** Moves the clock forward and runs the one-shot timers that come due, in time order. Repeating timers do not run. */
  advance(ms: number): void;
  /** Repeating timers that are active, such as the tick timer of a running round. */
  activeCount(): number;
}

/**
 * A scheduler the test drives by hand, so a round or a public arena cycle plays without
 * waiting. Repeating timers run on tick(), one-shot timers when advance() or tick() reach them.
 */
export function manualScheduler(start = Date.parse("2026-11-11T09:00:00Z")): ManualScheduler {
  let time = start;
  let order = 0;
  const repeating = new Set<() => void>();
  const once = new Map<number, { readonly at: number; readonly run: () => void }>();

  const runDue = () => {
    for (;;) {
      let next: [number, { at: number; run: () => void }] | undefined;
      for (const entry of once) if (entry[1].at <= time && (next === undefined || entry[1].at < next[1].at)) next = entry;
      if (next === undefined) return;
      once.delete(next[0]);
      next[1].run();
    }
  };

  return {
    every(run) {
      // A new function per timer, so two timers with the same callback stay apart.
      const job = () => run();
      repeating.add(job);
      return () => repeating.delete(job);
    },
    after(run, afterMs) {
      const id = order++;
      once.set(id, { at: time + afterMs, run });
      return () => once.delete(id);
    },
    now: () => time,
    tick() {
      runDue();
      for (const job of [...repeating]) job();
    },
    advance(ms) {
      const target = time + ms;
      for (;;) {
        let nextAt: number | undefined;
        for (const entry of once.values()) if (entry.at <= target && (nextAt === undefined || entry.at < nextAt)) nextAt = entry.at;
        if (nextAt === undefined) break;
        time = Math.max(time, nextAt);
        runDue();
      }
      time = target;
    },
    activeCount: () => repeating.size,
  };
}

/** The settings of a test arena, without the kind, which the create request carries. */
export const SETTINGS: CreateArenaRequest["settings"] = {
  name: "Test event",
  ticksPerRound: 20,
  tickMs: 100,
  ruleSetMode: "standard",
  botFill: false,
  joinPolicy: "anyone",
  tankCount: 64,
};

export const PASSWORD = "correct horse battery";

export interface CallInit {
  readonly method?: string;
  /** A player token, sent as a bearer token. */
  readonly token?: string;
  /** A session cookie. The call then also sends this server's own Origin, as a browser does. */
  readonly cookie?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface TestServer {
  readonly server: RunningServer;
  readonly ticks: ManualScheduler;
  api(path: string, init?: CallInit): Promise<Response>;
}

export type TestServerOptions = Omit<ServerOptions, "port" | "schedule" | "now">;

/**
 * A server on a free port with the manual scheduler and clock. The round pause is 0 unless
 * given, and arena messages are not held back (stream.test.ts covers the interval), because
 * the manual clock stands still and a held message would wait for an advance().
 */
export function startTestServer(options: TestServerOptions = {}): TestServer {
  const ticks = manualScheduler();
  const server = startServer({ port: 0, schedule: ticks, now: ticks.now, roundStartDelayMs: 0, arenaMessageIntervalMs: 0, ...options });
  return { server, ticks, api: clientOf(server.url) };
}

export function clientOf(url: string): TestServer["api"] {
  return (path, init = {}) =>
    fetch(`${url}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
        ...(init.cookie === undefined ? {} : { cookie: init.cookie, origin: url }),
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
}

let accountNumber = 0;

/** Registers a new account and returns its session cookie ("algotank_session=..."). */
export async function signUp(t: Pick<TestServer, "api">, email = `owner${++accountNumber}@example.org`): Promise<string> {
  const res = await t.api("/api/auth/register", { method: "POST", body: { email, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) throw new Error("register sent no cookie");
  return cookie;
}

export interface TestArena extends CreateArenaResponse {
  /** The owner's session cookie. */
  readonly cookie: string;
}

/** Signs up a new owner (unless a cookie is given) and creates an arena, a presenter arena by default. */
export async function createTestArena(
  t: TestServer,
  options: { readonly kind?: CreateArenaRequest["kind"]; readonly settings?: CreateArenaRequest["settings"]; readonly cookie?: string } = {},
): Promise<TestArena> {
  const cookie = options.cookie ?? (await signUp(t));
  const body: CreateArenaRequest = { kind: options.kind ?? "presenter", settings: options.settings ?? SETTINGS };
  const res = await t.api("/api/arenas", { method: "POST", cookie, body });
  if (res.status !== 200) throw new Error(`create arena failed: ${res.status} ${await res.text()}`);
  return { ...((await res.json()) as CreateArenaResponse), cookie };
}

export async function joinTestPlayer(t: TestServer, arenaId: string, name: string, look: TankLook = plainTankLook(1)): Promise<JoinResponse> {
  const res = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", body: { name, look } });
  if (res.status !== 200) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as JoinResponse;
}

export async function getArena(t: TestServer, arenaId: string): Promise<PublicArena> {
  return (await (await t.api(`/api/arenas/${arenaId}`)).json()) as PublicArena;
}

export interface StreamReader {
  readonly messages: StreamMessage[];
  /** Comment lines such as heartbeats, without the leading colon. */
  readonly comments: string[];
  /** Resolves once a message matches. */
  waitFor(predicate: (message: StreamMessage) => boolean, timeoutMs?: number): Promise<StreamMessage>;
  /** Resolves when the server ended the stream. */
  readonly ended: Promise<void>;
  close(): Promise<void>;
}

/** `cookie`: a session cookie, as the owner's page sends it with its EventSource. */
/** `params` adds query parameters to the stream's address, such as `{ chat: "0" }`. */
export async function openStream(t: TestServer, arenaId: string, playerToken?: string, cookie?: string, params: Readonly<Record<string, string>> = {}): Promise<StreamReader> {
  const abort = new AbortController();
  const search = new URLSearchParams({ ...(playerToken === undefined ? {} : { token: playerToken }), ...params }).toString();
  const query = search === "" ? "" : `?${search}`;
  const res = await fetch(`${t.server.url}/api/arenas/${arenaId}/events${query}`, {
    signal: abort.signal,
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
  if (res.status !== 200 || res.body === null) throw new Error(`stream failed: ${res.status}`);

  const messages: StreamMessage[] = [];
  const comments: string[] = [];
  const waiters = new Set<() => void>();

  const pump = (async () => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (block.startsWith(":")) comments.push(block.slice(1).trim());
          else {
            const data = block.split("\n").find((line) => line.startsWith("data: "));
            if (data !== undefined) messages.push(JSON.parse(data.slice(6)) as StreamMessage);
          }
          for (const wake of waiters) wake();
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) throw error;
    }
  })();

  return {
    messages,
    comments,
    ended: pump,
    async waitFor(predicate, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = messages.find(predicate);
        if (found !== undefined) return found;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error("timed out waiting for a stream message");
        await new Promise<void>((resolve) => {
          const wake = () => {
            waiters.delete(wake);
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(wake, left);
          waiters.add(wake);
        });
      }
    },
    async close() {
      abort.abort();
      await pump;
    },
  };
}

/**
 * Closes a player's stream, as a browser that is closed, and waits until the server has seen
 * it go: presence stamps the moment of the close, so a test that moves the clock before then
 * would make the player look seen later than they were.
 */
export async function leaveStream(t: TestServer, arenaId: string, reader: StreamReader): Promise<void> {
  const before = t.server.connectionCount(arenaId);
  await reader.close();
  const deadline = Date.now() + 3000;
  while (t.server.connectionCount(arenaId) >= before) {
    if (Date.now() > deadline) throw new Error("the server did not see the stream close");
    await Bun.sleep(5);
  }
}
