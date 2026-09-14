'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Pencil, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, MoneyInput, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { AcquisitionCostHead, Land } from '@/lib/db/types';
import { ACQUISITION_COST_HEAD_LABEL } from '@/lib/db/types';
import { landAcquisitionCostRepository } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

/**
 * What the land actually costs to acquire (BRD ACQ-002).
 *
 * The BRD asks for the total, not just the land price: registration, stamp
 * duty, legal, mutation, broker commission and the rest. Only the *estimate*
 * lives on this screen. The actual is read from the expense ledger, because
 * the money was already recorded when it was paid — storing it twice would
 * give the question "what did this land cost" two answers that disagree the
 * first time somebody edits an expense.
 */
export function AcquisitionCostPanel({ land }: { land: Land }) {
  const { userId } = useMockSession();
  const [editing, setEditing] = useState<AcquisitionCostHead | null>(null);

  const sheet = useLiveQuery(() => landAcquisitionCostRepository.sheetForLand(land.id), [land.id]);

  if (!sheet) return <p className="text-sm text-ink-muted">Loading…</p>;

  const current = sheet.lines.find((l) => l.cost_head === editing);
  /* Rows with nothing in them at all are hidden behind a toggle rather than
     padding the table with nine zeroes on a land nobody has estimated yet. */
  const used = sheet.lines.filter((l) => l.estimated > 0 || l.actual > 0);
  const rows = used.length > 0 ? sheet.lines : sheet.lines.slice(0, 3);

  return (
    <>
      <p className="mb-4 text-sm text-ink-muted">
        The estimate is set here. Actuals come from the cost ledger — nothing on this screen is
        typed twice.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-hairline px-3 pb-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                Cost head
              </th>
              <th className="border-b border-hairline px-3 pb-2 text-right text-xs font-medium uppercase tracking-wide text-ink-muted">
                Estimated
              </th>
              <th className="border-b border-hairline px-3 pb-2 text-right text-xs font-medium uppercase tracking-wide text-ink-muted">
                Actual
              </th>
              <th className="border-b border-hairline px-3 pb-2 text-right text-xs font-medium uppercase tracking-wide text-ink-muted">
                Variance
              </th>
              <th className="border-b border-hairline px-3 pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((line) => (
              <tr key={line.cost_head}>
                <td className="border-b border-hairline px-3 py-2.5">
                  <span className="text-ink">{ACQUISITION_COST_HEAD_LABEL[line.cost_head]}</span>
                  {line.remarks && (
                    <span className="mt-0.5 block text-xs text-ink-muted">{line.remarks}</span>
                  )}
                </td>
                <td className="border-b border-hairline px-3 py-2.5 text-right tabular-nums text-ink">
                  {line.estimated > 0 ? formatBdt(line.estimated) : '—'}
                </td>
                <td className="border-b border-hairline px-3 py-2.5 text-right tabular-nums text-ink">
                  {line.actual > 0 ? formatBdt(line.actual) : '—'}
                </td>
                <td
                  className={
                    line.variance == null || line.variance === 0
                      ? 'border-b border-hairline px-3 py-2.5 text-right tabular-nums text-ink-muted'
                      : line.variance > 0
                        ? 'border-b border-hairline px-3 py-2.5 text-right font-medium tabular-nums text-red-700'
                        : 'border-b border-hairline px-3 py-2.5 text-right font-medium tabular-nums text-emerald-700'
                  }
                >
                  {line.variance == null || line.variance === 0
                    ? '—'
                    : `${line.variance > 0 ? '+' : '−'}${formatBdt(Math.abs(line.variance))}`}
                </td>
                <td className="border-b border-hairline px-3 py-2.5 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${ACQUISITION_COST_HEAD_LABEL[line.cost_head]}`}
                    onClick={() => setEditing(line.cost_head)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 pt-3 text-sm font-semibold text-ink">Total acquisition cost</td>
              <td className="px-3 pt-3 text-right text-sm font-semibold tabular-nums text-ink">
                {formatBdt(sheet.estimatedTotal)}
              </td>
              <td className="px-3 pt-3 text-right text-sm font-semibold tabular-nums text-ink">
                {formatBdt(sheet.actualTotal)}
              </td>
              {/* same rule as the rows: no spend, no variance */}
              <td
                className={
                  sheet.actualTotal === 0
                    ? 'px-3 pt-3 text-right text-sm font-semibold tabular-nums text-ink-muted'
                    : sheet.actualTotal - sheet.estimatedTotal > 0
                      ? 'px-3 pt-3 text-right text-sm font-semibold tabular-nums text-red-700'
                      : 'px-3 pt-3 text-right text-sm font-semibold tabular-nums text-emerald-700'
                }
              >
                {sheet.actualTotal === 0
                  ? 'nothing paid yet'
                  : `${sheet.actualTotal - sheet.estimatedTotal > 0 ? '+' : '−'}${formatBdt(Math.abs(sheet.actualTotal - sheet.estimatedTotal))}`}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/*
        Fees in the ledger that no head can claim yet. Said out loud rather
        than folded into one line, because a total that quietly absorbs money
        it cannot explain is worse than one that admits it.
      */}
      {sheet.unclassifiedActual > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-hairline bg-slate-50 px-3 py-2.5 text-xs text-ink-muted">
          <Receipt className="mt-0.5 size-4 shrink-0 text-admin-600" />
          <span>
            <strong className="text-ink">{formatBdt(sheet.unclassifiedActual)}</strong> of land
            extra costs is in the total but not on a line above — the cost ledger records those as
            one category, so they cannot be split across registration, legal and the rest yet.{' '}
            <Link href="/admin/expenses" className="text-admin-700 underline">
              Open the cost ledger
            </Link>
          </span>
        </p>
      )}

      {editing && current && (
        <EstimateDialog
          land={land}
          head={editing}
          estimated={current.estimated}
          remarks={current.remarks}
          userId={userId}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EstimateDialog({
  land,
  head,
  estimated,
  remarks,
  userId,
  onClose,
}: {
  land: Land;
  head: AcquisitionCostHead;
  estimated: number;
  remarks: string | null;
  userId: string | null;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(estimated > 0 ? String(estimated) : '');
  const [note, setNote] = useState(remarks ?? '');
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      title={ACQUISITION_COST_HEAD_LABEL[head]}
      subtitle={`Estimated cost · ${land.code}`}
      icon={Calculator}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setSaving(true);
              try {
                await landAcquisitionCostRepository.setEstimate(
                  land.id,
                  head,
                  Number(amount) || 0,
                  note.trim() || null,
                  userId,
                );
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save estimate'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Estimated amount">
          <MoneyInput
            value={amount}
            placeholder="e.g. 1200000"
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Note" hint="How the figure was arrived at">
          <TextArea
            value={note}
            placeholder="e.g. 1.5% of deed value per the 2024 schedule"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
