/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QR_DEFAULT_PX, QR_MAX_PX, QR_MIN_PX, qrSide } from "./InvitePane.tsx";
import { qrMatrix, qrPath } from "./QrCode.tsx";
import { SharePanel, spacedCode } from "./SharePanel.tsx";

describe("QR code", () => {
  test("encodes a link as a square matrix with the three finder patterns", () => {
    const matrix = qrMatrix("https://algotank.example/a/K7M2QX");
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    // Each finder pattern has a dark corner module.
    expect(matrix.isDark(0, 0)).toBe(true);
    expect(matrix.isDark(0, matrix.size - 1)).toBe(true);
    expect(matrix.isDark(matrix.size - 1, 0)).toBe(true);
  });

  test("the path starts after the 4-module quiet zone", () => {
    expect(qrPath(qrMatrix("x")).startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});

describe("SharePanel", () => {
  test("shows the code in two groups, the link, and a named QR code", () => {
    const html = renderToStaticMarkup(<SharePanel link="https://algotank.example/a/K7M2QX" code="K7M2QX" />);
    expect(spacedCode("K7M2QX")).toBe("K7M 2QX");
    expect(html).toContain("K7M 2QX");
    expect(html).toContain('value="https://algotank.example/a/K7M2QX"');
    expect(html).toContain('aria-label="QR code that opens https://algotank.example/a/K7M2QX"');
  });

  test("the screen size shows the link as text, without the scheme", () => {
    const html = renderToStaticMarkup(<SharePanel link="https://algotank.example/a/K7M2QX" code="K7M2QX" size="screen" />);
    expect(html).toContain(">algotank.example/a/K7M2QX<");
    expect(html).not.toContain("<input");
  });
});

describe("qrSide", () => {
  test("the QR code takes the smaller side of its box, between the limits, and a default before the box is known", () => {
    expect(qrSide(null)).toBe(QR_DEFAULT_PX);
    expect(qrSide({ width: 328, height: 200 })).toBe(200);
    expect(qrSide({ width: 150, height: 400 })).toBe(150);
    expect(qrSide({ width: 900, height: 900 })).toBe(QR_MAX_PX);
    expect(qrSide({ width: 328, height: 40 })).toBe(QR_MIN_PX);
  });
});
