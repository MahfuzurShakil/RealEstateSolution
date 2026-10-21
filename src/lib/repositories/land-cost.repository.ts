'use client';

import { db } from '../db/database';
import type { AcquisitionCostHead, Expense, SupplierPaymentMethod } from '../db/types';
import { ACQUISITION_COST_HEAD_LABEL } from '../db/types';
import { documentRepository } from './document.repository';
import { expenseRepository } from './finance.repository';

/**
 * The Land Cost tab (2026-10-21) — budget, deal, paid and pending per cost
 * head, and the payments that make up "paid".
 *
 * A payment here is an ordinary expense against the land: `land_payment` for
 * the land price, `land_extra_cost` with `land_cost_head` for every other
 * head. So the cost ledger, Cash Position and the project costing all see it
 * without a second copy, and the cost sheet's actual reads it the way it
 * always has.
 */

/** One payment as the tab lists it. */
export interface LandCostPayment {
  expense: Expense;
  head: AcquisitionCostHead | null;
  /** set when the payment is for a land development activity */
  activityId: string | null;
  headLabel: string;
  accountName: string | null;
  /** owner it was paid to, on a land price payment against one owner */
  ownerName: string | null;
  fileCount: number;
}

export interface RecordLandPaymentInput {
  landId: string;
  head: AcquisitionCostHead;
  /** pays a land development activity instead of a cost head */
  activityId?: string | null;
  amount: number;
  date: string;
  accountId: string;
  paidTo: string;
  method: SupplierPaymentMethod;
  reference: string | null;
  notes: string | null;
  /** land price only — which owner's share this settles */
  ownerMappingId: string | null;
  files: File[];
}

class LandCostRepository {
  /** Every payment against this land, newest first. */
  async paymentsForLand(landId: string): Promise<LandCostPayment[]> {
    const [expenses, accounts, mappings, activities] = await Promise.all([
      db.expenses.where('land_id').equals(landId).toArray(),
      db.bank_accounts.toArray(),
      db.land_owner_mapping.where('land_id').equals(landId).toArray(),
      db.land_development_activities.where('land_id').equals(landId).toArray(),
    ]);
    const activityLabel = new Map(activities.map((a) => [a.id, a.activity_type]));
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const owners = await Promise.all(
      mappings.map(async (m) => [m.id, (await db.landowners.get(m.owner_id))?.name ?? null] as const),
    );
    const ownerName = new Map(owners);

    const rows = await Promise.all(
      expenses.map(async (e) => {
        const activityId = e.land_development_activity_id ?? null;
        const head: AcquisitionCostHead | null = activityId
          ? null
          : e.cost_category === 'land_payment'
            ? 'land_price'
            : (e.land_cost_head ?? null);
        const files = await documentRepository.listForEntity('expense', e.id);
        return {
          expense: e,
          head,
          activityId,
          headLabel: activityId
            ? `Development · ${activityLabel.get(activityId) ?? 'removed activity'}`
            : head
              ? ACQUISITION_COST_HEAD_LABEL[head]
              : 'Unclassified',
          accountName: e.account_id ? (accountName.get(e.account_id) ?? null) : null,
          ownerName: e.owner_mapping_id ? (ownerName.get(e.owner_mapping_id) ?? null) : null,
          fileCount: files.length,
        };
      }),
    );
    return rows.sort(
      (a, b) =>
        b.expense.expense_date.localeCompare(a.expense.expense_date) ||
        b.expense.created_at.localeCompare(a.expense.created_at),
    );
  }

  /** Records a payment against one cost head, with its receipts. */
  async recordPayment(input: RecordLandPaymentInput, userId: string | null): Promise<Expense> {
    if (!input.accountId) throw new Error('Pick the account the money was paid from.');
    const activity = input.activityId
      ? await db.land_development_activities.get(input.activityId)
      : undefined;
    const isPrice = !activity && input.head === 'land_price';
    const expense = await expenseRepository.createExpense(
      {
        land_id: input.landId,
        project_id: null,
        account_id: input.accountId,
        cost_category: isPrice ? 'land_payment' : 'land_extra_cost',
        land_cost_head: isPrice || activity ? null : input.head,
        land_development_activity_id: activity?.id ?? null,
        owner_mapping_id: isPrice ? input.ownerMappingId : null,
        installment_id: null,
        cost_reason: activity
          ? `Land development — ${activity.activity_type}`
          : ACQUISITION_COST_HEAD_LABEL[input.head],
        amount: input.amount,
        expense_date: input.date,
        paid_to: input.paidTo,
        payment_method: input.method,
        reference_no: input.reference,
        paid_by: userId,
        notes: input.notes,
      },
      userId,
    );
    const uploadedAt = new Date().toISOString();
    for (const file of input.files) {
      await documentRepository.create(
        {
          entity_type: 'expense',
          entity_id: expense.id,
          document_type: 'receipt',
          custom_type_name: null,
          file_url: file.name,
          file_data: file,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          is_public: false,
          uploaded_by: userId,
          uploaded_at: uploadedAt,
          notes: null,
        },
        userId,
      );
    }
    return expense;
  }

  /** Deletes a payment and its receipts. */
  async removePayment(expenseId: string): Promise<void> {
    await expenseRepository.removeCascade(expenseId);
  }
}

export const landCostRepository = new LandCostRepository();
