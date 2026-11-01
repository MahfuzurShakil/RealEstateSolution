'use client';

import { useState } from 'react';
import { CalendarClock, Check, Info, Loader2, MapPin, Minus, Plus, ShoppingBag, Sparkles } from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import {
  FREQUENCY_LABEL,
  daysBetween,
  formatDay,
  formatPct,
  formatTaka,
  type InvestorProject,
  type ShareRequest,
  type ShareRound,
} from '@/lib/domain/investor-portal';
import { investorRepository } from '@/lib/repositories/investor/investor.repository';
import { publicShareOfferRepository } from '@/lib/repositories/public/share-offer.public.repository';
import { cn } from '@/lib/utils/cn';
import { todayLocal } from '@/lib/utils/format';
import { PortalDialog } from './PortalDialog';
import { Money } from './ui';

/** the plan lengths offered, up to the round's maximum; 0 = pay in full */
function planOptions(round: ShareRound): number[] {
  const steps = round.frequency === 'monthly' ? [6, 12, 18, 24, 36, 48, 60] : [2, 4, 6, 8, 12, 16, 20];
  return [0, ...steps.filter((n) => n < round.max_installments), round.max_installments];
}

function planLabel(n: number, round: ShareRound) {
  return n === 0 ? 'Pay in full' : `${n} ${FREQUENCY_LABEL[round.frequency].toLowerCase()} installments`;
}

/**
 * Asks to buy shares: how many, over how long, with the price worked out as
 * the customer chooses. It sends a request, not a payment — the office calls,
 * reserves the shares and prepares the agreement.
 */
function BuySharesDialog({
  open,
  onClose,
  round,
  project,
  existing,
  visitor = false,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  round: ShareRound;
  project: InvestorProject;
  existing: ShareRequest | undefined;
  /** BUYER-PORTAL-PLAN.md §6 — on the website: no account, so name and phone are asked */
  visitor?: boolean;
  onSent?: (r: { shares: number; installments: number }) => void;
}) {
  const most = Math.min(round.max_shares, round.shares_available);
  const plans = planOptions(round);
  const [shares, setShares] = useState(existing?.shares ?? round.min_shares);
  const [plan, setPlan] = useState(existing?.installments ?? round.max_installments);
  const [note, setNote] = useState(existing?.note ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = shares * round.price_per_share;
  const down = plan === 0 ? total : Math.round((total * round.down_payment_pct) / 100);
  const each = plan === 0 ? 0 : Math.round((total - down) / plan);
  const set = (n: number) => setShares(Math.max(round.min_shares, Math.min(most, n || round.min_shares)));

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (visitor) await publicShareOfferRepository.requestShares({ round_code: round.code, shares, installments: plan, note, name, phone, email });
      else await investorRepository.requestShares({ round_code: round.code, shares, installments: plan, note });
      onSent?.({ shares, installments: plan });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalDialog
      open={open}
      onClose={onClose}
      title={`Buy shares in ${project.name}`}
      description={`Round ${round.round_no} · ${formatTaka(round.price_per_share)} per share · ${formatPct(round.share_pct)} ownership each`}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-site-muted">Total price</p>
            <Money amount={total} className="font-display block text-xl font-semibold" />
          </div>
          <Button onClick={send} disabled={busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}>
            {busy ? 'Sending…' : existing ? 'Update request' : 'Send purchase request'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {error && (
          <p role="alert" className="rounded-2xl bg-site-danger/10 px-4 py-3 text-sm font-medium text-site-danger">
            {error}
          </p>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-site-muted uppercase">Number of shares</p>
          <div className="flex items-center gap-3">
            <div className="flex h-12 items-center rounded-2xl border border-site-line">
              <button type="button" aria-label="One share less" disabled={shares <= round.min_shares} onClick={() => set(shares - 1)} className="grid size-12 place-items-center text-site-muted disabled:opacity-40">
                <Minus className="size-4" />
              </button>
              <input
                aria-label="Number of shares"
                inputMode="numeric"
                value={shares}
                onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')))}
                style={{ outline: 'none' }}
                className="tabular font-display h-full w-14 border-x border-site-line bg-transparent text-center text-lg font-semibold"
              />
              <button type="button" aria-label="One share more" disabled={shares >= most} onClick={() => set(shares + 1)} className="grid size-12 place-items-center text-site-muted disabled:opacity-40">
                <Plus className="size-4" />
              </button>
            </div>
            <p className="text-sm text-site-muted">
              <span className="tabular font-semibold text-site-ink">{formatPct(shares * round.share_pct)}</span> ownership
              <span className="block text-xs">
                {round.min_shares}–{most} shares per customer
              </span>
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="buy-plan" className="mb-2 block text-xs font-semibold tracking-[0.12em] text-site-muted uppercase">
            Payment plan
          </label>
          <select
            id="buy-plan"
            value={plan}
            onChange={(e) => setPlan(Number(e.target.value))}
            className="h-12 w-full rounded-2xl border border-site-line bg-white px-4 text-[15px] font-medium focus:border-site-primary focus:outline-none"
          >
            {plans.map((n) => (
              <option key={n} value={n}>
                {planLabel(n, round)}
              </option>
            ))}
          </select>
        </div>

        <dl className="divide-y divide-site-line rounded-2xl border border-site-line text-sm">
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-site-muted">
              {shares} × <Money amount={round.price_per_share} />
            </dt>
            <dd>
              <Money amount={total} className="font-semibold" />
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-site-muted">{plan === 0 ? 'Paid at signing' : `Down payment (${round.down_payment_pct}%)`}</dt>
            <dd>
              <Money amount={down} className="font-semibold" />
            </dd>
          </div>
          {plan > 0 && (
            <div className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-site-muted">
                Then {plan} × {FREQUENCY_LABEL[round.frequency].toLowerCase()}
              </dt>
              <dd>
                <Money amount={each} className="font-semibold" /> <span className="text-xs text-site-muted">each</span>
              </dd>
            </div>
          )}
        </dl>

        {visitor && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-semibold tracking-[0.12em] text-site-muted uppercase">Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-12 w-full rounded-2xl border border-site-line px-4 text-[15px] focus:border-site-primary focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold tracking-[0.12em] text-site-muted uppercase">Mobile number</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="01XXX XXXXXX" className="tabular h-12 w-full rounded-2xl border border-site-line px-4 text-[15px] placeholder:text-site-faint focus:border-site-primary focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold tracking-[0.12em] text-site-muted uppercase">
                Email <span className="font-normal tracking-normal normal-case">(optional)</span>
              </span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="h-12 w-full rounded-2xl border border-site-line px-4 text-[15px] focus:border-site-primary focus:outline-none" />
            </label>
          </div>
        )}

        <div>
          <label htmlFor="buy-note" className="mb-2 block text-xs font-semibold tracking-[0.12em] text-site-muted uppercase">
            Note for our team <span className="font-normal tracking-normal normal-case">(optional)</span>
          </label>
          <textarea
            id="buy-note"
            rows={2}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A good time to call, or anything we should know"
            className="w-full resize-none rounded-2xl border border-site-line px-4 py-3 text-[15px] placeholder:text-site-faint focus:border-site-primary focus:outline-none"
          />
        </div>

        <p className="flex gap-2.5 rounded-xl bg-site-primary-soft/50 px-4 py-3 text-[13px] text-site-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-site-primary" aria-hidden />
          <span>
            Nothing is charged now. Our team will call you within one working day to hold these shares for you and prepare the agreement. The down payment is made when the agreement is
            signed.
          </span>
        </p>
      </div>
    </PortalDialog>
  );
}

/** One open share offering on the overview: the project, the terms, and a way to buy. */
export function OpportunityCard({
  round,
  project,
  owned,
  request,
  visitor = false,
}: {
  round: ShareRound;
  project: InvestorProject;
  owned: boolean;
  request: ShareRequest | undefined;
  /** on the public website (BUYER-PORTAL-PLAN.md §6): the request goes in without an account */
  visitor?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<{ shares: number; installments: number } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const soldPct = Math.round(((round.total_shares - round.shares_available) / round.total_shares) * 100);
  const left = daysBetween(todayLocal(), round.closes_on);
  // a declined request leaves the way open for a new one
  const active = request && (request.status === 'new' || request.status === 'contacted') ? request : undefined;

  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-site-line bg-white shadow-site-1">
      <div className="relative aspect-[16/8] overflow-hidden bg-site-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
        <img src={project.image} alt="" loading="lazy" className="size-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-site-night/80 via-site-night/10 to-transparent" />
        <div className="absolute top-3 right-3 left-3 flex flex-wrap justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-site-brass px-2.5 py-1 text-xs font-bold text-site-night">
            <Sparkles className="size-3.5" aria-hidden /> Round {round.round_no} open
          </span>
          {owned && <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-site-primary-dark">You own shares here</span>}
        </div>
        <div className="absolute right-4 bottom-3 left-4 text-white">
          <p className="text-xs font-semibold tracking-[0.14em] text-site-brass uppercase">{project.category}</p>
          <p className="font-display mt-0.5 truncate text-xl font-semibold">{project.name}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1.5 text-sm text-site-muted">
          <MapPin className="size-4 shrink-0" aria-hidden /> <span className="truncate">{project.location}</span>
        </p>
        <p className="mt-2 line-clamp-2 text-sm text-site-muted">{project.summary}</p>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-site-line bg-site-line text-sm">
          <div className="bg-white px-3 py-2.5">
            <dt className="text-xs text-site-muted">Price per share</dt>
            <dd className="mt-0.5">
              <Money amount={round.price_per_share} className="font-semibold" />
            </dd>
          </div>
          <div className="bg-white px-3 py-2.5">
            <dt className="text-xs text-site-muted">Ownership per share</dt>
            <dd className="tabular mt-0.5 font-semibold">{formatPct(round.share_pct)}</dd>
          </div>
          <div className="bg-white px-3 py-2.5">
            <dt className="text-xs text-site-muted">Down payment</dt>
            <dd className="mt-0.5 font-semibold">{round.down_payment_pct}%</dd>
          </div>
          <div className="bg-white px-3 py-2.5">
            <dt className="text-xs text-site-muted">Pay the rest in</dt>
            <dd className="mt-0.5 font-semibold">
              up to {round.max_installments} {round.frequency === 'monthly' ? 'months' : 'quarters'}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-site-muted">
            <span>
              <span className="tabular font-semibold text-site-ink">{round.shares_available}</span> of {round.total_shares} shares left
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {left > 0 ? `Closes in ${left} days` : `Closes ${formatDay(round.closes_on)}`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-site-soft" aria-label={`${soldPct}% taken`}>
            <div className="h-full rounded-full bg-site-brass" style={{ width: `${soldPct}%` }} />
          </div>
        </div>

        <div className="mt-auto pt-5">
          {sent ? (
            <div className="rounded-2xl bg-site-primary-soft/60 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-site-primary-dark">
                <Check className="size-4" aria-hidden /> Request sent
              </p>
              <p className="mt-0.5 text-[13px] text-site-muted">
                {sent.shares} share{sent.shares > 1 ? 's' : ''} · {planLabel(sent.installments, round)} · our team will call you within one working day.
              </p>
            </div>
          ) : request?.status === 'reserved' ? (
            <div className="rounded-2xl bg-site-primary-soft/60 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-site-primary-dark">
                <Check className="size-4" aria-hidden /> Shares reserved for you
              </p>
              <p className="mt-0.5 text-[13px] text-site-muted">Our office is preparing your agreement. It will appear under My investments once signed.</p>
            </div>
          ) : active ? (
            <div className="rounded-2xl bg-site-primary-soft/60 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-site-primary-dark">
                <Check className="size-4" aria-hidden /> {active.status === 'contacted' ? 'Our team is in touch' : 'Purchase request sent'}
              </p>
              <p className="mt-0.5 text-[13px] text-site-muted">
                {active.shares} share{active.shares > 1 ? 's' : ''} · {planLabel(active.installments, round)}
                {active.status === 'new' && ' · our team will call you'}
              </p>
              {active.office_note && <p className="mt-1 text-[13px] text-site-ink">“{active.office_note}”</p>}
              <div className="mt-2 flex gap-4 text-sm font-semibold">
                <button type="button" onClick={() => setOpen(true)} className="text-site-primary hover:underline">
                  Change
                </button>
                <button
                  type="button"
                  disabled={withdrawing}
                  onClick={async () => {
                    setWithdrawing(true);
                    await investorRepository.withdrawRequest(round.code);
                    setWithdrawing(false);
                  }}
                  className={cn('text-site-muted hover:text-site-danger', withdrawing && 'opacity-50')}
                >
                  {withdrawing ? 'Withdrawing…' : 'Withdraw'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {request?.status === 'declined' && (
                <p className="mb-3 rounded-2xl bg-site-soft px-4 py-3 text-[13px] text-site-muted">
                  Your last request could not go ahead{request.office_note ? `: ${request.office_note}` : '.'} You can send a new one.
                </p>
              )}
              <Button className="w-full" onClick={() => setOpen(true)} icon={<ShoppingBag className="size-4" />}>
                {owned ? 'Buy more shares' : 'Buy shares'}
              </Button>
            </>
          )}
        </div>
      </div>

      {open && <BuySharesDialog open onClose={() => setOpen(false)} round={round} project={project} existing={active} visitor={visitor} onSent={visitor ? setSent : undefined} />}
    </article>
  );
}
