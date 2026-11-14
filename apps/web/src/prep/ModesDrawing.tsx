// The picture at the top of the modes step (71-workshop-appeal.md, C3): two lists of
// rules side by side, each under its own tab, and an arrow from one rule of the first
// list into the second list. It shows without words that a mode is one more list of
// rules and that a rule can move the tank to it. Decoration; the sentence beside it
// says the same.

const BAR_W = 34;
const BAR_H = 6;

function List({ x, flag, highlight }: { readonly x: number; readonly flag: boolean; readonly highlight: number | null }) {
  return (
    <g transform={`translate(${x} 0)`}>
      {/* The tab of the mode, like a chip of the mode strip. */}
      <rect x={0} y={2} width={24} height={9} rx={3} strokeWidth={1.2} style={{ fill: "var(--color-water-soft)", stroke: "var(--color-water)" }} />
      {flag ? <path d="M5 4.5 V9.5 M5 4.8 H10 L8.6 6.3 L10 7.8 H5" fill="none" strokeWidth={1.1} strokeLinejoin="round" style={{ stroke: "var(--color-ink)" }} /> : null}
      <line x1={0} y1={11.5} x2={44} y2={11.5} strokeWidth={1.2} style={{ stroke: "var(--color-water)" }} />
      {/* The order line and three rules, the last one "If no rule fits". */}
      <line x1={4} y1={16} x2={4} y2={42} strokeWidth={1.4} strokeLinecap="round" style={{ stroke: "var(--color-water-light)" }} />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${15 + i * 11})`}>
          <circle cx={4} cy={BAR_H / 2} r={2.6} style={{ fill: i === 2 ? "var(--color-panel)" : "var(--color-water)", stroke: "var(--color-water)" }} strokeWidth={0.8} />
          <rect x={9} y={0} width={BAR_W} height={BAR_H} rx={2} strokeWidth={1} style={{ fill: "var(--color-panel)", stroke: i === highlight ? "var(--color-water-deep)" : "var(--color-line-strong)" }} />
          <rect x={11} y={1.6} width={12} height={2.8} rx={1.2} style={{ fill: "var(--color-water-soft)" }} />
          <rect x={26} y={1.6} width={14} height={2.8} rx={1.2} style={{ fill: "var(--color-ok-soft)", stroke: "var(--color-ok)" }} strokeWidth={0.5} />
        </g>
      ))}
    </g>
  );
}

export function ModesDrawing() {
  return (
    <svg viewBox="0 0 112 52" aria-hidden="true" className="block h-full max-h-28 w-auto max-w-full">
      <List x={2} flag highlight={0} />
      <List x={64} flag={false} highlight={null} />
      {/* From the first rule of the first mode into the top of the second mode. */}
      <path d="M45 18 C 56 18, 54 6, 64 7" fill="none" strokeWidth={1.6} strokeLinecap="round" style={{ stroke: "var(--color-water-deep)" }} />
      <path d="M60.5 4.2 L64.6 7 L60.6 9.8" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--color-water-deep)" }} />
    </svg>
  );
}
