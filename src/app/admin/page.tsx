'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import {
  Building2,
  CalendarClock,
  FileSignature,
  FileText,
  HardHat,
  Layers,
  Map,
  Package,
  UserRound,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { BOOKING_STATUS_META, discountPct } from '@/lib/domain/booking';
import { FOLLOW_UP_META, LEAD_STATUS_META, followUpState } from '@/lib/domain/lead';
import {
  MATERIAL_REQUEST_STATUS_META,
  SCHEDULE_STATE_META,
  rollupAcrossTowers,
} from '@/lib/domain/site-progress';
import { ProgressBar } from '@/components/admin/site-progress/ProgressBar';
import { formatBdt, formatDate, formatPhone, todayLocal } from '@/lib/utils/format';
import { DemoDataCard } from '@/components/admin/DemoDataCard';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  bookingRepository,
  customerRepository,
  documentRepository,
  landRepository,
  landownerRepository,
  leadRepository,
  materialRequestRepository,
  projectRepository,
  siteProgressUpdateRepository,
  towerRepository,
  towerWorkItemRepository,
  unitRepository,
} from '@/lib/repositories';
import { useMockSession } from '@/lib/auth/mock-session';

/**
 * Placeholder dashboard — proves the shell, the Dexie connection and the
 * repository layer all work end to end. Real KPI cards (Design Reference A.4
 * Pattern 2) arrive with Module 8.
 */
export default function AdminDashboardPage() {
  const { userName } = useMockSession();

  const today = todayLocal();

  /** The sales team's daily task list (Section 4.4). */
  const followUps = useLiveQuery(() => leadRepository.followUpQueue(today), [today]);
  /** Bookings a manager has to sign off (Section 5.4). */
  const pendingApprovals = useLiveQuery(
    () => bookingRepository.list({ awaiting_approval: true }),
    [],
  );
  const customerNameById = useLiveQuery(
    async () =>
      Object.fromEntries((await customerRepository.getAll()).map((c) => [c.id, c.name])),
    [],
  );

  const counts = useLiveQuery(
    async () => ({
      lands: await landRepository.count(),
      landowners: await landownerRepository.count(),
      documents: await documentRepository.count(),
      projects: await projectRepository.count(),
      towers: await towerRepository.count(),
      units: await unitRepository.count(),
      leads: await leadRepository.count(),
      bookings: await bookingRepository.count(),
      site_updates: await siteProgressUpdateRepository.count(),
      material_requests: await materialRequestRepository.count(),
    }),
    [],
  );

  /** Construction progress across every tower (Section 6.3). */
  const workItems = useLiveQuery(() => towerWorkItemRepository.getAll(), []);
  const progress = rollupAcrossTowers(workItems ?? [], today);

  /** The Procurement inbox (Section 6.5). */
  const pendingRequests = useLiveQuery(
    () => materialRequestRepository.list({ pending_only: true }),
    [],
  );

  const tiles = [
    { label: 'Lands', value: counts?.lands, icon: Map, tint: 'bg-admin-100 text-admin-700' },
    {
      label: 'Landowners',
      value: counts?.landowners,
      icon: Users,
      tint: 'bg-orange-100 text-orange-600',
    },
    {
      label: 'Projects',
      value: counts?.projects,
      icon: Building2,
      tint: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Units',
      value: counts?.units,
      icon: Layers,
      tint: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Leads',
      value: counts?.leads,
      icon: UserRound,
      tint: 'bg-violet-100 text-violet-600',
    },
    {
      label: 'Bookings',
      value: counts?.bookings,
      icon: FileSignature,
      tint: 'bg-rose-100 text-rose-600',
    },
    {
      label: 'Site Updates',
      value: counts?.site_updates,
      icon: HardHat,
      tint: 'bg-amber-100 text-amber-600',
    },
    {
      label: 'Material Requests',
      value: counts?.material_requests,
      icon: Package,
      tint: 'bg-teal-100 text-teal-600',
    },
    {
      label: 'Documents',
      value: counts?.documents,
      icon: FileText,
      tint: 'bg-slate-100 text-slate-600',
    },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${userName}`}
        subtitle="All eight admin modules are live. The Public Portal is next on the roadmap."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {tiles.map(({ label, value, icon: Icon, tint }) => (
          <Card key={label}>
            <div className={`mb-4 grid size-11 place-items-center rounded-xl ${tint}`}>
              <Icon className="size-5" />
            </div>
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{value ?? '—'}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Construction progress</h2>
          <Link href="/admin/site-progress" className="text-sm text-admin-700 hover:underline">
            Site log
          </Link>
        </div>
        {workItems === undefined ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : workItems.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No tower has a work breakdown yet — add a tower and its default WBS comes with it.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold text-ink">
                {progress.actual_pct.toFixed(1)}%
              </span>
              <span className="text-sm text-ink-muted">
                {progress.planned_pct === null
                  ? 'no planned dates set'
                  : `planned ${progress.planned_pct.toFixed(1)}% by today`}
              </span>
              <Badge tone={SCHEDULE_STATE_META[progress.state].tone}>
                {SCHEDULE_STATE_META[progress.state].label}
              </Badge>
            </div>
            <div className="mt-3">
              <ProgressBar value={progress.actual_pct} planned={progress.planned_pct} />
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Weighted across every tower in every project.
            </p>
          </>
        )}
      </Card>

      {pendingRequests && pendingRequests.length > 0 && (
        <Card className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Material requests waiting</h2>
            <Link href="/admin/material-requests" className="text-sm text-admin-700 hover:underline">
              All requests
            </Link>
          </div>
          <ul className="space-y-2">
            {pendingRequests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/material-requests/${request.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
                    <Package className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {request.items[0]?.item_name ?? request.code}
                      {request.items.length > 1 && ` +${request.items.length - 1} more`}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {request.code} · {request.project?.name ?? 'Project removed'}
                      {request.tower ? ` · ${request.tower.name}` : ''} ·{' '}
                      {formatDate(request.request_date)}
                    </p>
                  </div>
                  <Badge tone={MATERIAL_REQUEST_STATUS_META[request.status].tone}>
                    {MATERIAL_REQUEST_STATUS_META[request.status].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Follow-ups due</h2>
          <Link href="/admin/leads" className="text-sm text-admin-700 hover:underline">
            All leads
          </Link>
        </div>
        {followUps === undefined ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : followUps.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing overdue or due today — the sales team is caught up.
          </p>
        ) : (
          <ul className="space-y-2">
            {followUps.map(({ lead, date }) => {
              const state = followUpState(date, today);
              return (
                <li key={lead.id}>
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-admin-50 text-admin-600">
                      <CalendarClock className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{lead.name}</p>
                      <p className="text-xs text-ink-muted">
                        {lead.code} · {formatPhone(lead.phone)} · {formatDate(date)}
                      </p>
                    </div>
                    <Badge tone={LEAD_STATUS_META[lead.status].tone}>
                      {LEAD_STATUS_META[lead.status].label}
                    </Badge>
                    {state !== 'none' && (
                      <Badge tone={FOLLOW_UP_META[state].tone}>{FOLLOW_UP_META[state].label}</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {pendingApprovals && pendingApprovals.length > 0 && (
        <Card className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Discount approvals waiting</h2>
            <Link href="/admin/bookings" className="text-sm text-admin-700 hover:underline">
              All bookings
            </Link>
          </div>
          <ul className="space-y-2">
            {pendingApprovals.map((booking) => (
              <li key={booking.id}>
                <Link
                  href={`/admin/bookings/${booking.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline p-3 transition-colors hover:bg-admin-50/60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
                    <FileSignature className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {customerNameById?.[booking.customer_id] ?? booking.code}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {booking.code} · {formatBdt(booking.discount_amount)} discount ·{' '}
                      {discountPct(booking.base_price, booking.discount_amount).toFixed(1)}%
                    </p>
                  </div>
                  <Badge tone={BOOKING_STATUS_META[booking.status].tone}>
                    {BOOKING_STATUS_META[booking.status].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <DemoDataCard />

      <Card>
        <h2 className="text-base font-semibold text-ink">What is wired up</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          <li>• Shared IndexedDB (Dexie) — one database for both portals</li>
          <li>• 40 tables across twelve Dexie versions — every module appends a new version block, none edits an old one</li>
          <li>• Repository layer — UI never calls Dexie directly</li>
          <li>• Admin shell: sidebar and route guard driven by the Section 9.6 permission matrix</li>
          <li>• Module 1 — Land Management, preloaded with sample records</li>
          <li>• Module 2 — Project Creation: towers, bulk unit generation, JV allocation check</li>
          <li>• Module 3 — Sales / Lead / CRM: phone dedup, follow-up log, lost &amp; revive</li>
          <li>• Module 4 — Booking &amp; Customer: discount approval gating, unit reservation</li>
          <li>• Module 5 — Site Progress: per-tower WBS, daily log with planned-vs-actual, material requests</li>
          <li>• Module 6 — Procurement: purchase orders, GRN with a quality-check gate, weighted-average stock, transfers, supplier vouchers</li>
          <li>• Module 7 — Finance: instalment schedules, receipts allocated oldest-first, collections, refunds, cost ledger, project P&amp;L</li>
          <li>• Module 8 — Users &amp; Roles: project scoping, permission matrix, master data, company settings</li>
        </ul>
      </Card>
      </div>
    </>
  );
}
