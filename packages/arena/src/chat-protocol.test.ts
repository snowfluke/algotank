import { describe, expect, test } from "bun:test";
import { CHAT_LIMITS, parseChatText } from "./chat-protocol.ts";

describe("parseChatText", () => {
  test.each<[string, unknown, string]>([
    ["trims the ends", "  hai  ", "hai"],
    ["joins lines with one space", "ayo\r\nmulai\n\nsekarang", "ayo mulai sekarang"],
    ["makes a tab and a run of spaces one space", "a\t\tb   c", "a b c"],
    ["removes control characters", "he\u0000llo\u0007", "hello"],
    ["removes the bidi controls that reverse text", "abc‮def⁦", "abcdef"],
    ["keeps an emoji with a zero-width joiner", "hi \u{1F468}‍\u{1F469}", "hi \u{1F468}‍\u{1F469}"],
  ])("%s", (_label, value, expected) => {
    expect(parseChatText(value)).toBe(expected);
  });

  test("counts code points, so 200 emoji pass and 201 characters do not", () => {
    expect(parseChatText("\u{1F600}".repeat(CHAT_LIMITS.textMax))).toBe("\u{1F600}".repeat(CHAT_LIMITS.textMax));
    expect(parseChatText("x".repeat(CHAT_LIMITS.textMax + 1))).toBeNull();
  });

  test.each([undefined, null, 5, {}, "", "   ", "\n\u0000\n"])("refuses %p", (value) => {
    expect(parseChatText(value)).toBeNull();
  });
});
