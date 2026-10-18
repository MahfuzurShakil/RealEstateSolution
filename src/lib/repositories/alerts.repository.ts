'use client';

import { db } from '../db/database';
import {
  AHEAD_OF_WORK_POINTS,
  NEAR_BUDGET_PCT,
  PAYMENT_OVERDUE_DAYS,
} from '../domain/construction-cost';
import { formatBdt } from '../utils/format';
import { directPurchasePaymentRepository, projectCostSheet } from './construction-cost.repository';
import { fundOverview } from './fund.repository';

/*
 * Alerts (DIRECT-PURCHASE-PLAN.md B6). Computed on read from the same rules
 * the screens use, so a bell can never disagree with the page it links to.
 * Nothing is stored and nothing is blocked — transparency, not restriction.
 */

export type AlertKind = 'over_budget' | 'near_budget' | 'ahead_of_work' | 'payment_overdue' | 'low_fund';
/** who the alert is for: the site (budget) or finance (money) */
export type AlertArea = 'site' | 'finance';

export interface CostAlert {
  id: string;
  kind: AlertKind;
  area: AlertArea;
  severity: 'red' | 'amber';
  project_id: string;
  project_name: string;
  title: string;
  detail: string;
  href: string;
}

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  over_budget: 'Over budget',
  near_budget: 'Budget nearly used',
  ahead_of_work: 'Spending ahead of work',
  payment_overdue: 'Payment overdue',
  low_fund: 'Low fund',
};

export async function costAlerts(): Promise<CostAlert[]> {
  const out: CostAlert[] = [];
  const projects = await db.projects.toArray();
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const withWork = new Set((await db.work_item_budget_lines.toArray()).map((l) => l.project_id));
  for (const id of (await db.direct_purchases.toArray()).map((p) => p.project_id)) withWork.add(id);

  for (const projectId of withWork) {
    const sheet = await projectCostSheet(projectId);
    for (const tower of sheet.towers) {
      for (const row of tower.items) {
        const name = `${tower.tower.name} · ${row.work_item.name}`;
        const href = `/admin/site-progress/${projectId}?tab=cost`;
        const base = { project_id: projectId, project_name: projectName.get(projectId) ?? '—', area: 'site' as const, href };
        if (row.health === 'over') {
          out.push({
            ...base,
            id: `over-${row.work_item.id}`,
            kind: 'over_budget',
            severity: 'red',
            title: `${name} is over budget`,
            detail:
              row.budget > 0
                ? `Spent ${formatBdt(row.actual)} of ${formatBdt(row.budget)} (${row.used_pct}%), work ${row.work_item.actual_progress_pct}% done`
                : `${formatBdt(row.actual)} spent with no budget set`,
          });
        } else if (row.health === 'ahead_of_work') {
          out.push({
            ...base,
            id: `ahead-${row.work_item.id}`,
            kind: 'ahead_of_work',
            severity: 'amber',
            title: `${name}: spending ahead of the work`,
            detail: `${row.used_pct}% of budget spent, work ${row.work_item.actual_progress_pct}% done (${AHEAD_OF_WORK_POINTS}+ points apart)`,
          });
        } else if (row.health === 'near') {
          out.push({
            ...base,
            id: `near-${row.work_item.id}`,
            kind: 'near_budget',
            severity: 'amber',
            title: `${name}: budget nearly used`,
            detail: `${row.used_pct}% of ${formatBdt(row.budget)} spent (warns at ${NEAR_BUDGET_PCT}%), work ${row.work_item.actual_progress_pct}% done`,
          });
        }
      }
    }
  }

  // overdue payments: one alert per project, not one per bill
  const overdue = (await directPurchasePaymentRepository.pending()).filter((r) => r.age_days > PAYMENT_OVERDUE_DAYS);
  const byProject = new Map<string, typeof overdue>();
  for (const r of overdue) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r]);
  for (const [projectId, rows] of byProject) {
    const due = rows.reduce((s, r) => s + r.due, 0);
    const oldest = Math.max(...rows.map((r) => r.age_days));
    out.push({
      id: `overdue-${projectId}`,
      kind: 'payment_overdue',
      area: 'finance',
      severity: oldest > PAYMENT_OVERDUE_DAYS * 3 ? 'red' : 'amber',
      project_id: projectId,
      project_name: projectName.get(projectId) ?? '—',
      title: `${rows.length} payment${rows.length === 1 ? '' : 's'} overdue`,
      detail: `${formatBdt(due)} owed for more than ${PAYMENT_OVERDUE_DAYS} days; oldest ${oldest} days`,
      href: '/admin/payments',
    });
  }

  const fund = await fundOverview();
  for (const row of fund.projects) {
    if (!(row.owed > 0) || row.remaining >= row.owed) continue;
    out.push({
      id: `fund-${row.project_id}`,
      kind: 'low_fund',
      area: 'finance',
      severity: row.remaining < 0 ? 'red' : 'amber',
      project_id: row.project_id,
      project_name: row.project_name,
      title: 'Not enough fund to pay what is owed',
      detail: `${formatBdt(row.remaining)} left against ${formatBdt(row.owed)} owed — give it money from the pool or record money in`,
      href: '/admin/fund',
    });
  }

  const rank = (a: CostAlert) => (a.severity === 'red' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.project_name.localeCompare(b.project_name));
}
