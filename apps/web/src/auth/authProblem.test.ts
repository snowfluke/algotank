/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ApiFailure } from "../api/client.ts";
import { en, id } from "../api/messages.ts";
import { authProblem } from "./authProblem.ts";

const failure = (status: number, code: string | null, retryAfterSeconds?: number): ApiFailure => ({
  ok: false,
  status,
  error: retryAfterSeconds === undefined ? { error: "x" } : { error: "x", retryAfterSeconds },
  code,
});

describe("authProblem", () => {
  test("puts each code next to its field", () => {
    expect(authProblem(failure(409, "email_taken"), "register", en)).toEqual({ field: "email", sentence: en.codes.email_taken });
    expect(authProblem(failure(400, "password_too_short"), "register", id).field).toBe("password");
    expect(authProblem(failure(401, "invalid_credentials"), "signIn", en).field).toBe("password");
  });

  test("a wait or a lost connection belongs to the whole form", () => {
    const limited = authProblem(failure(429, "rate_limited", 120), "signIn", en);
    expect(limited.field).toBe("form");
    expect(limited.sentence).toContain("2 minutes");
    expect(authProblem(failure(0, "network_error"), "signIn", en).field).toBe("form");
  });
});
