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
