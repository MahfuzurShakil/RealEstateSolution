'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileSignature,
  HardHat,
  Package,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { DemoDataCard } from '@/components/admin/DemoDataCard';
import { BarList, CashFlowChart, Donut, Ring } from '@/components/admin/dashboard/charts';
import { ProjectPortfolio } from '@/components/admin/dashboard/ProjectPortfolio';
import { usePurchaseMode } from '@/lib/settings/use-purchase-mode';
import { useMockSession } from '@/lib/auth/mock-session';
import { canView } from '@/lib/domain/access';
import { discountPct } from '@/lib/domain/booking';
import { COST_TYPE_META } from '@/lib/domain/construction-cost';
import { LEAD_PIPELINE_STEPS, LEAD_STATUS_META, followUpState } from '@/lib/domain/lead';
import { PROJECT_PIPELINE_STEPS, PROJECT_STATUS_META } from '@/lib/domain/project';
import {
  bookingRepository,
  customerRepository,
  leadRepository,
  materialRequestRepository,
  ownerDashboard,
} from '@/lib/repositories';
import { formatBdt, formatDate, formatPhone, todayLocal } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * The owner's dashboard (client, 2026-10-21).
 *
 * It used to be nine record counters and some lists — "12 lands, 40 units"
 * tells an owner nothing about whether the business is doing well. The page
 * now answers, in reading order: how much cash is there, how much is sold
 * and collected, how much has been spent against budget, what is owed; then
 * what needs the owner today; then every project's health on one table; then
 * the shape of inventory, sales and cost.
 *
 * Still gated on the Section 9.6 `PERMISSION_MATRIX`, the same one the
 * sidebar and route guard read: money tiles only for roles that see money,
 * lists only for roles that can open the page they link to.
 */

interface AttentionItem {
  id: string;
  severity: 'red' | 'amber';
  title: string;
  detail: string;
  href: string;
  icon: LucideIcon;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

function KpiTile({
  icon: Icon,
  tint,
  label,
  value,
  children,
  aside,
  href,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: string;
  children?: React.ReactNode;
  aside?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <Card className="h-full transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tint)}>
            <Icon className="size-4" />
          </span>
          <p className="truncate text-sm text-ink-muted">{label}</p>
        </div>
        {aside}
      </div>
      <p className="mt-3 text-[1.35rem] font-semibold leading-tight tracking-tight text-ink">{value}</p>
      {children && <div className="mt-1.5 space-y-0.5 text-xs text-ink-muted">{children}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function AdminDashboardPage() {
  const { role, userName } = useMockSession();
  const { procurement } = usePurchaseMode();
  const see = (module: Parameters<typeof canView>[1]) => canView(role, module);
  const seesMoney = see('dashboard') || see('finance_collection') || see('finance_expense');
  const today = todayLocal();

  const data = useLiveQuery(() => ownerDashboard(today), [today]);

  /** The sales team's daily task list (Section 4.4). */
  const followUps = useLiveQuery(
    () => (see('crm') ? leadRepository.followUpQueue(today) : Promise.resolve([])),
    [today, role],
  );
  /** Bookings a manager has to sign off (Section 5.4). */
  const pendingApprovals = useLiveQuery(
    () => (see('booking') ? bookingRepository.list({ awaiting_approval: true }) : Promise.resolve([])),
    [role],
  );
  const customerNameById = useLiveQuery(
    async () => Object.fromEntries((await customerRepository.getAll()).map((c) => [c.id, c.name])),
    [],
  );
  /** The Procurement inbox (Section 6.5). */
  const pendingRequests = useLiveQuery(
    () =>
      procurement && see('material_request')
        ? materialRequestRepository.list({ pending_only: true })
        : Promise.resolve([]),
    [role, procurement],
  );

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-2xl bg-white/70" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      </div>
    );
  }

  const { cash, sales, cost, units, leads, projects } = data;
  const activeProjects = projects.filter((r) => r.project.status !== 'closed');
  const onSite = projects.filter((r) => r.progress);
  const unitsForSale = units.total - units.by_status.draft;
  const unitsSold = units.by_status.booked + units.by_status.sold + units.by_status.handed_over;
  const collectedPct = share(sales.collected, sales.sales_value);
  const budgetPct = share(cost.budget_spent, cost.budget);
  const atRisk = projects.filter((r) => r.health === 'risk').length;
  const watch = projects.filter((r) => r.health === 'watch').length;
  const avgProgress =
    onSite.length > 0 ? onSite.reduce((s, r) => s + (r.progress?.actual_pct ?? 0), 0) / onSite.length : null;

  /* ---------------- needs attention: one ranked list ---------------- */
  const attention: AttentionItem[] = [];
  if (seesMoney) {
    for (const a of data.alerts) {
      attention.push({
        id: a.id,
        severity: a.severity,
        title: `${a.project_name}: ${a.title}`,
        detail: a.detail,
        href: a.href,
        icon: a.area === 'finance' ? Wallet : AlertTriangle,
      });
    }
    if (sales.overdue_count > 0) {
      attention.push({
        id: 'collections-overdue',
        severity: 'red',
        title: `${sales.overdue_count} buyer instalment${sales.overdue_count === 1 ? '' : 's'} overdue`,
        detail: `${formatBdt(sales.overdue_amount)} past its date`,
        href: '/admin/collections?status=overdue',
        icon: Receipt,
      });
    }
  }
  if (see('site_progress')) {
    for (const r of projects.filter((p) => p.is_stale)) {
      attention.push({
        id: `stale-${r.project.id}`,
        severity: 'amber',
        title: `${r.project.name}: no site update lately`,
        detail: 'Nothing logged from site in over two weeks',
        href: `/admin/site-progress/${r.project.id}`,
        icon: HardHat,
      });
    }
    for (const r of projects.filter((p) => p.progress && p.progress.variance !== null && p.progress.variance < -10)) {
      attention.push({
        id: `behind-${r.project.id}`,
        severity: 'red',
        title: `${r.project.name} is behind schedule`,
        detail: `${r.progress!.actual_pct.toFixed(0)}% done against ${r.progress!.planned_pct?.toFixed(0)}% planned`,
        href: `/admin/site-progress/${r.project.id}`,
        icon: HardHat,
      });
    }
  }
  if (pendingApprovals && pendingApprovals.length > 0) {
    attention.push({
      id: 'approvals',
      severity: 'amber',
      title: `${pendingApprovals.length} discount approval${pendingApprovals.length === 1 ? '' : 's'} waiting`,
      detail: 'Bookings held until a manager signs off',
      href: '/admin/bookings',
      icon: FileSignature,
    });
  }
  if (followUps && followUps.length > 0) {
    const overdue = followUps.filter(({ date }) => followUpState(date, today) === 'overdue').length;
    attention.push({
      id: 'follow-ups',
      severity: overdue > 0 ? 'red' : 'amber',
      title: `${followUps.length} lead follow-up${followUps.length === 1 ? '' : 's'} due`,
      detail: overdue > 0 ? `${overdue} already overdue` : 'Due today',
      href: '/admin/leads',
      icon: CalendarClock,
    });
  }
  if (pendingRequests && pendingRequests.length > 0) {
    attention.push({
      id: 'material-requests',
      severity: 'amber',
      title: `${pendingRequests.length} material request${pendingRequests.length === 1 ? '' : 's'} waiting`,
      detail: 'Site is waiting on procurement',
      href: '/admin/material-requests',
      icon: Package,
    });
  }
  attention.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1));

  const headline =
    atRisk + watch === 0
      ? 'Every project is on track.'
      : `${atRisk > 0 ? `${atRisk} project${atRisk === 1 ? '' : 's'} at risk` : ''}${
          atRisk > 0 && watch > 0 ? ' and ' : ''
        }${watch > 0 ? `${watch} to watch` : ''}.`;

  return (
    <div className="space-y-6">
      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-admin-600 via-admin-500 to-admin-400 p-6 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-24 right-40 size-48 rounded-full bg-accent-coral/30 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm text-white/75">{longDate(today)}</p>
            <h1 className="mt-1 text-2xl font-semibold">
              {greeting()}, {userName}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/85">
              {headline}
              {seesMoney && cost.owed > 0 && <> {formatBdt(cost.owed)} is owed to vendors.</>}
              {attention.length > 0 && (
                <> {attention.length} thing{attention.length === 1 ? '' : 's'} need you today.</>
              )}
            </p>
          </div>
          <dl className="flex flex-wrap gap-3">
            {[
              { label: 'Active projects', value: String(activeProjects.length) },
              { label: 'Units sold', value: unitsForSale > 0 ? `${unitsSold} / ${unitsForSale}` : '—' },
              {
                label: 'Avg. construction',
                value: avgProgress === null ? '—' : `${avgProgress.toFixed(0)}%`,
              },
            ].map((s) => (
              <div key={s.label} className="min-w-28 rounded-xl bg-white/15 px-4 py-2.5 backdrop-blur-sm">
                <dt className="text-[11px] uppercase tracking-wide text-white/75">{s.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- KPIs ---------------- */}
      {seesMoney ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            icon={Banknote}
            tint="bg-admin-50 text-admin-700"
            label="Cash in hand"
            value={formatBdt(cash.balance)}
            href="/admin/cash"
          >
            <p className="flex items-center gap-1">
              <ArrowDownLeft className="size-3.5 text-admin-600" />
              {formatBdt(cash.in_this_month)} in this month
            </p>
            <p className="flex items-center gap-1">
              <ArrowUpRight className="size-3.5 text-accent-coral" />
              {formatBdt(cash.out_this_month)} out this month
            </p>
          </KpiTile>
          <KpiTile
            icon={TrendingUp}
            tint="bg-blue-50 text-blue-600"
            label="Sales booked"
            value={formatBdt(sales.sales_value)}
            aside={<Ring pct={collectedPct} size={52} />}
          >
            <p>{formatBdt(sales.collected)} collected</p>
            <p>{formatBdt(sales.due)} still due</p>
          </KpiTile>
          <KpiTile
            icon={HardHat}
            tint="bg-amber-50 text-amber-600"
            label="Construction spent"
            value={formatBdt(cost.budget_spent)}
            aside={
              <Ring
                pct={budgetPct}
                size={52}
                tone={budgetPct !== null && budgetPct > 100 ? 'red' : budgetPct !== null && budgetPct >= 90 ? 'amber' : 'teal'}
              />
            }
          >
            <p>{cost.budget > 0 ? `of ${formatBdt(cost.budget)} work-item budget` : 'No work-item budget set'}</p>
            <p>{formatBdt(cost.recorded)} all recorded cost</p>
          </KpiTile>
          <KpiTile
            icon={Wallet}
            tint="bg-rose-50 text-rose-600"
            label="Bills to pay"
            value={formatBdt(cost.owed)}
            href="/admin/payments"
          >
            {cost.overdue_bills > 0 ? (
              <span className="font-medium text-red-600">
                {cost.overdue_bills} overdue · {formatBdt(cost.overdue_bills_amount)}
              </span>
            ) : (
              'Nothing older than 30 days'
            )}
          </KpiTile>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile icon={Building2} tint="bg-admin-50 text-admin-700" label="Projects on site" value={String(onSite.length)}>
            {activeProjects.length} active in total
          </KpiTile>
          <KpiTile
            icon={HardHat}
            tint="bg-amber-50 text-amber-600"
            label="Avg. construction"
            value={avgProgress === null ? '—' : `${avgProgress.toFixed(1)}%`}
            aside={<Ring pct={avgProgress} size={52} />}
          >
            weighted by work item, per project
          </KpiTile>
          <KpiTile icon={CheckCircle2} tint="bg-blue-50 text-blue-600" label="Units available" value={String(units.by_status.available)}>
            {unitsSold} sold of {unitsForSale}
          </KpiTile>
          <KpiTile icon={TrendingUp} tint="bg-violet-50 text-violet-600" label="New leads this month" value={String(leads.this_month)}>
            {leads.total} leads in all
          </KpiTile>
        </div>
      )}

      {/* ---------------- cash flow + attention ---------------- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {seesMoney && (
          <Card className="xl:col-span-2">
            <CardHeader
              title="Cash flow"
              subtitle="Money in and out of every account, last 12 months"
              action={
                <Link href="/admin/cash" className="text-sm text-admin-700 hover:underline">
                  Cash position
                </Link>
              }
            />
            <CashFlowChart data={data.monthly} />
          </Card>
        )}
        <Card className={cn(!seesMoney && 'xl:col-span-3')}>
          <CardHeader
            title="Needs your attention"
            subtitle={attention.length === 0 ? undefined : 'Most serious first'}
            action={attention.length > 0 ? <Badge tone="red">{attention.length}</Badge> : undefined}
          />
          {attention.length === 0 ? (
            <div className="grid place-items-center py-10 text-center">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="mt-2 text-sm font-medium text-ink">All clear</p>
              <p className="text-xs text-ink-muted">Nothing is over budget, overdue or behind.</p>
            </div>
          ) : (
            <ul className="-mx-2 max-h-[17rem] space-y-1 overflow-y-auto px-2">
              {attention.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-slate-50"
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                          item.severity === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{item.detail}</p>
                      </div>
                      <span
                        className={cn(
                          'mt-1 shrink-0 text-[10px] font-semibold uppercase',
                          item.severity === 'red' ? 'text-red-600' : 'text-amber-600',
                        )}
                      >
                        {item.severity === 'red' ? 'Urgent' : 'Soon'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------- portfolio ---------------- */}
      {see('project') && (
        <Card>
          <CardHeader
            title="Project portfolio"
            subtitle="Every project, the ones that need you first"
            action={
              <div className="flex items-center gap-3">
                <span className="hidden items-center gap-3 text-xs text-ink-muted sm:flex">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-red-500" /> At risk {atRisk}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-amber-500" /> Watch {watch}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-emerald-500" /> Healthy{' '}
                    {projects.length - atRisk - watch}
                  </span>
                </span>
                <Link href="/admin/projects" className="text-sm text-admin-700 hover:underline">
                  All projects
                </Link>
              </div>
            }
          />
          <ProjectPortfolio rows={projects} seesMoney={seesMoney} />
        </Card>
      )}

      {/* ---------------- inventory, sales, stages ---------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {see('project') && (
          <Card>
            <CardHeader title="Unit inventory" subtitle="Where every flat, plot and share stands" />
            <Donut
              centerValue={String(unitsForSale)}
              centerLabel="units"
              slices={[
                { key: 'handed_over', label: 'Handed over', value: units.by_status.handed_over, color: '#0e4e59' },
                { key: 'sold', label: 'Sold', value: units.by_status.sold, color: '#0a7784' },
                { key: 'booked', label: 'Booked', value: units.by_status.booked, color: '#0d919c' },
                {
                  key: 'reserved',
                  label: 'Reserved / hold',
                  value: units.by_status.reserved + units.by_status.hold,
                  color: '#74cdd2',
                },
                { key: 'available', label: 'Available', value: units.by_status.available, color: '#d3f1f0' },
              ]}
            />
            {units.by_status.draft > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                + {units.by_status.draft} draft unit{units.by_status.draft === 1 ? '' : 's'} still missing details
              </p>
            )}
          </Card>
        )}

        {see('crm') && (
          <Card>
            <CardHeader
              title="Sales pipeline"
              subtitle={`${leads.total} leads · ${
                leads.total > 0 ? Math.round((leads.by_status.booked / leads.total) * 100) : 0
              }% turned into bookings`}
              action={
                <Link href="/admin/leads" className="text-sm text-admin-700 hover:underline">
                  Leads
                </Link>
              }
            />
            <BarList
              rows={[
                ...LEAD_PIPELINE_STEPS.map((s) => ({
                  key: s,
                  label: LEAD_STATUS_META[s].label,
                  value: leads.by_status[s],
                })),
                { key: 'lost', label: 'Lost', value: leads.by_status.lost, muted: true },
              ]}
            />
          </Card>
        )}

        {see('project') && (
          <Card>
            <CardHeader title="Projects by stage" subtitle="From the first plan to the last handover" />
            <ol className="space-y-1.5">
              {PROJECT_PIPELINE_STEPS.map((status, i) => {
                const count = data.pipeline[status];
                return (
                  <li key={status} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        count > 0 ? 'bg-admin-500 text-white' : 'bg-slate-100 text-slate-400',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className={cn('flex-1 text-sm', count > 0 ? 'text-ink' : 'text-ink-muted')}>
                      {PROJECT_STATUS_META[status].label}
                    </span>
                    <span className={cn('text-sm font-semibold', count > 0 ? 'text-ink' : 'text-slate-300')}>
                      {count}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>

      {/* ---------------- money detail ---------------- */}
      {seesMoney && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader title="Where the money went" subtitle="Site costs recorded, by type" />
            {cost.by_type.length === 0 ? (
              <p className="text-sm text-ink-muted">No site cost recorded yet.</p>
            ) : (
              <BarList
                format={formatBdt}
                barClass="bg-accent-coral"
                rows={cost.by_type.map((r) => ({
                  key: r.cost_type,
                  label: COST_TYPE_META[r.cost_type].label,
                  value: r.amount,
                }))}
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Where the money came from"
              subtitle="Everything received, by source"
              action={
                <Link href="/admin/fund" className="text-sm text-admin-700 hover:underline">
                  Fund
                </Link>
              }
            />
            <BarList
              format={formatBdt}
              rows={[
                { key: 'capital', label: "Partners' capital", value: data.fund.capital },
                { key: 'collections', label: 'Buyer payments', value: data.fund.collections },
                { key: 'loans', label: 'Loans', value: data.fund.loans },
              ]}
            />
            {data.fund.pool_unallocated > 0 && (
              <p className="mt-4 rounded-lg bg-admin-50 px-3 py-2 text-xs text-admin-800">
                {formatBdt(data.fund.pool_unallocated)} in the company pool is not given to any project yet.
              </p>
            )}
          </Card>

          <Card className="lg:col-span-2 xl:col-span-1">
            <CardHeader
              title="Latest money movements"
              action={
                <Link href="/admin/payments/history" className="text-sm text-admin-700 hover:underline">
                  History
                </Link>
              }
            />
            {data.recent.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {data.recent.map((row) => {
                  const isIn = row.amount >= 0;
                  return (
                    <li key={`${row.kind}-${row.id}`} className="flex items-center gap-3 py-2">
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full',
                          isIn ? 'bg-admin-50 text-admin-600' : 'bg-orange-50 text-accent-coral',
                        )}
                      >
                        {isIn ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{row.label}</p>
                        <p className="text-xs text-ink-muted">{formatDate(row.date)}</p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-ink">
                        {isIn ? '+' : '−'}
                        {formatBdt(Math.abs(row.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ---------------- work queues for the team roles ---------------- */}
      {((followUps && followUps.length > 0) || (pendingApprovals && pendingApprovals.length > 0)) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {followUps && followUps.length > 0 && (
            <Card>
              <CardHeader
                title="Follow-ups due"
                action={
                  <Link href="/admin/leads" className="text-sm text-admin-700 hover:underline">
                    All leads
                  </Link>
                }
              />
              <ul className="space-y-1">
                {followUps.slice(0, 6).map(({ lead, date }) => (
                  <li key={lead.id}>
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{lead.name}</p>
                        <p className="text-xs text-ink-muted">
                          {formatPhone(lead.phone)} · {formatDate(date)}
                        </p>
                      </div>
                      <Badge tone={LEAD_STATUS_META[lead.status].tone}>{LEAD_STATUS_META[lead.status].label}</Badge>
                      <ChevronRight className="size-4 text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {pendingApprovals && pendingApprovals.length > 0 && (
            <Card>
              <CardHeader
                title="Discount approvals waiting"
                action={
                  <Link href="/admin/bookings" className="text-sm text-admin-700 hover:underline">
                    All bookings
                  </Link>
                }
              />
              <ul className="space-y-1">
                {pendingApprovals.slice(0, 6).map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/admin/bookings/${booking.id}`}
                      className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {customerNameById?.[booking.customer_id] ?? booking.code}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {booking.code} · {formatBdt(booking.discount_amount)} off (
                          {discountPct(booking.base_price, booking.discount_amount).toFixed(1)}%)
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* the demo-data switch — useful while demoing */}
      <DemoDataCard />
    </div>
  );
}
