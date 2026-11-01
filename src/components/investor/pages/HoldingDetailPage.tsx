'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Building2, CalendarClock, CheckCircle2, Circle, CreditCard, FileSearch, MapPin, Receipt } from 'lucide-react';
import { ButtonLink } from '@/components/public/ui/Button';
import {
  FREQUENCY_LABEL,
  allocationLabel,
  formatDay,
  formatPct,
  isHome,
  type HoldingView,
} from '@/lib/domain/investor-portal';
import { cn } from '@/lib/utils/cn';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { ScheduleTable } from '../ScheduleTable';
import { HoldingDocuments } from './DocumentsPage';
import { DetailList, EmptyNote, HealthPill, Money, Panel, ProgressBar, StatusPill } from '../ui';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Payment schedule' },
  { id: 'payments', label: 'Payments' },
  { id: 'documents', label: 'Documents' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** The money side panel, the same for a home and a share. */
function ProgressPanel({ v }: { v: HoldingView }) {
  const { holding } = v;
  return (
    <Panel title="Payment progress">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-site-muted">Paid</p>
          <Money amount={v.paid} className="font-display block text-2xl font-semibold" />
        </div>
        <p className="tabular font-display text-3xl font-semibold text-site-primary">{v.progress_pct}%</p>
      </div>
      <ProgressBar pct={v.progress_pct} className="mt-3 h-2.5" tone={v.health === 'overdue' ? 'danger' : 'primary'} />
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-site-muted">Outstanding</dt>
          <dd><Money amount={v.outstanding} className="font-semibold" /></dd>
        </div>
        <div>
          <dt className="text-site-muted">Installments paid</dt>
          <dd className="tabular font-semibold">{v.paid_count} of {v.schedule.length}</dd>
        </div>
      </dl>
      {v.due_now > 0 ? (
        <div className="mt-5 rounded-2xl bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-site-danger">
            <AlertTriangle className="size-4" aria-hidden /> Due now
          </p>
          <Money amount={v.due_now} className="font-display mt-1 block text-xl font-semibold text-site-danger" />
          {v.late_fees > 0 && <p className="text-xs text-site-danger">includes <Money amount={v.late_fees} /> late fee</p>}
          <ButtonLink href={`/customer/payments/checkout?holding=${holding.code}`} className="mt-3 w-full bg-site-danger hover:bg-site-danger hover:brightness-110" icon={<CreditCard className="size-4" />}>
            Pay now
          </ButtonLink>
        </div>
      ) : v.next ? (
        <div className="mt-5 rounded-2xl bg-site-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-site-primary" aria-hidden /> Next payment</p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <Money amount={v.next.remaining} className="font-display text-xl font-semibold" />
            <StatusPill status={v.next.status} />
          </p>
          <p className="text-sm text-site-muted">{v.next.label} · due {formatDay(v.next.due_date)}</p>
          <ButtonLink href={`/customer/payments/checkout?holding=${holding.code}`} variant="outline" className="mt-3 w-full" icon={<CreditCard className="size-4" />}>
            Pay in advance
          </ButtonLink>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-site-primary-soft p-4 text-sm font-semibold text-site-primary-dark">Every installment is paid. Thank you.</p>
      )}
    </Panel>
  );
}

/** BUYER-PORTAL-PLAN.md §5 — a flat or plot: the unit, the agreement, the building and the handover. */
function HomeOverviewTab({ v }: { v: HoldingView }) {
  const { holding, project } = v;
  const home = holding.home!;
  const rows = v.schedule.filter((i) => i.seq > 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Panel title="Your home">
          <DetailList
            rows={[
              ['Booking number', <span key="c" className="tabular">{holding.code}</span>],
              ['Unit', <span key="u" className="tabular">{home.unit_code}</span>],
              ['Details', home.unit_label],
              ['Booked on', formatDay(home.booking_date)],
              ['Total price', <Money key="t" amount={holding.total_price} />],
              ['Booking money', <Money key="b" amount={home.booking_amount} />],
            ]}
          />
          {home.on_hold && (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              Your booking is on hold until the booking money is in. Once it is received, the unit is confirmed in your name.
            </p>
          )}
        </Panel>
        <Panel title="Agreement and payment plan">
          <DetailList
            rows={[
              ['Agreement number', <span key="a" className="tabular">{holding.agreement_no}</span>],
              ['Signed on', home.payment_plan ? formatDay(holding.agreement_date) : 'Not signed yet'],
              ['How you pay', home.payment_plan ?? 'Set when the agreement is signed'],
              ...(rows.length > 1
                ? ([
                    ['Installments', `${rows.length} monthly, ${formatDay(rows[0].due_date)} to ${formatDay(rows[rows.length - 1].due_date)}`],
                    ['Each installment', <Money key="e" amount={rows[0].amount} />],
                  ] as [string, React.ReactNode][])
                : rows.length === 1
                  ? ([['Balance', <span key="bal"><Money amount={rows[0].amount} /> by {formatDay(rows[0].due_date)}</span>]] as [string, React.ReactNode][])
                  : []),
              ['Late fee', v.round.late_fee_pct ? `${v.round.late_fee_pct}% of the installment after ${v.round.grace_days} days’ grace` : 'None'],
              ['Handover by', home.handover_date ? formatDay(home.handover_date) : 'As agreed with our office'],
            ]}
          />
        </Panel>
      </div>

      <div className="space-y-6">
        <ProgressPanel v={v} />

        <Panel title="Building and handover">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Construction progress</span>
            <span className="tabular font-semibold">{project.construction_progress_pct}%</span>
          </div>
          <ProgressBar pct={project.construction_progress_pct} className="mt-2" />
          <ol className="mt-5 space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              {home.fully_paid_on ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-site-primary" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-site-line" aria-hidden />}
              <span>
                <span className="font-semibold">Full price paid</span>
                <span className="block text-site-muted">{home.fully_paid_on ? formatDay(home.fully_paid_on) : 'The deed is registered after the last payment'}</span>
              </span>
            </li>
            {home.delivery.map((d) => (
              <li key={d.label} className="flex items-start gap-2.5">
                {d.done_on ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-site-primary" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-site-line" aria-hidden />}
                <span>
                  <span className="font-semibold">{d.label}</span>
                  <span className="block text-site-muted">{d.done_on ? formatDay(d.done_on) : 'Not yet'}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function OverviewTab({ v }: { v: HoldingView }) {
  const { holding, project, round } = v;
  const each = v.schedule.find((i) => i.seq === 1)?.amount ?? 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Panel title="Share details">
          <DetailList
            rows={[
              ['Holding number', <span key="c" className="tabular">{holding.code}</span>],
              ['Share round', `Round ${round.round_no} · valuation ${formatTakaShort(round.valuation)}`],
              ['Shares owned', <span key="s" className="tabular">{holding.shares}</span>],
              ['Ownership per share', formatPct(round.share_pct)],
              ['Your ownership', <span key="o" className="tabular">{formatPct(holding.share_pct)} of {project.name}</span>],
              ['Price per share', <Money key="p" amount={holding.price_per_share} />],
              ['Total price', <Money key="t" amount={holding.total_price} />],
              ['Current value', <span key="cv"><Money amount={v.current_value} /> <span className="text-sm font-normal text-site-muted">at {formatTakaShort(project.valuation)} valuation</span></span>],
            ]}
          />
        </Panel>
        <Panel title="Agreement and payment plan">
          <DetailList
            rows={[
              ['Agreement number', <span key="a" className="tabular">{holding.agreement_no}</span>],
              ['Signed on', formatDay(holding.agreement_date)],
              ['Down payment', <Money key="d" amount={holding.down_payment} />],
              ['Installments', `${holding.installment_count} × ${FREQUENCY_LABEL[holding.frequency].toLowerCase()}`],
              ['Each installment', <Money key="e" amount={each} />],
              ['Late fee', '2% of the installment after 7 days’ grace'],
              ['Share certificate', holding.certificate_no ?? 'Issued once every installment is paid'],
            ]}
          />
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Payment progress">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-site-muted">Paid</p>
              <Money amount={v.paid} className="font-display block text-2xl font-semibold" />
            </div>
            <p className="tabular font-display text-3xl font-semibold text-site-primary">{v.progress_pct}%</p>
          </div>
          <ProgressBar pct={v.progress_pct} className="mt-3 h-2.5" tone={v.health === 'overdue' ? 'danger' : 'primary'} />
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-site-muted">Outstanding</dt>
              <dd><Money amount={v.outstanding} className="font-semibold" /></dd>
            </div>
            <div>
              <dt className="text-site-muted">Installments paid</dt>
              <dd className="tabular font-semibold">{v.paid_count} of {v.schedule.length}</dd>
            </div>
          </dl>
          {v.due_now > 0 ? (
            <div className="mt-5 rounded-2xl bg-red-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-site-danger">
                <AlertTriangle className="size-4" aria-hidden /> Due now
              </p>
              <Money amount={v.due_now} className="font-display mt-1 block text-xl font-semibold text-site-danger" />
              {v.late_fees > 0 && <p className="text-xs text-site-danger">includes <Money amount={v.late_fees} /> late fee</p>}
              <ButtonLink href={`/customer/payments/checkout?holding=${holding.code}`} className="mt-3 w-full bg-site-danger hover:bg-site-danger hover:brightness-110" icon={<CreditCard className="size-4" />}>
                Pay now
              </ButtonLink>
            </div>
          ) : v.next ? (
            <div className="mt-5 rounded-2xl bg-site-soft p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-site-primary" aria-hidden /> Next payment</p>
              <p className="mt-1 flex items-center justify-between gap-2">
                <Money amount={v.next.remaining} className="font-display text-xl font-semibold" />
                <StatusPill status={v.next.status} />
              </p>
              <p className="text-sm text-site-muted">{v.next.label} · due {formatDay(v.next.due_date)}</p>
              <ButtonLink href={`/customer/payments/checkout?holding=${holding.code}`} variant="outline" className="mt-3 w-full" icon={<CreditCard className="size-4" />}>
                Pay in advance
              </ButtonLink>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-site-primary-soft p-4 text-sm font-semibold text-site-primary-dark">Every installment is paid. Thank you.</p>
          )}
        </Panel>

        <Panel title="About the project">
          <p className="text-[15px] text-site-muted">{project.summary}</p>
          <div className="mt-5">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Construction progress</span>
              <span className="tabular font-semibold">{project.construction_progress_pct}%</span>
            </div>
            <ProgressBar pct={project.construction_progress_pct} className="mt-2" />
          </div>
          <p className="mt-4 text-sm text-site-muted">
            Latest valuation <span className="font-semibold text-site-ink">{formatTakaShort(project.valuation)}</span> · {formatDay(project.valuation_date)}
          </p>
        </Panel>
      </div>
    </div>
  );
}

/** "৳ 120 crore" — valuations read in crore; payments always in full. */
function formatTakaShort(amount: number) {
  return `৳ ${Number((amount / 10_000_000).toFixed(2))} crore`;
}

export function HoldingDetailPage({ code }: { code: string }) {
  const { portfolio } = useCustomerPortal();
  const [tab, setTab] = useState<Tab>('overview');
  const v = portfolio.holdings.find((h) => h.holding.code === code);

  if (!v) {
    return (
      <Panel>
        <EmptyNote icon={FileSearch} title="Not found" body="This home or investment is not on your account. Please go back to the overview." />
      </Panel>
    );
  }
  const { holding, project } = v;
  const home = isHome(holding);

  return (
    <div className="space-y-6">
      <Link href={home ? '/customer/homes' : '/customer/investments'} className="inline-flex items-center gap-1.5 text-sm font-medium text-site-muted hover:text-site-primary">
        <ArrowLeft className="size-4" aria-hidden /> {home ? 'My homes' : 'My investments'}
      </Link>

      <section className="relative overflow-hidden rounded-3xl bg-site-night text-white shadow-site-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- mock stock photo */}
        <img src={project.image} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-r from-site-night via-site-night/80 to-site-night/20" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <HealthPill health={v.health} className="bg-white/95" />
              <span className="tabular rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">{holding.code}</span>
            </div>
            <h1 className="mt-4 text-3xl leading-tight font-semibold sm:text-4xl">{project.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-white/75">
              <span className="inline-flex items-center gap-1.5"><Building2 className="size-4" aria-hidden /> {project.category}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden /> {project.location}</span>
            </p>
          </div>
          <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-md sm:gap-6 sm:p-5">
            <div>
              <dt className="text-xs text-white/60">{home ? 'Unit' : 'Shares'}</dt>
              <dd className="font-display tabular mt-1 text-xl font-semibold sm:text-2xl">{home ? holding.home?.unit_code : holding.shares}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/60">{home ? 'Paid' : 'Ownership'}</dt>
              <dd className="font-display tabular mt-1 text-xl font-semibold sm:text-2xl">{home ? `${v.progress_pct}%` : formatPct(holding.share_pct)}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/60">Total price</dt>
              <dd className="font-display mt-1 text-xl font-semibold sm:text-2xl"><Money amount={holding.total_price} /></dd>
            </div>
          </dl>
        </div>
      </section>

      <div role="tablist" aria-label="Investment sections" className="flex gap-1 overflow-x-auto rounded-full border border-site-line bg-white p-1 shadow-site-1 sm:w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              tab === t.id ? 'bg-site-night text-white' : 'text-site-muted hover:text-site-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'overview' && (home ? <HomeOverviewTab v={v} /> : <OverviewTab v={v} />)}
        {tab === 'schedule' && (
          <Panel
            title="Payment schedule"
            action={v.next && <ButtonLink href={`/customer/payments/checkout?holding=${holding.code}`} size="sm" icon={<CreditCard className="size-4" />}>Pay</ButtonLink>}
            padded={false}
          >
            <ScheduleTable rows={v.schedule} />
          </Panel>
        )}
        {tab === 'payments' && (
          <Panel title={home ? 'Payments for this home' : 'Payments for this project'} padded={false}>
            {v.payments.length ? (
              <ul className="divide-y divide-site-line">
                {v.payments.map((p) => (
                  <li key={p.receipt_no}>
                    <Link href={`/customer/receipts/${p.receipt_no}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-site-ivory sm:px-6">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-site-primary-soft text-site-primary">
                        <Receipt className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="tabular block font-semibold">{p.receipt_no}</span>
                        <span className="block text-sm text-site-muted">
                          {formatDay(p.paid_at)} · {p.method_detail} · {p.allocations.map((a) => allocationLabel(v, a)).join(', ')}
                        </span>
                      </span>
                      <Money amount={p.total} className="font-semibold" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote icon={Receipt} title="No payments yet" />
            )}
          </Panel>
        )}
        {tab === 'documents' && (
          <Panel title="Documents" padded={false}>
            <HoldingDocuments v={v} holdings={portfolio.holdings} />
          </Panel>
        )}
      </div>
    </div>
  );
}
