import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountResponse, AuthErrorResponse, MeResponse, RegisterResponse } from "@game/arena";
import { jsonResponse } from "../http.ts";
import { Router } from "../router.ts";
import { startServer, type RunningServer, type ServerOptions } from "../server.ts";
import { SETTINGS } from "../test-helpers.ts";
import { AuthError, createAuth, type Auth } from "./index.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const PASSWORD = "correct horse battery";

const servers: RunningServer[] = [];
const auths: Auth[] = [];
const stops: (() => void)[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  for (const auth of auths.splice(0)) auth.stop();
  for (const stop of stops.splice(0)) stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-auth-"));
  directories.push(directory);
  return directory;
}

/** A clock the test moves by hand. */
function manualClock(start = Date.parse("2026-11-11T09:00:00Z")): { now: () => number; advance(ms: number): void } {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

interface CallInit {
  readonly method?: string;
  readonly body?: unknown;
  readonly cookie?: string;
  /** true sends this server's own origin. */
  readonly origin?: string | true;
  readonly headers?: Readonly<Record<string, string>>;
}

interface Client {
  readonly server: RunningServer;
  call(path: string, init?: CallInit): Promise<Response>;
  register(email: string, password?: string, init?: CallInit): Promise<Response>;
  login(email: string, password?: string, init?: CallInit): Promise<Response>;
  me(cookie: string): Promise<MeResponse>;
}

function start(options: Partial<ServerOptions> = {}): Client {
  const server = startServer({ port: 0, ...options });
  servers.push(server);
  return clientFor(server);
}

/** Stops a server the test started, so another can start on the same data directory. */
async function stopServer(client: Client): Promise<void> {
  servers.splice(servers.indexOf(client.server), 1);
  await client.server.stop();
}

function clientFor(server: { url: string } & Partial<RunningServer>): Client {
  const call = (path: string, init: CallInit = {}) =>
    fetch(`${server.url}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
        ...(init.origin === undefined ? {} : { origin: init.origin === true ? server.url : init.origin }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  return {
    server: server as RunningServer,
    call,
    register: (email, password = PASSWORD, init = {}) =>
      call("/api/auth/register", { method: "POST", origin: true, body: { email, password }, ...init }),
    login: (email, password = PASSWORD, init = {}) =>
      call("/api/auth/login", { method: "POST", origin: true, body: { email, password }, ...init }),
    me: async (cookie) => (await (await call("/api/auth/me", { cookie })).json()) as MeResponse,
  };
}

/** The "name=value" part of the Set-Cookie header, ready to send back. */
function cookieOf(res: Response): string {
  const header = res.headers.get("set-cookie");
  if (header === null) throw new Error(`no Set-Cookie header on a ${res.status} answer`);
  return header.split(";")[0] ?? "";
}

async function signedUp(client: Client, email = "ada@example.org"): Promise<string> {
  const res = await client.register(email);
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return cookieOf(res);
}

async function errorOf(res: Response): Promise<AuthErrorResponse> {
  return (await res.json()) as AuthErrorResponse;
}

describe("register, me, logout, login", () => {
  test("a visitor registers, is signed in, logs out and logs in again", async () => {
    const client = start();
    const registered = await client.register("  Ada@Example.ORG ", PASSWORD);
    expect(registered.status).toBe(200);
    const { account, verificationEmail } = (await registered.json()) as RegisterResponse;
    // Stored and answered in the normalized form, and never with a password or a hash.
    expect(account.email).toBe("ada@example.org");
    expect(Object.keys(account).sort()).toEqual(["email", "emailVerified", "id"]);
    expect(account.emailVerified).toBe(false);
    // This server has no mail settings, so no code went out.
    expect(verificationEmail).toBe("off");
    const cookie = cookieOf(registered);
    expect(await client.me(cookie)).toEqual({ account });

    const logout = await client.call("/api/auth/logout", { method: "POST", cookie, origin: true });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await client.me(cookie)).toEqual({ account: null });

    const login = await client.login("ADA@example.org");
    expect(login.status).toBe(200);
    expect(((await login.json()) as AccountResponse).account).toEqual(account);
    const second = cookieOf(login);
    expect(second).not.toBe(cookie);
    expect(await client.me(second)).toEqual({ account });
  });

  test("me without a cookie, with a made-up token or with a malformed cookie is null", async () => {
    const client = start();
    expect(await (await client.call("/api/auth/me")).json()).toEqual({ account: null });
    expect(await client.me(`algotank_session=${"A".repeat(43)}`)).toEqual({ account: null });
    expect(await client.me("algotank_session=not-a-token")).toEqual({ account: null });
  });

  test("logout without a session answers 204", async () => {
    const client = start();
    expect((await client.call("/api/auth/logout", { method: "POST" })).status).toBe(204);
  });

  test("the session cookie is HttpOnly, SameSite=Lax, Path=/, 30 days, and Secure only when asked", async () => {
    const plain = (await start().register("ada@example.org")).headers.get("set-cookie") ?? "";
    const attributes = plain.split(";").map((part) => part.trim());
    expect(attributes[0]).toMatch(/^algotank_session=[A-Za-z0-9_-]{43}$/);
    expect(attributes.slice(1).sort()).toEqual(["HttpOnly", "Max-Age=2592000", "Path=/", "SameSite=Lax"]);

    const secure = (await start({ secureCookies: true }).register("ada@example.org")).headers.get("set-cookie") ?? "";
    expect(secure.split(";").map((part) => part.trim())).toContain("Secure");
  });
});

describe("credentials", () => {
  test("a wrong password and an unknown email get the same status and body", async () => {
    const client = start();
    await signedUp(client);
    const wrong = await client.login("ada@example.org", "not the password");
    const unknown = await client.login("nobody@example.org", PASSWORD);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.text()).toBe(await unknown.text());
    expect(wrong.headers.get("set-cookie")).toBeNull();
  });

  test("a login with a malformed email is the same 401, not a validation code", async () => {
    const client = start();
    const res = await client.login("not an email", PASSWORD);
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("invalid_credentials");
  });

  test("an empty password at login is the same 401", async () => {
    const client = start();
    await signedUp(client);
    for (const email of ["ada@example.org", "nobody@example.org"]) {
      const res = await client.login(email, "");
      expect([res.status, (await errorOf(res)).code]).toEqual([401, "invalid_credentials"]);
    }
  });

  test("a login for an unknown email takes about as long as a wrong password (it verifies a dummy hash)", async () => {
    const client = start({ trustProxy: true });
    await signedUp(client);
    const timed = async (email: string, i: number) => {
      const begin = performance.now();
      expect((await client.login(email, "wrong password", { headers: { "x-forwarded-for": `10.3.0.${i}` } })).status).toBe(401);
      return performance.now() - begin;
    };
    const median = (values: number[]) => values.sort((a, b) => a - b)[1] ?? 0;
    const known = median([await timed("ada@example.org", 1), await timed("ada@example.org", 2), await timed("ada@example.org", 3)]);
    const unknown = median([await timed("x1@example.org", 4), await timed("x2@example.org", 5), await timed("x3@example.org", 6)]);
    // Coarse on purpose: without the dummy verify an unknown email answers many times faster.
    expect(unknown).toBeGreaterThan(known / 3);
  });

  test("an email registers once, whatever its case and spaces", async () => {
    const client = start();
    await signedUp(client);
    const again = await client.register(" ADA@example.org");
    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe("email_taken");
  });

  test("two parallel registrations of one email create one account", async () => {
    const client = start();
    const answers = await Promise.all([client.register("ada@example.org"), client.register("ada@example.org")]);
    expect(answers.map((res) => res.status).sort()).toEqual([200, 409]);
  });

  test("each validation rule answers 400 with its code", async () => {
    const client = start({ trustProxy: true });
    const cases: [string, string, AuthErrorResponse["code"]][] = [
      ["no-at-sign.org", PASSWORD, "email_invalid"],
      ["two@at@example.org", PASSWORD, "email_invalid"],
      ["@example.org", PASSWORD, "email_invalid"],
      ["ada@", PASSWORD, "email_invalid"],
      ["ada@localhost", PASSWORD, "email_invalid"],
      ["ada@example.", PASSWORD, "email_invalid"],
      ["a da@example.org", PASSWORD, "email_invalid"],
      [`${"a".repeat(243)}@example.org`, PASSWORD, "email_invalid"], // 255 characters
      ["ada@example.org", "seven77", "password_too_short"],
      ["ada@example.org", "x".repeat(201), "password_too_long"],
      ["ada@example.org", " ADA@example.org", "password_is_email"],
    ];
    for (const [i, [email, password, code]] of cases.entries()) {
      // A new address each time, so the register limit does not answer first.
      const res = await client.register(email, password, { headers: { "x-forwarded-for": `10.0.0.${i}` } });
      expect([email, res.status, (await errorOf(res)).code]).toEqual([email, 400, code]);
    }
    // The edges that pass: 254 characters, 8 and 200 characters, and 8 characters counted as code points.
    const edges: [string, string][] = [
      [`${"a".repeat(242)}@example.org`, PASSWORD],
      ["eight@example.org", "12345678"],
      ["long@example.org", "x".repeat(200)],
      ["emoji@example.org", "🙂🙂🙂🙂🙂🙂🙂🙂"],
    ];
    for (const [i, [email, password]] of edges.entries()) {
      const res = await client.register(email, password, { headers: { "x-forwarded-for": `10.0.1.${i}` } });
      expect([email, res.status]).toEqual([email, 200]);
    }
  });

  test("a body that is not JSON, not declared JSON, malformed or over 4 KB is refused", async () => {
    const client = start({ trustProxy: true });
    const at = (i: number) => ({ "x-forwarded-for": `10.0.2.${i}` });
    const notDeclared = await client.call("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "text/plain", ...at(1) },
      body: { email: "ada@example.org", password: PASSWORD },
    });
    expect(notDeclared.status).toBe(415);
    const missing = await client.call("/api/auth/register", { method: "POST", body: { email: "ada@example.org" }, headers: at(2) });
    expect(missing.status).toBe(400);
    const huge = await client.register("ada@example.org", "x".repeat(5000), { headers: at(3) });
    expect(huge.status).toBe(413);
    const broken = await fetch(`${client.server.url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{oops",
    });
    expect(broken.status).toBe(400);
  });
});

describe("session lifecycle", () => {
  test("a session survives a restart on the same data directory and ends after 30 days", async () => {
    const dataDir = temporaryDirectory();
    const clock = manualClock();
    const first = start({ dataDir, now: clock.now });
    const cookie = await signedUp(first);
    const before = await first.me(cookie);
    await stopServer(first);

    const second = start({ dataDir, now: clock.now });
    expect(await second.me(cookie)).toEqual(before);
    clock.advance(30 * DAY_MS - 1);
    expect(await second.me(cookie)).toEqual(before);
    clock.advance(1);
    expect(await second.me(cookie)).toEqual({ account: null });
    // The account itself stays: a new login works.
    expect((await second.login("ada@example.org")).status).toBe(200);
  });

  test("an expired session is dropped from the file at the next start", async () => {
    const dataDir = temporaryDirectory();
    const clock = manualClock();
    const first = start({ dataDir, now: clock.now });
    await signedUp(first);
    await stopServer(first);
    const sessionsPath = join(dataDir, "auth", "sessions.json");
    expect((JSON.parse(readFileSync(sessionsPath, "utf8")) as { sessions: unknown[] }).sessions).toHaveLength(1);

    clock.advance(31 * DAY_MS);
    start({ dataDir, now: clock.now });
    expect((JSON.parse(readFileSync(sessionsPath, "utf8")) as { sessions: unknown[] }).sessions).toHaveLength(0);
  });

  test("the 11th login ends the oldest session", async () => {
    const clock = manualClock();
    const client = start({ now: clock.now });
    const cookies = [await signedUp(client)];
    for (let i = 0; i < 10; i++) {
      clock.advance(1000);
      const res = await client.login("ada@example.org");
      expect(res.status).toBe(200);
      cookies.push(cookieOf(res));
    }
    expect(await client.me(cookies[0] ?? "")).toEqual({ account: null });
    for (const cookie of cookies.slice(1)) expect((await client.me(cookie)).account?.email).toBe("ada@example.org");
  });

  test("the files hold no password or token, with mode 0600 in a 0700 folder", async () => {
    const dataDir = temporaryDirectory();
    const client = start({ dataDir });
    const cookie = await signedUp(client);
    const folder = join(dataDir, "auth");
    expect(statSync(folder).mode & 0o777).toBe(0o700);
    for (const name of ["accounts.json", "sessions.json"]) {
      const path = join(folder, name);
      expect([name, statSync(path).mode & 0o777]).toEqual([name, 0o600]);
      const text = readFileSync(path, "utf8");
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(cookie.split("=")[1] ?? "");
    }
  });
});

describe("origin check", () => {
  test("a POST with the cookie and a foreign, null or missing Origin is refused and the session stays", async () => {
    const client = start();
    const cookie = await signedUp(client);
    for (const origin of ["https://evil.example", "null", "http://localhost:1", undefined]) {
      const res = await client.call("/api/auth/logout", { method: "POST", cookie, ...(origin === undefined ? {} : { origin }) });
      expect([origin, res.status, (await errorOf(res)).code]).toEqual([origin, 403, "bad_origin"]);
    }
    expect((await client.me(cookie)).account).not.toBeNull();

    // A login that carries the cookie is checked too.
    const login = await client.login("ada@example.org", PASSWORD, { cookie, origin: "https://evil.example" });
    expect(login.status).toBe(403);
  });

  test("a login or register from another site is refused even without the cookie", async () => {
    const client = start();
    const foreign = { origin: "https://evil.example" };
    expect((await client.register("ada@example.org", PASSWORD, foreign)).status).toBe(403);
    await signedUp(client);
    expect((await client.login("ada@example.org", PASSWORD, foreign)).status).toBe(403);
  });

  test("behind a trusted proxy the forwarded host is this site", async () => {
    const proxied = start({ trustProxy: true });
    const res = await proxied.register("ada@example.org", PASSWORD, {
      origin: "https://algotank.example",
      headers: { "x-forwarded-host": "algotank.example" },
    });
    expect(res.status).toBe(200);
    // Without trust, the same header changes nothing.
    const direct = start();
    const refused = await direct.register("ada@example.org", PASSWORD, {
      origin: "https://algotank.example",
      headers: { "x-forwarded-host": "algotank.example" },
    });
    expect(refused.status).toBe(403);
  });
});

describe("requireAccount and accountOf", () => {
  /** The auth routes plus one route of another feature, on a real server, as B2 will use it. */
  function featureServer(): Client {
    const auth = createAuth({ secureCookies: false, trustProxy: false, mail: null });
    auths.push(auth);
    const router = new Router();
    auth.registerRoutes(router);
    router.add("POST", "/api/feature", (ctx) => jsonResponse(auth.requireAccount(ctx.req)));
    router.add("GET", "/api/feature", (ctx) => jsonResponse(auth.accountOf(ctx.req)));
    const server = Bun.serve<undefined>({
      port: 0,
      async fetch(req, srv) {
        const url = new URL(req.url);
        const match = router.match(req.method, url.pathname);
        if (match.kind !== "found") return new Response(null, { status: 404 });
        try {
          return await match.handler({ req, url, params: match.params, server: srv });
        } catch (error) {
          if (error instanceof AuthError) return error.toResponse();
          throw error;
        }
      },
    });
    stops.push(() => void server.stop(true));
    return clientFor({ url: `http://localhost:${server.port}` });
  }

  test("answers the account, 401 without a session and 403 from another site", async () => {
    const client = featureServer();
    const cookie = await signedUp(client);

    const ok = await client.call("/api/feature", { method: "POST", cookie, origin: true });
    expect(ok.status).toBe(200);
    const account = (await ok.json()) as Record<string, unknown>;
    expect(Object.keys(account).sort()).toEqual(["createdAt", "email", "emailVerified", "id"]);
    expect(account["email"]).toBe("ada@example.org");

    const none = await client.call("/api/feature", { method: "POST", origin: true });
    expect([none.status, (await errorOf(none)).code]).toEqual([401, "not_signed_in"]);
    const crossSite = await client.call("/api/feature", { method: "POST", cookie });
    expect([crossSite.status, (await errorOf(crossSite)).code]).toEqual([403, "bad_origin"]);

    expect(await (await client.call("/api/feature", { cookie })).json()).toEqual(account);
    expect(await (await client.call("/api/feature")).json()).toBeNull();
  });
});

describe("rate limits", () => {
  test("register: 5 per hour per address, then 429 with retryAfterSeconds", async () => {
    const clock = manualClock();
    const client = start({ now: clock.now });
    for (let i = 0; i < 5; i++) expect((await client.register(`user${i}@example.org`)).status).toBe(200);
    clock.advance(10 * MINUTE_MS);
    const limited = await client.register("user5@example.org");
    expect(limited.status).toBe(429);
    const body = await errorOf(limited);
    expect([body.code, body.retryAfterSeconds]).toEqual(["rate_limited", 50 * 60]);
    expect(limited.headers.get("retry-after")).toBe(String(50 * 60));
    // The refused request created no account.
    clock.advance(50 * MINUTE_MS);
    // A refused registration (a typo) does not use up the limit.
    for (let i = 0; i < 5; i++) expect((await client.register("not an email")).status).toBe(400);
    expect((await client.login("user5@example.org")).status).toBe(401);
    expect((await client.register("user5@example.org")).status).toBe(200);
  });

  test("login: 10 per 15 minutes per address", async () => {
    const clock = manualClock();
    const client = start({ now: clock.now });
    await signedUp(client);
    for (let i = 0; i < 10; i++) expect((await client.login("ada@example.org")).status).toBe(200);
    const limited = await client.login("ada@example.org");
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).retryAfterSeconds).toBe(15 * 60);
    expect(limited.headers.get("set-cookie")).toBeNull();
    clock.advance(15 * MINUTE_MS);
    expect((await client.login("ada@example.org")).status).toBe(200);
  });

  test("login: 5 failed attempts per 15 minutes per email, known or not, from any address", async () => {
    const clock = manualClock();
    const client = start({ now: clock.now, trustProxy: true });
    await signedUp(client);
    const from = (i: number) => ({ headers: { "x-forwarded-for": `10.1.0.${i}` } });
    for (const email of ["ada@example.org", "nobody@example.org"]) {
      for (let i = 0; i < 5; i++) expect((await client.login(email, "wrong password", from(i))).status).toBe(401);
      // Even the right password waits now, and the answer is the same for both emails.
      const limited = await client.login(email, PASSWORD, from(9));
      expect([limited.status, (await errorOf(limited)).retryAfterSeconds]).toEqual([429, 15 * 60]);
    }
    clock.advance(15 * MINUTE_MS);
    expect((await client.login("ada@example.org", PASSWORD, from(9))).status).toBe(200);
  });

  test("a successful login does not count as a failure", async () => {
    const client = start({ trustProxy: true });
    await signedUp(client);
    const from = (i: number) => ({ headers: { "x-forwarded-for": `10.2.0.${i}` } });
    for (let i = 0; i < 4; i++) expect((await client.login("ada@example.org", "wrong password", from(i))).status).toBe(401);
    for (let i = 0; i < 3; i++) expect((await client.login("ada@example.org", PASSWORD, from(i))).status).toBe(200);
    expect((await client.login("ada@example.org", "wrong password", from(5))).status).toBe(401);
    expect((await client.login("ada@example.org", PASSWORD, from(6))).status).toBe(429);
  });
});

describe("storage", () => {
  test("a damaged accounts or sessions file stops the start with a message that names it", async () => {
    for (const name of ["accounts.json", "sessions.json"]) {
      const dataDir = temporaryDirectory();
      // The files are written at the first change, so make one.
      const writer = start({ dataDir });
      await signedUp(writer);
      await stopServer(writer);

      const path = join(dataDir, "auth", name);
      writeFileSync(path, "{ damaged");
      expect(() => startServer({ port: 0, dataDir })).toThrow(path);
      writeFileSync(path, JSON.stringify({ version: 1, wrong: [] }));
      expect(() => startServer({ port: 0, dataDir })).toThrow(path);
    }
  });

  test("the auth folder does not disturb the arena loader, and both come back after a restart", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const cookie = await signedUp(first);
    const created = await first.call("/api/arenas", { method: "POST", cookie, origin: true, body: { kind: "private", settings: SETTINGS } });
    const { arenaId } = (await created.json()) as { arenaId: string };
    await stopServer(first);
    expect(readdirSync(dataDir).sort()).toEqual(["arenas", "auth", "metrics", "monthly", "results"]);
    // The other file is the public arena the server keeps.
    expect(readdirSync(join(dataDir, "arenas"))).toContain(`${arenaId}.json`);

    const second = start({ dataDir });
    expect((await second.call(`/api/arenas/${arenaId}`)).status).toBe(200);
    expect((await second.me(cookie)).account?.email).toBe("ada@example.org");
  });
});

describe("reset-password script", () => {
  const script = join(import.meta.dir, "..", "..", "scripts", "reset-password.ts");

  async function runReset(dataDir: string, email: string, stdin: string): Promise<{ code: number; out: string }> {
    const child = Bun.spawn(["bun", script, email], {
      env: { ...process.env, DATA_DIR: dataDir },
      stdin: new TextEncoder().encode(stdin),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { code, out: out + err };
  }

  test("changes the password and ends the account's sessions, printing nothing secret", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const cookie = await signedUp(first);
    const otherCookie = await signedUp(first, "bo@example.org");
    await stopServer(first);

    const newPassword = "a brand new password";
    const result = await runReset(dataDir, "ADA@example.org", `${newPassword}\n`);
    expect(result.code).toBe(0);
    expect(result.out).toContain("ada@example.org");
    expect(result.out).not.toContain(newPassword);
    expect(result.out).not.toContain("$argon2");

    const second = start({ dataDir });
    expect(await second.me(cookie)).toEqual({ account: null });
    expect((await second.me(otherCookie)).account?.email).toBe("bo@example.org");
    expect((await second.login("ada@example.org", PASSWORD)).status).toBe(401);
    expect((await second.login("ada@example.org", newPassword)).status).toBe(200);
  });

  test("applies the password rules, refuses an unknown email, and refuses while the server runs", async () => {
    const dataDir = temporaryDirectory();
    const running = start({ dataDir });
    await signedUp(running);

    const whileRunning = await runReset(dataDir, "ada@example.org", "a brand new password\n");
    expect(whileRunning.code).toBe(1);
    expect(whileRunning.out).toContain("Stop it first");
    await stopServer(running);

    const short = await runReset(dataDir, "ada@example.org", "short\n");
    expect([short.code, short.out.trim()]).toEqual([1, "The password needs at least 8 characters."]);
    const unknown = await runReset(dataDir, "nobody@example.org", "a brand new password\n");
    expect(unknown.code).toBe(1);

    const after = start({ dataDir });
    expect((await after.login("ada@example.org", PASSWORD)).status).toBe(200);
  });
});
