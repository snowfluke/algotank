import { expect, test } from "bun:test";
import { codeDigits } from "./VerifyEmailStep.tsx";

test("keeps the six digits of a typed or pasted code", () => {
  expect(codeDigits("123 456")).toBe("123456");
  expect(codeDigits("Code: 987654")).toBe("987654");
  expect(codeDigits("12345678")).toBe("123456");
  expect(codeDigits("abc")).toBe("");
});
