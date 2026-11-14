// A QR code as one crisp SVG path, with the 4-module quiet zone the standard
// asks for so phone cameras find it. Dark modules are ink on a white square.

import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** Quiet zone in modules on each side (ISO/IEC 18004 asks for 4). */
const QUIET_ZONE = 4;

export interface QrMatrix {
  readonly size: number;
  isDark(row: number, column: number): boolean;
}

export function qrMatrix(text: string): QrMatrix {
  // Type 0 picks the smallest version that fits; "M" survives a smudged screen or glare.
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return { size: qr.getModuleCount(), isDark: (row, column) => qr.isDark(row, column) };
}

/** One path: a 1 by 1 square per dark module, offset by the quiet zone. */
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (matrix.isDark(row, column)) parts.push(`M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return parts.join("");
}

export interface QrCodeProps {
  readonly text: string;
  /** Width and height in CSS pixels. */
  readonly size: number;
  /** Accessible name, for example m.share.qrLabel(link). */
  readonly label: string;
}

export function QrCode({ text, size, label }: QrCodeProps) {
  const { side, path } = useMemo(() => {
    const matrix = qrMatrix(text);
    return { side: matrix.size + QUIET_ZONE * 2, path: qrPath(matrix) };
  }, [text]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${side} ${side}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="block h-auto max-w-full shrink-0 rounded-[var(--radius-control)]"
    >
      <rect width={side} height={side} fill="#ffffff" />
      <path d={path} style={{ fill: "var(--color-ink)" }} />
    </svg>
  );
}
