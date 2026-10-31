'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Award, FileSearch, Printer } from 'lucide-react';
import { BrandMark } from '@/components/public/BrandMark';
import { Button } from '@/components/public/ui/Button';
import { useCompanyInfo } from '@/components/public/useCompanyInfo';
import {
  CUSTOMER_TYPE_LABEL,
  FREQUENCY_LABEL,
  GRACE_DAYS,
  LATE_FEE_RATE,
  formatDay,
  formatPct,
  formatTaka,
  takaInWords,
  type HoldingView,
  type InvestorCustomer,
} from '@/lib/domain/investor-portal';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { EmptyNote, Money, Panel } from '../ui';

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
      {[left, right].map((who) => (
        <div key={who}>
          <div className="h-10 border-b border-site-ink/40" />
          <p className="mt-2 font-semibold">{who}</p>
        </div>
      ))}
    </div>
  );
}

function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-1">
      <span className="font-semibold">{n}.</span>
      <span>
        <span className="font-semibold">{title}. </span>
        {children}
      </span>
    </li>
  );
}

function Agreement({ v, c, owner }: { v: HoldingView; c: InvestorCustomer; owner: string }) {
  const h = v.holding;
  const each = v.schedule.find((i) => i.seq === 1)?.amount ?? 0;
  return (
    <>
      <p>
        This Share Purchase Agreement (No. <b className="tabular">{h.agreement_no}</b>) is made on <b>{formatDay(h.agreement_date)}</b> between <b>{owner}</b>{' '}
        (the “Owner”) and <b>{c.full_name}</b>, customer {c.code}, customer type {CUSTOMER_TYPE_LABEL[c.customer_type]} (the “Customer”).
      </p>
      <ol className="mt-5 space-y-3">
        <Clause n={1} title="Shares">
          The Owner sells and the Customer buys <b>{h.shares} shares</b> of <b>{v.project.name}</b>, {v.project.location}, from Share Round {v.round.round_no}. Each
          share carries {formatPct(v.round.share_pct)} ownership; together {formatPct(h.share_pct)} of the project.
        </Clause>
        <Clause n={2} title="Price">
          {formatTaka(h.price_per_share)} per share, a total of <b>{formatTaka(h.total_price)}</b> ({takaInWords(h.total_price)}).
        </Clause>
        <Clause n={3} title="Payment plan">
          A down payment of {formatTaka(h.down_payment)}, then {h.installment_count} {FREQUENCY_LABEL[h.frequency].toLowerCase()} installments of {formatTaka(each)} each, on the
          dates in the attached payment schedule.
        </Clause>
        <Clause n={4} title="Late payment">
          An installment paid more than {GRACE_DAYS} days after its due date carries a late fee of {LATE_FEE_RATE * 100}% of that installment.
        </Clause>
        <Clause n={5} title="Ownership">
          A share certificate is issued once the full price is paid. Until then the shares are held for the Customer under this agreement.
        </Clause>
      </ol>
      <Signatures left={`For ${owner}`} right={c.full_name} />
    </>
  );
}

function Deed({ v, c, owner }: { v: HoldingView; c: InvestorCustomer; owner: string }) {
  return (
    <>
      <p>
        By this deed, executed on <b>{formatDay(v.holding.agreement_date)}</b> under agreement {v.holding.agreement_no}, <b>{owner}</b> records that{' '}
        <b>{c.full_name}</b> ({c.code}) holds <b>{v.holding.shares} shares</b>, being <b>{formatPct(v.holding.share_pct)}</b> of the ownership of{' '}
        <b>{v.project.name}</b>, {v.project.location}, subject to the payment terms of that agreement.
      </p>
      <p className="mt-4">
        The nominee for these shares is <b>{c.nominee.name}</b> ({c.nominee.relation}).
      </p>
      <Signatures left={`For ${owner}`} right={c.full_name} />
    </>
  );
}

function Schedule({ v }: { v: HoldingView }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-y border-site-line text-xs tracking-wide text-site-muted uppercase">
          <th className="px-2 py-2 font-semibold">#</th>
          <th className="px-2 py-2 font-semibold">Due date</th>
          <th className="px-2 py-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-site-line">
        {v.schedule.map((i) => (
          <tr key={i.id}>
            <td className="px-2 py-2">{i.label}</td>
            <td className="tabular px-2 py-2">{formatDay(i.due_date)}</td>
            <td className="px-2 py-2 text-right"><Money amount={i.amount} /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-site-ink">
          <td className="px-2 py-2 font-semibold" colSpan={2}>Total</td>
          <td className="px-2 py-2 text-right font-semibold"><Money amount={v.holding.total_price} /></td>
        </tr>
      </tfoot>
    </table>
  );
}

function Certificate({ v, c, owner, issued }: { v: HoldingView; c: InvestorCustomer; owner: string; issued: string | null }) {
  return (
    <div className="rounded-2xl border-4 border-double border-site-brass p-8 text-center sm:p-12">
      <Award className="mx-auto size-12 text-site-brass" aria-hidden />
      <p role="heading" aria-level={1} className="font-accent mt-4 text-4xl text-site-brass-dark italic">Share Certificate</p>
      <p className="tabular mt-2 text-sm text-site-muted">No. {v.holding.certificate_no}</p>
      <p className="mx-auto mt-8 max-w-lg text-[17px] leading-relaxed">
        This is to certify that <b>{c.full_name}</b> ({c.code}) is the registered holder of <b>{v.holding.shares} fully paid shares</b>, being{' '}
        <b>{formatPct(v.holding.share_pct)}</b> of the ownership of <b>{v.project.name}</b>, {v.project.location}.
      </p>
      <p className="mt-6 text-sm text-site-muted">Issued by {owner} on {formatDay(issued)}</p>
      <Signatures left="Managing Director" right="Company Secretary" />
    </div>
  );
}

export function DocumentViewPage({ id }: { id: string }) {
  const company = useCompanyInfo();
  const { snapshot, portfolio } = useCustomerPortal();
  const doc = snapshot.documents.find((d) => d.id === id && d.available);
  const v = doc && portfolio.holdings.find((h) => h.holding.code === doc.holding_code);

  if (!doc || !v) {
    return (
      <Panel>
        <EmptyNote icon={FileSearch} title="Document not available" body="This document is not on your account or has not been issued yet." />
      </Panel>
    );
  }
  const owner = company?.company_name ?? 'The Owner';
  const c = snapshot.customer;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print-hide mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/investor/documents" className="inline-flex items-center gap-1.5 text-sm font-medium text-site-muted hover:text-site-primary">
          <ArrowLeft className="size-4" aria-hidden /> Documents
        </Link>
        <Button onClick={() => window.print()} icon={<Printer className="size-4" />}>
          Print or save as PDF
        </Button>
      </div>

      <article className="relative overflow-hidden rounded-3xl border border-site-line bg-white p-6 text-[15px] leading-relaxed shadow-site-2 sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <span aria-hidden className="font-display pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] text-7xl font-bold tracking-widest whitespace-nowrap text-site-ink/[0.04] sm:text-8xl">
          SAMPLE
        </span>
        {doc.kind !== 'certificate' && (
          <header className="mb-8 flex flex-col gap-4 border-b-2 border-site-night pb-6 sm:flex-row sm:items-end sm:justify-between">
            <BrandMark company={company} />
            <div className="sm:text-right">
              <h1 className="text-xl font-semibold uppercase">{doc.title}</h1>
              <p className="text-sm text-site-muted">
                {v.project.name} · {v.holding.code}
              </p>
            </div>
          </header>
        )}
        {doc.kind === 'agreement' && <Agreement v={v} c={c} owner={owner} />}
        {doc.kind === 'deed' && <Deed v={v} c={c} owner={owner} />}
        {doc.kind === 'schedule' && <Schedule v={v} />}
        {doc.kind === 'certificate' && <Certificate v={v} c={c} owner={owner} issued={doc.issued_on} />}
        <p className="mt-10 border-t border-site-line pt-4 text-xs text-site-muted">
          Sample document for the Customer Portal demo. The signed original is kept at our office.
        </p>
      </article>
    </div>
  );
}
