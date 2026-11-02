'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Banknote, Check, Eye, Landmark, Undo2 } from 'lucide-react';
import { AccountPicker } from '@/components/admin/finance/AccountPicker';
import { FileViewer } from '@/components/admin/documents/DocumentParts';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextArea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import type { PaymentSubmissionStatus } from '@/lib/db/types';
import { allocateSharePayment, installmentLabel } from '@/lib/domain/share-sale';
import { OFFLINE_METHOD_LABEL, customerUploadRepository, paymentSubmissionInbox, paymentSubmissionRepository, shareSaleRepository, type SubmissionRow } from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone } from '@/lib/utils/format';
import { ErrorNote, useAction } from './ShareSaleModals';

const STATUS: Record<PaymentSubmissionStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: 'To verify', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  rejected: { label: 'Sent back', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

/**
 * Accounts checks a payment against the bank statement, then records it
 * (SHARE-SALE-FEEDBACK-PLAN.md C2). It is recorded on the customer's deposit
 * date, so a slow check never costs them a late fee.
 */
function ConfirmModal({ row, onClose }: { row: SubmissionRow; onClose: () => void }) {
  const { userId } = useMockSession();
  const s = row.submission;
  const [account, setAccount] = useState(s.paid_into_account_id ?? '');
  const { error, busy, run } = useAction();
  // how it lands on the schedule, as of the deposit date (share purchases)
  const preview = useLiveQuery(async () => {
    if (!s.sale_id) return null;
    const view = await shareSaleRepository.view(s.sale_id, s.paid_on);
    if (!view) return null;
    return allocateSharePayment(view, s.amount).map((a) => ({ ...a, label: installmentLabel(view.schedule.find((i) => i.id === a.installment_id)?.seq ?? 0) }));
  }, [s.sale_id, s.paid_on, s.amount]);
  return (
    <Modal
      open
      title={`Confirm ${formatBdt(s.amount)} from ${row.customer?.name ?? 'the customer'}`}
      subtitle={`${s.code} · ${OFFLINE_METHOD_LABEL[s.method]} on ${formatDate(s.paid_on)} · slip ${s.reference}`}
      icon={Check}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !account} onClick={() => run(() => paymentSubmissionRepository.confirm(s.id, { account_id: account }, userId), onClose)}>
            <Check className="size-4" /> {busy ? 'Recording…' : 'Confirm and record'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {row.duplicates.length > 0 && (
          <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Check this is not the same money twice: {row.duplicates.join('; ')}.
            </span>
          </p>
        )}
        <AccountPicker label="Arrived in" value={account} onChange={setAccount} />
        <p className="text-ink-muted">
          Recorded on <span className="font-medium text-ink">{formatDate(s.paid_on)}</span>, the date on the slip — late fees are worked out to that day, not today. The receipt is issued and the customer is told.
        </p>
        {preview && preview.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-ink">How it is applied</p>
            <ul className="divide-y divide-hairline rounded-xl border border-hairline">
              {preview.map((a) => (
                <li key={a.installment_id} className="flex justify-between gap-3 px-3 py-2">
                  <span>{a.label}</span>
                  <span className="tabular-nums">
                    {formatBdt(a.principal)}
                    {a.late_fee ? ` + ${formatBdt(a.late_fee)} late fee` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

function SendBackModal({ row, onClose }: { row: SubmissionRow; onClose: () => void }) {
  const { userId } = useMockSession();
  const [note, setNote] = useState('');
  const { error, busy, run } = useAction();
  return (
    <Modal
      open
      title="Send this payment back"
      subtitle={`${row.submission.code} · ${formatBdt(row.submission.amount)} · ${row.customer?.name ?? ''}`}
      icon={Undo2}
      tone="danger"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy || !note.trim()} onClick={() => run(() => paymentSubmissionRepository.reject(row.submission.id, note, userId), onClose)}>
            Send back
          </Button>
        </>
      }
    >
      <Field label="What is wrong" required hint="The customer sees this and can send the payment again">
        <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No deposit of this amount reached our account on that date; the slip is unreadable" />
      </Field>
      <ErrorNote error={error} />
    </Modal>
  );
}

/** Customer Requests → Payments to verify: bank payments customers reported from the portal. */
export function PaymentVerifyPanel({ showAll, mayConfirm }: { showAll: boolean; mayConfirm: boolean }) {
  const rows = useLiveQuery(() => paymentSubmissionInbox(), []);
  const [confirming, setConfirming] = useState<SubmissionRow | null>(null);
  const [sending, setSending] = useState<SubmissionRow | null>(null);
  const [viewing, setViewing] = useState<SubmissionRow | null>(null);
  if (!rows) return <p className="text-sm text-ink-muted">Loading…</p>;
  const shown = showAll ? rows : rows.filter((r) => r.submission.status === 'submitted');
  if (!shown.length)
    return (
      <EmptyState
        icon={Landmark}
        title="No payments to verify"
        description="When a customer pays at the bank and sends the slip from the Customer Portal, it waits here until Accounts finds the money in the bank."
      />
    );
  const slipFile = (r: SubmissionRow) => ({
    id: r.slip?.id ?? r.submission.id,
    name: r.slip?.file_name ?? 'Slip',
    mime: r.slip?.file_type,
    subtitle: `${r.submission.code} · ${formatBdt(r.submission.amount)} · slip ${r.submission.reference}`,
    load: () => (r.slip ? customerUploadRepository.file(r.slip.id) : Promise.resolve(null)),
  });

  return (
    <>
      <ul className="space-y-3">
        {shown.map((r) => {
          const s = r.submission;
          return (
            <li key={s.id} className="rounded-xl border border-hairline bg-white p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-50 text-admin-600">
                  <Banknote className="size-5" />
                </span>
                <div className="min-w-[14rem] flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {formatBdt(s.amount)} · {r.customer?.name ?? '—'}
                    <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {s.code} · for {s.holding_code} · {r.customer ? formatPhone(r.customer.phone) : ''}
                  </p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="text-ink-muted">Paid by</dt>
                      <dd className="font-medium text-ink">{OFFLINE_METHOD_LABEL[s.method]}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Date on the slip</dt>
                      <dd className="font-medium text-ink">{formatDate(s.paid_on)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Paid into</dt>
                      <dd className="font-medium text-ink">{r.account ? `${r.account.name}${r.account.account_number ? ` · ${r.account.account_number}` : ''}` : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Slip / transaction no.</dt>
                      <dd className="font-medium text-ink">{s.reference}</dd>
                    </div>
                  </dl>
                  {s.note && <p className="mt-2 text-xs text-ink">Customer’s note: {s.note}</p>}
                  {s.status === 'submitted' && r.duplicates.length > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <AlertTriangle className="size-3.5" /> {r.duplicates.join('; ')}
                    </p>
                  )}
                  {s.status === 'rejected' && s.review_note && <p className="mt-2 text-xs text-red-700">Sent back: {s.review_note}</p>}
                  {s.status === 'confirmed' && <p className="mt-2 text-xs text-emerald-700">Recorded{s.receipt_no ? ` as ${s.receipt_no}` : ''} on {formatDate(s.paid_on)}.</p>}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setViewing(r)} disabled={!r.slip}>
                    <Eye className="size-4" /> View slip
                  </Button>
                  {mayConfirm && s.status === 'submitted' && (
                    <>
                      <Button variant="dangerGhost" size="sm" onClick={() => setSending(r)}>
                        Send back
                      </Button>
                      <Button size="sm" onClick={() => setConfirming(r)}>
                        <Check className="size-4" /> Confirm
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {confirming && <ConfirmModal row={confirming} onClose={() => setConfirming(null)} />}
      {sending && <SendBackModal row={sending} onClose={() => setSending(null)} />}
      {viewing && <FileViewer file={slipFile(viewing)} files={[slipFile(viewing)]} onSelect={() => undefined} onClose={() => setViewing(null)} />}
    </>
  );
}
