import type { ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { formatTaka, type HoldingView, type PaymentAllocation } from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { AcceptedLogos } from './PaymentLogos';

/**
 * The checkout's summary, drawn as a ticket: what is being paid, how it
 * splits, how far the investment gets after it — and the step's main button,
 * so the next action always sits beside the total.
 */
export function PaymentTicket({
  view,
  allocations,
  action,
  className,
}: {
  view: HoldingView;
  allocations: PaymentAllocation[];
  action?: ReactNode;
  className?: string;
}) {
  const principal = allocations.reduce((t, a) => t + a.principal, 0);
  const lateFee = allocations.reduce((t, a) => t + a.late_fee, 0);
  const total = principal + lateFee;
  const before = view.progress_pct;
  const after = Math.round(((view.paid + principal) / view.holding.total_price) * 100);

  return (
    <div className={cn('overflow-hidden rounded-3xl bg-site-night text-white shadow-site-3', className)}>
      <div className="relative overflow-hidden px-6 pt-6 pb-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
        <img src={view.project.image} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-br from-site-night/70 via-site-night/90 to-site-night" />
        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.18em] text-site-brass uppercase">You are paying</p>
          <p className="font-display mt-2 text-[38px] leading-none font-semibold tracking-tight">
            <span className="font-taka tabular">{formatTaka(total)}</span>
          </p>
          <p className="mt-2.5 truncate text-sm font-semibold">{view.project.name}</p>
          <p className="tabular text-xs text-white/60">
            {view.holding.code} · {view.holding.shares} shares
          </p>
        </div>
      </div>

      {/* perforation */}
      <div aria-hidden className="relative h-5">
        <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-site-ivory" />
        <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-site-ivory" />
        <span className="absolute top-1/2 right-5 left-5 border-t-2 border-dashed border-white/15" />
      </div>

      <div className="space-y-4 px-6 pt-2 pb-6">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-white/60">Toward installments</dt>
            <dd className="font-taka tabular font-semibold">{formatTaka(principal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/60">Late fee</dt>
            <dd className={cn('font-taka tabular font-semibold', lateFee > 0 && 'text-site-brass')}>{formatTaka(lateFee)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/60">Gateway charge</dt>
            <dd className="font-semibold text-site-brass">Free</dd>
          </div>
        </dl>

        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">Price paid</span>
            <span className="tabular font-semibold">
              {before}% <span className="text-white/40">→</span> <span className="text-site-brass">{after}%</span>
            </span>
          </div>
          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-site-brass/80 transition-[width] duration-700 ease-site-out" style={{ width: `${after}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-site-primary-bright" style={{ width: `${before}%` }} />
          </div>
        </div>

        {action}

        <div className="flex flex-col items-center gap-2 border-t border-white/10 pt-4">
          <AcceptedLogos className="justify-center" />
          <p className="flex items-center gap-1.5 text-[11px] text-white/55">
            <LockKeyhole className="size-3" aria-hidden /> 256-bit encrypted · PCI DSS gateway · instant receipt
          </p>
        </div>
      </div>
    </div>
  );
}
