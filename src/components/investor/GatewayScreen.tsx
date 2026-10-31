'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Building, CheckCircle2, ChevronDown, ChevronRight, Clock, CreditCard, FlaskConical, Landmark, Loader2, Lock, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import { allocationLabel, formatTaka, viewHolding, type HoldingView, type InvestorSnapshot, type PaymentMethod } from '@/lib/domain/investor-portal';
import { investorRepository, type GatewayOutcome, type PaymentIntent } from '@/lib/repositories/investor/investor.mock.repository';
import { cn } from '@/lib/utils/cn';
import { PaymentLogo, type LogoName } from './PaymentLogos';

/*
 * Stand-in for the payment gateway's hosted checkout (plan §7). In the live
 * build the customer leaves the website for the gateway's own page and comes
 * back with a result, so this screen is deliberately neutral — the gateway's
 * look, not the website's. Nothing typed here is sent anywhere; the sandbox
 * panel decides what the gateway reports.
 */

type Tab = 'card' | 'mobile' | 'bank';
type Wallet = 'bkash' | 'nagad' | 'rocket';
type Phase =
  | { at: 'choose' }
  | { at: 'wallet'; wallet: Wallet; step: 'number' | 'otp' | 'pin'; number: string }
  | { at: 'card3ds'; brand: CardBrand; last4: string }
  | { at: 'bank'; bank: string }
  | { at: 'processing'; label: string }
  | { at: 'done'; intent: PaymentIntent };

type CardBrand = 'visa' | 'mastercard' | 'amex';

const WALLETS: Record<Wallet, { label: string; color: string; pinLength: number }> = {
  bkash: { label: 'bKash', color: '#E2136E', pinLength: 5 },
  nagad: { label: 'Nagad', color: '#F7941D', pinLength: 4 },
  rocket: { label: 'Rocket', color: '#8C3494', pinLength: 4 },
};

const BANKS = ['BRAC Bank', 'City Bank', 'Dutch-Bangla Bank', 'Eastern Bank', 'Islami Bank Bangladesh', 'Mutual Trust Bank'];

const TEST = { otp: '123456', card: '4242 4242 4242 4242' };

const field =
  'h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10';

function brandOf(num: string): CardBrand | null {
  if (/^4/.test(num)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'mastercard';
  if (/^3[47]/.test(num)) return 'amex';
  return null;
}
const BRAND_LABEL: Record<CardBrand, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' };

function Countdown({ until, onExpire }: { until: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Date.parse(until) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const ms = Math.max(0, Date.parse(until) - Date.now());
      setLeft(ms);
      if (ms === 0) {
        clearInterval(t);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, onExpire]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={cn('inline-flex items-center gap-1.5 tabular-nums', m < 2 && 'text-red-600')}>
      <Clock className="size-4" aria-hidden /> {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

function OtpInput({ value, onChange, length = 6, mask = false, autoFocus = true }: { value: string; onChange: (v: string) => void; length?: number; mask?: boolean; autoFocus?: boolean }) {
  return (
    <input
      autoFocus={autoFocus}
      inputMode="numeric"
      type={mask ? 'password' : 'text'}
      autoComplete="one-time-code"
      maxLength={length}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
      className={cn(field, 'text-center text-xl font-semibold tracking-[0.5em] tabular-nums')}
      placeholder={'•'.repeat(length)}
    />
  );
}

/** The provider's own pop-up: wallet colour on top, merchant and amount, one step at a time. */
function WalletPanel({
  wallet,
  merchant,
  amount,
  children,
  onClose,
}: {
  wallet: Wallet;
  merchant: string;
  amount: number;
  children: ReactNode;
  onClose: () => void;
}) {
  const w = WALLETS[wallet];
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
      <div className="flex items-center justify-between px-5 py-4 text-white" style={{ background: w.color }}>
        <span className="flex items-center gap-3">
          <PaymentLogo name={wallet} className="h-8 w-12 ring-white/40" />
          <span className="text-lg font-bold">{w.label} Payment</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-white/20 hover:bg-white/30">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm">
        <span className="min-w-0">
          <span className="block text-xs text-slate-500">Merchant</span>
          <span className="block truncate font-semibold text-slate-800">{merchant}</span>
        </span>
        <span className="text-right">
          <span className="block text-xs text-slate-500">Amount</span>
          <span className="font-taka block font-bold text-slate-900 tabular-nums">{formatTaka(amount)}</span>
        </span>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </div>
  );
}

export function GatewayScreen({ intentId }: { intentId: string }) {
  const router = useRouter();
  const company = useCompanyInfo();
  const [intent, setIntent] = useState<PaymentIntent | null | undefined>(undefined);
  const [snap, setSnap] = useState<InvestorSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>('mobile');
  const [phase, setPhase] = useState<Phase>({ at: 'choose' });
  const [outcome, setOutcome] = useState<GatewayOutcome>('success');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' });
  const [orderOpen, setOrderOpen] = useState(false);
  const merchant = company?.company_name ?? 'Merchant';

  useEffect(() => {
    if (!investorRepository.session()) {
      router.replace('/investor/login?next=/investor/payments');
      return;
    }
    investorRepository.intent(intentId).then((i) => {
      if (i && i.status !== 'pending') router.replace(`/investor/payments/result/${i.id}`);
      else setIntent(i);
    });
    investorRepository.snapshot().then(setSnap);
  }, [intentId, router]);

  const view: HoldingView | undefined = useMemo(() => {
    const h = snap && intent ? snap.holdings.find((x) => x.code === intent.holding_code) : undefined;
    return h && snap ? viewHolding(snap, h) : undefined;
  }, [snap, intent]);

  const finish = async (method: PaymentMethod, detail: string, result: GatewayOutcome, label: string) => {
    setPhase({ at: 'processing', label });
    const done = await investorRepository.completeIntent(intentId, method, detail, result);
    if (done?.status === 'paid') {
      setPhase({ at: 'done', intent: done });
      setTimeout(() => router.replace(`/investor/payments/result/${intentId}`), 3200);
    } else {
      router.replace(`/investor/payments/result/${intentId}`);
    }
  };

  const expire = async () => {
    await investorRepository.intent(intentId);
    router.replace(`/investor/payments/result/${intentId}`);
  };

  const reset = () => {
    setPhase({ at: 'choose' });
    setCode('');
    setError(null);
  };

  if (intent === undefined || (intent && !snap)) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100">
        <Loader2 className="size-7 animate-spin text-slate-400" />
      </div>
    );
  }
  if (intent === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6 text-center font-sans">
        <div>
          <p className="text-lg font-semibold text-slate-900">This payment session is no longer available.</p>
          <button type="button" onClick={() => router.replace('/investor/payments')} className="mt-4 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
            Return to merchant
          </button>
        </div>
      </div>
    );
  }

  const digits = card.number.replace(/\D/g, '');
  const brand = brandOf(digits);
  const [mm, yy] = card.expiry.split('/').map((x) => Number(x?.trim()));
  const expiryOk = mm >= 1 && mm <= 12 && yy >= new Date().getFullYear() % 100;
  const cardOk = digits.length >= 15 && !!brand && expiryOk && card.cvc.length >= 3 && card.name.trim().length > 1;

  const busy = phase.at === 'processing' || phase.at === 'done';

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      {/* gateway top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-md bg-blue-600 text-white">
              <Lock className="size-4" aria-hidden />
            </span>
            Secure Checkout
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold tracking-wide text-amber-800 uppercase">Sandbox</span>
          </span>
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline">Session expires in</span>
            <Countdown until={intent.expires_at} onExpire={expire} />
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-10">
        <div className="relative grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* order summary */}
          <aside className="border-b border-slate-200 bg-slate-50 p-4 sm:p-6 md:border-r md:border-b-0">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-lg font-bold text-white sm:size-11">{merchant.charAt(0)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{merchant}</span>
                <span className="flex items-center gap-1 text-xs text-emerald-700">
                  <BadgeCheck className="size-3.5" aria-hidden /> Verified merchant
                </span>
              </span>
              <span className="shrink-0 text-right md:hidden">
                <span className="font-taka block text-lg font-bold tabular-nums">{formatTaka(intent.total)}</span>
                <button type="button" aria-expanded={orderOpen} onClick={() => setOrderOpen((o) => !o)} className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600">
                  Order details <ChevronDown className={cn('size-3.5 transition-transform', orderOpen && 'rotate-180')} aria-hidden />
                </button>
              </span>
            </div>
            <div className={cn(orderOpen ? 'block' : 'hidden', 'md:block')}>

            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Order ID</dt>
                <dd className="font-mono text-xs font-semibold">{intent.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Customer</dt>
                <dd className="truncate font-medium">{snap?.customer.full_name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Reference</dt>
                <dd className="font-medium">{view?.holding.agreement_no}</dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-dashed border-slate-300 pt-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{view?.project.name}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {intent.allocations.map((a) => (
                  <li key={a.installment_id} className="flex justify-between gap-3">
                    <span className="text-slate-600">{allocationLabel(view, a)}</span>
                    <span className="font-taka font-medium tabular-nums">{formatTaka(a.principal)}</span>
                  </li>
                ))}
                {intent.late_fee > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-slate-600">Late fee</span>
                    <span className="font-taka font-medium tabular-nums">{formatTaka(intent.late_fee)}</span>
                  </li>
                )}
              </ul>
              <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
                <span className="font-semibold">Total payable</span>
                <span className="font-taka text-2xl font-bold tabular-nums">{formatTaka(intent.total)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => finish('card', '', 'cancelled', 'Cancelling')}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              <ArrowLeft className="size-4" aria-hidden /> Cancel and return to merchant
            </button>
            </div>
          </aside>

          {/* payment */}
          <section className="p-4 sm:p-7">
            {phase.at === 'choose' && (
              <>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Payment type">
                  {(
                    [
                      ['mobile', 'Mobile banking', Smartphone],
                      ['card', 'Cards', CreditCard],
                      ['bank', 'Net banking', Landmark],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      role="tab"
                      type="button"
                      aria-selected={tab === id}
                      onClick={() => {
                        setTab(id);
                        setError(null);
                      }}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-2 sm:py-2.5 sm:text-sm',
                        tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="max-w-full truncate">{label}</span>
                    </button>
                  ))}
                </div>

                {tab === 'mobile' && (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-slate-700">Choose your wallet</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {(Object.keys(WALLETS) as Wallet[]).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => {
                            setPhase({ at: 'wallet', wallet: w, step: 'number', number: '' });
                            setCode('');
                            setError(null);
                          }}
                          className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-all hover:border-slate-400 hover:shadow-md sm:flex-col sm:items-center sm:py-5"
                        >
                          <PaymentLogo name={w} className="h-10 w-16" />
                          <span className="flex-1 font-semibold sm:flex-none">{WALLETS[w].label}</span>
                          <ChevronRight className="size-4 text-slate-400 sm:hidden" aria-hidden />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'card' && (
                  <form
                    className="mt-6 space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!cardOk || !brand) return setError('Please check the card details.');
                      setError(null);
                      setCode('');
                      setPhase({ at: 'card3ds', brand, last4: digits.slice(-4) });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {(['visa', 'mastercard', 'amex'] as LogoName[]).map((n) => (
                        <PaymentLogo key={n} name={n} className={cn('h-7 w-11 transition-opacity', brand && brand !== n && 'opacity-30')} />
                      ))}
                    </div>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-600">Card number</span>
                      <span className="relative mt-1 block">
                        <input
                          className={cn(field, 'pr-16 tabular-nums')}
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="1234 5678 9012 3456"
                          value={card.number}
                          onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') })}
                        />
                        {brand && <PaymentLogo name={brand} className="absolute top-1/2 right-3 h-6 w-10 -translate-y-1/2" />}
                      </span>
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-600">Name on card</span>
                      <input className={cn(field, 'mt-1 uppercase')} autoComplete="cc-name" placeholder="AS PRINTED ON CARD" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-sm">
                        <span className="font-medium text-slate-600">Expiry</span>
                        <input
                          className={cn(field, 'mt-1 tabular-nums')}
                          autoComplete="cc-exp"
                          placeholder="MM / YY"
                          value={card.expiry}
                          onChange={(e) => {
                            const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setCard({ ...card, expiry: d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d });
                          }}
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-600">CVV</span>
                        <input
                          className={cn(field, 'mt-1 tabular-nums')}
                          type="password"
                          autoComplete="cc-csc"
                          inputMode="numeric"
                          placeholder="•••"
                          value={card.cvc}
                          onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        />
                      </label>
                    </div>
                    {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
                    <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-[15px] font-semibold text-white transition-colors hover:bg-blue-700">
                      <Lock className="size-4" aria-hidden /> Pay <span className="font-taka tabular-nums">{formatTaka(intent.total)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCard({ number: TEST.card, name: snap?.customer.full_name.toUpperCase() ?? 'TEST USER', expiry: '12 / 29', cvc: '123' })}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Fill in the sandbox test card
                    </button>
                  </form>
                )}

                {tab === 'bank' && (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-slate-700">Choose your bank</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {BANKS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => {
                            setPhase({ at: 'bank', bank: b });
                            setCode('');
                            setError(null);
                          }}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-sm font-semibold transition-all hover:border-slate-400 hover:shadow-md"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                            <Building className="size-4.5" aria-hidden />
                          </span>
                          <span className="flex-1">{b}</span>
                          <ChevronRight className="size-4 text-slate-400" aria-hidden />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {phase.at === 'wallet' && (
              <WalletPanel wallet={phase.wallet} merchant={merchant} amount={intent.total} onClose={reset}>
                {phase.step === 'number' && (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!/^01[3-9]\d{8}$/.test(phase.number)) return setError('Enter an 11-digit mobile number starting with 01.');
                      setError(null);
                      setPhase({ ...phase, step: 'otp' });
                    }}
                  >
                    <label className="block text-sm">
                      <span className="font-medium text-slate-600">Your {WALLETS[phase.wallet].label} account number</span>
                      <input
                        autoFocus
                        className={cn(field, 'mt-1 text-lg tabular-nums')}
                        inputMode="tel"
                        placeholder="e.g. 01XXXXXXXXX"
                        value={phase.number}
                        onChange={(e) => setPhase({ ...phase, number: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                      />
                    </label>
                    <p className="text-xs text-slate-500">By continuing you agree to the {WALLETS[phase.wallet].label} terms and conditions.</p>
                    {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
                    <button type="submit" className="h-12 w-full rounded-lg font-semibold text-white" style={{ background: WALLETS[phase.wallet].color }}>
                      Confirm
                    </button>
                    <button type="button" onClick={() => setPhase({ ...phase, number: snap?.customer.phone ?? '01711223344' })} className="text-xs font-semibold text-blue-600 hover:underline">
                      Use the sandbox test number
                    </button>
                  </form>
                )}
                {phase.step === 'otp' && (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (code !== TEST.otp) return setError('Invalid verification code.');
                      setError(null);
                      setCode('');
                      setPhase({ ...phase, step: 'pin' });
                    }}
                  >
                    <p className="text-sm text-slate-600">
                      Enter the verification code sent to <span className="font-semibold tabular-nums">{phase.number.slice(0, 5)}•••{phase.number.slice(-3)}</span>
                    </p>
                    <OtpInput value={code} onChange={setCode} />
                    {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
                    <button type="submit" disabled={code.length !== 6} className="h-12 w-full rounded-lg font-semibold text-white disabled:opacity-50" style={{ background: WALLETS[phase.wallet].color }}>
                      Verify
                    </button>
                    <p className="text-xs text-slate-500">Sandbox code: {TEST.otp}</p>
                  </form>
                )}
                {phase.step === 'pin' && (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const w = WALLETS[phase.wallet];
                      finish(phase.wallet, `${w.label} ${phase.number.slice(0, 5)}•••${phase.number.slice(-3)}`, outcome, `Confirming with ${w.label}`);
                    }}
                  >
                    <p className="text-sm text-slate-600">Enter your {WALLETS[phase.wallet].label} PIN to confirm the payment</p>
                    <OtpInput value={code} onChange={setCode} length={WALLETS[phase.wallet].pinLength} mask />
                    <button
                      type="submit"
                      disabled={code.length !== WALLETS[phase.wallet].pinLength}
                      className="h-12 w-full rounded-lg font-semibold text-white disabled:opacity-50"
                      style={{ background: WALLETS[phase.wallet].color }}
                    >
                      Confirm payment
                    </button>
                    <p className="text-xs text-slate-500">Sandbox: any {WALLETS[phase.wallet].pinLength}-digit PIN.</p>
                  </form>
                )}
              </WalletPanel>
            )}

            {phase.at === 'card3ds' && (
              <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <span className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="size-5 text-blue-600" aria-hidden /> 3-D Secure verification
                  </span>
                  <PaymentLogo name={phase.brand} className="h-7 w-11" />
                </div>
                <form
                  className="space-y-4 p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code !== TEST.otp) return setError('The code is not correct. Please try again.');
                    finish('card', `${BRAND_LABEL[phase.brand]} •••• ${phase.last4}`, outcome, 'Authorising with your bank');
                  }}
                >
                  <dl className="grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-slate-500">Merchant</dt>
                    <dd className="truncate text-right font-medium">{merchant}</dd>
                    <dt className="text-slate-500">Amount</dt>
                    <dd className="font-taka text-right font-semibold tabular-nums">{formatTaka(intent.total)}</dd>
                    <dt className="text-slate-500">Card</dt>
                    <dd className="text-right font-medium tabular-nums">•••• {phase.last4}</dd>
                  </dl>
                  <p className="text-sm text-slate-600">Your card issuer has sent a one-time password to your registered mobile number.</p>
                  <OtpInput value={code} onChange={setCode} />
                  {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
                  <div className="flex gap-3">
                    <button type="button" onClick={reset} className="h-12 flex-1 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50">
                      Back
                    </button>
                    <button type="submit" disabled={code.length !== 6} className="h-12 flex-[2] rounded-lg bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      Submit
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">Sandbox OTP: {TEST.otp}</p>
                </form>
              </div>
            )}

            {phase.at === 'bank' && (
              <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <span className="grid size-9 place-items-center rounded-lg bg-slate-900 text-white">
                    <Building className="size-4.5" aria-hidden />
                  </span>
                  <span className="font-semibold">{phase.bank} · Internet Banking</span>
                </div>
                <form
                  className="space-y-4 p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code !== TEST.otp) return setError('The code is not correct. Please try again.');
                    finish('internet_banking', `${phase.bank} internet banking`, outcome, `Approving with ${phase.bank}`);
                  }}
                >
                  <p className="text-sm text-slate-600">
                    Approve a payment of <span className="font-taka font-semibold tabular-nums">{formatTaka(intent.total)}</span> to {merchant}. Enter the code {phase.bank} sent to your
                    registered mobile.
                  </p>
                  <OtpInput value={code} onChange={setCode} />
                  {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
                  <div className="flex gap-3">
                    <button type="button" onClick={reset} className="h-12 flex-1 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50">
                      Back
                    </button>
                    <button type="submit" disabled={code.length !== 6} className="h-12 flex-[2] rounded-lg bg-slate-900 font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                      Approve payment
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">Sandbox code: {TEST.otp}</p>
                </form>
              </div>
            )}

            {/* sandbox controls */}
            {(phase.at === 'choose' || phase.at === 'wallet' || phase.at === 'card3ds' || phase.at === 'bank') && (
              <div className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
                <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-amber-800 uppercase">
                  <FlaskConical className="size-3.5" aria-hidden /> Sandbox · test result
                </p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Test result">
                  {(
                    [
                      ['success', 'Successful'],
                      ['declined', 'Declined'],
                      ['insufficient_funds', 'Insufficient balance'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={outcome === id}
                      onClick={() => setOutcome(id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        outcome === id ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-300 bg-white text-amber-800',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-amber-800/80">No real money moves. Codes: OTP {TEST.otp} · any PIN · card {TEST.card}.</p>
              </div>
            )}
          </section>

          {phase.at === 'processing' && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-white/95 p-6 backdrop-blur-sm" role="status">
              <div className="text-center">
                <Loader2 className="mx-auto size-11 animate-spin text-blue-600" aria-hidden />
                <p className="mt-4 text-lg font-semibold">{phase.label}…</p>
                <p className="mt-1 text-sm text-slate-500">Please do not close, refresh or go back.</p>
              </div>
            </div>
          )}
          {phase.at === 'done' && (
            <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-white p-6" role="status">
              <div className="text-center">
                <span className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="size-12 text-emerald-600 motion-safe:animate-[fade-up_.4s_ease-out_both]" aria-hidden />
                </span>
                <p className="mt-5 text-2xl font-bold">Payment successful</p>
                <p className="font-taka mt-1 text-3xl font-bold tabular-nums">{formatTaka(phase.intent.total)}</p>
                <dl className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-y-1.5 text-left text-sm">
                  <dt className="text-slate-500">Transaction ID</dt>
                  <dd className="text-right font-mono font-semibold">{phase.intent.reference}</dd>
                  <dt className="text-slate-500">Paid with</dt>
                  <dd className="text-right font-medium">{phase.intent.method_detail}</dd>
                </dl>
                <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Returning you to {merchant}…
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="mt-6 flex flex-col items-center gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> 256-bit SSL encryption</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden /> PCI DSS compliant</span>
            <span className="inline-flex items-center gap-1.5"><CreditCard className="size-3.5" aria-hidden /> Card details are never shared with the merchant</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-80">
            {(['visa', 'mastercard', 'amex', 'bkash', 'nagad', 'rocket'] as LogoName[]).map((n) => (
              <PaymentLogo key={n} name={n} className="h-5 w-8" />
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
