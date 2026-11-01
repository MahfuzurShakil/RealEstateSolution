import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { ShareOfferingStatus } from '@/lib/db/types';
import { OFFERING_STATUS_META, SALE_HEALTH_META, type OfferingAvailability, type SaleHealth } from '@/lib/domain/share-sale';
import { cn } from '@/lib/utils/cn';

export function OfferingBadge({ state }: { state: ShareOfferingStatus | 'expired' }) {
  const m = OFFERING_STATUS_META[state];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function SaleBadge({ health }: { health: SaleHealth }) {
  const m = SALE_HEALTH_META[health];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** A headline number; with `href` the tile is a link. */
export function Kpi({ label, value, hint, icon: Icon, tone = 'default', href }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: 'default' | 'danger'; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <span className={cn('grid size-8 place-items-center rounded-lg', tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-admin-50 text-admin-600')}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn('mt-2 text-lg font-semibold tabular-nums', tone === 'danger' ? 'text-red-600' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </>
  );
  const cls = 'rounded-2xl border border-hairline bg-white p-4 shadow-sm';
  return href ? (
    <Link href={href} className={cn(cls, 'block transition-colors hover:border-admin-300')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Sold / reserved / free shares of one offering as one bar. */
export function AvailabilityBar({ a, total, compact = false }: { a: OfferingAvailability; total: number; compact?: boolean }) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className={compact ? 'min-w-36' : ''}>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        <span className="h-full bg-admin-500" style={{ width: `${pct(a.sold)}%` }} />
        <span className="h-full bg-amber-400" style={{ width: `${pct(a.reserved)}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-muted tabular-nums">
        <span className="font-semibold text-ink">{a.sold}</span> sold
        {a.reserved > 0 && (
          <>
            {' · '}
            <span className="font-semibold text-amber-700">{a.reserved}</span> reserved
          </>
        )}
        {' · '}
        {a.available} left{!compact && ` of ${total}`}
      </p>
    </div>
  );
}

/** The tab strip of a detail page — the same pill row the project page uses. */
export function DetailTabs<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (key: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn('rounded-lg px-4 py-2 text-sm font-medium transition-colors', active === t.key ? 'bg-admin-500 text-white' : 'text-ink-muted hover:bg-admin-50 hover:text-admin-700')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** One label / value line in a detail card. */
export function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className={cn('min-w-0 text-right tabular-nums [overflow-wrap:anywhere]', strong ? 'font-semibold text-ink' : 'font-medium text-ink')}>{children}</span>
    </div>
  );
}
