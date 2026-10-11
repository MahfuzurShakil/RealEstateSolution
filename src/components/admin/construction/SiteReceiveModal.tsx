'use client';

import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { outstanding } from '@/lib/domain/procurement';
import type { IncomingDelivery } from '@/lib/repositories';
import { goodsReceiptRepository, stockTransferRepository } from '@/lib/repositories';
import { todayLocal } from '@/lib/utils/format';

/**
 * Receive a delivery (Phase 2 step 4) — at a site, or at the main store.
 *
 * Quantities only, no money: the storekeeper counts what came off the lorry
 * against the challan, accepts what is good and turns back what is not.
 * Rejected material never enters stock and can never be billed. A part
 * delivery leaves the rest outstanding on the order.
 */
export function SiteReceiveModal({
  delivery,
  atLabel,
  onClose,
}: {
  delivery: IncomingDelivery | null;
  /** where it is being received — "the site", "the main store" */
  atLabel: string;
  onClose: () => void;
}) {
  if (!delivery) return null;
  return delivery.kind === 'order' ? (
    <OrderReceive delivery={delivery} atLabel={atLabel} onClose={onClose} />
  ) : (
    <DispatchReceive delivery={delivery} atLabel={atLabel} onClose={onClose} />
  );
}

function Header({ delivery }: { delivery: IncomingDelivery }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
      <span>From {delivery.from_label}</span>
      {delivery.request_code ? (
        <Badge tone="blue">For {delivery.request_code}</Badge>
      ) : (
        <Badge tone="amber">Sent ahead, no request</Badge>
      )}
    </div>
  );
}

function OrderReceive({
  delivery,
  atLabel,
  onClose,
}: {
  delivery: IncomingDelivery;
  atLabel: string;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const order = delivery.order!;
  const pending = order.items.filter((i) => outstanding(i) > 0);
  const [date, setDate] = useState(todayLocal());
  const [challan, setChallan] = useState('');
  const [notes, setNotes] = useState('');
  const [accepted, setAccepted] = useState<Record<string, string>>(
    Object.fromEntries(pending.map((i) => [i.id, String(outstanding(i))])),
  );
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const lines = pending.flatMap((i) => {
      const ok = Number(accepted[i.id]) || 0;
      const bad = Number(rejected[i.id]) || 0;
      return [
        ...(ok > 0 ? [{ po_item_id: i.id, quantity_received: ok, quality_check: 'passed' as const }] : []),
        ...(bad > 0 ? [{ po_item_id: i.id, quantity_received: bad, quality_check: 'failed' as const }] : []),
      ];
    });
    if (lines.length === 0) {
      setError('Enter what arrived on at least one line.');
      return;
    }
    const over = pending.find((i) => (Number(accepted[i.id]) || 0) > outstanding(i) + 0.0005);
    if (over) {
      setError(`${over.item_name}: only ${outstanding(over)} ${over.unit} is still to come on this order.`);
      return;
    }
    const short = pending.some((i) => (Number(accepted[i.id]) || 0) < outstanding(i) - 0.0005);
    if (Object.values(rejected).some((v) => Number(v) > 0) && !notes.trim()) {
      setError('Say why material was turned back.');
      return;
    }
    setBusy(true);
    try {
      await goodsReceiptRepository.createReceipt(
        {
          po_id: order.id,
          receipt_date: date,
          received_by: userId,
          challan_no: challan.trim() || null,
          notes: [notes.trim(), short ? 'Part delivery — the rest is still to come.' : '']
            .filter(Boolean)
            .join(' ') || null,
          items: lines,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The receipt could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={`Receive ${delivery.code}`}
      subtitle={`Counting it in at ${atLabel}`}
      icon={PackageCheck}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Receive'}
          </Button>
        </>
      }
    >
      <Header delivery={delivery} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Received on" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Challan no." hint="The supplier's delivery note">
          <TextInput value={challan} onChange={(e) => setChallan(e.target.value)} placeholder="e.g. CH-48211" />
        </Field>
      </div>

      <div className="mt-4 space-y-3">
        {pending.map((item) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-xl border border-hairline bg-white p-3 sm:grid-cols-[1fr_120px_120px] sm:items-end"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{item.item_name}</p>
              <p className="text-xs text-ink-muted">
                {outstanding(item)} {item.unit} still to come of {item.quantity_ordered}
              </p>
            </div>
            <Field label={`Accepted (${item.unit})`}>
              <TextInput
                type="number"
                min={0}
                step="any"
                value={accepted[item.id] ?? ''}
                onChange={(e) => setAccepted((a) => ({ ...a, [item.id]: e.target.value }))}
              />
            </Field>
            <Field label="Turned back">
              <TextInput
                type="number"
                min={0}
                step="any"
                value={rejected[item.id] ?? ''}
                placeholder="0"
                onChange={(e) => setRejected((r) => ({ ...r, [item.id]: e.target.value }))}
              />
            </Field>
          </div>
        ))}
      </div>

      <Field label="Note" className="mt-4">
        <TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Vehicle, short count, why anything was turned back"
        />
      </Field>
      <p className="mt-3 text-xs text-ink-muted">
        Accept less than the full quantity and the rest stays on the order to come later. Material
        turned back never enters stock, and the supplier cannot bill for it.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}

function DispatchReceive({
  delivery,
  atLabel,
  onClose,
}: {
  delivery: IncomingDelivery;
  atLabel: string;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const t = delivery.transfer!;
  const [date, setDate] = useState(todayLocal());
  const [got, setGot] = useState(String(t.quantity));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const short = (Number(got) || 0) < t.quantity - 0.0005;

  async function save() {
    setBusy(true);
    try {
      await stockTransferRepository.receive(t.id, {
        quantity_received: Number(got) || 0,
        received_date: date,
        received_by: userId,
        note: note.trim() || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not be received.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={`Receive ${delivery.code}`}
      subtitle={`Counting it in at ${atLabel}`}
      icon={PackageCheck}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} viewSafe disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Receive'}
          </Button>
        </>
      }
    >
      <Header delivery={delivery} />
      <p className="mb-4 text-sm text-ink">
        {t.quantity} {t.unit} of <span className="font-medium">{t.item_name}</span> sent on the{' '}
        {t.transfer_date}.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Arrived (${t.unit})`} required>
          <TextInput type="number" min={0} step="any" value={got} onChange={(e) => setGot(e.target.value)} />
        </Field>
        <Field label="Received on" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label={short ? 'What happened to the rest? (required)' : 'Note'} className="mt-4">
        <TextArea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={short ? 'Short by the driver’s count, damaged on the way…' : 'Optional'}
        />
      </Field>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
