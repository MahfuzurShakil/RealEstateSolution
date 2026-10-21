'use client';

import { db } from '../db/database';
import type { BookingStatus, ConstructionCostType, Project, ProjectStatus } from '../db/types';
import { CONSTRUCTION_COST_TYPES } from '../db/types';
import { COST_TYPE_META } from '../domain/construction-cost';
import { costCategoryLabel, money } from '../domain/finance';
import { PROJECT_STATUS_META } from '../domain/project';
import { projectCostingRepository } from './costing.repository';
import { financeDashboardRepository } from './finance.repository';
import { fundOverview, splitProject, type ShareSlice } from './fund.repository';
import { lookupRepository } from './lookup.repository';

/*
 * One project's full money picture (client, 2026-10-21): the plan, every
 * taka in, every cost, and what each owner stands to gain or lose. Nothing
 * is stored; each figure is the one its own module computes — the costing
 * estimate, the finance P&L, the fund — put on one page.
 */

export interface StatementCostLine {
  key: string;
  group: 'Land' | 'Construction' | 'Before construction' | 'Other costs' | 'Material received';
  label: string;
  /** null when there is no budget for this line */
  budget: number | null;
  actual: number;
  unpaid: number;
}

export interface StatementBooking {
  id: string;
  code: string;
  customer: string;
  unit: string;
  status: BookingStatus;
  price: number;
  paid: number;
  due: number;
}

export interface StatementEntry {
  id: string;
  date: string;
  group: 'income' | 'cost' | 'funding';
  type: string;
  detail: string;
  /** + money in to the project, − cost or money back out */
  amount: number;
  /** cost only: still owed to the vendor */
  unpaid?: number;
  href?: string;
}

export interface StatementPartner extends ShareSlice {
  /** their own money in this project: capital put straight in, plus their part of the pool money given to it */
  put_in: number;
  expected_profit: number;
  result_so_far: number;
}

export interface ProjectStatement {
  project: Project;
  stage_label: string;
  plan: {
    revenue: number;
    revenue_source: 'estimate' | 'units' | 'none';
    cost: number;
    cost_source: 'estimate' | 'work_budget' | 'none';
    /** expected revenue less the larger of the planned and the actual cost */
    profit: number;
    margin_pct: number | null;
  };
  income: {
    sales_booked: number;
    collected: number;
    refunded: number;
    net_received: number;
    due: number;
    overdue: number;
    units_total: number;
    units_sold: number;
    unsold_value: number;
  };
  cost: {
    total: number;
    unpaid: number;
    lines: StatementCostLine[];
  };
  funding: {
    partner_capital: number;
    loans: number;
    other: number;
    from_pool: number;
    buyers: number;
    received: number;
    spent: number;
    left: number;
  };
  /** money received from buyers less every cost so far — negative while building is normal */
  result_so_far: number;
  partners: StatementPartner[];
  bookings: StatementBooking[];
  entries: StatementEntry[];
}

const SOLD = new Set(['booked', 'sold', 'handed_over']);

export async function projectStatement(projectId: string): Promise<ProjectStatement | null> {
  const project = await db.projects.get(projectId);
  if (!project) return null;

  const towers = await db.towers.where('project_id').equals(projectId).toArray();
  const towerIds = new Set(towers.map((t) => t.id));
  const [
    allUnits,
    bookings,
    customers,
    payments,
    refunds,
    purchases,
    budgetLines,
    expenses,
    receipts,
    allocations,
    partners,
    landMappings,
    categories,
    costing,
    finance,
    fund,
  ] = await Promise.all([
    db.units.toArray(),
    db.bookings.toArray(),
    db.customers.toArray(),
    db.payments.toArray(),
    db.refunds.toArray(),
    db.direct_purchases.where('project_id').equals(projectId).toArray(),
    db.work_item_budget_lines.where('project_id').equals(projectId).toArray(),
    db.expenses.where('project_id').equals(projectId).toArray(),
    db.fund_receipts.toArray(),
    db.fund_allocations.where('project_id').equals(projectId).toArray(),
    db.partners.toArray(),
    db.land_project_mapping.toArray(),
    lookupRepository.costCategories(),
    projectCostingRepository.forProject(projectId),
    financeDashboardRepository.forProject(projectId),
    fundOverview(),
  ]);

  const units = allUnits.filter((u) => towerIds.has(u.tower_id));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const myBookings = bookings.filter((b) => unitById.has(b.unit_id));
  const bookingIds = new Set(myBookings.map((b) => b.id));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const myPayments = payments.filter((p) => bookingIds.has(p.booking_id));
  const myRefunds = refunds.filter((r) => bookingIds.has(r.booking_id));
  const myReceipts = receipts.filter((r) => r.project_id === projectId);
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const sum = <T>(rows: T[], f: (r: T) => number) => money(rows.reduce((s, r) => s + (Number(f(r)) || 0), 0));

  /* ---------------- cost, by line ---------------- */
  const lines: StatementCostLine[] = [];
  const landCost = finance?.cost_land ?? 0;
  if (landCost > 0 || (costing?.land.estimated ?? 0) > 0) {
    lines.push({
      key: 'land',
      group: 'Land',
      label: 'Land (price, registration, fees, development)',
      budget: costing?.land.estimated || null,
      actual: landCost,
      unpaid: 0,
    });
  }
  const workPurchases = purchases.filter((p) => p.work_item_id);
  for (const type of CONSTRUCTION_COST_TYPES) {
    const mine = workPurchases.filter((p) => p.cost_type === type);
    const budget = sum(
      budgetLines.filter((l) => l.cost_type === type),
      (l) => l.budgeted_amount,
    );
    if (mine.length === 0 && budget === 0) continue;
    lines.push({
      key: `work-${type}`,
      group: 'Construction',
      label: COST_TYPE_META[type as ConstructionCostType].label,
      budget: budget || null,
      actual: sum(mine, (p) => p.amount),
      unpaid: sum(mine, (p) => p.amount - (p.paid_amount || 0)),
    });
  }
  const stagePurchases = purchases.filter((p) => !p.work_item_id);
  const byStage = new Map<string, typeof stagePurchases>();
  for (const p of stagePurchases) {
    const key = p.stage ?? 'planning';
    byStage.set(key, [...(byStage.get(key) ?? []), p]);
  }
  for (const [stage, rows] of byStage) {
    lines.push({
      key: `stage-${stage}`,
      group: 'Before construction',
      label: `${PROJECT_STATUS_META[stage as ProjectStatus]?.label ?? stage} stage`,
      budget: null,
      actual: sum(rows, (p) => p.amount),
      unpaid: sum(rows, (p) => p.amount - (p.paid_amount || 0)),
    });
  }
  // a land linked to this project is costed through the land, once (finance.repository)
  const linkedLands = new Set(landMappings.filter((m) => m.project_id === projectId).map((m) => m.land_id));
  const projectExpenses = expenses.filter((e) => !(e.land_id && linkedLands.has(e.land_id)));
  const byCategory = new Map<string, typeof projectExpenses>();
  for (const e of projectExpenses) byCategory.set(e.cost_category, [...(byCategory.get(e.cost_category) ?? []), e]);
  for (const [category, rows] of byCategory) {
    lines.push({
      key: `exp-${category}`,
      group: 'Other costs',
      label: costCategoryLabel(category, categories),
      budget: null,
      actual: sum(rows, (e) => e.amount),
      unpaid: 0,
    });
  }
  if ((finance?.cost_procurement ?? 0) > 0) {
    lines.push({
      key: 'procurement',
      group: 'Material received',
      label: 'Material received at site (purchase orders)',
      budget: null,
      actual: finance!.cost_procurement,
      unpaid: 0,
    });
  }
  const costTotal = money(lines.reduce((s, l) => s + l.actual, 0));
  const costUnpaid = money(lines.reduce((s, l) => s + l.unpaid, 0));

  /* ---------------- income ---------------- */
  const companyUnits = units.filter((u) => u.for_sale_by === 'company');
  const unsoldValue = sum(
    companyUnits.filter((u) => !SOLD.has(u.status)),
    (u) => u.base_price,
  );
  const salesBooked = finance?.sales_value ?? 0;
  const collected = sum(myPayments, (p) => p.amount);
  const refunded = sum(myRefunds, (r) => r.net_refund);

  /* ---------------- plan ---------------- */
  const estimateRevenue = costing?.revenue.expected ?? 0;
  const unitsRevenue = money(salesBooked + unsoldValue);
  const revenue = estimateRevenue > 0 ? estimateRevenue : unitsRevenue;
  const revenueSource = estimateRevenue > 0 ? 'estimate' : unitsRevenue > 0 ? 'units' : 'none';
  const workBudget = sum(budgetLines, (l) => l.budgeted_amount);
  const estimateCost = costing?.estimatedTotal ?? 0;
  const planCost = estimateCost > 0 ? estimateCost : workBudget > 0 ? money(workBudget + landCost) : 0;
  const costSource = estimateCost > 0 ? 'estimate' : workBudget > 0 ? 'work_budget' : 'none';
  // a plan already overtaken by real spending is not believed
  const expectedProfit = money(revenue - Math.max(planCost, costTotal));
  const resultSoFar = money(collected - refunded - costTotal);

  /* ---------------- funding ---------------- */
  const fundRow = fund.projects.find((r) => r.project_id === projectId);
  const fromPool = sum(allocations, (a) => a.amount);
  const shares = splitProject(projectId, partners);
  const partnerRows: StatementPartner[] = shares.map((s) => {
    const direct = sum(
      myReceipts.filter((r) => r.source_type === 'partner_capital' && r.partner_id === s.partner_id),
      (r) => r.amount,
    );
    const poolPart = s.kind === 'company' && s.company_pct ? money((fromPool * s.company_pct) / 100) : 0;
    return {
      ...s,
      put_in: money(direct + poolPart),
      expected_profit: money((expectedProfit * s.share_pct) / 100),
      result_so_far: money((resultSoFar * s.share_pct) / 100),
    };
  });

  /* ---------------- bookings ---------------- */
  const paidByBooking = new Map<string, number>();
  for (const p of myPayments) paidByBooking.set(p.booking_id, money((paidByBooking.get(p.booking_id) ?? 0) + p.amount));
  const bookingRows: StatementBooking[] = myBookings
    .map((b) => {
      const paid = paidByBooking.get(b.id) ?? 0;
      return {
        id: b.id,
        code: b.code,
        customer: customerName.get(b.customer_id) ?? '—',
        unit: unitById.get(b.unit_id)?.code ?? '—',
        status: b.status,
        price: Number(b.final_price) || 0,
        paid,
        due: b.status === 'cancelled' ? 0 : money(Math.max(0, (Number(b.final_price) || 0) - paid)),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  /* ---------------- every entry ---------------- */
  const bookingById = new Map(myBookings.map((b) => [b.id, b]));
  const who = (bookingId: string) => {
    const b = bookingById.get(bookingId);
    return b ? `${customerName.get(b.customer_id) ?? '—'} · ${unitById.get(b.unit_id)?.code ?? ''}` : '—';
  };
  const entries: StatementEntry[] = [
    ...myPayments.map((p) => ({
      id: `pay-${p.id}`,
      date: p.payment_date,
      group: 'income' as const,
      type: 'Buyer payment',
      detail: who(p.booking_id),
      amount: Number(p.amount) || 0,
      href: `/admin/bookings/${p.booking_id}`,
    })),
    ...myRefunds.map((r) => ({
      id: `ref-${r.id}`,
      date: r.refund_date,
      group: 'income' as const,
      type: 'Refund to buyer',
      detail: who(r.booking_id),
      amount: -(Number(r.net_refund) || 0),
      href: `/admin/bookings/${r.booking_id}`,
    })),
    ...purchases.map((p) => ({
      id: `dp-${p.id}`,
      date: p.purchase_date,
      group: 'cost' as const,
      type: p.work_item_id ? COST_TYPE_META[p.cost_type].label : `${PROJECT_STATUS_META[p.stage ?? 'planning']?.label ?? ''} stage`,
      detail: `${p.vendor_name} · ${p.description}`,
      amount: -(Number(p.amount) || 0),
      unpaid: money(p.amount - (p.paid_amount || 0)),
    })),
    ...projectExpenses.map((e) => ({
      id: `exp-${e.id}`,
      date: e.expense_date,
      group: 'cost' as const,
      type: costCategoryLabel(e.cost_category, categories),
      detail: e.cost_reason || e.paid_to,
      amount: -(Number(e.amount) || 0),
      href: `/admin/expenses/${e.id}`,
    })),
    ...myReceipts.map((r) => ({
      id: `fnd-${r.id}`,
      date: r.receipt_date,
      group: 'funding' as const,
      type: r.source_type === 'partner_capital' ? 'Partner capital' : r.source_type === 'loan' ? 'Loan' : 'Other money in',
      detail: (r.partner_id ? partnerName.get(r.partner_id) : r.source_name) ?? '—',
      amount: Number(r.amount) || 0,
    })),
    ...allocations.map((a) => ({
      id: `alc-${a.id}`,
      date: a.allocation_date,
      group: 'funding' as const,
      type: 'From company pool',
      detail: a.notes || a.code,
      amount: Number(a.amount) || 0,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return {
    project,
    stage_label: PROJECT_STATUS_META[project.status].label,
    plan: {
      revenue,
      revenue_source: revenueSource,
      cost: planCost,
      cost_source: costSource,
      profit: expectedProfit,
      margin_pct: revenue > 0 ? Math.round((expectedProfit / revenue) * 1000) / 10 : null,
    },
    income: {
      sales_booked: salesBooked,
      collected,
      refunded,
      net_received: money(collected - refunded),
      due: finance?.due ?? 0,
      overdue: finance?.overdue_amount ?? 0,
      units_total: companyUnits.filter((u) => u.status !== 'draft').length,
      units_sold: companyUnits.filter((u) => SOLD.has(u.status)).length,
      unsold_value: unsoldValue,
    },
    cost: { total: costTotal, unpaid: costUnpaid, lines },
    funding: {
      partner_capital: sum(
        myReceipts.filter((r) => r.source_type === 'partner_capital'),
        (r) => r.amount,
      ),
      loans: sum(
        myReceipts.filter((r) => r.source_type === 'loan'),
        (r) => r.amount,
      ),
      other: sum(
        myReceipts.filter((r) => r.source_type === 'other'),
        (r) => r.amount,
      ),
      from_pool: fromPool,
      buyers: collected,
      received: fundRow?.received ?? 0,
      spent: fundRow?.spent ?? 0,
      left: fundRow?.remaining ?? 0,
    },
    result_so_far: resultSoFar,
    partners: partnerRows,
    bookings: bookingRows,
    entries,
  };
}
