'use client';

import { useState } from 'react';
import { BadgeCheck, Check, FlaskConical, Landmark, LockKeyhole, Mail, RotateCcw, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/public/ui/Button';
import { CUSTOMER_TYPE_LABEL, formatDay } from '@/lib/domain/investor-portal';
import { investorRepository } from '@/lib/repositories/investor/investor.mock.repository';
import { formatPhone } from '@/lib/utils/format';
import { useCustomerPortal } from '../CustomerPortalProvider';
import { CustomerTypeBadge, DetailList, PageHeading, Panel } from '../ui';

export function ProfilePage() {
  const { snapshot } = useCustomerPortal();
  const [requested, setRequested] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const c = snapshot.customer;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Account"
        title="My profile"
        description="The details on your customer record. To change any of them, send a request and our office will update it after checking."
        actions={
          requested ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-site-primary-soft px-4 py-2 text-sm font-semibold text-site-primary-dark">
              <Check className="size-4" aria-hidden /> Request sent — we will contact you
            </span>
          ) : (
            <Button variant="outline" size="sm" icon={<Mail className="size-4" />} onClick={() => setRequested(true)}>
              Request a change
            </Button>
          )
        }
      />

      <section className="flex flex-col gap-5 rounded-3xl bg-site-night p-6 text-white shadow-site-2 sm:flex-row sm:items-center sm:p-8">
        <span className="font-display grid size-20 shrink-0 place-items-center rounded-full bg-site-brass text-2xl font-bold text-site-night">
          {c.full_name
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join('')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-semibold">{c.full_name}</p>
          <p className="tabular mt-1 text-white/65">
            Customer {c.code} · since {formatDay(c.joined_on)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CustomerTypeBadge type={c.customer_type} className="bg-site-brass/20 text-site-brass" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
              <BadgeCheck className="size-3.5 text-site-brass" aria-hidden /> KYC verified {formatDay(c.kyc_verified_on)}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={<span className="inline-flex items-center gap-2"><UserRound className="size-5 text-site-primary" aria-hidden /> Personal details</span>}>
          <DetailList
            rows={[
              ['Full name', c.full_name],
              ['Customer type', CUSTOMER_TYPE_LABEL[c.customer_type]],
              ['Date of birth', formatDay(c.date_of_birth)],
              ['National ID', <span key="n" className="tabular">{c.nid_masked}</span>],
              ['TIN', <span key="t" className="tabular">{c.tin_masked}</span>],
            ]}
          />
        </Panel>
        <Panel title={<span className="inline-flex items-center gap-2"><Mail className="size-5 text-site-primary" aria-hidden /> Contact</span>}>
          <DetailList
            rows={[
              ['Mobile', <span key="m" className="tabular">{formatPhone(c.phone)}</span>],
              ['Email', c.email],
              ['Address', c.address],
            ]}
          />
        </Panel>
        <Panel title={<span className="inline-flex items-center gap-2"><Users className="size-5 text-site-primary" aria-hidden /> Nominee</span>}>
          <DetailList
            rows={[
              ['Name', c.nominee.name],
              ['Relation', c.nominee.relation],
              ['Mobile', <span key="m" className="tabular">{formatPhone(c.nominee.phone)}</span>],
              ['Share of entitlement', `${c.nominee.share_pct}%`],
            ]}
          />
        </Panel>
        <Panel title={<span className="inline-flex items-center gap-2"><Landmark className="size-5 text-site-primary" aria-hidden /> Bank account for payouts</span>}>
          <DetailList
            rows={[
              ['Bank', c.bank.bank_name],
              ['Branch', c.bank.branch],
              ['Account', <span key="a" className="tabular">{c.bank.account_masked}</span>],
            ]}
          />
        </Panel>
      </div>

      <div className="flex gap-3 rounded-2xl bg-site-soft p-5 text-sm text-site-muted">
        <LockKeyhole className="mt-0.5 size-5 shrink-0 text-site-primary" aria-hidden />
        <p>
          You sign in with a one-time code sent to your registered mobile number or email, so there is no password to remember or leak. Only you can see your
          investments, payments and documents.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-site-brass/50 bg-site-brass/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex gap-2.5 text-site-muted">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-site-brass-dark" aria-hidden />
          <span>
            <span className="font-semibold text-site-brass-dark">Demo mode.</span> Sample data and a sandbox payment gateway — no real money moves.
          </span>
        </p>
        {resetDone ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-site-primary-dark" role="status">
            <Check className="size-4" aria-hidden /> Demo reset
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw className="size-4" />}
            onClick={() => {
              investorRepository.resetDemo();
              setResetDone(true);
            }}
          >
            Reset demo
          </Button>
        )}
      </div>
    </div>
  );
}
