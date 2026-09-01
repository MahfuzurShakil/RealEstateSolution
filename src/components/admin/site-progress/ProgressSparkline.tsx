import type { ProgressPoint } from '@/lib/domain/site-progress';
import { cn } from '@/lib/utils/cn';

/**
 * Actual vs planned progress over time — the construction S-curve.
 *
 * A single "62%, planned 67%" gives the gap today but not which way it is
 * moving, and on a three-year build that is the only question worth asking:
 * a project 5 points behind and closing is fine, one 5 points behind and
 * widening is not. Every reading carries its own date, so the curve is
 * rebuilt from the log (see `progressSeries`) — nothing extra is stored.
 *
 * Inline SVG on purpose: no chart library, and it inherits the theme.
 */
export function ProgressSparkline({
  series,
  height = 44,
  className,
}: {
  series: ProgressPoint[];
  height?: number;
  className?: string;
}) {
  // two points is the minimum that draws a line rather than a dot
  if (series.length < 2) return null;

  const width = 160;
  const pad = 2;
  const usable = height - pad * 2;

  /*
   * The vertical scale is anchored at zero but its top adapts to the data.
   *
   * A fixed 0–100 axis is defensible, but on a 44px sparkline it squashes a
   * project at 37% into the bottom third, where the actual and planned lines
   * overlap and the shape — the only thing this chart is for — disappears.
   * Keeping zero as the floor means the curve can still never exaggerate the
   * direction or the relative size of the gap, and the exact percentages are
   * printed next to the chart anyway.
   */
  const peak = series.reduce(
    (max, p) => Math.max(max, p.actual, p.planned ?? 0),
    0,
  );
  const top = Math.min(100, Math.max(10, Math.ceil(peak * 1.15)));

  const x = (i: number) => (i / (series.length - 1)) * width;
  const y = (pct: number) => pad + usable - (Math.min(top, Math.max(0, pct)) / top) * usable;

  const actualPath = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.actual)}`).join(' ');

  // the planned line breaks wherever the plan is unknown, rather than
  // dropping to zero and inventing a cliff that never happened
  const plannedSegments: string[] = [];
  let current: string[] = [];
  series.forEach((p, i) => {
    if (p.planned === null) {
      if (current.length > 1) plannedSegments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${x(i)},${y(p.planned)}`);
  });
  if (current.length > 1) plannedSegments.push(current.join(' '));

  const last = series[series.length - 1];
  const behind = last.planned !== null && last.actual - last.planned < -5;
  const stroke = behind ? 'var(--color-red-500, #ef4444)' : 'var(--color-admin-500, #0d919c)';

  const areaPath = `${actualPath} L${width},${height} L0,${height} Z`;
  const gradientId = `spark-${behind ? 'behind' : 'ok'}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
      role="img"
      aria-label={`Progress over time, scaled 0 to ${top}%: now ${last.actual.toFixed(0)}%${
        last.planned === null ? '' : `, planned ${last.planned.toFixed(0)}%`
      }`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={areaPath} fill={`url(#${gradientId})`} />

      {plannedSegments.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          className="text-slate-300"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <path
        d={actualPath}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      <circle cx={width} cy={y(last.actual)} r="2.5" fill={stroke} />
    </svg>
  );
}
