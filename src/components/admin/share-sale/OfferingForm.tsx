'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Equal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, MoneyInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { useMockSession } from '@/lib/auth/mock-session';
import { LATE_FEE_TYPES, type LateFeeType, type ShareFrequency, type ShareOffering } from '@/lib/db/types';
import { FREQUENCY_LABEL, LATE_FEE_TYPE_LABEL, addDays, closesOn, daysBetween, formatCrore, formatSharePct, offeringMath } from '@/lib/domain/share-sale';
import { projectRepository, projectStatement, shareOfferingRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/** The form's state: every number as typed, so a half-typed field is not forced into a number. */
interface Draft {
  project_id: string;
  net_asset_value: string;
  premium_mode: 'amount' | 'pct';
  premium_value: string;
  premium_pct: string;
  valuation_date: string;
  offered_pct: string;
  total_shares: string;
  closes_on: string;
  min_shares: string;
  max_shares: string;
  min_down_payment_pct: string;
  max_installments: string;
  installment_frequency: ShareFrequency;
  late_fee_type: LateFeeType;
  late_fee_pct: string;
  late_fee_amount: string;
  grace_days: string;
  hold_days: string;
  notes: string;
}

/** How the premium is typed (feedback A1, round 2): a clear name for each choice. */
const PREMIUM_MODE_LABEL: Record<Draft['premium_mode'], string> = {
  amount: 'Fixed amount (BDT)',
  pct: 'Percentage of NAV (%)',
};

function fromOffering(o: ShareOffering | undefined, projectId: string | null): Draft {
  const today = todayLocal();
  return {
    project_id: o?.project_id ?? projectId ?? '',
    net_asset_value: o ? String(o.net_asset_value) : '',
    premium_mode: 'amount',
    premium_value: o ? String(o.premium_value) : '',
    premium_pct: '',
    valuation_date: o?.valuation_date ?? today,
    offered_pct: o ? String(o.offered_pct) : '',
    total_shares: o ? String(o.total_shares) : '',
    // a draft saved before close dates keeps its day count, counted from today
    closes_on: o?.closes_on && o.closes_on > today ? o.closes_on : closesOn(today, o?.validity_days ?? 90),
    min_shares: o ? String(o.min_shares) : '1',
    max_shares: o ? String(o.max_shares) : '',
    min_down_payment_pct: o ? String(o.min_down_payment_pct) : '20',
    max_installments: o ? String(o.max_installments) : '20',
    installment_frequency: o?.installment_frequency ?? 'monthly',
    late_fee_type: o?.late_fee_type ?? 'pct_once',
    // switching a fixed-fee draft back to % starts from the usual 2%
    late_fee_pct: o && o.late_fee_type !== 'fixed_once' ? String(o.late_fee_pct) : '2',
    late_fee_amount: o?.late_fee_amount ? String(o.late_fee_amount) : '',
    grace_days: o ? String(o.grace_days) : '7',
    hold_days: o ? String(o.hold_days) : '7',
    notes: o?.notes ?? '',
  };
}

function Row({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-2 text-sm', strong && 'font-semibold text-ink')}>
      <span className={strong ? '' : 'text-ink-muted'}>{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

/**
 * New or draft share offering (client meeting, 2026-11-01):
 *   valuation = net asset value + premium
 *   then the % going to the market, how many shares, the day it closes,
 *   and the longest installment plan.
 * The summary on the right works the price out as the numbers are typed;
 * the buttons sit under the form, as on the other forms (feedback A4).
 */
export function OfferingForm({ offering, projectId }: { offering?: ShareOffering; projectId?: string | null }) {
  const router = useRouter();
  const { userId } = useMockSession();
  const [d, setD] = useState<Draft>(() => fromOffering(offering, projectId ?? null));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // an error belongs to the numbers it was about; editing any of them clears it
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setError('');
  };

  const projects = useLiveQuery(() => projectRepository.list(), []);
  const statement = useLiveQuery(() => (d.project_id ? projectStatement(d.project_id) : Promise.resolve(null)), [d.project_id]);
  const free = useLiveQuery(() => (d.project_id ? shareOfferingRepository.freePct(d.project_id, offering?.id) : Promise.resolve(100)), [d.project_id, offering?.id]);

  const nav = Number(d.net_asset_value) || 0;
  const premium = d.premium_mode === 'pct' ? Math.round((nav * (Number(d.premium_pct) || 0)) / 100) : Number(d.premium_value) || 0;
  const terms = { net_asset_value: nav, premium_value: premium, offered_pct: Number(d.offered_pct) || 0, total_shares: Number(d.total_shares) || 0 };
  const m = offeringMath(terms);
  const shares = Math.floor(terms.total_shares);
  const maxShares = Number(d.max_shares) || 0;
  const n = Number(d.max_installments) || 0;
  const downPct = Number(d.min_down_payment_pct) || 0;
  const example = Math.max(1, Number(d.min_shares) || 1) * m.price_per_share;
  const exampleDown = Math.round((example * downPct) / 100);
  const today = todayLocal();
  const openDays = d.closes_on > today ? daysBetween(today, d.closes_on) + 1 : 0;
  const premiumPctOfNav = nav > 0 && premium > 0 ? Number(((premium / nav) * 100).toFixed(1)) : null;

  /** Switching how the premium is typed carries the number across, so the same premium shows the other way. */
  function premiumMode(mode: Draft['premium_mode']) {
    if (mode === 'pct') set('premium_pct', premiumPctOfNav !== null ? String(premiumPctOfNav) : '');
    else if (premium > 0) set('premium_value', String(premium));
    set('premium_mode', mode);
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const saved = await shareOfferingRepository.save(
        {
          id: offering?.id,
          project_id: d.project_id,
          net_asset_value: nav,
          premium_value: premium,
          valuation_date: d.valuation_date,
          offered_pct: terms.offered_pct,
          total_shares: Number(d.total_shares),
          closes_on: d.closes_on,
          min_shares: Number(d.min_shares),
          max_shares: Number(d.max_shares),
          min_down_payment_pct: downPct,
          max_installments: Number(d.max_installments),
          installment_frequency: d.installment_frequency,
          late_fee_type: d.late_fee_type,
          late_fee_pct: Number(d.late_fee_pct),
          late_fee_amount: Number(d.late_fee_amount) || 0,
          grace_days: Number(d.grace_days),
          hold_days: Number(d.hold_days),
          notes: d.notes,
        },
        userId,
      );
      router.push(`/admin/share-sale/offerings/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  const project = (projects ?? []).find((p) => p.id === d.project_id);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="1. Project valuation" subtitle="Valuation = net asset value + premium. It is the value of 100% of the project for this offering." />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project" required className="md:col-span-2">
              <SelectInput value={d.project_id} onChange={(e) => set('project_id', e.target.value)} disabled={!!offering}>
                <option value="">Choose a project…</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.code}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field
              label="Net asset value (NAV)"
              required
              hint={statement ? undefined : 'What the project’s land, building and other assets are worth, less what it owes.'}
            >
              <MoneyInput value={d.net_asset_value} onChange={(e) => set('net_asset_value', e.target.value)} placeholder="e.g. 900000000" />
              {statement && statement.cost.total > 0 && (
                <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  Book cost to date {formatBdt(statement.cost.total)}
                  <button type="button" className="font-semibold text-admin-700 hover:underline" onClick={() => set('net_asset_value', String(Math.round(statement.cost.total)))}>
                    Use as NAV
                  </button>
                </span>
              )}
            </Field>
            <Field label="Premium over NAV" hint="Brand, location, expected income — what the owner adds on top of NAV.">
              <div className="flex items-start gap-2">
                <SelectInput value={d.premium_mode} onChange={(e) => premiumMode(e.target.value as Draft['premium_mode'])} className="w-48 shrink-0" aria-label="Enter the premium as">
                  {(Object.keys(PREMIUM_MODE_LABEL) as Draft['premium_mode'][]).map((mode) => (
                    <option key={mode} value={mode}>
                      {PREMIUM_MODE_LABEL[mode]}
                    </option>
                  ))}
                </SelectInput>
                <div className="min-w-0 flex-1">
                  {d.premium_mode === 'amount' ? (
                    <MoneyInput value={d.premium_value} onChange={(e) => set('premium_value', e.target.value)} placeholder="e.g. 300000000" />
                  ) : (
                    <TextInput type="number" min="0" step="0.1" value={d.premium_pct} onChange={(e) => set('premium_pct', e.target.value)} placeholder="e.g. 25" />
                  )}
                </div>
              </div>
              {premiumPctOfNav !== null && (
                <span className="mt-1 block text-xs font-medium text-admin-700">{d.premium_mode === 'pct' ? `= ${formatBdt(premium)}` : `= ${premiumPctOfNav}% of NAV`}</span>
              )}
            </Field>
            <Field label="Valuation date" required>
              <TextInput type="date" value={d.valuation_date} onChange={(e) => set('valuation_date', e.target.value)} />
            </Field>
            <div className="flex items-center gap-2 self-end rounded-xl border border-admin-100 bg-admin-50/60 px-3 py-2.5 text-sm">
              <span className="text-ink-muted">Valuation</span>
              <span className="ml-auto font-semibold tabular-nums text-admin-700">{m.valuation > 0 ? formatBdt(m.valuation) : '—'}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="2. Share offered to the market"
            subtitle={d.project_id && free !== undefined ? `${formatSharePct(free)} of ${project?.name ?? 'this project'} is still free to offer.` : 'What part of the project goes on sale, split into how many shares, for how long.'}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="% of project offered" required hint={free !== undefined && d.project_id ? `Up to ${formatSharePct(free)}` : undefined}>
              <TextInput type="number" min="0" max="100" step="0.01" value={d.offered_pct} onChange={(e) => set('offered_pct', e.target.value)} placeholder="e.g. 50" />
            </Field>
            <Field label="Number of shares" required hint={m.share_pct > 0 ? `${formatSharePct(m.share_pct)} ownership each` : undefined}>
              <TextInput type="number" min="1" step="1" value={d.total_shares} onChange={(e) => set('total_shares', e.target.value)} placeholder="e.g. 500" />
            </Field>
            <Field label="Offer closes on" required hint={openDays ? `Open ${openDays} days if opened today` : 'Pick a day after today'}>
              <TextInput type="date" value={d.closes_on} min={addDays(today, 1)} max={addDays(today, 364)} onChange={(e) => set('closes_on', e.target.value)} />
            </Field>
            <Field label="Minimum shares per customer" required>
              <TextInput type="number" min="1" step="1" value={d.min_shares} onChange={(e) => set('min_shares', e.target.value)} />
            </Field>
            <Field label="Maximum shares per customer" required hint={maxShares > 0 && m.share_pct > 0 ? `${formatSharePct(maxShares * m.share_pct)} at most` : undefined}>
              <TextInput type="number" min="1" step="1" value={d.max_shares} onChange={(e) => set('max_shares', e.target.value)} placeholder="e.g. 25" />
            </Field>
            <Field label="Hold reserved shares (days)" required hint="Until the agreement is signed">
              <TextInput type="number" min="1" max="60" step="1" value={d.hold_days} onChange={(e) => set('hold_days', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="3. Payment plan limits" subtitle="The most a buyer may spread the price over. Each agreement can choose fewer installments or a bigger down payment." />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Minimum down payment (%)" required>
              <TextInput type="number" min="0" max="100" step="1" value={d.min_down_payment_pct} onChange={(e) => set('min_down_payment_pct', e.target.value)} />
            </Field>
            <Field label="Maximum installments" required hint="After the down payment; 0 = full price at signing">
              <TextInput type="number" min="0" max="120" step="1" value={d.max_installments} onChange={(e) => set('max_installments', e.target.value)} />
            </Field>
            <Field label="Installment frequency" required>
              <SelectInput value={d.installment_frequency} onChange={(e) => set('installment_frequency', e.target.value as ShareFrequency)}>
                {(Object.keys(FREQUENCY_LABEL) as ShareFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Late fee type" required hint="Charged once on each late installment, never on the down payment">
              <SelectInput value={d.late_fee_type} onChange={(e) => set('late_fee_type', e.target.value as LateFeeType)}>
                {LATE_FEE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LATE_FEE_TYPE_LABEL[t]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {d.late_fee_type === 'fixed_once' ? (
              <Field label="Late fee (BDT)" required hint="0 = no late fee">
                <MoneyInput value={d.late_fee_amount} onChange={(e) => set('late_fee_amount', e.target.value)} placeholder="e.g. 2000" />
              </Field>
            ) : (
              <Field label="Late fee (% of the installment)" required hint="0 = no late fee">
                <TextInput type="number" min="0" max="25" step="0.5" value={d.late_fee_pct} onChange={(e) => set('late_fee_pct', e.target.value)} />
              </Field>
            )}
            <Field label="Grace days before the late fee" required>
              <TextInput type="number" min="0" step="1" value={d.grace_days} onChange={(e) => set('grace_days', e.target.value)} />
            </Field>
            <Field label="Notes" className="md:col-span-3">
              <TextArea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the sales team should know about this offering" />
            </Field>
          </div>
        </Card>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-xs text-ink-muted">Saved as a draft. Open it from the next page when the numbers are agreed.</p>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : offering ? 'Save draft' : 'Save as draft'}
          </Button>
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20">
        <Card className="p-0">
          <div className="flex items-center gap-2 border-b border-hairline px-5 py-3.5">
            <Calculator className="size-4 text-admin-600" />
            <h2 className="text-sm font-semibold text-ink">Offer at a glance</h2>
          </div>
          <div className="px-5 py-3">
            <div className="mb-2 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 rounded-xl bg-canvas/70 p-3 text-center">
              <div>
                <p className="text-[11px] text-ink-muted">NAV</p>
                <p className="text-sm font-semibold tabular-nums">{nav ? formatCrore(nav) : '—'}</p>
              </div>
              <Plus className="size-3.5 text-ink-muted" />
              <div>
                <p className="text-[11px] text-ink-muted">Premium</p>
                <p className="text-sm font-semibold tabular-nums">{premium ? formatCrore(premium) : '—'}</p>
              </div>
              <Equal className="size-3.5 text-ink-muted" />
              <div>
                <p className="text-[11px] text-ink-muted">Valuation</p>
                <p className="text-sm font-semibold tabular-nums text-admin-700">{m.valuation ? formatCrore(m.valuation) : '—'}</p>
              </div>
            </div>
            {m.premium_pct !== null && premium > 0 && <p className="mb-1 text-xs text-ink-muted">Premium is {Number(m.premium_pct.toFixed(1))}% over NAV.</p>}
            <div className="divide-y divide-hairline">
              <Row label="Offered to the market">{terms.offered_pct ? `${formatSharePct(terms.offered_pct)} · ${shares || '—'} shares` : '—'}</Row>
              <Row label="Ownership per share">{m.share_pct ? formatSharePct(m.share_pct) : '—'}</Row>
              <Row label="Price per share" strong>
                {m.price_per_share ? formatBdt(m.price_per_share) : '—'}
              </Row>
              <Row label="Raises if every share sells" strong>
                {m.raise ? formatBdt(m.raise) : '—'}
              </Row>
              <Row label="Owner keeps after this offering">{d.project_id && free !== undefined && terms.offered_pct ? formatSharePct(Math.max(0, free - terms.offered_pct)) : '—'}</Row>
              <Row label="Offer closes">{openDays ? `${formatDate(d.closes_on)} · ${openDays} days` : '—'}</Row>
            </div>
          </div>
          {m.price_per_share > 0 && (
            <div className="border-t border-hairline bg-canvas/50 px-5 py-3 text-xs text-ink-muted">
              <p className="font-semibold text-ink">Smallest purchase, longest plan</p>
              <p className="mt-1">
                {Number(d.min_shares) || 1} share{(Number(d.min_shares) || 1) > 1 ? 's' : ''} = {formatBdt(example)}: {formatBdt(exampleDown)} down
                {n > 0 ? `, then ${n} × ${formatBdt(Math.round((example - exampleDown) / n))} ${FREQUENCY_LABEL[d.installment_frequency].toLowerCase()}` : ' (paid in full)'}.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
