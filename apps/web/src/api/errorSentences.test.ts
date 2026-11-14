/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ApiFailure } from "./client.ts";
import { describeError, errorSentence, isTokenRefused } from "./errorSentences.ts";
import { en, id } from "./messages.ts";

const failure = (status: number, error: string, code: string | null = null, extra: Partial<ApiFailure["error"]> = {}): ApiFailure => ({
  ok: false,
  status,
  error: { error, ...extra },
  code,
});

describe("errorSentence with a code", () => {
  test("uses the sentence that fits the action", () => {
    expect(errorSentence(failure(409, "x", "wrong_phase"), "join", en)).toContain("already started");
    expect(errorSentence(failure(409, "x", "wrong_phase"), "saveStrategy", en)).toContain("saves when the round ends");
  });

  test("falls back to the general sentence of the code", () => {
    expect(errorSentence(failure(409, "x", "name_taken"), "join", en)).toContain("different one");
    expect(errorSentence(failure(409, "x", "arena_limit"), "create", en)).toContain("already have an open arena");
    expect(errorSentence(failure(401, "x", "invalid_credentials"), "signIn", en)).toContain("not right");
  });

  test("rate_limited says how long to wait", () => {
    expect(errorSentence(failure(429, "x", "rate_limited", { retryAfterSeconds: 42 }), "join", en)).toContain("42 seconds");
    expect(errorSentence(failure(429, "x", "rate_limited", { retryAfterSeconds: 600 }), "signIn", en)).toContain("10 minutes");
    expect(errorSentence(failure(429, "x", "rate_limited", { retryAfterSeconds: 42 }), "join", id)).toContain("42 detik");
  });

  test("a client failure carries its own code", () => {
    expect(errorSentence(failure(0, "network_error", "network_error"), "create", en)).toContain("cannot reach the server");
    expect(errorSentence(failure(502, "bad_response", "bad_response"), "create", en)).toContain("cannot read");
  });

  test("a code named like an Object property is unknown", () => {
    expect(errorSentence(failure(500, "x", "constructor"), "join", en)).toBe(en.generic);
  });

  test("Indonesian has a sentence for every code", () => {
    for (const code of Object.keys(en.codes)) {
      const sentence = errorSentence(failure(409, "x", code), "create", id);
      expect(sentence).toBe(id.codes[code as keyof typeof id.codes]);
    }
  });
});

describe("errorSentence without a code", () => {
  test("a refused token names what to do for the action", () => {
    expect(errorSentence(failure(403, "The player token is not correct."), "saveStrategy", en)).toContain("join again");
    expect(errorSentence(failure(403, "x"), "saveStrategy", id)).toContain("gabung lagi");
  });

  test("a 404 says the arena does not exist", () => {
    expect(errorSentence(failure(404, "That arena does not exist."), "join", en)).toBe(en.notFound);
  });

  test("never shows the server's English text", () => {
    expect(errorSentence(failure(400, "The strategy has problems."), "saveStrategy", id)).toBe(id.invalid);
    const sentence = errorSentence(failure(500, "stack trace here"), "join", en);
    expect(sentence).toBe(en.generic);
  });
});

describe("describeError and isTokenRefused", () => {
  test("keeps the validation messages", () => {
    expect(describeError(failure(400, "The strategy has problems.", null, { details: ["Rule 1 is empty."] }), "saveStrategy", en)).toEqual({
      sentence: en.invalid,
      details: ["Rule 1 is empty."],
    });
  });

  test("401 and 403 mean the token was refused", () => {
    expect(isTokenRefused(failure(401, ""))).toBe(true);
    expect(isTokenRefused(failure(403, ""))).toBe(true);
    expect(isTokenRefused(failure(409, ""))).toBe(false);
  });
});
