import { expect, test } from "bun:test";
import { ConfigError, DEFAULT_DATA_DIR, DEFAULT_PORT, loadConfig } from "./config.ts";
import { PUBLIC_RULES, scaledPublicRules } from "./public-kinds.ts";

test("needs no variable and uses the defaults", () => {
  expect(loadConfig({})).toEqual({
    port: DEFAULT_PORT,
    host: undefined,
    dataDir: DEFAULT_DATA_DIR,
    secureCookies: false,
    trustProxy: false,
    arenaTtlHours: 24,
    publicArenaMax: 20,
    staticDir: undefined,
    leagueTimeZone: "Asia/Jakarta",
    publicTimeDivisor: 1,
    leagueShortDays: null,
    mail: null,
    adminEmails: [],
    metricsToken: null,
  });
  expect(loadConfig({ PORT: "9000" }).port).toBe(9000);
});

test("reads ADMIN_EMAILS as normalized emails and checks METRICS_TOKEN", () => {
  expect(loadConfig({ ADMIN_EMAILS: " Host@Example.org , second@example.org" }).adminEmails).toEqual(["host@example.org", "second@example.org"]);
  expect(() => loadConfig({ ADMIN_EMAILS: "host@example.org,not-an-email" })).toThrow(ConfigError);
  expect(loadConfig({ METRICS_TOKEN: "a-long-enough-token-1234" }).metricsToken).toBe("a-long-enough-token-1234");
  expect(() => loadConfig({ METRICS_TOKEN: "short" })).toThrow(ConfigError);
});

test("reads HOST, and an empty value means every interface", () => {
  expect(loadConfig({ HOST: "127.0.0.1" }).host).toBe("127.0.0.1");
  expect(loadConfig({ HOST: "" }).host).toBeUndefined();
});

test("ignores HOST_KEY, which no longer exists", () => {
  expect(loadConfig({ HOST_KEY: "short" })).not.toHaveProperty("hostKey");
});

test("reads DATA_DIR, and an empty value means the default", () => {
  expect(loadConfig({ DATA_DIR: "/var/lib/drench" }).dataDir).toBe("/var/lib/drench");
  expect(loadConfig({ DATA_DIR: "" }).dataDir).toBe(DEFAULT_DATA_DIR);
});

test("rejects a port that is not a port", () => {
  for (const PORT of ["abc", "-1", "70000", "80.5"]) {
    expect(() => loadConfig({ PORT })).toThrow(/PORT/);
  }
});

test("COOKIE_SECURE and TRUST_PROXY turn on only with \"1\"", () => {
  const on = loadConfig({ COOKIE_SECURE: "1", TRUST_PROXY: "1" });
  expect([on.secureCookies, on.trustProxy]).toEqual([true, true]);
  for (const value of ["0", "true", "yes", ""]) {
    const off = loadConfig({ COOKIE_SECURE: value, TRUST_PROXY: value });
    expect([off.secureCookies, off.trustProxy]).toEqual([false, false]);
  }
});

test("reads ARENA_TTL_HOURS and PUBLIC_ARENA_MAX, and rejects values out of range with the variable's name", () => {
  expect(loadConfig({ ARENA_TTL_HOURS: "0.5", PUBLIC_ARENA_MAX: "3" })).toMatchObject({ arenaTtlHours: 0.5, publicArenaMax: 3 , staticDir: undefined});
  for (const ARENA_TTL_HOURS of ["0", "-1", "abc"]) expect(() => loadConfig({ ARENA_TTL_HOURS })).toThrow(ConfigError);
  for (const PUBLIC_ARENA_MAX of ["0", "2.5", "many"]) expect(() => loadConfig({ PUBLIC_ARENA_MAX })).toThrow(/PUBLIC_ARENA_MAX/);
});

test("reads LEAGUE_TIME_ZONE and PUBLIC_TIME_DIVISOR, and rejects values out of range with the variable's name", () => {
  expect(loadConfig({ LEAGUE_TIME_ZONE: "Europe/Berlin", PUBLIC_TIME_DIVISOR: "9" })).toMatchObject({ leagueTimeZone: "Europe/Berlin", publicTimeDivisor: 9 });
  expect(() => loadConfig({ LEAGUE_TIME_ZONE: "Mars/Olympus" })).toThrow(/LEAGUE_TIME_ZONE/);
  for (const PUBLIC_TIME_DIVISOR of ["0", "10", "1.5", "fast"]) expect(() => loadConfig({ PUBLIC_TIME_DIVISOR })).toThrow(/PUBLIC_TIME_DIVISOR/);
});

test("the time divisor shortens every public wait and the turn, down to 100 ms, and keeps the turn count", () => {
  const fast = scaledPublicRules(9);
  expect(fast.tournament).toMatchObject({ countdownMs: 6667, readyCountdownMs: 556, breakMs: 2222, resultMs: 3333 });
  expect(fast.practice.settings).toMatchObject({ tickMs: 100, ticksPerRound: 60 });
  expect(scaledPublicRules(1)).toEqual(PUBLIC_RULES);
});

test("reads the mail settings, with port 465 by default", () => {
  const gmail = { SMTP_HOST: "smtp.gmail.com", SMTP_USER: "game@example.org", SMTP_PASS: "abcd efgh ijkl mnop", MAIL_FROM: "AlgoTank <game@example.org>" };
  expect(loadConfig(gmail).mail).toEqual({ host: "smtp.gmail.com", port: 465, login: { user: "game@example.org", pass: "abcd efgh ijkl mnop" }, from: "AlgoTank <game@example.org>" });
  expect(loadConfig({ ...gmail, SMTP_PORT: "587" }).mail?.port).toBe(587);
  expect(loadConfig({ SMTP_HOST: "relay.local", MAIL_FROM: "game@relay.local" }).mail?.login).toBeNull();
});

test("refuses half-set mail settings, so a typo fails at start and not at the first sign-up", () => {
  expect(() => loadConfig({ SMTP_USER: "a", SMTP_PASS: "b", MAIL_FROM: "c@d.e" })).toThrow(/SMTP_HOST/);
  expect(() => loadConfig({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a", MAIL_FROM: "c@d.e" })).toThrow(/SMTP_PASS/);
  expect(() => loadConfig({ SMTP_HOST: "smtp.gmail.com" })).toThrow(/MAIL_FROM/);
  for (const SMTP_PORT of ["0", "abc", "70000"]) expect(() => loadConfig({ SMTP_HOST: "h", MAIL_FROM: "c@d.e", SMTP_PORT })).toThrow(/SMTP_PORT/);
});

test("reads LEAGUE_SHORT_DAYS for a scripted run and refuses a value that does not fit", () => {
  expect(loadConfig({ LEAGUE_SHORT_DAYS: "2026-11-14T10:00:00Z/120/3" }).leagueShortDays).toEqual({ anchor: Date.parse("2026-11-14T10:00:00Z"), dayMs: 120_000, daysPerMonth: 3 });
  for (const value of ["2026-11-14T10:00:00Z/5/3", "soon/120/3", "2026-11-14T10:00:00Z/120/40", "120/3"]) {
    expect(() => loadConfig({ LEAGUE_SHORT_DAYS: value })).toThrow(ConfigError);
  }
});
