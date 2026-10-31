'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarClock, Check, CircleX, Copy, Download, Loader2, RotateCcw } from 'lucide-react';
import { Button, ButtonLink } from '@/components/public/ui/Button';
import { allocationLabel, formatDay } from '@/lib/domain/investor-portal';
import { investorRepository, type PaymentIntent } from '@/lib/repositories/investor/investor.mock.repository';
import { CheckoutSteps } from '../CheckoutSteps';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { Money, PortalSkeleton, ProgressBar } from '../ui';

const FAIL_TITLE: Record<string, string> = {
  failed: 'Payment not completed',
  cancelled: 'Payment cancelled',
  expired: 'Payment session timed out',
};

export function PaymentResultPage({ intentId }: { intentId: string }) {
  const router = useRouter();
  const { portfolio } = useCustomerPortal();
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    investorRepository.intent(intentId).then((i) => {
      // an unknown or unfinished checkout has no result to show
      if (!i || i.status === 'pending') router.replace('/investor/payments');
      else setIntent(i);
    });
  }, [intentId, router]);

  if (!intent) return <PortalSkeleton />;

  const ok = intent.status === 'paid';
  const v = portfolio.holdings.find((h) => h.holding.code === intent.holding_code);

  const retry = async () => {
    setRetrying(true);
    const fresh = await investorRepository.createIntent(intent.holding_code, intent.total, intent.option);
    router.push(`/investor/gateway/${fresh.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-4">
        <p className="text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">Payments</p>
        <div className="rounded-2xl border border-site-line bg-white px-4 py-3 shadow-site-1 sm:py-3.5">
          <CheckoutSteps current={ok ? 3 : 2} failed={!ok} />
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl border border-site-line bg-white shadow-site-2">
        <div className={ok ? 'relative overflow-hidden bg-site-night px-5 py-8 text-center text-white sm:px-6 sm:py-10' : 'bg-site-soft px-5 py-8 text-center sm:px-6 sm:py-10'}>
          {ok && <div aria-hidden className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-site-primary-bright/30 blur-3xl" />}
          <span
            className={
              ok
                ? 'relative mx-auto grid size-20 place-items-center rounded-full bg-site-primary-bright ring-8 ring-site-primary-bright/20 motion-safe:animate-[fade-up_.5s_var(--ease-site-out)_both]'
                : 'mx-auto grid size-20 place-items-center rounded-full bg-red-50 text-site-danger ring-8 ring-red-50/60'
            }
          >
            {ok ? <Check className="size-10 text-white" strokeWidth={3} aria-hidden /> : <CircleX className="size-10" aria-hidden />}
          </span>
          <h1 className="relative mt-6 text-2xl font-semibold sm:text-3xl">{ok ? 'Payment successful' : FAIL_TITLE[intent.status]}</h1>
          <Money amount={intent.total} className={ok ? 'font-display relative mt-3 block text-4xl font-semibold sm:text-5xl' : 'font-display mt-3 block text-4xl font-semibold text-site-muted line-through decoration-2'} />
          <p className={ok ? 'relative mt-3 text-white/70' : 'mx-auto mt-3 max-w-md text-site-muted'}>
            {ok ? `Received for ${v?.project.name}. A receipt has been sent by SMS and email.` : intent.failure_reason}
          </p>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          {ok && (
            <div className="grid gap-px overflow-hidden rounded-2xl border border-site-line bg-site-line sm:grid-cols-2">
              {[
                ['Transaction ID', (
                  <span key="t" className="flex items-center gap-2">
                    <span className="font-mono">{intent.reference}</span>
                    <button
                      type="button"
                      aria-label="Copy transaction ID"
                      onClick={() => {
                        navigator.clipboard?.writeText(intent.reference ?? '');
                        setCopied(true);
                      }}
                      className="text-site-muted hover:text-site-primary"
                    >
                      {copied ? <Check className="size-4 text-site-primary" /> : <Copy className="size-4" />}
                    </button>
                  </span>
                )],
                ['Receipt', <span key="r" className="tabular">{intent.receipt_no}</span>],
                ['Paid with', intent.method_detail],
                ['Date and time', new Date(intent.completed_at ?? intent.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
              ].map(([k, val]) => (
                <div key={k as string} className="bg-white p-4">
                  <p className="text-xs text-site-muted">{k}</p>
                  <div className="mt-0.5 font-semibold">{val}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold">{ok ? 'Applied to' : 'This payment was for'}</p>
            <ul className="mt-2 divide-y divide-site-line rounded-2xl border border-site-line">
              {intent.allocations.map((a) => (
                <li key={a.installment_id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                  <span>{allocationLabel(v, a)}</span>
                  <span className="text-right">
                    <Money amount={a.principal} className="font-semibold" />
                    {a.late_fee > 0 && (
                      <span className="block text-xs text-site-muted">
                        + <Money amount={a.late_fee} /> late fee
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {ok && v && (
            <div className="rounded-2xl bg-site-ivory p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-site-muted">Price paid on this investment</span>
                <span className="tabular font-semibold">{v.progress_pct}%</span>
              </div>
              <ProgressBar pct={v.progress_pct} className="mt-2 h-2.5" />
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-site-muted">Outstanding now</p>
                  <Money amount={v.outstanding} className="font-semibold" />
                </div>
                <div>
                  <p className="text-site-muted">{v.next?.status === 'overdue' ? 'Still overdue' : 'Next payment'}</p>
                  {v.next ? (
                    <p className={v.next.status === 'overdue' ? 'flex items-center gap-1.5 font-semibold text-site-danger' : 'flex items-center gap-1.5 font-semibold'}>
                      <CalendarClock className="size-4 text-site-primary" aria-hidden />
                      <Money amount={v.next.remaining + v.next.late_fee_due} /> · {formatDay(v.next.due_date)}
                    </p>
                  ) : (
                    <p className="font-semibold text-site-primary-dark">All paid</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {ok ? (
              <>
                <ButtonLink href={`/investor/receipts/${intent.receipt_no}`} icon={<Download className="size-4" />}>
                  Download receipt
                </ButtonLink>
                <ButtonLink href="/investor" variant="outline">
                  Back to overview
                </ButtonLink>
              </>
            ) : (
              <>
                <Button onClick={retry} disabled={retrying} icon={retrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}>
                  Try again
                </Button>
                <ButtonLink href={`/investor/payments?holding=${intent.holding_code}`} variant="outline">
                  Change amount
                </ButtonLink>
              </>
            )}
          </div>
          <p className="text-center text-xs text-site-muted">
            Order <span className="font-mono">{intent.id}</span>
            {!ok && ' · if money was taken from your account, it is returned automatically within 3–7 working days.'}
          </p>
        </div>
      </div>
    </div>
  );
}
