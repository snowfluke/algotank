// One small line chart of a 30-day series, drawn as plain SVG at the pixel width it measures, so
// its axis text stays at the caption size instead of scaling with a viewBox. One series per chart:
// the heading above it names it, so it has no legend. Axes: the first and the last day under the
// line, 0 and the highest value at the left. Each day has a point with a title for a mouse.

import { useBoxSize } from "../ui/useBoxSize.ts";

export interface ChartPoint {
  readonly day: string;
  readonly value: number;
}

export interface LineChartProps {
  readonly points: readonly ChartPoint[];
  /** The screen reader's sentence for the whole chart. */
  readonly summary: string;
  /** Formats a value for the axis and the point titles. */
  readonly formatValue: (n: number) => string;
  /** Formats a YYYY-MM-DD day for the x axis and the point titles. */
  readonly formatDay: (day: string) => string;
  readonly pointTitle: (day: string, value: string) => string;
}

/** The plot's height; the axis text adds AXIS_PX under it. */
const PLOT_PX = 72;
const AXIS_PX = 22;
const TOP_PX = 8;
/** Room at the left for the y-axis numbers at 14px. */
const LEFT_PX = 48;
const RIGHT_PX = 8;
const CAPTION_PX = 14;

export function LineChart({ points, summary, formatValue, formatDay, pointTitle }: LineChartProps) {
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const height = TOP_PX + PLOT_PX + AXIS_PX;
  const width = box?.width ?? 0;
  const max = Math.max(1, ...points.map((p) => p.value));
  const plotWidth = Math.max(0, width - LEFT_PX - RIGHT_PX);
  const x = (i: number) => LEFT_PX + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotWidth);
  const y = (value: number) => TOP_PX + PLOT_PX - (value / max) * PLOT_PX;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const step = points.length <= 1 ? plotWidth : plotWidth / (points.length - 1);

  return (
    <div ref={ref} className="min-w-0" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={summary} className="themed-svg block">
          <line x1={LEFT_PX} x2={width - RIGHT_PX} y1={TOP_PX + PLOT_PX} y2={TOP_PX + PLOT_PX} stroke="var(--color-line-strong, #b9b3a5)" strokeWidth={1} />
          <line x1={LEFT_PX} x2={LEFT_PX} y1={TOP_PX} y2={TOP_PX + PLOT_PX} stroke="var(--color-line-strong, #b9b3a5)" strokeWidth={1} />
          <g fill="var(--color-muted, #54616d)" fontSize={CAPTION_PX}>
            <text x={LEFT_PX - 6} y={TOP_PX + CAPTION_PX * 0.7} textAnchor="end">
              {formatValue(max)}
            </text>
            <text x={LEFT_PX - 6} y={TOP_PX + PLOT_PX} textAnchor="end">
              {formatValue(0)}
            </text>
            {first === undefined ? null : (
              <text x={LEFT_PX} y={height - 4} textAnchor="start">
                {formatDay(first.day)}
              </text>
            )}
            {last === undefined || points.length < 2 ? null : (
              <text x={width - RIGHT_PX} y={height - 4} textAnchor="end">
                {formatDay(last.day)}
              </text>
            )}
          </g>
          <path d={path} fill="none" stroke="var(--color-water, #1667c0)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last === undefined ? null : <circle cx={x(points.length - 1)} cy={y(last.value)} r={4} fill="var(--color-water, #1667c0)" />}
          {points.map((p, i) => (
            // A hit area wider than the line, so a mouse finds each day.
            <rect key={p.day} x={x(i) - step / 2} y={TOP_PX} width={Math.max(1, step)} height={PLOT_PX} fill="transparent">
              <title>{pointTitle(formatDay(p.day), formatValue(p.value))}</title>
            </rect>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
