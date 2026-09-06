'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Truck } from 'lucide-react';
import { SupplierVoucherModal } from '@/components/admin/procurement/SupplierVoucherModal';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { paymentSummary } from '@/lib/domain/procurement';
import { purchaseOrderRepository } from '@/lib/repositories';
import { formatBdt, formatDate } from '@/lib/utils/format';

/**
 * Paying a supplier from the Finance screen.
 *
 * A supplier payment is a `supplier_voucher`, not an `expense`, and that stays
 * true here — the cash position adds receipts and subtracts expenses, vouchers
 * and refunds as *disjoint* record sets, so a payment that could be entered as
 * either would be countable twice and no arithmetic could tell the duplicate
 * from two genuine payments of the same amount.
 *
 * What was wrong was not the schema but the map: the only way to pay a supplier
 * was to know it lived under Procurement, find the order and pay it from there.
 * Accounts thinks "I am paying BSRM", not "I am editing purchase order 14".
 *
 * So this is a way in, not a second way to record. It finds the order and hands
 * it to the same dialog the Procurement module uses, which writes the same
 * voucher.
 */
export function PaySupplierModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [orderId, setOrderId] = useState<string | null>(null);

  const orders = useLiveQuery(() => purchaseOrderRepository.list(), []);

  /*
   * Orders that owe money, most owed first.
   *
   * A cancelled order is excluded because its undelivered balance is void —
   * paying against one is the advance-recovery case, which needs a debit note
   * rather than another voucher. A draft is excluded because it has not been
   * placed: paying for an order the supplier has never been sent is not a
   * payment, it is a mistake.
   */
  const payable = (orders ?? [])
    .filter((o) => o.status !== 'cancelled' && o.status !== 'draft')
    .map((o) => ({ order: o, summary: paymentSummary(o.totals.value, o.vouchers) }))
    .filter((r) => r.summary.due > 0.009)
    .sort((a, b) => b.summary.due - a.summary.due);

  const options: ComboboxOption[] = payable.map(({ order, summary }) => ({
    id: order.id,
    label: `${order.supplier?.name ?? 'Supplier removed'} — ${formatBdt(summary.due)} due`,
    hint: `${order.code} · ${order.project?.name ?? 'Central stock'} · ordered ${formatDate(order.order_date)}`,
    // the buyer knows the order code or the project, not the supplier alone
    keywords: `${order.code} ${order.project?.name ?? 'central'} ${order.request?.code ?? ''}`,
  }));

  const picked = payable.find((r) => r.order.id === orderId) ?? null;

  function close() {
    setOrderId(null);
    onClose();
  }

  if (!open) return null;

  // once an order is chosen the Procurement dialog takes over completely, so
  // this one gets out of the way rather than stacking behind it
  if (picked) {
    return (
      <SupplierVoucherModal
        open
        order={picked.order}
        onClose={() => setOrderId(null)}
        onSaved={close}
      />
    );
  }

  return (
    <Modal
      open
      onClose={close}
      title="Pay a supplier"
      subtitle="Against a purchase order that still owes money"
      icon={Truck}
      footer={
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
      }
    >
      {orders === undefined ? (
        <p className="text-sm text-ink-muted">Loading orders…</p>
      ) : payable.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Every placed purchase order is paid in full. A payment has to sit against an order —
          that is what ties it to a project and to the material it bought.
        </p>
      ) : (
        <>
          <Field
            label="Purchase order"
            required
            hint="Search by supplier, order code or project"
          >
            <Combobox
              value={orderId}
              options={options}
              onChange={setOrderId}
              placeholder="Type a supplier or order code…"
              emptyLabel="No unpaid order matches"
            />
          </Field>
          <p className="mt-3 text-xs text-ink-muted">
            {payable.length} order{payable.length === 1 ? '' : 's'} still owing{' '}
            {formatBdt(payable.reduce((sum, r) => sum + r.summary.due, 0))} in total. The payment is
            recorded as a supplier voucher, which is where Procurement and the cash position both
            read it from.
          </p>
        </>
      )}
    </Modal>
  );
}
