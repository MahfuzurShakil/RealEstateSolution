import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, ShieldCheck, type LucideIcon } from 'lucide-react';
import {
  CUSTOMER_TYPE_LABEL,
  HOLDING_HEALTH_LABEL,
  INSTALLMENT_STATUS_LABEL,
  formatTaka,
  type CustomerType,
  type HoldingHealth,
  type InstallmentStatus,
} from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';

/** Money in the portal: tabular digits, the ৳ sign in the face that draws it. */
export function Money({ amount, className }: { amount: number; className?: string }) {
  return <span className={cn('tabular font-taka whitespace-nowrap', className)}>{formatTaka(amount)}</span>;
}

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">{eyebrow}</p>}
        <h1 className="mt-1 text-[28px] leading-tight font-semibold sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-site-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn('rounded-3xl border border-site-line bg-white shadow-site-1', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-site-line px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn(padded && 'p-5 sm:p-6')}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: 'default' | 'danger' | 'primary' }) {
  return (
    <div
      className={cn(
        'rounded-3xl border bg-white p-5 shadow-site-1',
        tone === 'danger' ? 'border-site-danger/30' : 'border-site-line',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-site-muted">{label}</p>
        <span
          className={cn(
            'grid size-9 place-items-center rounded-xl',
            tone === 'danger' ? 'bg-red-50 text-site-danger' : tone === 'primary' ? 'bg-site-primary text-white' : 'bg-site-primary-soft text-site-primary',
          )}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>
      <p className={cn('font-display mt-3 text-2xl font-semibold tracking-tight', tone === 'danger' && 'text-site-danger')}>{value}</p>
      {hint && <p className="mt-1 text-[13px] text-site-muted">{hint}</p>}
    </div>
  );
}

const STATUS: Record<InstallmentStatus, { cls: string; Icon: LucideIcon }> = {
  paid: { cls: 'bg-site-primary-soft text-site-primary-dark', Icon: CheckCircle2 },
  overdue: { cls: 'bg-red-50 text-site-danger', Icon: AlertTriangle },
  due: { cls: 'bg-site-booked-soft text-site-booked', Icon: Clock3 },
  upcoming: { cls: 'bg-site-sold-soft text-site-sold', Icon: CircleDashed },
};

/** Paid / Overdue / Due / Upcoming — icon and word, never colour alone. */
export function StatusPill({ status, className }: { status: InstallmentStatus; className?: string }) {
  const { cls, Icon } = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', cls, className)}>
      <Icon className="size-3.5" aria-hidden />
      {INSTALLMENT_STATUS_LABEL[status]}
    </span>
  );
}

const HEALTH: Record<HoldingHealth, InstallmentStatus> = { overdue: 'overdue', on_track: 'due', fully_paid: 'paid' };

export function HealthPill({ health, className }: { health: HoldingHealth; className?: string }) {
  const { cls, Icon } = STATUS[HEALTH[health]];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', health === 'on_track' ? 'bg-site-primary-soft text-site-primary-dark' : cls, className)}>
      {health === 'on_track' ? <ShieldCheck className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
      {HOLDING_HEALTH_LABEL[health]}
    </span>
  );
}

export function CustomerTypeBadge({ type, className }: { type: CustomerType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-site-brass/15 px-3 py-1 text-xs font-semibold text-site-brass-dark', className)}>
      <ShieldCheck className="size-3.5" aria-hidden />
      Customer type: {CUSTOMER_TYPE_LABEL[type]}
    </span>
  );
}

export function ProgressBar({ pct, className, tone = 'primary' }: { pct: number; className?: string; tone?: 'primary' | 'danger' }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-site-soft', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-site-out', tone === 'danger' ? 'bg-site-danger' : 'bg-site-primary')}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/** Label / value rows for detail panels. */
export function DetailList({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('divide-y divide-site-line', className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 py-3 text-[15px] sm:gap-6">
          <dt className="shrink-0 text-site-muted">{k}</dt>
          <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyNote({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-site-primary-soft text-site-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-site-muted">{body}</p>}
    </div>
  );
}

export function PortalSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6 p-6 lg:p-10" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-72 rounded-xl bg-site-line" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-3xl bg-white" />
        ))}
      </div>
      <div className="h-80 rounded-3xl bg-white" />
    </div>
  );
}
