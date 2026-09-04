'use client';

import { db } from '../db/database';
import type { CompanySettings, Payment, PurchaseOrderItem } from '../db/types';
import { bookingRepository, type BookingWithRelations } from './booking.repository';
import {
  purchaseOrderItemRepository,
  supplierVoucherRepository,
  type SupplierVoucherWithRelations,
} from './procurement.repository';
import { companySettingsRepository } from './settings.repository';

/**
 * Read-only joins for the printed documents (Tier 3.6).
 *
 * Every document is a snapshot of things that already exist — no new table, no
 * new column. It lives in its own repository rather than on top of the three
 * it borrows from, because a document has one shape and one rule: it reads,
 * and it never writes.
 *
 * The company block is fetched here rather than by the page, so a receipt
 * cannot be rendered with the letterhead missing.
 */

export interface ReceiptPrintData {
  company: CompanySettings | undefined;
  payment: Payment;
  booking: BookingWithRelations;
  received_by_name: string | null;
  /** Money received against this booking including this payment. */
  paid_to_date: number;
  /** `final_price − paid_to_date`, the balance the buyer still owes. */
  balance: number;
}

export interface BookingFormPrintData {
  company: CompanySettings | undefined;
  booking: BookingWithRelations;
  /** Land-owner-share units are sold on the owner's behalf — the form says so. */
  allocated_owner_name: string | null;
}

export interface VoucherPrintData {
  company: CompanySettings | undefined;
  voucher: SupplierVoucherWithRelations;
  items: PurchaseOrderItem[];
  /** Everything paid against the same purchase order, this voucher included. */
  paid_against_order: number;
}

class PrintRepository {
  async getReceipt(paymentId: string): Promise<ReceiptPrintData | null> {
    const payment = await db.payments.get(paymentId);
    if (!payment) return null;

    const booking = await bookingRepository.getWithRelations(payment.booking_id);
    if (!booking) return null;

    // `amount_received` on the booking is the running total and already
    // includes this payment — a receipt shows the position *after* the money
    // was taken, which is what the buyer is holding in their hand.
    const paid_to_date = booking.amount_received;

    return {
      company: await companySettingsRepository.get(),
      payment,
      booking,
      received_by_name: payment.received_by
        ? ((await db.users.get(payment.received_by))?.name ?? null)
        : null,
      paid_to_date,
      balance: (Number(booking.final_price) || 0) - paid_to_date,
    };
  }

  async getBookingForm(bookingId: string): Promise<BookingFormPrintData | null> {
    const booking = await bookingRepository.getWithRelations(bookingId);
    if (!booking) return null;

    const ownerId = booking.unit?.allocated_to_owner_id;
    return {
      company: await companySettingsRepository.get(),
      booking,
      allocated_owner_name: ownerId ? ((await db.landowners.get(ownerId))?.name ?? null) : null,
    };
  }

  async getVoucher(voucherId: string): Promise<VoucherPrintData | null> {
    const voucher = await supplierVoucherRepository.getWithRelations(voucherId);
    if (!voucher) return null;

    const paid = await db.supplier_vouchers.where('po_id').equals(voucher.po_id).toArray();

    return {
      company: await companySettingsRepository.get(),
      voucher,
      items: await purchaseOrderItemRepository.listForOrder(voucher.po_id),
      paid_against_order: paid.reduce((sum, v) => sum + (Number(v.amount) || 0), 0),
    };
  }
}

export const printRepository = new PrintRepository();
