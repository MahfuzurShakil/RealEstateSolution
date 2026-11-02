import { db } from '../db/database';
import type { BankAccount, Customer, CustomerUpload, OfflinePaymentMethod, PaymentMethod, PaymentSubmission, SharePaymentMethod } from '../db/types';
import { nowIso } from '../utils/id';
import { todayLocal } from '../utils/format';
import { bookingRepository } from './booking.repository';
import { homeReceiptNo } from './investor/investor.repository';
import { shareSaleRepository } from './share-sale.repository';

/*
 * SHARE-SALE-FEEDBACK-PLAN.md C2 — payments a customer made at the bank and
 * reported from the Customer Portal with the slip. Accounts checks each one
 * against the bank statement: confirming records the real payment on the
 * deposit date (so a slow check never costs the customer a late fee) and
 * issues the receipt; sending it back tells the customer why.
 */

export const OFFLINE_METHOD_LABEL: Record<OfflinePaymentMethod, string> = {
  bank_deposit: 'Bank deposit',
  bank_transfer: 'Bank transfer',
  cheque_deposit: 'Cheque deposit',
  pay_order: 'Pay order / DD',
};

const TO_SHARE_METHOD: Record<OfflinePaymentMethod, SharePaymentMethod> = {
  bank_deposit: 'bank_transfer',
  bank_transfer: 'bank_transfer',
  cheque_deposit: 'cheque',
  pay_order: 'bank_transfer',
};
const TO_BOOKING_METHOD: Record<OfflinePaymentMethod, PaymentMethod> = {
  bank_deposit: 'bank',
  bank_transfer: 'bank',
  cheque_deposit: 'cheque',
  pay_order: 'bank',
};

export interface SubmissionRow {
  submission: PaymentSubmission;
  customer?: Customer;
  account?: BankAccount;
  slip?: CustomerUpload;
  /** why this may be the same money twice; empty when nothing matches */
  duplicates: string[];
}

const sameRef = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Every reported payment, the ones to check first, each with what might make it a duplicate. */
export async function paymentSubmissionInbox(): Promise<SubmissionRow[]> {
  const [rows, customers, accounts, sharePays, bookingPays] = await Promise.all([
    db.payment_submissions.toArray(),
    db.customers.toArray(),
    db.bank_accounts.toArray(),
    db.share_payments.toArray(),
    db.payments.toArray(),
  ]);
  const slips = await db.customer_uploads.bulkGet(rows.map((r) => r.slip_upload_id ?? ''));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  return rows
    .filter((r) => r.status !== 'withdrawn')
    .map((r, i) => {
      const duplicates: string[] = [];
      if (r.status === 'submitted') {
        const others = rows.filter((o) => o.id !== r.id && o.status !== 'withdrawn' && o.status !== 'rejected');
        const byRef = others.find((o) => sameRef(o.reference, r.reference));
        if (byRef) duplicates.push(`Same reference as ${byRef.code}`);
        const byAmount = others.find((o) => o.amount === r.amount && o.paid_on === r.paid_on && o.paid_into_account_id === r.paid_into_account_id);
        if (byAmount && byAmount !== byRef) duplicates.push(`Same amount, date and account as ${byAmount.code}`);
        const paid = sharePays.find((p) => sameRef(p.reference, r.reference)) ?? bookingPays.find((p) => sameRef(p.reference_no, r.reference));
        if (paid) duplicates.push(`A payment with this reference is already recorded`);
      }
      return { submission: r, customer: customerById.get(r.customer_id), account: r.paid_into_account_id ? accountById.get(r.paid_into_account_id) : undefined, slip: slips[i] ?? undefined, duplicates };
    })
    .sort((a, b) => Number(b.submission.status === 'submitted') - Number(a.submission.status === 'submitted') || b.submission.created_at.localeCompare(a.submission.created_at));
}

export const paymentSubmissionRepository = {
  /**
   * Accounts saw the money in the bank: the payment is recorded on the
   * deposit date, into the account it landed in, and the receipt issued.
   */
  async confirm(id: string, input: { account_id: string | null }, userId: string | null): Promise<PaymentSubmission> {
    const r = await db.payment_submissions.get(id);
    if (!r || r.status !== 'submitted') throw new Error('This payment has already been checked.');
    if (!input.account_id) throw new Error('Choose the account the money arrived in.');
    const notes = `${OFFLINE_METHOD_LABEL[r.method]} reported on the Customer Portal (${r.code}), checked against the bank`;
    let paymentId: string | null = null;
    let receiptNo: string | null = null;
    if (r.sale_id) {
      const p = await shareSaleRepository.recordPayment(
        { sale_id: r.sale_id, paid_on: r.paid_on, amount: r.amount, method: TO_SHARE_METHOD[r.method], reference: r.reference, notes, channel: 'office', method_detail: OFFLINE_METHOD_LABEL[r.method], account_id: input.account_id },
        userId,
      );
      paymentId = p.id;
      receiptNo = p.code;
    } else if (r.booking_id) {
      const before = new Set((await db.payments.where('booking_id').equals(r.booking_id).toArray()).map((p) => p.id));
      await bookingRepository.recordPayment(r.booking_id, {
        amount: r.amount,
        payment_date: r.paid_on,
        payment_method: TO_BOOKING_METHOD[r.method],
        reference_no: r.reference,
        notes,
        received_by: userId,
        account_id: input.account_id,
        channel: 'office',
        method_detail: OFFLINE_METHOD_LABEL[r.method],
      });
      const added = (await db.payments.where('booking_id').equals(r.booking_id).toArray()).find((p) => !before.has(p.id));
      paymentId = added?.id ?? null;
      receiptNo = added ? homeReceiptNo(added) : null;
    } else {
      throw new Error('This payment is not linked to a purchase or booking.');
    }
    const ts = nowIso();
    await db.payment_submissions.update(id, { status: 'confirmed', reviewed_by: userId, reviewed_at: ts, review_note: null, payment_id: paymentId, receipt_no: receiptNo, paid_into_account_id: input.account_id, updated_at: ts });
    if (r.slip_upload_id) await db.customer_uploads.update(r.slip_upload_id, { status: 'accepted', reviewed_on: todayLocal(), review_note: null, updated_at: ts });
    return (await db.payment_submissions.get(id))!;
  },

  /** The money is not in the bank, or the slip does not match: the customer is told why and can send it again. */
  async reject(id: string, note: string, userId: string | null): Promise<void> {
    const r = await db.payment_submissions.get(id);
    if (!r || r.status !== 'submitted') throw new Error('This payment has already been checked.');
    if (!note.trim()) throw new Error('Say what is wrong, so the customer can put it right.');
    const ts = nowIso();
    await db.payment_submissions.update(id, { status: 'rejected', reviewed_by: userId, reviewed_at: ts, review_note: note.trim(), updated_at: ts });
    if (r.slip_upload_id) await db.customer_uploads.update(r.slip_upload_id, { status: 'rejected', reviewed_on: todayLocal(), review_note: note.trim(), updated_at: ts });
  },

  async waitingCount(): Promise<number> {
    return db.payment_submissions.where('status').equals('submitted').count();
  },
};
