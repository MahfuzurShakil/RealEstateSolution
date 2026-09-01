import { cn } from '@/lib/utils/cn';

/**
 * Actual progress as a filled bar, with the planned position marked on it.
 *
 * The marker is the whole point: a bare "62%" says nothing about whether that
 * is good news. Where the tick sits relative to the fill is the delay, read at
 * a glance, which is what Section 6.3's planned-vs-actual is for.
 */
export function ProgressBar({
  value,
  planned,
  behind: behindProp,
  tone = 'auto',
  size = 'md',
  className,
}: {
  value: number;
  /** planned % today; omit when the item has no plan dates */
  planned?: number | null;
  /**
   * Whether this is behind schedule, when the caller already knows.
   *
   * For a single work item, `value` and `planned` are the same measurement and
   * subtracting them is the delay. For a roll-up they are not: the actual is
   * weighted over every item, while the planned can only be weighted over the
   * items that HAVE plan dates. Deriving a verdict from those two made the bar
   * turn red under a badge that said "On Track". So a caller holding a rollup
   * passes its verdict, and only per-item bars fall back to the subtraction.
   */
  behind?: boolean;
  tone?: 'auto' | 'teal';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const behind = behindProp ?? (planned != null && pct - planned < -5);
  const done = pct >= 100;

  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-slate-100',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            tone === 'teal'
              ? 'bg-admin-500'
              : done
                ? 'bg-emerald-500'
                : behind
                  ? 'bg-red-500'
                  : 'bg-admin-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {planned != null && (
        <span
          // the tick sits on top of the track, so it stays visible over the fill
          className={cn(
            'absolute top-0 w-0.5 -translate-x-1/2 rounded-full bg-ink/50',
            size === 'sm' ? 'h-1.5' : 'h-2.5',
          )}
          style={{ left: `${Math.min(100, Math.max(0, planned))}%` }}
          title={`Planned ${planned.toFixed(0)}% by today`}
          aria-hidden
        />
      )}
    </div>
  );
}
