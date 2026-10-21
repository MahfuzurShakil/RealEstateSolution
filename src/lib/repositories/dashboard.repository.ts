'use client';

import { db } from '../db/database';
import type { ConstructionCostType, LeadStatus, Project, ProjectStatus, UnitStatus } from '../db/types';
import { CONSTRUCTION_COST_TYPES, LEAD_STATUSES, PROJECT_STATUSES, UNIT_STATUSES } from '../db/types';
import { PAYMENT_OVERDUE_DAYS } from '../domain/construction-cost';
import type { CashFlowRow } from '../domain/cash';
import { money } from '../domain/finance';
import type { ProgressRollup } from '../domain/site-progress';
import { costAlerts, type CostAlert } from './alerts.repository';
import { bankAccountRepository } from './bank.repository';
import { directPurchasePaymentRepository, projectCostSheet } from './construction-cost.repository';
import { collectionRepository, financeDashboardRepository } from './finance.repository';
import { fundOverview } from './fund.repository';
import { projectProgressRepository } from './site-progress.repository';

/*
 * The owner's dashboard (client, 2026-10-21): "where does the business stand"
 * in one read. Nothing new is stored — every figure is the same one the
 * module screens show, gathered from the repositories that already compute
 * it, so the dashboard can never disagree with the page a tile links to.
 */

export type ProjectHealth = 'good' | 'watch' | 'risk';

export interface DashboardProjectRow {
  project: Project;
  /** null for projects with no site work (planning, plots, shares, closed) */
  progress: ProgressRollup | null;
  is_stale: boolean;
  /** work-item budget and what has been recorded against it */
  budget: number;
  spent: number;
  /** every recorded cost on the project, stage costs and expenses included */
  cost: number;
  owed: number;
  fund_remaining: number | null;
  units_total: number;
  units_sold: number;
  sales_value: number;
  collected: number;
  overdue_amount: number;
  red_alerts: number;
  amber_alerts: number;
  health: ProjectHealth;
  /** the one-line reason behind `health` */
  health_note: string;
}

export interface MonthFlow {
  /** YYYY-MM */
  month: string;
  money_in: number;
  money_out: number;
}

export interface OwnerDashboard {
  cash: { balance: number; accounts: number; in_this_month: number; out_this_month: number };
  monthly: MonthFlow[];
  sales: {
    sales_value: number;
    collected: number;
    due: number;
    overdue_amount: number;
    overdue_count: number;
    due_this_month: number;
    booking_count: number;
  };
  cost: {
    recorded: number;
    budget: number;
    budget_spent: number;
    owed: number;
    overdue_bills: number;
    overdue_bills_amount: number;
    by_type: { cost_type: ConstructionCostType; amount: number }[];
  };
  fund: { capital: number; loans: number; collections: number; pool_unallocated: number };
  units: { total: number; by_status: Record<UnitStatus, number> };
  pipeline: Record<ProjectStatus, number>;
  leads: { total: number; by_status: Record<LeadStatus, number>; this_month: number };
  projects: DashboardProjectRow[];
  alerts: CostAlert[];
  recent: CashFlowRow[];
}

const SOLD: UnitStatus[] = ['booked', 'sold', 'handed_over'];

function zeroes<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/** The last `count` months ending with `today`'s, oldest first. */
function lastMonths(today: string, count: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export async function ownerDashboard(today: string): Promise<OwnerDashboard> {
  const [
    projects,
    towers,
    units,
    leads,
    purchases,
    position,
    flows,
    finance,
    collections,
    fund,
    board,
    pending,
    alerts,
  ] = await Promise.all([
    db.projects.toArray(),
    db.towers.toArray(),
    db.units.toArray(),
    db.leads.toArray(),
    db.direct_purchases.toArray(),
    bankAccountRepository.position(),
    bankAccountRepository.flows(),
    financeDashboardRepository.company(today),
    collectionRepository.summary(today),
    fundOverview(),
    projectProgressRepository.board(today),
    directPurchasePaymentRepository.pending(),
    costAlerts(),
  ]);

  // cash by month — a transfer between two accounts is not in `flows`, so this is real in/out
  const months = lastMonths(today, 12);
  const monthly: MonthFlow[] = months.map((month) => ({ month, money_in: 0, money_out: 0 }));
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  for (const row of flows) {
    const i = monthIndex.get(row.date.slice(0, 7));
    if (i === undefined) continue;
    if (row.amount >= 0) monthly[i].money_in = money(monthly[i].money_in + row.amount);
    else monthly[i].money_out = money(monthly[i].money_out - row.amount);
  }
  const thisMonth = monthly[monthly.length - 1];

  const towerProject = new Map(towers.map((t) => [t.id, t.project_id]));
  const unitsByProject = new Map<string, { total: number; sold: number }>();
  const unitStatus = zeroes(UNIT_STATUSES);
  for (const unit of units) {
    unitStatus[unit.status] += 1;
    const pid = towerProject.get(unit.tower_id);
    if (!pid) continue;
    const row = unitsByProject.get(pid) ?? { total: 0, sold: 0 };
    if (unit.status !== 'draft') row.total += 1;
    if (SOLD.includes(unit.status)) row.sold += 1;
    unitsByProject.set(pid, row);
  }

  const byType = zeroes(CONSTRUCTION_COST_TYPES);
  for (const p of purchases) byType[p.cost_type] = money(byType[p.cost_type] + (Number(p.amount) || 0));

  const pipeline = zeroes(PROJECT_STATUSES);
  for (const p of projects) pipeline[p.status] += 1;

  const leadStatus = zeroes(LEAD_STATUSES);
  const monthPrefix = today.slice(0, 7);
  let leadsThisMonth = 0;
  for (const lead of leads) {
    leadStatus[lead.status] += 1;
    if ((lead.created_at ?? '').startsWith(monthPrefix)) leadsThisMonth += 1;
  }

  const boardById = new Map(board.map((r) => [r.project.id, r]));
  const fundById = new Map(fund.projects.map((r) => [r.project_id, r]));
  const financeById = new Map(finance.projects.map((r) => [r.project_id, r]));

  let budgetTotal = 0;
  let budgetSpent = 0;
  const rows: DashboardProjectRow[] = [];
  for (const project of projects) {
    const sheet = await projectCostSheet(project.id);
    budgetTotal += sheet.budget;
    budgetSpent += sheet.actual;
    const site = boardById.get(project.id);
    const fundRow = fundById.get(project.id);
    const fin = financeById.get(project.id);
    const mine = alerts.filter((a) => a.project_id === project.id);
    const red = mine.filter((a) => a.severity === 'red').length;
    const amber = mine.length - red;
    const variance = site?.rollup.variance ?? null;
    const fundRemaining = fundRow ? fundRow.remaining : null;

    /*
     * Red is something already gone wrong — money short, budget blown, more
     * than ten points behind. Amber is the early warning. One reason is
     * named, the worst, so the owner knows what the colour means.
     */
    let health: ProjectHealth = 'good';
    let note = project.status === 'closed' ? 'Closed' : 'On track';
    if (variance !== null && variance < -10) {
      health = 'risk';
      note = `${Math.abs(variance).toFixed(0)} pts behind plan`;
    } else if (fundRemaining !== null && fundRemaining < 0) {
      health = 'risk';
      note = 'Spent more than it received';
    } else if (red > 0) {
      health = 'risk';
      note = mine.find((a) => a.severity === 'red')!.title;
    } else if (site?.rollup.state === 'behind') {
      health = 'watch';
      note = 'Slightly behind plan';
    } else if (site?.is_stale) {
      health = 'watch';
      note = 'No site update lately';
    } else if (amber > 0) {
      health = 'watch';
      note = mine[0].title;
    }

    const u = unitsByProject.get(project.id) ?? { total: 0, sold: 0 };
    rows.push({
      project,
      progress: site?.rollup ?? null,
      is_stale: site?.is_stale ?? false,
      budget: sheet.budget,
      spent: sheet.actual,
      cost: fundRow?.cost ?? 0,
      owed: fundRow?.owed ?? 0,
      fund_remaining: fundRemaining,
      units_total: u.total,
      units_sold: u.sold,
      sales_value: fin?.sales_value ?? 0,
      collected: fin?.collected ?? 0,
      overdue_amount: fin?.overdue_amount ?? 0,
      red_alerts: red,
      amber_alerts: amber,
      health,
      health_note: note,
    });
  }

  const healthRank: Record<ProjectHealth, number> = { risk: 0, watch: 1, good: 2 };
  const stageRank = (s: ProjectStatus) => (s === 'closed' ? 99 : -PROJECT_STATUSES.indexOf(s));
  rows.sort(
    (a, b) =>
      healthRank[a.health] - healthRank[b.health] ||
      stageRank(a.project.status) - stageRank(b.project.status) ||
      a.project.name.localeCompare(b.project.name),
  );

  const overdueBills = pending.filter((r) => r.age_days > PAYMENT_OVERDUE_DAYS);

  return {
    cash: {
      balance: position.total_balance,
      accounts: position.accounts.filter((a) => a.is_active).length,
      in_this_month: thisMonth.money_in,
      out_this_month: thisMonth.money_out,
    },
    monthly,
    sales: {
      sales_value: finance.sales_value,
      collected: finance.collected,
      due: finance.due,
      overdue_amount: collections.overdue_amount,
      overdue_count: collections.overdue_count,
      due_this_month: collections.due_this_month,
      booking_count: finance.projects.reduce((s, r) => s + r.booking_count, 0),
    },
    cost: {
      recorded: fund.totals.cost,
      budget: money(budgetTotal),
      budget_spent: money(budgetSpent),
      owed: money(pending.reduce((s, r) => s + r.due, 0)),
      overdue_bills: overdueBills.length,
      overdue_bills_amount: money(overdueBills.reduce((s, r) => s + r.due, 0)),
      by_type: CONSTRUCTION_COST_TYPES.map((cost_type) => ({ cost_type, amount: byType[cost_type] }))
        .filter((r) => r.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    },
    fund: {
      capital: fund.totals.capital,
      loans: fund.totals.loans,
      collections: fund.totals.collections,
      pool_unallocated: fund.pool.unallocated,
    },
    units: { total: units.length, by_status: unitStatus },
    pipeline,
    leads: { total: leads.length, by_status: leadStatus, this_month: leadsThisMonth },
    projects: rows,
    alerts,
    recent: flows.slice(0, 8),
  };
}
