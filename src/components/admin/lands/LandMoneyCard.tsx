'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import type { Land } from '@/lib/db/types';
import { landUsesPurchasePricing } from '@/lib/domain/land';
import { landAcquisitionCostRepository } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt } from '@/lib/utils/format';

/**
 * The land's money on the Overview (2026-10-21) — replaces "Commercials".
 *
 * Read from the same cost sheet as the Land Cost tab, so the two can never
 * disagree. The old card mixed its sources: "Paid to date" counted every
 * cost on the land while "Balance" subtracted only payments to the owner,
 * so the two lines measured different things and did not add up.
 *
 * Three questions, in the order an owner asks them: what did we agree to
 * pay for the land, how much of that has the landowner had, and what does
 * the land cost us altogether.
 */
export function LandMoneyCard({ land, onOpenCost }: { land: Land; onOpenCost: () => void }) {
  const sheet = useLiveQuery(() => landAcquisitionCostRepository.sheetForLand(land.id), [land.id]);
  if (!sheet) return null;

  const purchase = landUsesPurchasePricing(land.acquisition_type);
  const price = sheet.lines.find((l) => l.cost_head === 'land_price');
  const asking = Number(land.asking_price) || 0;
  const agreed = price?.agreed ?? null;
  const ownerPaid = price?.actual ?? 0;
  const ownerOwed = agreed != null ? Math.max(0, agreed - ownerPaid) : null;
  const ownerPct = agreed ? Math.min(100, Math.round((ownerPaid / agreed) * 100)) : 0;
  const moved = purchase && agreed != null && asking > 0 ? ((agreed - asking) / asking) * 100 : null;

  const dev = sheet.development;
  const total = {
    budget: sheet.estimatedTotal + dev.estimated,
    deal:
      sheet.agreedTotal != null || dev.agreed != null
        ? (sheet.agreedTotal ?? sheet.estimatedTotal) + (dev.agreed ?? dev.estimated)
        : null,
    paid: sheet.actualTotal + dev.actual,
    pending: sheet.pendingTotal + dev.pending,
  };

  return (
    <Card>
      <CardHeader
        title="Money at a glance"
        action={
          <button
            type="button"
            onClick={onOpenCost}
            className="inline-flex items-center gap-1 text-sm font-medium text-admin-700 hover:underline"
          >
            Land Cost <ArrowRight className="size-3.5" />
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1 — the price */}
        <div className="rounded-xl border border-hairline p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {purchase ? 'Land price' : 'Cash payable to the landowner'}
          </p>
          {purchase && (
            <p className="mt-2 text-xs text-ink-muted">
              Asking <span className="font-medium tabular-nums text-ink">{asking ? formatBdt(asking) : '—'}</span>
            </p>
          )}
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
            {agreed != null ? formatBdt(agreed) : <span className="text-base text-ink-muted">Not agreed yet</span>}
          </p>
          <p className="text-xs text-ink-muted">{agreed != null ? 'agreed' : 'agreed once a negotiation round is accepted'}</p>
          {moved != null && Math.abs(moved) >= 0.5 && (
            <span
              className={cn(
                'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                moved > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
              )}
            >
              {moved > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {moved > 0 ? '+' : '−'}
              {Math.abs(moved).toFixed(moved % 1 === 0 ? 0 : 1)}% vs asking
            </span>
          )}
        </div>

        {/* 2 — what the owner has had */}
        <div className="rounded-xl border border-hairline p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Paid to the landowner</p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-ink">{formatBdt(ownerPaid)}</p>
          <p className="text-xs text-ink-muted">
            {agreed ? `of ${formatBdt(agreed)} agreed` : 'nothing agreed to measure against yet'}
          </p>
          {agreed ? (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn('h-full rounded-full', ownerPct >= 100 ? 'bg-emerald-500' : 'bg-admin-500')}
                  style={{ width: `${ownerPct}%` }}
                />
              </div>
              <p className="mt-1.5 flex justify-between text-xs">
                <span className={ownerOwed ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>
                  {ownerOwed ? `${formatBdt(ownerOwed)} still owed` : 'Paid in full'}
                </span>
                <span className="tabular-nums text-ink-muted">{ownerPaid > 0 && ownerPct === 0 ? '<1' : ownerPct}%</span>
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* 3 — the land altogether */}
      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Whole land cost <span className="font-normal normal-case tracking-normal">— price, fees and development</span>
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Figure label="Budget" value={total.budget} />
          <Figure label="Deal" value={total.deal} />
          <Figure label="Paid" value={total.paid} />
          <Figure label="Pending" value={total.pending} warn={total.pending > 0} />
        </dl>
      </div>
    </Card>
  );
}

function Figure({ label, value, warn }: { label: string; value: number | null; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={cn('text-sm font-semibold tabular-nums', warn ? 'text-amber-700' : value ? 'text-ink' : 'text-slate-300')}>
        {value ? formatBdt(value) : '—'}
      </dd>
    </div>
  );
}
