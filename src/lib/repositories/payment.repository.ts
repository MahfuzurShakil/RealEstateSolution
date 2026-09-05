'use client';

import { db } from '../db/database';
import {
  DEFAULT_INSTALLMENT_PLAN,
  type InstallmentPlanTemplate,
  type Payment,
  type PaymentMethod,
} from '../db/types';
import { BaseRepository } from './base.repository';
import { documentRepository } from './document.repository';

export interface PaymentInput {
  booking_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference_no?: string | null;
  received_by?: string | null;
  notes?: string | null;
  /** Tier 3.5: the account this money landed in. */
  account_id?: string | null;
}

/**
 * Money actually received (Section 8.2).
 *
 * Module 4 uses this for the booking money; Module 7 will hang instalments off
 * the same rows by filling `installment_id`. Nothing here computes a schedule —
 * that is Finance's job.
 */
class PaymentRepository extends BaseRepository<Payment> {
  constructor() {
    super(() => db.payments);
  }

  /** Newest first — a receipt list is read from the top. */
  async listForBooking(bookingId: string): Promise<Payment[]> {
    const rows = await db.payments.where('booking_id').equals(bookingId).toArray();
    return rows.sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  }

  async totalForBooking(bookingId: string): Promise<number> {
    const rows = await this.listForBooking(bookingId);
    return rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }

  /** Totals for several bookings at once, for roll-ups on a customer page. */
  async totalsByBooking(): Promise<Record<string, number>> {
    const rows = await db.payments.toArray();
    return rows.reduce<Record<string, number>>((acc, p) => {
      acc[p.booking_id] = (acc[p.booking_id] ?? 0) + (Number(p.amount) || 0);
      return acc;
    }, {});
  }

  async record(input: PaymentInput, createdBy: string | null = null): Promise<Payment> {
    return this.create(
      {
        booking_id: input.booking_id,
        // Module 7 fills this in when it generates the instalment rows
        installment_id: null,
        amount: input.amount,
        payment_date: input.payment_date,
        payment_method: input.payment_method,
        account_id: input.account_id ?? null,
        reference_no: input.reference_no?.trim() || null,
        received_by: input.received_by ?? null,
        notes: input.notes?.trim() || null,
      },
      createdBy,
    );
  }

  async removeCascade(id: string): Promise<void> {
    await documentRepository.removeForEntity('payment', id);
    await this.remove(id);
  }

  async removeForBooking(bookingId: string): Promise<void> {
    const rows = await this.listForBooking(bookingId);
    for (const row of rows) await this.removeCascade(row.id);
  }
}

/**
 * Per-project instalment plan (Section 8.2). Module 4 only reads it — to show
 * the buyer's schedule in words and to default the tenure. Module 7 generates
 * the real instalments from it and gives Accounts a screen to edit it.
 */
class InstallmentPlanTemplateRepository extends BaseRepository<InstallmentPlanTemplate> {
  constructor() {
    super(() => db.installment_plan_templates);
  }

  async listForProject(projectId: string): Promise<InstallmentPlanTemplate[]> {
    const rows = await db.installment_plan_templates
      .where('project_id')
      .equals(projectId)
      .toArray();
    return rows.sort((a, b) => a.sequence_no - b.sequence_no);
  }

  /** Copies the system default onto a project, unless it already has one. */
  async seedForProject(projectId: string, createdBy: string | null = null): Promise<void> {
    if ((await this.listForProject(projectId)).length > 0) return;
    for (const row of DEFAULT_INSTALLMENT_PLAN) {
      await this.create({ ...row, project_id: projectId }, createdBy);
    }
  }

  /** Default tenure for a booking on this project, in months. */
  async tenureMonthsFor(projectId: string): Promise<number | null> {
    const rows = await this.listForProject(projectId);
    const monthly = rows.find((r) => r.schedule_type === 'monthly');
    return monthly?.month_count ?? null;
  }

  async removeForProject(projectId: string): Promise<void> {
    const rows = await this.listForProject(projectId);
    await db.installment_plan_templates.bulkDelete(rows.map((r) => r.id));
  }
}

export const paymentRepository = new PaymentRepository();
export const installmentPlanTemplateRepository = new InstallmentPlanTemplateRepository();
