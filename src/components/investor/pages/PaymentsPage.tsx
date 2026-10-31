'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleCheckBig, Info, Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import {
  MIN_PART_PAYMENT,
  allocatePayment,
  amountChoices,
  formatDay,
  formatTaka,
  maxPayable,
  type AmountOption,
  type HoldingView,
} from '@/lib/domain/investor-portal';
import { investorRepository } from '@/lib/repositories/investor/investor.mock.repository';
import { cn } from '@/lib/utils/cn';
import { formatPhone, formatTakaWords } from '@/lib/utils/format';
import { CheckoutSteps } from '../CheckoutSteps';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { InvestmentSelect } from '../InvestmentSelect';
import { PaymentTicket } from '../PaymentTicket';
import { EmptyNote, Money, PageHeading, Panel, StatusPill } from '../ui';

function defaultOption(v: HoldingView): AmountOption {
  return amountChoices(v)[0].id;
}

/** Phones: the total and the step's button stay pinned to the bottom of the screen. */
function MobileBar({ total, children }: { total: number; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-site-night px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-site-3 lg:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-site-brass uppercase">Total</p>
          <p className="font-display truncate text-xl leading-tight font-semibold">
            <span className="font-taka tabular">{formatTaka(total)}</span>
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-site-muted uppercase">{children}</p>;
}

export function PaymentsPage({ holdingFilter }: { holdingFilter: string | null }) {
  const router = useRouter();
  const { snapshot, portfolio } = useCustomerPortal();
  const payable = portfolio.holdings.filter((v) => maxPayable(v) > 0);

  const firstCode = useMemo(() => {
    const pick = payable.find((v) => v.holding.code === holdingFilter) ?? payable.find((v) => v.due_now > 0) ?? payable[0];
    return pick?.holding.code ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [code, setCode] = useState<string | null>(firstCode);
  const view = payable.find((v) => v.holding.code === code) ?? payable[0];
  const [option, setOption] = useState<AmountOption | null>(view ? defaultOption(view) : null);
  const [custom, setCustom] = useState('');
  const [step, setStep] = useState<0 | 1>(0);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!view || !option) {
    return (
      <div className="space-y-8">
        <PageHeading eyebrow="Payments" title="Make a payment" />
        <Panel>
          <EmptyNote icon={CircleCheckBig} title="Nothing to pay" body="Every installment on your account is paid. Thank you." />
        </Panel>
      </div>
    );
  }

  const choices = amountChoices(view);
  const max = maxPayable(view);
  const min = Math.min(MIN_PART_PAYMENT, max);
  const customValue = Number(custom) || 0;
  const amount = option === 'custom' ? customValue : (choices.find((c) => c.id === option)?.amount ?? 0);
  const customError =
    option !== 'custom' || !custom
      ? null
      : customValue < min
        ? `The smallest payment is ${formatTaka(min)}.`
        : customValue > max
          ? `That is more than you owe here (${formatTaka(max)}).`
          : null;
  const valid = amount >= min && amount <= max && !customError;
  const allocations = valid ? allocatePayment(view, amount) : [];

  // what is still overdue once this payment is applied
  const overdueLeft = view.schedule
    .filter((i) => i.status === 'overdue')
    .reduce((t, i) => {
      const a = allocations.find((x) => x.installment_id === i.id);
      return t + (i.remaining - (a?.principal ?? 0)) + (i.late_fee_due - (a?.late_fee ?? 0));
    }, 0);

  const pickHolding = (v: HoldingView) => {
    setCode(v.holding.code);
    setOption(defaultOption(v));
    setCustom('');
    setStep(0);
    setAgree(false);
  };

  const next = () => {
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const pay = async () => {
    setBusy(true);
    const intent = await investorRepository.createIntent(view.holding.code, amount, option);
    router.push(`/investor/gateway/${intent.id}`);
  };

  const c = snapshot.customer;
  const quick = [50_000, 100_000, 200_000].filter((q) => q < max);

  /** the step's main button: under the summary card on desktop, in the bottom bar on phones */
  const action = (wide: boolean) =>
    step === 0 ? (
      <Button size={wide ? 'lg' : 'md'} variant={wide ? 'primary' : 'light'} className={cn(wide && 'w-full')} disabled={!valid} onClick={next} iconRight={<ArrowRight className="size-4" />}>
        {wide ? 'Continue to review' : 'Continue'}
      </Button>
    ) : (
      <Button
        size={wide ? 'lg' : 'md'}
        variant={wide ? 'primary' : 'light'}
        className={cn(wide && 'w-full')}
        disabled={!agree || busy}
        onClick={pay}
        icon={busy ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
      >
        {busy ? 'Connecting…' : wide ? `Pay ${formatTaka(amount)} securely` : `Pay ${formatTaka(amount)}`}
      </Button>
    );

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-site-brass-dark uppercase">Payments</p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold sm:text-[30px]">Make a payment</h1>
      </div>
      <div className="rounded-2xl border border-site-line bg-white px-4 py-3 shadow-site-1 sm:py-3.5">
        <CheckoutSteps current={step} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="space-y-4">
          {step === 0 ? (
            <Panel>
              <div className="space-y-6">
                <div>
                  <FieldLabel>Pay towards</FieldLabel>
                  <InvestmentSelect options={payable} value={view} onChange={pickHolding} />
                </div>

                <div>
                  <FieldLabel>Amount</FieldLabel>
                  <div className="divide-y divide-site-line overflow-hidden rounded-2xl border border-site-line" role="radiogroup" aria-label="Payment amount">
                    {choices.map((ch) => {
                      const on = option === ch.id;
                      return (
                        <div key={ch.id} className={cn('transition-colors', on && 'bg-site-primary-soft/40')}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setOption(ch.id)}
                            style={{ outline: 'none' }}
                            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left focus-visible:bg-site-ivory"
                          >
                            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2 bg-white', on ? 'border-site-primary' : 'border-site-faint')}>
                              {on && <span className="size-2.5 rounded-full bg-site-primary" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2 font-semibold">
                                {ch.title}
                                {ch.id === 'due_now' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-site-danger uppercase">Recommended</span>}
                              </span>
                              <span className="mt-0.5 block text-[13px] leading-snug text-site-muted">{ch.hint}</span>
                            </span>
                            {ch.id !== 'custom' && <Money amount={ch.amount} className="shrink-0 font-semibold" />}
                          </button>

                          {ch.id === 'custom' && on && (
                            <div className="px-4 pb-4 sm:pl-[3.375rem]">
                              <div
                                className={cn(
                                  'flex h-14 items-center gap-2 rounded-xl border-2 bg-white px-4 transition-colors',
                                  customError ? 'border-site-danger' : 'border-site-line focus-within:border-site-primary',
                                )}
                              >
                                <span className="font-taka text-xl font-semibold text-site-muted">৳</span>
                                <input
                                  autoFocus
                                  aria-label="Amount in taka"
                                  inputMode="numeric"
                                  value={custom ? Number(custom).toLocaleString('en-IN') : ''}
                                  onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 9))}
                                  placeholder="Enter amount"
                                  style={{ outline: 'none' }}
                                  className="tabular font-display h-full w-full min-w-0 bg-transparent text-xl font-semibold placeholder:font-site placeholder:text-base placeholder:font-normal placeholder:text-site-faint"
                                />
                                {customValue > 0 && !customError && (
                                  <span className="shrink-0 rounded-full bg-site-soft px-2.5 py-1 text-xs font-semibold text-site-muted">{formatTakaWords(customValue)}</span>
                                )}
                              </div>
                              <p className={cn('mt-2 text-[13px]', customError ? 'font-medium text-site-danger' : 'text-site-muted')}>
                                {customError ?? `Minimum ${formatTaka(min)} · up to ${formatTaka(max)}`}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {quick.map((q) => (
                                  <button
                                    key={q}
                                    type="button"
                                    onClick={() => setCustom(String(q))}
                                    className={cn(
                                      'tabular rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
                                      customValue === q ? 'border-site-primary bg-site-primary text-white' : 'border-site-line bg-white hover:border-site-primary',
                                    )}
                                  >
                                    <span className="font-taka">{formatTaka(q)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {valid && overdueLeft > 0 ? (
                  <p className="flex gap-2.5 rounded-xl bg-site-booked-soft px-4 py-3 text-[13px] text-site-booked" role="status">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <Money amount={overdueLeft} className="font-semibold" /> will still be overdue after this payment, and reminders continue until it is cleared.
                    </span>
                  </p>
                ) : (
                  <p className="flex gap-2.5 text-[13px] text-site-muted">
                    <Info className="mt-0.5 size-4 shrink-0 text-site-primary" aria-hidden />
                    Payments go to late fees first, then the oldest installment. A part payment leaves the rest of that installment owing.
                  </p>
                )}
              </div>
            </Panel>
          ) : (
            <>
              <Panel title="How this payment is applied" padded={false}>
                <ul className="divide-y divide-site-line">
                  {allocations.map((a) => {
                    const i = view.schedule.find((x) => x.id === a.installment_id)!;
                    const left = i.remaining - a.principal;
                    return (
                      <li key={a.installment_id} className="flex items-start justify-between gap-3 px-5 py-3.5 sm:px-6">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 font-semibold">
                            {i.label} <StatusPill status={i.status} />
                          </span>
                          <span className="mt-0.5 block text-xs text-site-muted">
                            Due {formatDay(i.due_date)}
                            {a.late_fee > 0 && (
                              <>
                                {' '}
                                · incl. <Money amount={a.late_fee} /> late fee
                              </>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <Money amount={a.principal + a.late_fee} className="block font-semibold" />
                          {left > 0 ? (
                            <span className="block text-xs font-medium text-site-booked">
                              <Money amount={left} /> still owing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-site-primary-dark">
                              <Check className="size-3.5" aria-hidden /> Cleared
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>

              <div className="rounded-3xl border border-site-line bg-white px-5 py-4 text-sm shadow-site-1 sm:px-6">
                <p className="text-site-muted">Receipt goes to</p>
                <p className="mt-0.5 font-semibold break-words">
                  {c.full_name} · <span className="tabular">{formatPhone(c.phone)}</span> · {c.email}
                </p>
              </div>

              <label className="flex cursor-pointer gap-3 rounded-3xl border border-site-line bg-white px-5 py-4 text-sm shadow-site-1 sm:px-6">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-site-primary" />
                <span className="text-site-muted">
                  I confirm this payment of <Money amount={amount} className="font-semibold text-site-ink" /> under agreement{' '}
                  <span className="tabular font-semibold text-site-ink">{view.holding.agreement_no}</span> and agree to the payment terms and refund policy.
                </span>
              </label>

              <Button variant="ghost" size="sm" onClick={() => setStep(0)} icon={<ArrowLeft className="size-4" />}>
                Change amount
              </Button>
            </>
          )}
        </div>

        <aside className="hidden space-y-3 lg:sticky lg:top-6 lg:block">
          <PaymentTicket view={view} allocations={allocations} />
          {action(true)}
          <p className="text-center text-xs text-site-muted">
            {step === 0 ? 'You can review everything before paying.' : 'Card, mobile or net banking is chosen on the gateway’s secure page.'}
          </p>
        </aside>
      </div>

      <MobileBar total={valid ? amount : 0}>{action(false)}</MobileBar>
    </div>
  );
}
