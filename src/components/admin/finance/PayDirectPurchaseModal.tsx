'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useMockSession } from '@/lib/auth/mock-session';
import { SUPPLIER_PAYMENT_METHODS, type SupplierPaymentMethod } from '@/lib/db/types';
import { SUPPLIER_PAYMENT_METHOD_META } from '@/lib/domain/procurement';
import {
  bankAccountRepository,
  directPurchasePaymentRepository,
  projectFundLeft,
  type PendingPurchaseRow,
} from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { formatBdt, formatDate, todayLocal } from '@/lib/utils/format';

/**
 * Pay all or part of a direct purchase (DIRECT-PURCHASE-PLAN.md B4).
 *
 * The balance of every account is shown before one is picked, and the button
 * stays off while the picked account cannot cover the amount — so "can I pay
 * this?" is answered on the screen, not by an error after the click. The
 * same goes for the project's own fund: a bank balance that belongs to
 * another project or the pool cannot pay this project's bill.
 */
export function PayDirectPurchaseModal({
  purchase,
  onClose,
}: {
  purchase: PendingPurchaseRow;
  onClose: () => void;
}) {
  const { userId } = useMockSession();
  const position = useLiveQuery(() => bankAccountRepository.position(), []);
  const fundLeft = useLiveQuery(() => projectFundLeft(purchase.project_id), [purchase.project_id]);
  const accounts = (position?.accounts ?? []).filter((a) => a.is_active);

  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState(String(purchase.due));
  const [method, setMethod] = useState<SupplierPaymentMethod>('cash');
  const [date, setDate] = useState(todayLocal());
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const account = accounts.find((a) => a.id === accountId);
  const value = Number(amount) || 0;
  const short = account ? account.closing_balance + 0.005 < value : false;
  const over = value > purchase.due + 0.005;
  // client, 2026-10-22: the project must have the money, not just the bank
  const projectShort = fundLeft !== undefined && fundLeft + 0.005 < value;

  async function pay() {
    setError('');
    setBusy(true);
    try {
      await directPurchasePaymentRepository.pay(
        {
          purchase_id: purchase.id,
          account_id: accountId,
          amount: value,
          payment_date: date,
          payment_method: method,
          reference_no: reference,
        },
        userId,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The payment could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="md"
      icon={Wallet}
      title={`Pay ${purchase.vendor_name}`}
      subtitle={`${purchase.code} · ${purchase.description}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={pay} disabled={busy || !accountId || short || over || projectShort || !(value > 0)}>
            {busy ? 'Paying…' : `Pay ${formatBdt(value)}`}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-hairline bg-slate-50 p-3 text-sm">
        <div>
          <p className="text-xs text-ink-muted">Cost</p>
          <p className="font-medium text-ink">{formatBdt(purchase.amount)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Paid</p>
          <p className="font-medium text-ink">{formatBdt(purchase.paid_amount)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Owed</p>
          <p className="font-semibold text-ink">{formatBdt(purchase.due)}</p>
        </div>
        <p className="col-span-3 text-xs text-ink-muted">
          {purchase.project_name} · {purchase.tower_name} · {purchase.work_item_name} · bought{' '}
          {formatDate(purchase.purchase_date)}
        </p>
      </div>

      <div
        className={cn(
          'mb-4 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm',
          projectShort ? 'border-red-200 bg-red-50' : 'border-hairline bg-white',
        )}
      >
        <span className={projectShort ? 'text-red-700' : 'text-ink-muted'}>{purchase.project_name}&apos;s fund left</span>
        <span className={cn('font-semibold', projectShort ? 'text-red-700' : 'text-ink')}>
          {fundLeft === undefined ? '…' : formatBdt(fundLeft)}
        </span>
      </div>
      {projectShort && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            This project has only {formatBdt(Math.max(0, fundLeft ?? 0))} of its own money, so it cannot pay{' '}
            {formatBdt(value)}. Pay part now, or first give it money from the company pool.{' '}
            <Link href="/admin/fund" className="font-medium underline">
              Go to Fund &amp; Partners
            </Link>
          </span>
        </div>
      )}

      <p className="mb-1.5 text-sm font-medium text-ink">
        Pay from <span className="text-red-500">*</span>
      </p>
      {accounts.length === 0 ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No account is set up yet. Add one under Finance → Cash Position first.
        </p>
      ) : (
        <div className="mb-4 space-y-1.5">
          {accounts.map((a) => {
            const enough = a.closing_balance + 0.005 >= value;
            return (
              <label
                key={a.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors',
                  accountId === a.id ? 'border-admin-400 bg-admin-50/60' : 'border-hairline hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="pay_account"
                  className="size-4 accent-admin-600"
                  checked={accountId === a.id}
                  onChange={() => setAccountId(a.id)}
                />
                <span className="min-w-0 flex-1 text-sm text-ink">{a.name}</span>
                <span className={cn('text-sm font-medium', enough ? 'text-ink' : 'text-red-600')}>
                  {formatBdt(a.closing_balance)}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {short && account && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {account.name} holds {formatBdt(account.closing_balance)} — not enough for{' '}
          {formatBdt(value)}. Pay part now, or pick another account.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (BDT)" required error={over ? `Only ${formatBdt(purchase.due)} is owed` : undefined}>
          <TextInput
            type="number"
            min={0}
            step="any"
            value={amount}
            invalid={over}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Date" required>
          <TextInput type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Method">
          <SelectInput value={method} onChange={(e) => setMethod(e.target.value as SupplierPaymentMethod)}>
            {SUPPLIER_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {SUPPLIER_PAYMENT_METHOD_META[m]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Reference" hint="Cheque no., bKash TrxID, bank ref…">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
