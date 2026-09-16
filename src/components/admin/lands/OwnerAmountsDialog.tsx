'use client';

import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MoneyInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { splitAmountByShare } from '@/lib/domain/land';
import { landPipelineRepository, type LandWithRelations } from '@/lib/repositories';
import { formatBdt } from '@/lib/utils/format';

/**
 * What each owner was agreed, edited on the Owners tab (BRD LAND-002, ACQ-003).
 *
 * The amounts are filled by share when the price is agreed; this is where a
 * different split — one heir taking less for an earlier advance — is recorded.
 * A total that does not match the land's agreed amount is shown, not refused:
 * the settlement plans are built from these figures, so the gap must be seen.
 */
export function OwnerAmountsDialog({
  land,
  onClose,
}: {
  land: LandWithRelations;
  onClose: () => void;
}) {
  const agreed = Number(land.final_agreed_amount) || 0;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      land.owners.map((o) => [o.id, o.agreed_amount != null ? String(o.agreed_amount) : '']),
    ),
  );
  const [saving, setSaving] = useState(false);

  const total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);
  const off = agreed > 0 && Math.abs(total - agreed) > 0.5;

  function splitByShare() {
    const split = splitAmountByShare(
      agreed,
      land.owners.map((o) => ({ id: o.id, share: o.ownership_share_pct })),
    );
    setValues(Object.fromEntries(Object.entries(split).map(([id, n]) => [id, String(n)])));
  }

  async function save() {
    setSaving(true);
    try {
      await landPipelineRepository.setOwnerAmounts(
        Object.fromEntries(
          Object.entries(values).map(([id, v]) => [id, v.trim() === '' ? null : Number(v)]),
        ),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Agreed amount by owner"
      subtitle={`${land.code} · land agreed at ${formatBdt(agreed)}`}
      icon={Scale}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save amounts'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">Filled by share when the price was agreed.</p>
          <Button size="sm" variant="outline" onClick={splitByShare} disabled={agreed <= 0}>
            Split by share
          </Button>
        </div>
        <ul className="space-y-2">
          {land.owners.map((o) => (
            <li
              key={o.id}
              className="grid items-center gap-3 rounded-xl border border-hairline p-3 sm:grid-cols-[1fr_auto_12rem]"
            >
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {o.owner?.name ?? 'Unknown owner'}
              </span>
              <span className="text-xs tabular-nums text-ink-muted">{o.ownership_share_pct}%</span>
              <MoneyInput
                aria-label={`Agreed amount for ${o.owner?.name ?? 'owner'}`}
                value={values[o.id] ?? ''}
                placeholder="e.g. 20000000"
                onChange={(e) => setValues((v) => ({ ...v, [o.id]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
        <p className={off ? 'text-sm font-medium text-amber-700' : 'text-sm text-ink-muted'}>
          Total {formatBdt(total)} of {formatBdt(agreed)}
          {off && ` — ${formatBdt(Math.abs(total - agreed))} ${total > agreed ? 'over' : 'short'}`}
        </p>
      </div>
    </Modal>
  );
}
