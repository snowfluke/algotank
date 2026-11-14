/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ApiFailure } from "../api/client.ts";
import { en } from "./messages.ts";
import { closedReason } from "./StreamStatus.tsx";

const notFound: ApiFailure = { ok: false, status: 404, error: { error: "That arena does not exist." }, code: null };

describe("closedReason", () => {
  test("an arena that was on screen and now answers 404 was closed", () => {
    expect(closedReason(notFound, true, en.connection)).toBe(en.connection.arenaClosed);
  });

  test("a 404 before the arena ever loaded is a wrong code, not a closed arena", () => {
    expect(closedReason(notFound, false, en.connection)).toBe(en.connection.notFound);
  });

  test("an arena that still answers asks for a reload", () => {
    expect(closedReason({ ok: true, data: null }, true, en.connection)).toBe(en.connection.closed);
  });
});
