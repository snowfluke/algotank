// Load test of one presenter arena against a running server
// (docs/specs/revamp/63-large-arenas.md, item 8). It registers an owner, creates a
// presenter arena, joins N players over HTTP from one address (a venue shares one),
// opens each player's event stream right after the join (as a phone does), starts the
// first round (a cut round), and during the break sends one strategy save per player,
// spread over 10 seconds. Then it closes the arena.
//
// Usage (the server must run with TRUST_PROXY=1, because registration allows 5
// accounts per hour per address and the script sends its own X-Forwarded-For):
//   bun apps/server/scripts/load-test.ts \
//     --url=http://localhost:8971 --players=64 --pid=<server PID> [--ticks=40] [--tick-ms=600] [--edit-seconds=10]
//
// It prints: the time to join N players (with their streams), the turn interval as the
// clients saw it (mean and worst over every stream), bytes per second per client while
// the round ran, the server's CPU and memory during the round (ps), whether every
// stream got every turn, and the strategy saves (time and failures).
//
// The script and the server share one machine, so the client's own parsing competes
// with the server for the CPU. A run takes about ticks x tick-ms + 3 s + the joins.

import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { plainTankLook, TANK_COLOUR_COUNT, type TankColour } from "@game/arena";
import { PRESETS } from "@game/engine";

interface Options {
  readonly url: string;
  readonly players: number;
  readonly pid: number;
  readonly ticks: number;
  readonly tickMs: number;
  readonly editSeconds: number;
}

function parseOptions(argv: readonly string[]): Options {
  const value = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const int = (name: string, fallback?: number): number => {
    const raw = value(name);
    const n = raw === undefined ? fallback : Number(raw);
    if (n === undefined || !Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a whole number`);
    return n;
  };
  const url = value("url");
  if (url === undefined) throw new Error("--url is required, for example --url=http://localhost:8971");
  return {
    url: url.replace(/\/$/, ""),
    players: int("players"),
    pid: int("pid"),
    ticks: int("ticks", 40),
    tickMs: int("tick-ms", 600),
    editSeconds: int("edit-seconds", 10),
  };
}

const VENUE_ADDRESS = "10.20.30.40";
const OWNER_ADDRESS = `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const TICK_PREFIX = /"tick":\{"tick":(\d+)/;
const PHASE = /"phase":\{"kind":"(\w+)"/;

function headers(address: string, extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", "x-forwarded-for": address, ...extra };
}

async function expectOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new Error(`${what} failed: ${response.status} ${await response.text()}`);
  return response;
}

interface StreamStats {
  bytes: number;
  /** Bytes received while the round ran (from roundStart to the arena message of the break). */
  roundBytes: number;
  readonly tickArrivals: Map<number, number>;
  roundStartAt: number | null;
  breakAt: number | null;
  error: string | null;
}

/** Reads the server-sent events of one stream's body. Only the start of each message is inspected. */
function eventReader(stats: StreamStats, onBreak: () => void): (chunk: Uint8Array) => void {
  const decoder = new TextDecoder();
  let buffer = "";
  return (chunk) => {
    stats.bytes += chunk.byteLength;
    if (stats.roundStartAt !== null && stats.breakAt === null) stats.roundBytes += chunk.byteLength;
    buffer += decoder.decode(chunk, { stream: true });
    let end = buffer.indexOf("\n\n");
    while (end >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf("\n\n");
      if (block.startsWith("event: tick")) {
        const match = TICK_PREFIX.exec(block.slice(0, 200));
        if (match !== null) stats.tickArrivals.set(Number(match[1]), performance.now());
      } else if (block.startsWith("event: roundStart")) {
        stats.roundStartAt ??= performance.now();
      } else if (block.startsWith("event: arena") && stats.roundStartAt !== null && stats.breakAt === null) {
        if (PHASE.exec(block)?.[1] === "break") {
          stats.breakAt = performance.now();
          onBreak();
        }
      }
    }
  };
}

const CRLF = Buffer.from("\r\n");

/**
 * Opens one event stream on its own TCP connection, as a phone does, and checks the HTTP
 * framing strictly (status line, chunked transfer encoding, every chunk size and its CRLF).
 * The script does not read streams with fetch: with 512 streams Bun's fetch failed a few of
 * them with InvalidHTTPResponse and said no more, and this reader names what it received.
 */
function openStream(url: string, token: string, stop: AbortSignal, onBreak: () => void): { stats: StreamStats; opened: Promise<void> } {
  const stats: StreamStats = { bytes: 0, roundBytes: 0, tickArrivals: new Map(), roundStartAt: null, breakAt: null, error: null };
  const onBody = eventReader(stats, onBreak);
  const target = new URL(`${url}/events?token=${encodeURIComponent(token)}`);
  let resolveOpened: () => void = () => {};
  const opened = new Promise<void>((resolve) => (resolveOpened = resolve));
  const socket = connect(Number(target.port), target.hostname);
  const fail = (message: string) => {
    if (stats.error === null && !stop.aborted) stats.error = message;
    socket.destroy();
    resolveOpened();
  };
  stop.addEventListener("abort", () => socket.destroy());
  socket.on("connect", () => {
    socket.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\nX-Forwarded-For: ${VENUE_ADDRESS}\r\nAccept: text/event-stream\r\n\r\n`);
  });
  socket.on("error", (error) => fail(`socket: ${error.message}`));
  socket.on("close", () => fail(`the server closed the connection after ${stats.bytes} body bytes`));

  let pending: Buffer = Buffer.alloc(0);
  let state: "headers" | "size" | "data" | "dataEnd" = "headers";
  let remaining = 0;
  socket.on("data", (data: Buffer) => {
    pending = pending.length === 0 ? data : Buffer.concat([pending, data]);
    for (;;) {
      if (state === "headers") {
        const end = pending.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = pending.subarray(0, end).toString("latin1");
        pending = pending.subarray(end + 4);
        if (!head.startsWith("HTTP/1.1 200")) return fail(`stream answered: ${head.split("\r\n")[0]}`);
        if (!/^transfer-encoding: *chunked$/im.test(head)) return fail(`stream is not chunked: ${JSON.stringify(head)}`);
        state = "size";
        resolveOpened();
      } else if (state === "size") {
        const end = pending.indexOf(CRLF);
        if (end < 0) return;
        const line = pending.subarray(0, end).toString("latin1");
        const size = /^[0-9a-fA-F]+/.exec(line);
        if (size === null) return fail(`bad chunk size line after ${stats.bytes} body bytes: ${JSON.stringify(line.slice(0, 60))}`);
        remaining = Number.parseInt(size[0], 16);
        pending = pending.subarray(end + 2);
        if (remaining === 0) return fail(`the server ended the stream after ${stats.bytes} body bytes`);
        state = "data";
      } else if (state === "data") {
        if (pending.length === 0) return;
        const take = Math.min(remaining, pending.length);
        onBody(pending.subarray(0, take));
        pending = pending.subarray(take);
        remaining -= take;
        if (remaining === 0) state = "dataEnd";
      } else {
        if (pending.length < 2) return;
        if (pending[0] !== 13 || pending[1] !== 10) {
          return fail(`no CRLF after a chunk, after ${stats.bytes} body bytes: ${JSON.stringify(pending.subarray(0, 60).toString("latin1"))}`);
        }
        pending = pending.subarray(2);
        state = "size";
      }
    }
  });
  return { stats, opened };
}

interface Sample {
  /** CPU seconds the process has used since it started. */
  readonly cpuSeconds: number;
  readonly rssMb: number;
}

/** "[[dd-]hh:]mm:ss.cc" as ps prints the cumulative CPU time. */
function cpuSecondsOf(text: string): number {
  return text.split(/[-:]/).map(Number).reduce((total, part) => total * 60 + part, 0);
}

function sampleServer(pid: number): Sample {
  const out = spawnSync("ps", ["-o", "time=,rss=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
  const [time, rss] = out.split(/\s+/);
  if (time === undefined || rss === undefined) throw new Error(`ps found no process ${pid}`);
  return { cpuSeconds: cpuSecondsOf(time), rssMb: Number(rss) / 1024 };
}

async function inBatches<T>(count: number, width: number, work: (i: number) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array(count);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, count) }, async () => {
      while (next < count) {
        const i = next++;
        results[i] = await work(i);
      }
    }),
  );
  return results;
}

function summary(values: readonly number[]): { mean: number; worst: number } {
  return { mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length), worst: Math.max(...values) };
}

async function main(): Promise<void> {
  const options = parseOptions(Bun.argv.slice(2));
  const origin = new URL(options.url).origin;
  const api = `${options.url}/api`;

  // 1. Owner and arena.
  const email = `load-${Date.now()}@example.test`;
  const registered = await expectOk(
    await fetch(`${api}/auth/register`, {
      method: "POST",
      headers: headers(OWNER_ADDRESS, { origin }),
      body: JSON.stringify({ email, password: "load-test-password" }),
    }),
    "register",
  );
  const cookie = (registered.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const ownerHeaders = headers(OWNER_ADDRESS, { origin, cookie });
  const created = (await (
    await expectOk(
      await fetch(`${api}/arenas`, {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          kind: "presenter",
          settings: { name: "Load test", ticksPerRound: options.ticks, tickMs: options.tickMs, ruleSetMode: "standard", botFill: false, joinPolicy: "anyone", tankCount: 512 },
        }),
      }),
      "create arena",
    )
  ).json()) as { arenaId: string };
  const arenaUrl = `${api}/arenas/${created.arenaId}`;

  const stop = new AbortController();
  let breaks = 0;
  let resolveBreak: () => void = () => {};
  const allInBreak = new Promise<void>((resolve) => (resolveBreak = resolve));
  const onBreak = () => {
    breaks += 1;
    if (breaks === options.players) resolveBreak();
  };

  try {
    // 2. Joins, each followed by its stream.
    const beforeJoins = sampleServer(options.pid);
    const joinStart = performance.now();
    const players = await inBatches(options.players, 16, async (i) => {
      const joined = (await (
        await expectOk(
          await fetch(`${arenaUrl}/players`, {
            method: "POST",
            headers: headers(VENUE_ADDRESS),
            body: JSON.stringify({ name: `Player ${i + 1}`, look: plainTankLook(((i % TANK_COLOUR_COUNT) + 1) as TankColour) }),
          }),
          `join ${i + 1}`,
        )
      ).json()) as { playerToken: string };
      const stream = openStream(arenaUrl, joined.playerToken, stop.signal, onBreak);
      await stream.opened;
      return { token: joined.playerToken, stats: stream.stats };
    });
    const joinSeconds = (performance.now() - joinStart) / 1000;
    const afterJoins = sampleServer(options.pid);
    console.log(
      `joined ${options.players} players with their streams in ${joinSeconds.toFixed(2)} s; server CPU ${(afterJoins.cpuSeconds - beforeJoins.cpuSeconds).toFixed(2)} s; bytes per client during the joins: mean ${(players.reduce((s, p) => s + p.stats.bytes, 0) / players.length / 1024).toFixed(0)} KB`,
    );

    // 3. The round, with the server sampled every 500 ms.
    const samples: Sample[] = [sampleServer(options.pid)];
    const sampler = setInterval(() => samples.push(sampleServer(options.pid)), 500);
    const roundStart = performance.now();
    await expectOk(await fetch(`${arenaUrl}/rounds`, { method: "POST", headers: ownerHeaders }), "start round");
    const limitMs = options.ticks * options.tickMs * 3 + 30_000;
    const timedOut = await Promise.race([allInBreak.then(() => false), Bun.sleep(limitMs).then(() => true)]);
    clearInterval(sampler);
    samples.push(sampleServer(options.pid));
    const roundSeconds = (performance.now() - roundStart) / 1000;
    if (timedOut) console.log(`not every stream saw the break within ${limitMs / 1000} s (${breaks} of ${options.players})`);

    const intervals: number[] = [];
    let complete = 0;
    const rates: number[] = [];
    for (const { stats } of players) {
      const arrivals = [...stats.tickArrivals.entries()].sort((a, b) => a[0] - b[0]).map(([, at]) => at);
      for (let i = 1; i < arrivals.length; i++) intervals.push((arrivals[i] as number) - (arrivals[i - 1] as number));
      if (stats.tickArrivals.size === options.ticks && [...stats.tickArrivals.keys()].every((t) => t >= 0 && t < options.ticks)) complete += 1;
      if (stats.roundStartAt !== null && stats.breakAt !== null) rates.push(stats.roundBytes / ((stats.breakAt - stats.roundStartAt) / 1000));
    }
    const interval = summary(intervals);
    const rate = summary(rates);
    // CPU share per 500 ms step, from the cumulative CPU time; 100% is one core.
    const shares = samples.slice(1).map((s, i) => ((s.cpuSeconds - (samples[i] as Sample).cpuSeconds) / 0.5) * 100);
    const cpu = summary(shares);
    const rss = summary(samples.map((s) => s.rssMb));
    console.log(`round of ${options.ticks} turns at ${options.tickMs} ms took ${roundSeconds.toFixed(1)} s (3 s pause included)`);
    console.log(`turn interval seen by clients: mean ${interval.mean.toFixed(0)} ms, worst ${interval.worst.toFixed(0)} ms`);
    console.log(`bytes per second per client during the round: mean ${(rate.mean / 1024).toFixed(1)} KB/s, worst ${(rate.worst / 1024).toFixed(1)} KB/s`);
    console.log(`bytes per turn per client: about ${(rate.mean * (interval.mean / 1000) / 1024).toFixed(1)} KB`);
    console.log(`server during the round: CPU mean ${cpu.mean.toFixed(0)}% of one core, worst 500 ms step ${cpu.worst.toFixed(0)}%; memory mean ${rss.mean.toFixed(0)} MB, worst ${rss.worst.toFixed(0)} MB (${samples.length} samples)`);
    const failed = players.filter((p) => p.stats.error !== null);
    console.log(`streams that got every turn: ${complete} of ${options.players}; stream errors: ${failed.length}`);
    for (const { stats } of failed) {
      console.log(`  stream error after ${stats.tickArrivals.size} turns, ${(stats.bytes / 1024).toFixed(0)} KB: ${stats.error}`);
    }

    // 4. One strategy save per player, spread over the edit window.
    const saveTimes: number[] = [];
    const saveStatuses = new Map<number, number>();
    const editStart = performance.now();
    await Promise.all(
      players.map(async ({ token }, i) => {
        await Bun.sleep((options.editSeconds * 1000 * i) / options.players);
        const strategy = PRESETS[i % PRESETS.length]!.strategy;
        const start = performance.now();
        const response = await fetch(`${arenaUrl}/players/me/strategy`, {
          method: "PUT",
          headers: headers(VENUE_ADDRESS, { authorization: `Bearer ${token}` }),
          body: JSON.stringify(strategy),
        });
        saveTimes.push(performance.now() - start);
        saveStatuses.set(response.status, (saveStatuses.get(response.status) ?? 0) + 1);
        await response.arrayBuffer();
      }),
    );
    const save = summary(saveTimes);
    const after = sampleServer(options.pid);
    console.log(
      `strategy saves: ${options.players} in ${((performance.now() - editStart) / 1000).toFixed(1)} s, answer mean ${save.mean.toFixed(1)} ms, worst ${save.worst.toFixed(1)} ms, answers ${[...saveStatuses].map(([status, n]) => `${n} x ${status}`).join(", ")} (an eliminated player is refused until the final); server memory after ${after.rssMb.toFixed(0)} MB`,
    );
  } finally {
    stop.abort();
    const closeStart = performance.now();
    const closed = await fetch(arenaUrl, { method: "DELETE", headers: ownerHeaders });
    if (closed.status !== 204) console.error(`closing the arena answered ${closed.status}; close ${created.arenaId} by hand`);
    else console.log(`closed the arena in ${(performance.now() - closeStart).toFixed(0)} ms`);
  }
}

const scriptStart = performance.now();
await main();
console.log(`load test done after ${((performance.now() - scriptStart) / 1000).toFixed(1)} s`);
// Ends the script when its work ends, without waiting for the aborted streams to wind down.
process.exit(0);
