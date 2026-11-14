// Email verification and password reset through the routes, with a fake mail sender and a
// clock the test moves (email-routes.ts has the state tables these tests walk through).

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountResponse, AuthCapabilities, AuthErrorResponse, MeResponse, RegisterResponse } from "@game/arena";
import type { MailSender, OutgoingMail } from "../mail.ts";
import { startServer, type RunningServer, type ServerOptions } from "../server.ts";

const MINUTE_MS = 60 * 1000;
const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "a brand new password";

const servers: RunningServer[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

interface FakeMail extends MailSender {
  readonly sent: OutgoingMail[];
  /** Makes every send fail from now on, as a mail server that refuses the login. */
  failing: boolean;
  /** Waits until `count` mails were sent; the reset sends after its answer. */
  waitFor(count: number): Promise<void>;
}

function fakeMail(): FakeMail {
  const mail: FakeMail = {
    sent: [],
    failing: false,
    async sendMail(m) {
      if (mail.failing) throw new Error("535 Username and Password not accepted");
      mail.sent.push(m);
    },
    async waitFor(count) {
      for (let i = 0; i < 200 && mail.sent.length < count; i++) await Bun.sleep(10);
      if (mail.sent.length < count) throw new Error(`Expected ${count} mails, got ${mail.sent.length}.`);
    },
  };
  return mail;
}

const SIX_DIGITS = /\b\d{6}\b/;

function codeIn(mail: OutgoingMail | undefined): string {
  const code = mail?.text.match(SIX_DIGITS)?.[0];
  if (code === undefined) throw new Error("The mail holds no code.");
  return code;
}

/** Any other code than `code`, so a test can type a wrong one. */
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

interface Setup {
  readonly url: string;
  readonly mail: FakeMail | null;
  advance(ms: number): void;
  call(path: string, body?: unknown, init?: { readonly cookie?: string; readonly address?: string }): Promise<Response>;
}

function start(options: { readonly mail?: boolean; readonly dataDir?: string; readonly clock?: { now: () => number; advance(ms: number): void } } = {}): Setup {
  let time = Date.parse("2026-11-13T09:00:00Z");
  const clock = options.clock ?? { now: () => time, advance: (ms: number) => void (time += ms) };
  const mail = options.mail === false ? null : fakeMail();
  const serverOptions: ServerOptions = {
    port: 0,
    now: clock.now,
    trustProxy: true,
    ...(mail === null ? {} : { mail }),
    ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
  };
  const server = startServer(serverOptions);
  servers.push(server);
  return {
    url: server.url,
    mail,
    advance: clock.advance,
    call: (path, body, init = {}) =>
      fetch(`${server.url}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json", origin: server.url }),
          ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
          "x-forwarded-for": init.address ?? "203.0.113.1",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

function cookieOf(res: Response): string {
  const header = res.headers.get("set-cookie");
  if (header === null) throw new Error("No session cookie.");
  return header.split(";")[0] ?? "";
}

async function errorOf(res: Response): Promise<AuthErrorResponse> {
  return (await res.json()) as AuthErrorResponse;
}

async function signUp(s: Setup, email = "ada@example.org", language: "en" | "id" = "en"): Promise<{ cookie: string; body: RegisterResponse }> {
  const res = await s.call("/api/auth/register", { email, password: PASSWORD, language }, { address: `198.51.100.${email.length}` });
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return { cookie: cookieOf(res), body: (await res.json()) as RegisterResponse };
}

async function me(s: Setup, cookie: string): Promise<MeResponse> {
  return (await (await s.call("/api/auth/me", undefined, { cookie })).json()) as MeResponse;
}

describe("capabilities", () => {
  test("say whether the server can send email", async () => {
    expect((await (await start({ mail: false }).call("/api/auth/capabilities")).json()) as AuthCapabilities).toEqual({ canSendEmail: false });
    expect((await (await start().call("/api/auth/capabilities")).json()) as AuthCapabilities).toEqual({ canSendEmail: true });
  });
});

describe("verification: unverified -> code sent -> verified", () => {
  test("sign-up sends a code in the page's language, and the right code verifies the email", async () => {
    const s = start();
    const { cookie, body } = await signUp(s, "ada@example.org", "id");
    expect(body.verificationEmail).toBe("sent");
    expect(body.account.emailVerified).toBe(false);
    const sent = s.mail?.sent[0];
    expect(sent?.to).toBe("ada@example.org");
    expect(sent?.subject).toBe("Kode AlgoTank kamu");
    expect(sent?.text).toContain("15 menit");

    const verified = await s.call("/api/auth/verify", { code: codeIn(sent) }, { cookie });
    expect(verified.status).toBe(200);
    expect(((await verified.json()) as AccountResponse).account.emailVerified).toBe(true);
    expect((await me(s, cookie)).account?.emailVerified).toBe(true);
    // Verified is the end: no new code, and the code again just answers the account.
    expect(await errorOf(await s.call("/api/auth/verify/send", {}, { cookie }))).toMatchObject({ code: "already_verified" });
    expect((await s.call("/api/auth/verify", { code: codeIn(sent) }, { cookie })).status).toBe(200);
  });

  test("the code accepts spaces between the digits, and a code that is not 6 digits is refused without counting", async () => {
    const s = start();
    const { cookie } = await signUp(s);
    for (let i = 0; i < 6; i++) expect((await s.call("/api/auth/verify", { code: "12345" }, { cookie })).status).toBe(400);
    const code = codeIn(s.mail?.sent[0]);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect((await s.call("/api/auth/verify", { code: spaced }, { cookie })).status).toBe(200);
  });

  test("needs a session and this site", async () => {
    const s = start();
    expect(await errorOf(await s.call("/api/auth/verify", { code: "123456" }))).toMatchObject({ code: "not_signed_in" });
    expect(await errorOf(await s.call("/api/auth/verify/send", {}))).toMatchObject({ code: "not_signed_in" });
    const { cookie } = await signUp(s);
    const crossSite = await fetch(`${s.url}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", cookie },
      body: JSON.stringify({ code: "123456" }),
    });
    expect(await errorOf(crossSite)).toMatchObject({ code: "bad_origin" });
  });

  test("4 wrong tries say how many are left, the 5th ends the code, and then even the right code is refused", async () => {
    const s = start();
    const { cookie } = await signUp(s);
    const code = codeIn(s.mail?.sent[0]);
    for (const left of [4, 3, 2, 1]) {
      const res = await s.call("/api/auth/verify", { code: wrong(code) }, { cookie });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toMatchObject({ code: "code_wrong", triesLeft: left });
    }
    expect(await errorOf(await s.call("/api/auth/verify", { code: wrong(code) }, { cookie }))).toMatchObject({ code: "code_expired" });
    expect(await errorOf(await s.call("/api/auth/verify", { code }, { cookie }))).toMatchObject({ code: "code_expired" });
    expect((await me(s, cookie)).account?.emailVerified).toBe(false);
    // Unverified with no live code: a new code starts again.
    s.advance(MINUTE_MS);
    expect((await s.call("/api/auth/verify/send", {}, { cookie })).status).toBe(204);
    expect((await s.call("/api/auth/verify", { code: codeIn(s.mail?.sent.at(-1)) }, { cookie })).status).toBe(200);
  });

  test("a code works for 14 minutes 59 seconds and not at 15 minutes", async () => {
    const s = start();
    const first = await signUp(s, "early@example.org");
    const second = await signUp(s, "late@example.org");
    s.advance(15 * MINUTE_MS - 1000);
    expect((await s.call("/api/auth/verify", { code: codeIn(s.mail?.sent[0]) }, { cookie: first.cookie })).status).toBe(200);
    s.advance(1000);
    expect(await errorOf(await s.call("/api/auth/verify", { code: codeIn(s.mail?.sent[1]) }, { cookie: second.cookie }))).toMatchObject({ code: "code_expired" });
  });

  test("a new code at most once a minute: the old code stops working and the new one works", async () => {
    const s = start();
    const { cookie } = await signUp(s);
    const old = codeIn(s.mail?.sent[0]);
    s.advance(59 * 1000);
    const early = await s.call("/api/auth/verify/send", { language: "en" }, { cookie });
    expect(early.status).toBe(429);
    expect(await errorOf(early)).toMatchObject({ code: "rate_limited", retryAfterSeconds: 1 });
    s.advance(1000);
    expect((await s.call("/api/auth/verify/send", { language: "en" }, { cookie })).status).toBe(204);
    const fresh = codeIn(s.mail?.sent[1]);
    if (fresh !== old) expect(await errorOf(await s.call("/api/auth/verify", { code: old }, { cookie }))).toMatchObject({ code: "code_wrong" });
    expect((await s.call("/api/auth/verify", { code: fresh }, { cookie })).status).toBe(200);
  });

  test("at most 5 codes an hour, the sign-up's included", async () => {
    const s = start();
    const { cookie } = await signUp(s);
    for (let i = 0; i < 4; i++) {
      s.advance(MINUTE_MS);
      expect((await s.call("/api/auth/verify/send", {}, { cookie })).status).toBe(204);
    }
    s.advance(MINUTE_MS);
    const sixth = await s.call("/api/auth/verify/send", {}, { cookie });
    expect(sixth.status).toBe(429);
    // The sign-up's code was sent at minute 0, so a slot frees at minute 60.
    expect((await errorOf(sixth)).retryAfterSeconds).toBe(55 * 60);
    s.advance(55 * MINUTE_MS);
    expect((await s.call("/api/auth/verify/send", {}, { cookie })).status).toBe(204);
    expect(s.mail?.sent.length).toBe(6);
  });

  test("a failed send says so at sign-up and on a new code", async () => {
    const s = start();
    if (s.mail === null) throw new Error("mail expected");
    s.mail.failing = true;
    const { cookie, body } = await signUp(s);
    expect(body.verificationEmail).toBe("failed");
    s.advance(MINUTE_MS);
    expect(await errorOf(await s.call("/api/auth/verify/send", {}, { cookie }))).toMatchObject({ code: "mail_failed" });
  });

  test("without mail settings: sign-up says off, and no code can be sent or used", async () => {
    const s = start({ mail: false });
    const { cookie, body } = await signUp(s);
    expect(body.verificationEmail).toBe("off");
    expect(await errorOf(await s.call("/api/auth/verify/send", {}, { cookie }))).toMatchObject({ code: "mail_off" });
    expect(await errorOf(await s.call("/api/auth/verify", { code: "123456" }, { cookie }))).toMatchObject({ code: "code_expired" });
    expect(await errorOf(await s.call("/api/auth/reset/send", { email: "ada@example.org" }))).toMatchObject({ code: "mail_off" });
  });

  test("refuses a language it does not write", async () => {
    const s = start();
    const { cookie } = await signUp(s);
    s.advance(MINUTE_MS);
    expect((await s.call("/api/auth/verify/send", { language: "fr" }, { cookie })).status).toBe(400);
  });

  test("the code is stored hashed, and a restart keeps it working", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-email-"));
    directories.push(dataDir);
    let time = Date.parse("2026-11-13T09:00:00Z");
    const clock = { now: () => time, advance: (ms: number) => void (time += ms) };
    const s = start({ dataDir, clock });
    const { cookie } = await signUp(s);
    const code = codeIn(s.mail?.sent[0]);
    const file = readFileSync(join(dataDir, "auth", "codes.json"), "utf8");
    expect(file).not.toContain(code);
    expect(file).toContain("$argon2");
    const server = servers.pop();
    await server?.stop();

    const again = start({ dataDir, clock });
    expect((await again.call("/api/auth/verify", { code }, { cookie })).status).toBe(200);
    expect(readFileSync(join(dataDir, "auth", "codes.json"), "utf8")).not.toContain("verify");
  });
});

describe("password reset by email", () => {
  async function askReset(s: Setup, email: string, address = "203.0.113.9"): Promise<Response> {
    return s.call("/api/auth/reset/send", { email, language: "en" }, { address });
  }

  test("answers the same for an email with and without an account, and mails only the account", async () => {
    const s = start();
    await signUp(s);
    const before = s.mail?.sent.length ?? 0;
    const known = await askReset(s, "Ada@Example.org", "203.0.113.10");
    const unknown = await askReset(s, "nobody@example.org", "203.0.113.11");
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(await known.json()).toEqual(await unknown.json());
    await s.mail?.waitFor(before + 1);
    await Bun.sleep(50);
    expect(s.mail?.sent.length).toBe(before + 1);
    expect(s.mail?.sent.at(-1)?.to).toBe("ada@example.org");
    expect(s.mail?.sent.at(-1)?.text).toContain("new password");
  });

  test("the code and a new password set it, end every other session and sign this browser in", async () => {
    const s = start();
    const { cookie: oldSession } = await signUp(s);
    const before = s.mail?.sent.length ?? 0;
    await askReset(s, "ada@example.org");
    await s.mail?.waitFor(before + 1);
    const code = codeIn(s.mail?.sent.at(-1));

    const reset = await s.call("/api/auth/reset", { email: "ada@example.org", code, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    const fresh = cookieOf(reset);
    expect((await me(s, fresh)).account?.email).toBe("ada@example.org");
    // The code reached the mailbox, so the email counts as verified too.
    expect((await me(s, fresh)).account?.emailVerified).toBe(true);
    expect((await me(s, oldSession)).account).toBeNull();
    expect((await s.call("/api/auth/login", { email: "ada@example.org", password: PASSWORD })).status).toBe(401);
    expect((await s.call("/api/auth/login", { email: "ada@example.org", password: NEW_PASSWORD })).status).toBe(200);
    // Used once.
    expect(await errorOf(await s.call("/api/auth/reset", { email: "ada@example.org", code, password: "yet another password" }))).toMatchObject({ code: "code_invalid" });
  });

  test("a second request ends the first code", async () => {
    const s = start();
    await signUp(s);
    let count = s.mail?.sent.length ?? 0;
    await askReset(s, "ada@example.org", "203.0.113.60");
    await s.mail?.waitFor(++count);
    const first = codeIn(s.mail?.sent.at(-1));
    s.advance(MINUTE_MS);
    await askReset(s, "ada@example.org", "203.0.113.61");
    await s.mail?.waitFor(++count);
    const second = codeIn(s.mail?.sent.at(-1));
    if (first !== second) {
      expect(await errorOf(await s.call("/api/auth/reset", { email: "ada@example.org", code: first, password: NEW_PASSWORD }))).toMatchObject({ code: "code_invalid" });
    }
    expect((await s.call("/api/auth/reset", { email: "ada@example.org", code: second, password: NEW_PASSWORD })).status).toBe(200);
  });

  test("one error for a wrong code, no code and an unknown email; a password problem is named", async () => {
    const s = start();
    await signUp(s);
    expect(await errorOf(await s.call("/api/auth/reset", { email: "ada@example.org", code: "123456", password: NEW_PASSWORD }))).toMatchObject({ code: "code_invalid" });
    expect(await errorOf(await s.call("/api/auth/reset", { email: "nobody@example.org", code: "123456", password: NEW_PASSWORD }))).toMatchObject({ code: "code_invalid" });
    expect(await errorOf(await s.call("/api/auth/reset", { email: "ada@example.org", code: "123456", password: "short" }))).toMatchObject({ code: "password_too_short" });
  });

  test("the 5th wrong code ends the reset code, and 15 minutes end it too", async () => {
    const s = start();
    await signUp(s, "ada@example.org");
    await signUp(s, "bea@example.org");
    let count = s.mail?.sent.length ?? 0;
    await askReset(s, "ada@example.org", "203.0.113.20");
    await s.mail?.waitFor(++count);
    const adaCode = codeIn(s.mail?.sent.at(-1));
    for (let i = 0; i < 5; i++) {
      expect(await errorOf(await s.call("/api/auth/reset", { email: "ada@example.org", code: wrong(adaCode), password: NEW_PASSWORD }))).toMatchObject({ code: "code_invalid" });
    }
    expect(await errorOf(await s.call("/api/auth/reset", { email: "ada@example.org", code: adaCode, password: NEW_PASSWORD }))).toMatchObject({ code: "code_invalid" });
    // A new request a minute later gives a code that works.
    s.advance(MINUTE_MS);
    await askReset(s, "ada@example.org", "203.0.113.22");
    await s.mail?.waitFor(++count);
    expect((await s.call("/api/auth/reset", { email: "ada@example.org", code: codeIn(s.mail?.sent.at(-1)), password: NEW_PASSWORD })).status).toBe(200);

    await askReset(s, "bea@example.org", "203.0.113.21");
    await s.mail?.waitFor(++count);
    const beaCode = codeIn(s.mail?.sent.at(-1));
    s.advance(15 * MINUTE_MS);
    expect(await errorOf(await s.call("/api/auth/reset", { email: "bea@example.org", code: beaCode, password: NEW_PASSWORD }))).toMatchObject({ code: "code_invalid" });
  });

  test("per email: one code a minute and 5 an hour, silently, so the answer stays the same", async () => {
    const s = start();
    await signUp(s);
    let count = s.mail?.sent.length ?? 0;
    expect((await askReset(s, "ada@example.org", "203.0.113.30")).status).toBe(202);
    await s.mail?.waitFor(++count);
    // Another address, the same email, within the minute: the same answer and no mail.
    expect((await askReset(s, "ada@example.org", "203.0.113.31")).status).toBe(202);
    await Bun.sleep(50);
    expect(s.mail?.sent.length).toBe(count);
    for (let i = 0; i < 4; i++) {
      s.advance(MINUTE_MS);
      await askReset(s, "ada@example.org", `203.0.113.${40 + i}`);
      await s.mail?.waitFor(++count);
    }
    s.advance(MINUTE_MS);
    expect((await askReset(s, "ada@example.org", "203.0.113.50")).status).toBe(202);
    await Bun.sleep(50);
    expect(s.mail?.sent.length).toBe(count);
  });

  test("per address: one request a minute and 5 an hour, answered with 429", async () => {
    const s = start();
    expect((await askReset(s, "a@example.org")).status).toBe(202);
    const early = await askReset(s, "b@example.org");
    expect(early.status).toBe(429);
    expect(await errorOf(early)).toMatchObject({ code: "rate_limited" });
    for (let i = 0; i < 4; i++) {
      s.advance(MINUTE_MS);
      expect((await askReset(s, `c${i}@example.org`)).status).toBe(202);
    }
    s.advance(MINUTE_MS);
    expect((await askReset(s, "d@example.org")).status).toBe(429);
    expect((await askReset(s, "d@example.org", "203.0.113.99")).status).toBe(202);
  });

  test("an email that is not valid is named, because that reveals nothing about accounts", async () => {
    const s = start();
    expect(await errorOf(await askReset(s, "not an email"))).toMatchObject({ code: "email_invalid" });
  });
});
