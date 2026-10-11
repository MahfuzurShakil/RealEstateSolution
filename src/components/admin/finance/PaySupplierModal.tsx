'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Truck } from 'lucide-react';
import { SupplierVoucherModal } from '@/components/admin/procurement/SupplierVoucherModal';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { supplierBillRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Paying a supplier from the Finance screen.
 *
 * A supplier payment is a `supplier_voucher`, not an `expense`, so the cash
 * position never counts it twice. Phase 2 step 4: it is made against an
 * approved bill (the final billable voucher), not against a bare order, so
 * this picks a voucher with a balance and hands it to the payment dialog.
 */
export function PaySupplierModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [billId, setBillId] = useState<string | null>(null);
  const bills = useLiveQuery(() => supplierBillRepository.list({ status: 'payable' }), []);

  const payable = (bills ?? []).filter((b) => b.balance > 0.009).sort((a, b) => b.balance - a.balance);

  const options: ComboboxOption[] = payable.map((bill) => ({
    id: bill.id,
    label: `${bill.supplier?.name ?? 'Supplier removed'} — ${formatBdt(bill.balance)} due`,
    hint: `${bill.code} · bill ${bill.bill_no} · ${bill.project?.name ?? 'Main store'} · ${formatDate(bill.bill_date)}`,
    keywords: `${bill.code} ${bill.bill_no} ${bill.order?.code ?? ''} ${bill.project?.name ?? 'main store'}`,
  }));

  const picked = payable.find((b) => b.id === billId) ?? null;

  function close() {
    setBillId(null);
    onClose();
  }

  if (!open) return null;

  if (picked) {
    return <SupplierVoucherModal open bill={picked} onClose={() => setBillId(null)} onSaved={close} />;
  }

  return (
    <Modal
      open
      onClose={close}
      title="Pay a supplier"
      subtitle="Against an approved bill voucher with a balance"
      icon={Truck}
      footer={
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
      }
    >
      {bills === undefined ? (
        <p className="text-sm text-ink-muted">Loading vouchers…</p>
      ) : payable.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No approved bill is waiting for payment. A supplier is paid against a bill that
          procurement recorded, accounts verified and management approved.
        </p>
      ) : (
        <>
          <Field label="Bill voucher" required hint="Search by supplier, voucher, bill no. or project">
            <Combobox
              value={billId}
              options={options}
              onChange={setBillId}
              placeholder="Type a supplier or voucher code…"
              emptyLabel="No payable voucher matches"
            />
          </Field>
          <p className="mt-3 text-xs text-ink-muted">
            {payable.length} voucher{payable.length === 1 ? '' : 's'} owing{' '}
            {formatBdt(payable.reduce((sum, b) => sum + b.balance, 0))} in total.
          </p>
        </>
      )}
    </Modal>
  );
}
