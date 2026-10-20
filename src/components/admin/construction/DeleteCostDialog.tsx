'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { directPurchaseRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

export interface DeletableCost {
  id: string;
  code: string;
  description: string;
  vendor_name: string;
  amount: number;
  purchase_date: string;
  attachment_count?: number;
}

/**
 * Confirm deleting a recorded cost (client, 2026-10-21 — it used the
 * browser's own confirm box). Only an unpaid cost can go; the repository
 * refuses one with money paid against it, and the reason is shown here.
 */
export function DeleteCostDialog({ cost, onClose }: { cost: DeletableCost | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <ConfirmDialog
      open={cost !== null}
      tone="danger"
      icon={Trash2}
      title="Delete this cost"
      subtitle={cost?.code}
      confirmLabel="Delete cost"
      busy={busy}
      message={
        cost
          ? `${cost.description} — ${formatBdt(cost.amount)} from ${cost.vendor_name}, ${formatDate(cost.purchase_date)}. It comes off the recorded spending and out of Bills to Pay${
              cost.attachment_count
                ? cost.attachment_count === 1
                  ? ', and its attachment is deleted with it'
                  : `, and its ${cost.attachment_count} attachments are deleted with it`
                : ''
            }. This cannot be undone.`
          : undefined
      }
      onCancel={() => {
        setError('');
        onClose();
      }}
      onConfirm={async () => {
        if (!cost) return;
        setBusy(true);
        setError('');
        try {
          await directPurchaseRepository.removeCascade(cost.id);
          onClose();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The cost could not be deleted.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
    </ConfirmDialog>
  );
}
